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

OLLAMA_API_BASE = "http://localhost:11434/v1".freeze
VALID_OPTIONS = ("A".."D").freeze
ANSWER_RETRIES = 2
ANSWER_RETRY_BASE_DELAY = 0.5

class Responder
  attr_reader :model

  def initialize(model: "qwen/qwen3.5-9b", api_base: OLLAMA_API_BASE, api_key: "dummy-key")
    @model = model
    RubyLLM.configure do |config|
      config.ollama_api_base = api_base
      config.ollama_api_key  = api_key
      config.default_model   = @model
    end
  end

  def answer(question)
    prompt = build_prompt(question)
    attempts = 0
    begin
      attempts += 1
      chat = RubyLLM.chat(model: model, provider: :ollama).with_temperature(0)
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

def sanitize_model_name(name)
  name.to_s.split("/").last
end

def run_benchmark(model_name)
  sanitized = sanitize_model_name(model_name)
  answers_dir = File.join("answers", sanitized)
  FileUtils.mkdir_p(answers_dir)

  timestamp = Time.now.strftime("%Y%m%d%H%M%S")
  responder = Responder.new(model: model_name, api_base: OLLAMA_API_BASE, api_key: "dummy-key")

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

if ARGV[0]
  run_benchmark(ARGV[0])
else
  fetch_local_models.each do |m|
    model_id = m[:id] || m["id"]
    next unless model_id
    puts "Running benchmark for model: #{model_id}"
    run_benchmark(model_id)
  end
end
