#!/usr/bin/env ruby
# frozen_string_literal: true

require "bundler/inline"

gemfile do
  source "https://rubygems.org"
  gem "ruby_llm", "~> 1.0"
  gem "csv"
end

require "json"
require "fileutils"
require "csv"
require "net/http"
require "uri"

OLLAMA_API_BASE     = "http://localhost:1976/v1".freeze
OPENROUTER_API_BASE = "https://openrouter.ai/api/v1".freeze
RESULTS_CSV_PATH    = File.expand_path("results.csv", __dir__).freeze
OUTPUT_PATH         = File.expand_path("models.json", __dir__).freeze

PROVIDER_PRIORITY = %w[ollama openrouter openai anthropic gemini mistral xai].freeze

# Maps each benchmark provider to its Hugging Face organization. Used to
# construct candidate HF model IDs for parameter-count lookups without
# hardcoding every model name.
HF_ORG_BY_PROVIDER = {
  "apple"      => "apple",
  "deepseek"   => "deepseek-ai",
  "google"     => "google",
  "meta-llama" => "meta-llama",
  "microsoft"  => "microsoft",
  "openai"     => "openai",
  "poolside"   => "poolside",
  "qwen"       => "Qwen",
  "tencent"    => "tencent",
  "xiaomi"     => "XiaomiMiMo"
}.freeze

# Explicit HF model ID overrides for cases where dynamic construction
# doesn't match the canonical HF name (e.g. Google's `-it` instruct suffix,
# MLX variants which reuse the base model's safetensors).
HF_MODEL_ID_OVERRIDES = {
  "gemma-4-e2b"      => "google/gemma-4-E2B-it",
  "gemma-4-e4b"      => "google/gemma-4-E4B-it",
  "qwen3.5-0.8b-mlx" => "Qwen/Qwen3.5-0.8B"
}.freeze

def benchmark_model_providers
  result = {}
  CSV.foreach(RESULTS_CSV_PATH, headers: true) do |row|
    result[row["model"]] ||= row["provider"]
  end
  result
end

def matches_benchmark_model?(model_id, benchmark_names)
  short = model_id.to_s.split("/").last.sub(":free", "")
  benchmark_names.include?(short)
end

def pick_best(matches)
  matches.sort_by do |m|
    provider_rank = PROVIDER_PRIORITY.index(m.provider) || PROVIDER_PRIORITY.size
    free_penalty = m.id.include?(":free") ? 1 : 0
    [provider_rank, free_penalty]
  end.first
end

# Fetches the total parameter count (in billions) for a Hugging Face model.
# Returns nil if the model can't be found or has no safetensors data.
def fetch_billion_params(hf_model_id)
  uri = URI("https://huggingface.co/api/models/#{hf_model_id}")
  response = Net::HTTP.get_response(uri)
  return nil unless response.is_a?(Net::HTTPSuccess)

  data = JSON.parse(response.body)
  params_by_dtype = data.dig("safetensors", "parameters")
  return nil unless params_by_dtype.is_a?(Hash) && !params_by_dtype.empty?

  (params_by_dtype.values.sum.to_f / 1e9).round(2)
rescue StandardError => e
  warn "Failed to fetch params for #{hf_model_id}: #{e.class}: #{e.message}"
  nil
end

# Returns HF model IDs under the given org that match a short name. Used as
# a fallback when direct title-cased construction doesn't find a match.
def search_hf_ids(short_name, org)
  uri = URI("https://huggingface.co/api/models?search=#{URI.encode_www_form_component(short_name)}&limit=5")
  response = Net::HTTP.get_response(uri)
  return [] unless response.is_a?(Net::HTTPSuccess)

  data = JSON.parse(response.body)
  data.filter_map { |m| m["modelId"] if m["modelId"]&.start_with?("#{org}/") }
rescue StandardError => e
  warn "HF search failed for #{short_name}: #{e.class}: #{e.message}"
  []
end

# Returns the ordered list of HF model IDs to try for a benchmark model.
# Order: explicit override, then title-cased candidate, then original-case
# candidate, then HF search results filtered to the provider's org.
def hf_id_candidates(short_name, provider)
  return [HF_MODEL_ID_OVERRIDES[short_name]] if HF_MODEL_ID_OVERRIDES.key?(short_name)

  org = HF_ORG_BY_PROVIDER[provider]
  return [] unless org

  title_cased = short_name.split("-").map(&:capitalize).join("-")
  candidates = ["#{org}/#{title_cased}", "#{org}/#{short_name}"]
  candidates.concat(search_hf_ids(short_name, org))
  candidates.uniq
end

# Tries each candidate HF ID and returns the first billion_params value
# that resolves successfully, or nil if none do.
def find_billion_params(short_name, provider)
  hf_id_candidates(short_name, provider).each do |hf_id|
    billions = fetch_billion_params(hf_id)
    return billions if billions
  end
  nil
end

def enrich_with_params(model_hash, short_name, provider)
  billions = find_billion_params(short_name, provider)
  return model_hash if billions.nil?

  model_hash.merge(billion_params: billions)
end

RubyLLM.configure do |config|
  config.ollama_api_base     = OLLAMA_API_BASE
  config.ollama_api_key      = "dummy-key"
  config.openrouter_api_base = OPENROUTER_API_BASE
  config.openrouter_api_key  = ENV["OPENROUTER_API_KEY"] if ENV["OPENROUTER_API_KEY"]
end

puts "Fetching models..."
RubyLLM.models.refresh!

benchmark_providers = benchmark_model_providers
benchmark_names = benchmark_providers.keys
matched = RubyLLM.models.all.select { |m| matches_benchmark_model?(m.id, benchmark_names) }

# Group by benchmark model name and pick best per group
by_benchmark = matched.group_by do |m|
  m.id.to_s.split("/").last.sub(":free", "")
end

deduped = by_benchmark.map { |_name, variants| pick_best(variants) }.compact.sort_by(&:id)

FileUtils.mkdir_p(File.dirname(OUTPUT_PATH))
File.write(OUTPUT_PATH, JSON.pretty_generate(
  deduped.map { |m| enrich_with_params(m.to_h, m.id.split("/").last.sub(":free", ""), benchmark_providers[m.id.split("/").last.sub(":free", "")]) }
))

puts "Exported #{deduped.size} models to #{OUTPUT_PATH}"
puts "Matched: #{by_benchmark.keys.join(', ')}"
missing = benchmark_names - by_benchmark.keys
puts "Missing (Ollama not connected?): #{missing.join(', ')}" if missing.any?
