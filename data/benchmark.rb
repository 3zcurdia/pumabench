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
  attr_reader :model, :effort, :provider, :api_base, :api_key

  def initialize(**opts)
    @model    = opts[:model]
    @effort   = opts[:effort]
    @provider = opts[:provider]
    @api_base = opts[:api_base]
    @api_key  = opts[:api_key]
    @dry_run  = opts[:dry_run]
    configure_ruby_llm! unless @dry_run
  end

  def configure_ruby_llm!
    RubyLLM.configure do |config|
      if @provider == :openrouter
        config.openrouter_api_key  = ENV["OPENROUTER_API_KEY"]
        config.openrouter_api_base = OPENROUTER_API_BASE
      else
        config.openai_api_key  = api_key
        config.openai_api_base = api_base
      end
      config.default_model = @model
    end
  end

  def answer(question)
    prompt = build_prompt(question)
    attempts = 0
    begin
      attempts += 1
      chat = RubyLLM.chat(model: model, provider: provider, assume_model_exists: true).with_temperature(0)
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

def run_benchmark(model_name, **options)
	RubyLLM.models.refresh! unless options[:dry_run]
  sanitized = sanitize_model_name(model_name, options[:effort])
  answers_dir = File.join(ANSWERS_DIR, sanitized)
  FileUtils.mkdir_p(answers_dir)

  resume_start_time = Time.now
  if options[:resume]
    existing = Dir.glob(File.join(answers_dir, "*-area-*.csv"))
    timestamp = if existing.empty?
                  resume_start_time.strftime("%Y%m%d%H%M%S")
                else
                  File.basename(existing.sort.last, ".csv").sub(/-area-\d+\z/, "")
                end
  else
    timestamp = resume_start_time.strftime("%Y%m%d%H%M%S")
  end

  if options[:resume]
    existing_counts = (1..NUM_AREAS).each_with_object({}) do |n, h|
      path = File.join(answers_dir, "#{timestamp}-area-#{n}.csv")
      next unless File.exist?(path)
      h[n] = File.foreach(path).count - 1
    end
    unless existing_counts.empty?
      puts "Resuming run #{timestamp} for #{model_name}:"
      existing_counts.each { |n, c| puts "  area #{n}: #{c} answers already recorded" }
    end
  end

  responder = Responder.new(**options.merge(model: model_name))

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
    expected_rows = data["total_questions"] + 1

    if !options[:dry_run] && File.exist?(csv_path) && File.foreach(csv_path).count >= expected_rows
      puts "Skipping area #{area_number} for model #{model_name} (already complete: #{timestamp})"
      next
    end

    already_answered = {}
    if File.exist?(csv_path)
      CSV.foreach(csv_path, headers: true) do |row|
        already_answered[row["number"].to_i] = row["answer"]
      end
    end

    if options[:dry_run]
      questions.each do |q|
        puts responder.build_prompt(q)
        puts "---"
      end
    else
      File.open(csv_path, "a") do |csv|
        csv.sync = true
        csv.puts "number,answer" if already_answered.empty?

        questions.each do |q|
          n = q["number"]
          next if already_answered.key?(n)

          option = responder.answer(q)

          if option.nil? || !VALID_OPTIONS.include?(option)
            warn "Error: empty/invalid response for model #{model_name}, area #{area_number}, question #{n}"
            csv.puts "#{n},ERROR"
          else
            csv.puts "#{n},#{option}"
          end
        end
      end
    end

    puts "Finished area #{area_number} for model #{model_name}"
  end

  run_evaluate(sanitized, resume_ts: options[:resume] ? resume_start_time.strftime("%Y%m%d%H%M%S") : nil) unless options[:dry_run]
end

def fetch_local_models(api_base)
  body = Net::HTTP.get(URI("#{api_base}/models"))
  JSON.parse(body, symbolize_names: true)[:data] || []
rescue StandardError => e
  warn "Error: could not fetch models from #{OPENAI_API_BASE}: #{e.message}"
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

def build_area_payload(area_data, model, timestamp, correct, total, subjects, subjects_set, timestamp_override = nil)
  subjects_out = subjects_set.sort.to_h do |name|
    st = subjects[name] || { questions: 0, correct: 0 }
    [name, st.merge(percentage: pct(st[:correct], st[:questions]))]
  end
  {
    "model"     => model,
    "timestamp" => timestamp_override || timestamp,
    "area"      => area_data["area"],
    "area_name" => area_data["area_name"],
    "total"     => { "questions" => total, "correct" => correct, "percentage" => pct(correct, total) },
    "subjects"  => subjects_out
  }
end

def build_aggregates(model_filter, subjects_set, timestamp_override: nil)
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
      payload = build_area_payload(area_data, model, timestamp, correct, total, subjects, subjects_set, timestamp_override)
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
  model_split = model.split("-thinking-")
  row = [model_split[0], model_split[1].nil? ? "none" : model_split[1], score, avg_points]
  row.concat(area_avgs)
  row.concat(subject_cols.map { |s| pct(agg[:subjects][s][:correct], agg[:subjects][s][:questions]) })
  row
end

def build_results_csv_header(subject_cols)
  header = ["model", "effort", "score", "avg points"]
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

def run_evaluate(model_filter = nil, resume_ts: nil)
  subject_cols = all_subjects.sort
  if model_filter
    aggregates = build_aggregates(model_filter, subject_cols, timestamp_override: resume_ts)
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

# Default api base set to local ollama instance
cli_options = { provider: nil, effort: nil, api_base: "http://localhost:1234/v1", api_key: "dummy-key", evaluate_only: false, resume: false, dry_run: false }
OptionParser.new do |opts|
  opts.banner = "Usage: ruby benchmark.rb <model> [--provider=openai|openrouter] [--effort=low|medium|high] [--resume] [--dry-run]\n" \
                "       ruby benchmark.rb --evaluate-only\n" \
                "       ruby benchmark.rb -h, --help"
  opts.on("--provider=NAME", %i[openai openrouter], "Provider to use (auto-detected from model name if omitted)") { |v| cli_options[:provider] = v }
  opts.on("--effort=LEVEL",  "Thinking effort: low|medium|high|none") { |v| cli_options[:effort] = v.to_sym }
  opts.on("--api_base=URL", "OpenAI-compatible API base URL") { |v| cli_options[:api_base] = v }
  opts.on("--api_key=KEY", "OpenAI-compatible API key") { |v| cli_options[:api_key] = v }
  opts.on("--evaluate-only", "Skip the benchmark; re-evaluate every model in answers/") { cli_options[:evaluate_only] = true }
  opts.on("--resume", "Continue the latest in-progress run for this model instead of starting a new one") { cli_options[:resume] = true }
  opts.on("--dry-run", "Print prompts without calling the LLM or writing files") { cli_options[:dry_run] = true }
  opts.on("-h", "--help", "Show this help") { puts opts; exit }
end.parse!

if cli_options[:evaluate_only]
  run_evaluate
elsif ARGV[0]
  model    = ARGV[0]
  cli_options[:provider] ||= :openai
  run_benchmark(model, **cli_options)
else
  models = fetch_local_models(cli_options[:api_base])
  if models.empty?
    puts "No local Ollama models found at #{cli_options[:api_base]}."
    puts "Start Ollama and pull a model first, e.g.: ollama pull qwen3.5-9b"
  else
    puts "Available local Ollama models at #{cli_options[:api_base]}:"
    models.each do |m|
      model_id = m[:id] || m["id"]
      puts "  - #{model_id}"
    end
    puts
    puts "Run the benchmark for one of them with:"
    puts "  ruby benchmark.rb <model-id> --provider=openrouter"
    puts
    puts "Examples:"
    sample = models.first[:id] || models.first["id"]
    puts "  ruby benchmark.rb #{sample} --provider=openrouter"
    puts "  ruby benchmark.rb #{sample} --provider=openrouter --effort=medium"
    puts
    puts "Or re-evaluate all existing answer CSVs without running a benchmark:"
    puts "  ruby benchmark.rb --evaluate-only"
    puts
    puts "For OpenRouter models (auth via OPENROUTER_API_KEY env var):"
    puts "  ruby benchmark.rb qwen/qwen-3.6-27b"
  end
end
