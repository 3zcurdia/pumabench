#!/usr/bin/env ruby
# frozen_string_literal: true

EVALUATE_ONLY = ARGV.any? { |a| a == "--evaluate-only" || a.start_with?("--evaluate-only=") }

require "bundler/inline"

gemfile do
  source "https://rubygems.org"
  gem "csv"
  gem "ruby_llm", "~> 1.0" unless EVALUATE_ONLY
end

require "net/http"
require "json"
require "fileutils"
require "uri"
require "optparse"
require "csv"
require "set"

OLLAMA_API_BASE          = "http://localhost:1976/v1".freeze
OPENROUTER_API_BASE      = "https://openrouter.ai/api/v1".freeze
VALID_OPTIONS            = ("A".."D").freeze
ANSWER_RETRIES           = 2
ANSWER_RETRY_BASE_DELAY  = 0.5

TEST_DIR    = "test/2025".freeze
ANSWERS_DIR = "answers".freeze
RESULTS_DIR = "results".freeze
RESULTS_CSV = "results.csv".freeze
NUM_AREAS   = 4

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
      chat = RubyLLM.chat(model: model, provider: provider).with_temperature(0)
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
  answers_dir = File.join(ANSWERS_DIR, sanitized)
  FileUtils.mkdir_p(answers_dir)

  timestamp = Time.now.strftime("%Y%m%d%H%M%S")
  responder = Responder.new(model: model_name, provider: provider, effort: effort)

  area_files = Dir.glob(File.join(TEST_DIR, "area-*.json")).sort

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

  run_evaluate(sanitized)
end

def fetch_local_models
  body = Net::HTTP.get(URI("#{OLLAMA_API_BASE}/models"))
  JSON.parse(body, symbolize_names: true)[:data] || []
rescue StandardError => e
  warn "Error: could not fetch models from #{OLLAMA_API_BASE}: #{e.message}"
  []
end

def pct(c, t) = t.zero? ? 0.0 : (100.0 * c / t).round(1)

def score_csv(q_by_number, csv_path)
  correct = total = 0
  subjects = Hash.new { |h, k| h[k] = { questions: 0, correct: 0 } }
  CSV.foreach(csv_path, headers: true) do |row|
    q = q_by_number[row["number"].to_i]
    next unless q && q["correct_answer"]
    s = q["subject"]
    subjects[s][:questions] += 1
    total += 1
    if row["answer"] == q["correct_answer"]
      subjects[s][:correct] += 1
      correct += 1
    end
  end
  [correct, total, subjects]
end

def write_json(path, payload)
  FileUtils.mkdir_p(File.dirname(path))
  txt_path = path.sub(/\.json\z/, ".txt")
  File.delete(txt_path) if File.exist?(txt_path)
  File.write(path, "#{JSON.pretty_generate(payload)}\n")
end

def all_subjects
  Dir.glob(File.join(TEST_DIR, "area-*.json")).each_with_object(Set.new) do |f, set|
    JSON.parse(File.read(f))["questions"].each { |q| set << q["subject"] if q["subject"] }
  end
end

def build_area_payload(area_data, model, timestamp, correct, total, subjects, subjects_set)
  subjects_out = subjects_set.sort.to_h do |name|
    st = subjects[name] || { questions: 0, correct: 0 }
    [name, st.merge(percentage: pct(st[:correct], st[:questions]))]
  end
  {
    "model"     => model,
    "timestamp" => timestamp,
    "area"      => area_data["area"],
    "area_name" => area_data["area_name"],
    "total"     => { "questions" => total, "correct" => correct, "percentage" => pct(correct, total) },
    "subjects"  => subjects_out
  }
end

def build_aggregates(model_filter, subjects_set)
  aggregates = Hash.new do |h, model|
    h[model] = {
      areas: Hash.new { |ah, n| ah[n] = { correct: 0, questions: 0, runs: 0 } },
      subjects: Hash.new { |sh, subj| sh[subj] = { correct: 0, questions: 0 } }
    }
  end

  Dir.glob(File.join(TEST_DIR, "area-*.json")).sort.each do |area_file|
    area_number = File.basename(area_file, ".json").split("-").last
    area_data   = JSON.parse(File.read(area_file))
    q_by_number = area_data["questions"].each_with_object({}) { |q, h| h[q["number"]] = q }

    csv_glob = if model_filter
                 File.join(ANSWERS_DIR, model_filter, "*-area-#{area_number}.csv")
               else
                 File.join(ANSWERS_DIR, "*", "*-area-#{area_number}.csv")
               end

    Dir.glob(csv_glob).sort.each do |csv_path|
      model     = File.basename(File.dirname(csv_path))
      timestamp = File.basename(csv_path, ".csv").sub(/-area-\d+\z/, "")
      correct, total, subjects = score_csv(q_by_number, csv_path)
      payload = build_area_payload(area_data, model, timestamp, correct, total, subjects, subjects_set)
      out = File.join(RESULTS_DIR, model, "#{timestamp}-area-#{area_number}.json")
      write_json(out, payload)
      puts "Model #{model} area #{area_number} (#{timestamp}): #{correct}/#{total}"

      agg = aggregates[model]
      area_agg = agg[:areas][area_number.to_i]
      area_agg[:correct]   += correct
      area_agg[:questions] += total
      area_agg[:runs]      += 1
      subjects.each do |name, st|
        next if st[:questions].zero?
        agg[:subjects][name][:correct]   += st[:correct]
        agg[:subjects][name][:questions] += st[:questions]
      end
    end
  end

  aggregates
end

def aggregates_to_row(model, agg, subject_cols)
  areas_with_data = (1..NUM_AREAS).select { |n| agg[:areas][n][:questions] > 0 }
  if areas_with_data.empty?
    score      = 0.0
    avg_points = 0.0
    area_avgs  = Array.new(NUM_AREAS, 0.0)
  else
    area_avgs = (1..NUM_AREAS).map do |n|
      a = agg[:areas][n]
      a[:runs].zero? ? 0.0 : (a[:correct].to_f / a[:runs]).round(2)
    end
    score      = (areas_with_data.sum { |n| pct(agg[:areas][n][:correct], agg[:areas][n][:questions]) } / areas_with_data.size.to_f).round(2)
    avg_points = (area_avgs.sum / NUM_AREAS.to_f).round(2)
  end
  row = [model, score, avg_points]
  row.concat(area_avgs)
  row.concat(subject_cols.map { |s| pct(agg[:subjects][s][:correct], agg[:subjects][s][:questions]) })
  row
end

def build_results_csv_header(subject_cols)
  header = ["model", "score", "avg points"]
  header.concat((1..NUM_AREAS).map { |n| "area #{n}" })
  header.concat(subject_cols)
end

def write_results_csv_full(aggregates, subject_cols)
  CSV.open(RESULTS_CSV, "w") do |csv|
    csv << build_results_csv_header(subject_cols)
    aggregates.keys.sort.each do |model|
      csv << aggregates_to_row(model, aggregates[model], subject_cols)
    end
  end
end

def write_results_csv_single(model, agg, subject_cols)
  header = build_results_csv_header(subject_cols)
  existing_rows = []
  if File.exist?(RESULTS_CSV)
    CSV.foreach(RESULTS_CSV, headers: true) do |row|
      existing_rows << row.to_h
    end
  end

  if !existing_rows.empty? && existing_rows.first.keys != header
    warn "Warning: existing #{RESULTS_CSV} header does not match current schema; performing full rebuild."
    aggregates_all = build_aggregates(nil, all_subjects)
    write_results_csv_full(aggregates_all, subject_cols)
    puts "Wrote #{RESULTS_CSV} (full rebuild)"
    return
  end

  new_row_arr  = aggregates_to_row(model, agg, subject_cols)
  new_row_hash = header.each_with_index.to_h { |h, i| [h, new_row_arr[i]] }
  preserved    = existing_rows.reject { |r| r["model"] == model }
  all_rows     = (preserved + [new_row_hash]).sort_by { |r| r["model"].to_s }

  CSV.open(RESULTS_CSV, "w") do |csv|
    csv << header
    all_rows.each { |r| csv << header.map { |h| r[h] } }
  end
end

def run_evaluate(model_filter = nil)
  subject_cols = all_subjects.sort
  if model_filter
    aggregates = build_aggregates(model_filter, subject_cols)
    if aggregates.empty?
      warn "No answer CSVs found for model #{model_filter}; skipping evaluation."
      return
    end
    write_results_csv_single(model_filter, aggregates[model_filter], subject_cols)
    puts "Wrote #{RESULTS_CSV} (updated model #{model_filter})"
  else
    aggregates = build_aggregates(nil, subject_cols)
    write_results_csv_full(aggregates, subject_cols)
    puts "Wrote #{RESULTS_CSV}"
  end
end

cli_options = { provider: nil, effort: nil, evaluate_only: false }
OptionParser.new do |opts|
  opts.banner = "Usage: ruby benchmark.rb <model> [--provider=ollama|openrouter] [--effort=low|medium|high]\n" \
                "       ruby benchmark.rb --evaluate-only"
  opts.on("--provider=NAME", %i[ollama openrouter], "Provider to use (auto-detected from model name if omitted)") { |v| cli_options[:provider] = v }
  opts.on("--effort=LEVEL",  "Thinking effort: low|medium|high|none") { |v| cli_options[:effort] = v.to_sym }
  opts.on("--evaluate-only", "Skip the benchmark; re-evaluate every model in answers/") { cli_options[:evaluate_only] = true }
  opts.on("-h", "--help", "Show this help") { puts opts; exit }
end.parse!

if cli_options[:evaluate_only]
  run_evaluate
elsif ARGV[0]
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
    puts "Or re-evaluate all existing answer CSVs without running a benchmark:"
    puts "  ruby benchmark.rb --evaluate-only"
    puts
    puts "For OpenRouter models (auth via OPENROUTER_API_KEY env var):"
    puts "  ruby benchmark.rb qwen/qwen-3.6-27b"
  end
end
