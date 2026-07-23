#!/usr/bin/env ruby
# frozen_string_literal: true

require "bundler/inline"

gemfile do
  source "https://rubygems.org"
  gem "ruby_llm", "~> 1.0"
end

require "net/http"
require "json"
require "fileutils"
require "uri"
require "optparse"

OLLAMA_API_BASE     = "http://localhost:11434/v1".freeze
OPENROUTER_API_BASE = "https://openrouter.ai/api/v1".freeze
VALID_OPTIONS       = ("A".."D").freeze
ANSWER_RETRIES      = 2
ANSWER_RETRY_BASE_DELAY = 0.5

class Responder
  attr_reader :model, :effort, :provider

  def initialize(model:, provider: :ollama, effort: nil)
    @model    = model
    @effort   = effort
    @provider = provider
    configure_ruby_llm!
  end

  def configure_ruby_llm!
    RubyLLM.configure do |config|
      case @provider
      when :openrouter
        api_key = ENV["OPENROUTER_API_KEY"]
        if api_key.nil? || api_key.empty?
          abort "Error: OPENROUTER_API_KEY is required for provider openrouter"
        end
        config.openrouter_api_key  = api_key
        config.openrouter_api_base = OPENROUTER_API_BASE
      when :ollama
        config.ollama_api_base = OLLAMA_API_BASE
        config.ollama_api_key  = "dummy-key"
      else
        abort "Error: unknown provider #{@provider.inspect}"
      end
      config.default_model = @model
    end
  end

  def answer(question)
    prompt = build_prompt(question)
    attempts = 0
    begin
      attempts += 1
      chat = RubyLLM.chat(model: model, provider: provider).with_temperature(0).with_thinking(effort: effort)
      content = chat.ask(prompt).content.to_s.strip
      return extract_answer_letter(content) unless content.empty?
      warn "⚠️  Empty response (attempt #{attempts}) for model #{model}"
    rescue StandardError => e
      warn "⚠️  Could not generate answer (attempt #{attempts}) for model #{model}: #{e.message}"
      sleep(ANSWER_RETRY_BASE_DELAY * attempts) if attempts <= ANSWER_RETRIES
    end while attempts <= ANSWER_RETRIES

    nil
  end

  def build_prompt(question)
    <<~PROMPT
    Eres un experto en conocimientos académicos de nivel preparatoria. Tu tarea es responder correctamente la siguiente pregunta de opción múltiple.

    Instrucciones:
    - Analiza cuidadosamente la pregunta y las opciones.
    - Selecciona únicamente una opción.
    - Responde exclusivamente con la letra y el texto de la opción correcta.
    - No incluyas explicaciones, razonamientos, comentarios ni información adicional.
    - Haz tu mejor esfuerzo para elegir la respuesta correcta.

    Tema: #{question["subject"]}

    Pregunta:
    #{question["question"]}

    Opciones:
      #{question.dig("options", "A")}
      #{question.dig("options", "B")}
      #{question.dig("options", "C")}
      #{question.dig("options", "D")}

    Formato obligatorio de respuesta:
    <letra>
    PROMPT
  end

  def extract_answer_letter(response)
    return nil if response.nil?
    upper = response.upcase
    match = upper.match(/\b[ABCD]\b/) || upper.match(/^[<\(\[]?([ABCD])/)
    return nil unless match
    match[1] || match[0]
  end
end

def sanitize_model_name(name, effort)
  model_name = name.to_s.split("/").last.sub(":free", "")
  model_name + (effort ? "-thinking-#{effort}" : "")
end

def run_benchmark(model_name, provider: :ollama, effort: nil)
  sanitized = sanitize_model_name(model_name, effort)
  answers_dir = File.join("answers", sanitized)
  FileUtils.mkdir_p(answers_dir)

  timestamp = Time.now.strftime("%Y%m%d%H%M%S")
  responder = Responder.new(model: model_name, provider: provider, effort: effort)

  area_files = Dir.glob("test/2025/area-*.json").sort

  area_files.each do |area_file|
    area_number = File.basename(area_file, ".json").split("-").last
    csv_path = File.join(answers_dir, "#{timestamp}-area-#{area_number}.csv")

    begin
      data = JSON.parse(File.read(area_file))
    rescue JSON::ParserError => e
      warn "Error: failed to parse #{area_file}: #{e.message}. Skipping."
      next
    end
    questions = data["questions"]

    File.open(csv_path, "w") do |csv|
      csv.sync = true
      csv.puts "number,answer"

      questions.each do |q|
        option = responder.answer(q)

        if option.nil? || !VALID_OPTIONS.include?(option)
          warn "Error: empty/invalid response for model #{model_name}, area #{area_number}, question #{q["number"]}"
          csv.puts "#{q["number"]},ERROR"
        else
          csv.puts "#{q["number"]},#{option}"
        end
      end
    end

    puts "Finished area #{area_number} for model #{model_name}"
  end
end

def fetch_local_models
  body = Net::HTTP.get(URI("#{OLLAMA_API_BASE}/models"))
  JSON.parse(body, symbolize_names: true)[:data] || []
rescue StandardError => e
  warn "Error: could not fetch models from #{OLLAMA_API_BASE}: #{e.message}"
  []
end

cli_options = { provider: nil, effort: nil }
OptionParser.new do |opts|
  opts.banner = "Usage: ruby benchmark.rb <model> [--provider=ollama|openrouter] [--effort=low|medium|high]"
  opts.on("--provider=NAME", %i[ollama openrouter], "Provider to use (auto-detected from model name if omitted)") { |v| cli_options[:provider] = v }
  opts.on("--effort=LEVEL",  "Thinking effort: low|medium|high|none") { |v| cli_options[:effort] = v.to_sym }
  opts.on("-h", "--help", "Show this help") { puts opts; exit }
end.parse!

if ARGV[0]
  model    = ARGV[0]
  provider = cli_options[:provider] || :ollama
  RubyLLM.models.refresh! if provider != :ollama
  effort   = cli_options[:effort]
  run_benchmark(model, provider: provider, effort: effort)
else
  models = fetch_local_models
  if models.empty?
    puts "No local Ollama models found at #{OLLAMA_API_BASE}."
    puts "Start Ollama and pull a model first, e.g.: ollama pull qwen3.5-9b"
  else
    puts "Available local Ollama models at #{OLLAMA_API_BASE}:"
    models.each do |m|
      model_id = m[:id] || m["id"]
      puts "  - #{model_id}"
    end
    puts
    puts "Run the benchmark for one of them with:"
    puts "  ruby benchmark.rb <model-id> --provider=ollama"
    puts
    puts "Examples:"
    sample = models.first[:id] || models.first["id"]
    puts "  ruby benchmark.rb #{sample} --provider=ollama"
    puts "  ruby benchmark.rb #{sample} --provider=ollama --effort=medium"
    puts
    puts "For OpenRouter models (auth via OPENROUTER_API_KEY env var):"
    puts "  ruby benchmark.rb qwen/qwen-3.6-27b"
  end
end
