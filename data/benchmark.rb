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
HF_API                   = "https://huggingface.co/api/models".freeze
HTTP_TIMEOUT             = 30
VALID_OPTIONS            = ("A".."D").freeze
ANSWER_RETRIES           = 2
ANSWER_RETRY_BASE_DELAY  = 0.5

TEST_DIR     = "test/2025".freeze
ANSWERS_DIR  = "answers".freeze
RESULTS_DIR  = "results".freeze
RESULTS_CSV  = "results.csv".freeze
MODELS_JSON  = "models.json".freeze
NUM_AREAS    = 4
ALL_SUBJECTS = Dir.glob(File.join(TEST_DIR, "area-*.json")).each_with_object(Set.new) do |f, set|
  JSON.parse(File.read(f))["questions"].each { |q| set << q["subject"] if q["subject"] }
end.sort.freeze

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

  def answer(question, shared_references: nil)
    prompt = build_prompt(question, shared_references: shared_references)
    attempts = 0
    begin
      attempts += 1
      chat = RubyLLM.chat(model: model, provider: provider, assume_model_exists: true).with_temperature(0)
      chat =
        if effort == "none"
          chat.with_thinking(effort: nil)
        elsif effort != nil || effort != ""
          chat.with_thinking(effort: effort)
        else
          chat
        end
      content = chat.ask(prompt).content.to_s.strip
      return extract_answer_letter(content) unless content.empty?
      warn "⚠️  Empty response (attempt #{attempts}) for model #{model}"
    rescue StandardError => e
      warn "⚠️  Could not generate answer (attempt #{attempts}) for model #{model}: #{e.message}"
      sleep(ANSWER_RETRY_BASE_DELAY * attempts) if attempts <= ANSWER_RETRIES
    end while attempts <= ANSWER_RETRIES

    nil
  end

  def build_prompt(question, shared_references: nil)
    shared_block  = render_shared_references(shared_references, question["subject"])
    ref_block     = render_reference(question["reference"])
    options_block = render_options(question["options"])

    <<~PROMPT
    Eres un experto en conocimientos académicos de nivel preparatoria. Tu tarea es responder correctamente la siguiente pregunta de opción múltiple.

    Instrucciones:
    - Analiza cuidadosamente la pregunta, sus referencias y las opciones.
    - Selecciona únicamente una opción.
    - Responde exclusivamente con la letra y el texto de la opción correcta.
    - No incluyas explicaciones, razonamientos, comentarios ni información adicional.
    - Haz tu mejor esfuerzo para elegir la respuesta correcta.
    #{shared_block}
    Tema: #{question["subject"]}

    Pregunta:
    #{question["question"]}
    #{ref_block}
    Opciones:
    #{options_block}

    Formato obligatorio de respuesta:
    <letra>
    PROMPT
  end

  def render_shared_references(refs, subject)
    return "" if refs.nil? || refs.empty?
    applicable = refs.select do |r|
      subjects = r["applies_to_subjects"]
      subjects.nil? || subjects.empty? || (subject && subjects.include?(subject))
    end
    return "" if applicable.empty?

    lines = applicable.map { |r| "  - " + render_reference_line(r) }
    ["", "Referencias compartidas aplicables:", *lines].join("\n")
  end

  def render_reference(ref)
    return "" if ref.nil? || ref.empty?
    label =
      case ref["type"]
      when "text"     then "Referencia"
      when "image"    then "Referencia (imagen pendiente de descripción)"
      when "image_set" then "Referencia (#{ref["images"]&.size || "varias"} figuras pendientes de descripción)"
      else "Referencia"
      end
    body = render_reference_line(ref)
    ["", "#{label}:", "  #{body}"].join("\n")
  end

  def render_reference_line(ref)
    case ref["type"]
    when "text"
      ref["content"].to_s
    when "image"
      "Imagen disponible en: #{ref["path"]} (no multimodal: no se puede usar para responder)"
    when "image_set"
      paths = (ref["images"] || []).map { |i| "#{i["label"]}: #{i["path"]}" }
      "Imágenes disponibles: #{paths.join("; ")} (no multimodal: no se pueden usar para responder)"
    else
      ref.to_s
    end
  end

  def render_options(options)
    return "" if options.nil? || options.empty?
    ("A".."D").map do |letter|
      value = options[letter] || options[letter.to_sym]
      "      #{render_option(letter, value)}"
    end.join("\n")
  end

  def render_option(letter, value)
    if value.is_a?(Hash)
      label = value["label"] || letter
      fragments = []
      fragments << "imagen: #{value["image"]}" if value["image"]
      fragments << "descripción: #{value["image_description"]}" if value["image_description"]
      text = value["text"].to_s
      fragments.unshift(text) unless text.empty?
      "#{label}) #{fragments.join(' | ')}"
    else
      value.to_s
    end
  end

  def extract_answer_letter(response)
    return nil if response.nil?
    upper = response.upcase
    match = upper.match(/\b[ABCD]\b/) || upper.match(/^[<\(\[]?([ABCD])/)
    return nil unless match
    match[1] || match[0]
  end
end

def model_answers_path_name(name, effort)
  model_name = name.to_s.split("/").last.sub(":free", "")
  model_name + (effort ? "-thinking-#{effort}" : "")
end

def load_latest_failed_questions(sanitized)
  result_files = Dir.glob(File.join(RESULTS_DIR, sanitized, "*-area-*.json"))
  return [{}, nil] if result_files.empty?

  by_timestamp = result_files.group_by { |f| File.basename(f).sub(/-area-\d+\.json\z/, "") }
  latest_ts    = by_timestamp.keys.sort.last

  failed_by_area = {}
  by_timestamp[latest_ts].each do |f|
    area_number = File.basename(f, ".json").split("-").last
    data        = JSON.parse(File.read(f))
    failed_by_area[area_number] = data["failed_questions"].map { |q| q["number"] }.to_set
  end

  [failed_by_area, latest_ts]
end

def run_benchmark(model_name, **options)
	RubyLLM.models.refresh! unless options[:dry_run]
  record   = register_model(model_name) unless options[:dry_run]
  model_id = record && record["id"]
  sanitized = model_answers_path_name(model_name, options[:effort])

  if options[:rebuild]
    model_answers = File.join(ANSWERS_DIR, sanitized)
    model_results = File.join(RESULTS_DIR, sanitized)
    FileUtils.rm_rf(model_answers) if File.exist?(model_answers)
    FileUtils.rm_rf(model_results) if File.exist?(model_results)
    puts "Rebuild: deleted #{model_answers} and #{model_results}"
    options[:resume] = false
  end

  retry_filter = {}
  retry_timestamp = nil
  if options[:retry_failed]
    retry_filter, retry_timestamp = load_latest_failed_questions(sanitized)
    if retry_timestamp.nil?
      warn "No existing results found for model #{sanitized}; nothing to retry."
      return
    end
    if retry_filter.values.all?(&:empty?)
      puts "No failed questions to retry for model #{sanitized} (timestamp: #{retry_timestamp})."
      run_evaluate(model_filter: sanitized, model_id: model_id, resume_ts: retry_timestamp) unless options[:dry_run]
      return
    end
    total_failed = retry_filter.values.sum(&:size)
    puts "Retrying #{total_failed} failed questions across #{retry_filter.size} areas for #{sanitized} (timestamp: #{retry_timestamp})"
  end

  answers_dir = File.join(ANSWERS_DIR, sanitized)
  FileUtils.mkdir_p(answers_dir)

  resume_start_time = Time.now
  if options[:retry_failed]
    timestamp = retry_timestamp
  elsif options[:resume]
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

    if options[:retry_failed]
      failed_numbers = retry_filter[area_number]
      if failed_numbers.nil? || failed_numbers.empty?
        puts "No failed questions for area #{area_number}; skipping"
        next
      end

      existing_answers = {}
      if File.exist?(csv_path)
        CSV.foreach(csv_path, headers: true) do |row|
          existing_answers[row["number"].to_i] = row["answer"]
        end
      else
        warn "Warning: missing #{csv_path} for retry; skipping area #{area_number}"
        next
      end

      questions_to_retry = questions.select { |q| failed_numbers.include?(q["number"]) }
      puts "Retrying #{questions_to_retry.size} failed questions for area #{area_number} (csv: #{csv_path})"

      questions_to_retry.each do |q|
        n = q["number"]
        option = responder.answer(q, shared_references: data["shared_references"])

        existing_answers[n] = if option.nil? || !VALID_OPTIONS.include?(option)
                                warn "Error: empty/invalid response for model #{model_name}, area #{area_number}, question #{n}"
                                "ERROR"
                              else
                                option
                              end
        print "."
      end

      File.open(csv_path, "w") do |csv|
        csv.sync = true
        csv.puts "number,answer"
        existing_answers.keys.sort.each { |n| csv.puts "#{n},#{existing_answers[n]}" }
      end

      puts "\nFinished retrying area #{area_number} for model #{model_name}"
      next
    end

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
        puts responder.build_prompt(q, shared_references: data["shared_references"])
        puts "---"
      end
    else
      puts "Writing to answers to #{csv_path}"
      File.open(csv_path, "a") do |csv|
        csv.sync = true
        csv.puts "number,answer" if already_answered.empty?

        questions.each do |q|
          n = q["number"]
          next if already_answered.key?(n)

          option = responder.answer(q, shared_references: data["shared_references"])

          if option.nil? || !VALID_OPTIONS.include?(option)
            warn "Error: empty/invalid response for model #{model_name}, area #{area_number}, question #{n}"
            csv.puts "#{n},ERROR"
          else
            csv.puts "#{n},#{option}"
          end
          print "."
        end
      end
    end

    puts "\nFinished area #{area_number} for model #{model_name}"
  end

  eval_resume_ts = if options[:retry_failed]
                    timestamp
                  elsif options[:resume]
                    resume_start_time.strftime("%Y%m%d%H%M%S")
                  end
  run_evaluate(model_filter: sanitized, model_id: model_id, resume_ts: eval_resume_ts) unless options[:dry_run]
end

def fetch_local_models(api_base)
  body = Net::HTTP.get(URI("#{api_base}/models"))
  JSON.parse(body, symbolize_names: true)[:data] || []
rescue StandardError => e
  warn "Error: could not fetch models from #{api_base}: #{e.message}"
  []
end

def http_get_json(url, redirects_remaining: 5)
  uri = URI(url)
  response = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https", open_timeout: HTTP_TIMEOUT, read_timeout: HTTP_TIMEOUT) do |http|
    http.get(uri.request_uri)
  end
  if response.is_a?(Net::HTTPRedirection) && redirects_remaining.positive? && response["location"]
    next_uri = URI(response["location"])
    next_uri = uri + next_uri if next_uri.relative?
    return http_get_json(next_uri.to_s, redirects_remaining: redirects_remaining - 1)
  end
  return nil unless response.is_a?(Net::HTTPSuccess)
  JSON.parse(response.body)
rescue StandardError => e
  warn "⚠️  GET #{url} failed: #{e.message}"
  nil
end

def fetch_openrouter_index
  data = http_get_json("#{OPENROUTER_API_BASE}/models")
  return [{}, {}] unless data.is_a?(Hash)
  by_id   = {}
  by_name = {}
  Array(data["data"]).each do |m|
    next unless m.is_a?(Hash)
    id = m["id"]
    next if id.nil? || id.empty?
    by_id[id] = m
    name = id.split("/", 2).last
    by_name[name] ||= m
  end
  [by_id, by_name]
end

def hf_lookup(hf_id)
  return nil if hf_id.nil? || hf_id.to_s.strip.empty?
  http_get_json("#{HF_API}/#{hf_id}")
end

def parameters_from_description(text)
  return nil unless text.is_a?(String) || text.is_a?(Symbol)
  text = text.to_s
  return nil if text.empty?
  patterns = [
    [/(\d+(?:\.\d+)?)\s*trillion\s+param/i, 1_000_000_000_000],
    [/(\d+(?:\.\d+)?)\s*billion\s+param/i,  1_000_000_000],
    [/(\d+(?:\.\d+)?)\s*[Bb]\s*[-–—]?\s*param/i, 1_000_000_000],
  ]
  patterns.each do |re, multiplier|
    m = text.match(re)
    return (m[1].to_f * multiplier).round if m
  end
  nil
end

def parameters_from_tensor_info(data)
  per_dtype = data.dig("safetensors", "parameters")
  if per_dtype.is_a?(Hash) && !per_dtype.empty?
    return per_dtype.values.map(&:to_i).sum
  end
  total_bytes = data.dig("safetensors", "total")
  return nil unless total_bytes.is_a?(Integer) && total_bytes.positive?
  total_bytes / 2
end

def detect_moe_type(hf_data, or_entry, id)
  config = (hf_data && hf_data["config"]) || {}
  model_type = config["model_type"].to_s.downcase
  if model_type.include?("moe") || model_type.include?("mixtral") || model_type.include?("gpt_oss")
    return "moe"
  end
  if config.any? { |k, _| k.is_a?(String) && k.match?(/num_experts|num_local_experts|n_routed_experts|n_shared_experts|expert_count|moe_config/i) }
    return "moe"
  end
  desc = or_entry && or_entry["description"].to_s.downcase
  if desc && (desc.include?("mixture-of-experts") || desc.include?("sparse expert") || desc.match?(/\bmoe\b/))
    return "moe"
  end
  return "moe" if id.match?(/\d+[bm](?:-\d+[bm])+/)
  "dense"
end

def fetch_openrouter_endpoints(id, or_entry: nil)
  or_entry ||= (fetch_openrouter_index.first || {})[id]
  if or_entry
    details_path = or_entry.dig("links", "details")
    if details_path
      data = http_get_json("https://openrouter.ai#{details_path}")
      endpoints = data.dig("data", "endpoints") if data.is_a?(Hash)
      if endpoints.is_a?(Array) && !endpoints.empty?
        ep = endpoints.first
        return {
          "latency_last_30m" => ep["latency_last_30m"],
          "throughput_last_30m" => ep["throughput_last_30m"]
        }
      end
    end
  end
  {}
end

def build_model_record(id, or_entry)
  org      = id.split("/", 2).first
  name     = id.split("/", 2).last
  hf_id    = or_entry && or_entry["hugging_face_id"]
  hf_id    = nil if hf_id.nil? || hf_id.to_s.strip.empty?
  hf_data  = hf_id ? hf_lookup(hf_id) : nil
  hf_data ||= hf_lookup(id)

  parameters = nil
  parameters = parameters_from_description(or_entry["description"]) if or_entry
  parameters = parameters_from_tensor_info(hf_data) if parameters.nil? && hf_data

  speed = fetch_openrouter_endpoints(id, or_entry: or_entry)

  {
    "id"         => id,
    "name"       => (or_entry && or_entry["name"]) || name,
    "provider"   => org,
    "type"       => detect_moe_type(hf_data, or_entry, id),
    "parameters" => parameters,
    "pricing"    => or_entry && or_entry["pricing"],
    "latency_last_30m" => speed["latency_last_30m"],
    "throughput_last_30m" => speed["throughput_last_30m"]
  }
end

def load_model_registry
  return [] unless File.exist?(MODELS_JSON)
  data = JSON.parse(File.read(MODELS_JSON))
  data.is_a?(Array) ? data : []
rescue JSON::ParserError => e
  warn "⚠️  Could not parse #{MODELS_JSON}: #{e.message}; using empty registry"
  []
end

def save_model_registry(records)
  records.sort_by! { |r| r["id"].to_s }
  File.write(MODELS_JSON, JSON.pretty_generate(records))
end

def find_model_record_by_slug(records, slug)
  records.find { |r| r["id"].to_s.split("/", 2).last.sub(":free", "") == slug } ||
    records.find { |r| r["name"] == slug }
end

def register_models()
	registry = load_model_registry
	registry.each do |r|
		register_model(r["id"])
	end
end

def register_model(id)
  registry = load_model_registry
  existing = registry.find { |r| r["id"] == id }

  if existing
    speed = fetch_openrouter_endpoints(id)
    unless speed.empty?
      existing["latency_last_30m"] = speed["latency_last_30m"]
      existing["throughput_last_30m"] = speed["throughput_last_30m"]
      save_model_registry(registry)
      puts "Updated speed for #{id} in #{MODELS_JSON}"
    end
    return existing
  end

  or_by_id, or_by_name = fetch_openrouter_index
  or_entry = or_by_id[id] || or_by_name[id.split("/", 2).last]
  record = build_model_record(id, or_entry)
  registry << record
  save_model_registry(registry)
  if or_entry
    puts "Registered #{id} in #{MODELS_JSON}"
  else
    puts "Registered #{id} in #{MODELS_JSON} (not found on OpenRouter; minimal record)"
  end
  record
end

def pct(c, t) = t.zero? ? 0.0 : (100.0 * c / t).round(2)

def score_csv(q_by_number, csv_path)
  correct = total = 0
  failed_question = []
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
    else
      failed_question << q
    end
  end
  [correct, total, subjects, failed_question]
end

def write_json(path, payload)
  FileUtils.mkdir_p(File.dirname(path))
  txt_path = path.sub(/\.json\z/, ".txt")
  File.delete(txt_path) if File.exist?(txt_path)
  File.write(path, "#{JSON.pretty_generate(payload)}\n")
end

def build_area_payload(area_data, model, timestamp, correct, total, subjects, effort, model_id, failed_questions, timestamp_override: nil)
  subjects_out = ALL_SUBJECTS.to_h do |name|
    st = subjects[name] || { questions: 0, correct: 0 }
    [name, st.merge(percentage: pct(st[:correct], st[:questions]))]
  end
  {
    "id"        => model_id,
    "model"     => model,
    "effort"    => effort.nil? ? "none" : effort.to_s,
    "timestamp" => timestamp_override || timestamp,
    "area"      => area_data["area"],
    "area_name" => area_data["area_name"],
    "total"     => { "questions" => total, "correct" => correct, "percentage" => pct(correct, total) },
    "subjects"  => subjects_out,
    "failed_questions" => failed_questions
  }
end

def build_aggregates(model_filter: nil, timestamp_override: nil, model_id: nil)
  registry = load_model_registry
  aggregates = Hash.new do |h, model|
    h[model] = {
      id: nil,
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
      _, effort = model.split("-thinking-", 2)
      timestamp = File.basename(csv_path, ".csv").sub(/-area-\d+\z/, "")
      correct, total, subjects, failed_questions = score_csv(q_by_number, csv_path)

      id = model_id
      if model_id.nil?
        record = find_model_record_by_slug(registry, model.split("-thinking-", 2).first)
        id = record && record["id"]
      end

      payload = build_area_payload(area_data, model, timestamp, correct, total, subjects, effort, id, failed_questions, timestamp_override: timestamp_override)
      out = File.join(RESULTS_DIR, model, "#{timestamp}-area-#{area_number}.json")
      write_json(out, payload)
      puts "Model #{model} area #{area_number} (#{timestamp}): #{correct}/#{total}"

      agg = aggregates[model]
      agg[:id] ||= id
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

def aggregates_to_row(model, agg)
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
  model_split = model.split("-thinking-", 2)
  row = [agg[:id], model_split[0], model_split[1].nil? ? "none" : model_split[1], score, avg_points]
  row.concat(area_avgs)
  row.concat(ALL_SUBJECTS.map { |s| "#{agg[:subjects][s][:correct]}/#{agg[:subjects][s][:questions]}" })
  row
end

def build_results_csv_header()
  header = ["id", "model", "effort", "score", "avg points"]
  header.concat((1..NUM_AREAS).map { |n| "area #{n}" })
  header.concat(ALL_SUBJECTS)
end

def write_results_csv_full(aggregates)
  CSV.open(RESULTS_CSV, "w") do |csv|
    csv << build_results_csv_header()
    aggregates.keys.sort.each do |model|
      csv << aggregates_to_row(model, aggregates[model])
    end
  end
end

def write_results_csv_single(model, agg)
  header = build_results_csv_header()
  existing_rows = []
  if File.exist?(RESULTS_CSV)
    CSV.foreach(RESULTS_CSV, headers: true) do |row|
      existing_rows << row.to_h
    end
  end

  if !existing_rows.empty? && existing_rows.first.keys != header
    warn "Warning: existing #{RESULTS_CSV} header does not match current schema; performing full rebuild."
    write_results_csv_full(build_aggregates())
    puts "Wrote #{RESULTS_CSV} (full rebuild)"
    return
  end

  new_row_arr  = aggregates_to_row(model, agg)
  new_row_hash = header.each_with_index.to_h { |h, i| [h, new_row_arr[i]] }
  preserved    = existing_rows.reject { |r| r["model"] == new_row_hash["model"] && r["effort"] == new_row_hash["effort"] }
  all_rows     = (preserved + [new_row_hash]).sort_by { |r| r["model"].to_s }

  CSV.open(RESULTS_CSV, "w") do |csv|
    csv << header
    all_rows.each { |r| csv << header.map { |h| r[h] } }
  end
end

def aggregate_failed_questions
  seen = {}
  Dir.glob(File.join(RESULTS_DIR, "*", "*-area-*.json")).each do |path|
    data = JSON.parse(File.read(path))
    (data["failed_questions"] || []).each do |q|
      key = "#{data["area"]}-#{q["number"]}"
      seen[key] ||= q.merge("area" => data["area"], "area_name" => data["area_name"], "models" => [])
      seen[key]["models"] << data["model"] unless seen[key]["models"].include?(data["model"])
    end
  end
  seen.values
end

def write_failed_questions_json(path: "failed_questions.json")
  failed = aggregate_failed_questions
  FileUtils.mkdir_p(File.dirname(path)) if File.dirname(path) != "."
  File.write(path, "#{JSON.pretty_generate(failed)}\n")
  puts "Wrote #{path} (#{failed.size} unique failed questions)"
end

def run_evaluate(model_filter: nil, resume_ts: nil, model_id: nil)
  if model_filter
    aggregates = build_aggregates(model_filter: model_filter, timestamp_override: resume_ts, model_id: model_id)
    if aggregates.empty?
      warn "No answer CSVs found for model #{model_filter}; skipping evaluation."
      return
    end
    write_results_csv_single(model_filter, aggregates[model_filter])
    puts "Wrote #{RESULTS_CSV} (updated model #{model_filter})"
  else
    write_results_csv_full(build_aggregates())
    puts "Wrote #{RESULTS_CSV}"
  end
  write_failed_questions_json
end

# Default api base set to local ollama instance
cli_options = { provider: nil, effort: nil, api_base: "http://localhost:11434/v1", api_key: "dummy-key", evaluate_only: false, resume: false, dry_run: false, rebuild: false, retry_failed: false }
OptionParser.new do |opts|
  opts.banner = "Usage: ruby benchmark.rb <model> [--provider=openai|openrouter] [--effort=low|medium|high] [--resume] [--rebuild] [--retry-failed] [--dry-run]\n" \
                "       ruby benchmark.rb --evaluate-only\n" \
                "       ruby benchmark.rb -h, --help"
  opts.on("--provider=NAME", %i[openai openrouter], "Provider to use (auto-detected from model name if omitted)") { |v| cli_options[:provider] = v }
  opts.on("--effort=LEVEL",  "Thinking effort: low|medium|high|none") { |v| cli_options[:effort] = v.to_sym }
  opts.on("--api_base=URL", "OpenAI-compatible API base URL") { |v| cli_options[:api_base] = v }
  opts.on("--api_key=KEY", "OpenAI-compatible API key") { |v| cli_options[:api_key] = v }
  opts.on("--evaluate-only", "Skip the benchmark; re-evaluate every model in answers/") { cli_options[:evaluate_only] = true }
  opts.on("--resume", "Continue the latest in-progress run for this model instead of starting a new one") { cli_options[:resume] = true }
  opts.on("--rebuild", "Delete previous answers/results for this model and re-run from scratch") { cli_options[:rebuild] = true }
  opts.on("--retry-failed", "Re-ask only the questions flagged as failures in the latest result JSONs and refresh the answers CSV + results.csv") { cli_options[:retry_failed] = true }
  opts.on("--dry-run", "Print prompts without calling the LLM or writing files") { cli_options[:dry_run] = true }
  opts.on("-h", "--help", "Show this help") { puts opts; exit }
end.parse!

if cli_options[:retry_failed]
  conflicts = []
  conflicts << "--rebuild"        if cli_options[:rebuild]
  conflicts << "--resume"         if cli_options[:resume]
  conflicts << "--evaluate-only"  if cli_options[:evaluate_only]
  conflicts << "--dry-run"        if cli_options[:dry_run]
  unless conflicts.empty?
    warn "Error: --retry-failed cannot be combined with #{conflicts.join(', ')}"
    exit 1
  end
end

if cli_options[:evaluate_only]
  register_models()
  run_evaluate()
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
