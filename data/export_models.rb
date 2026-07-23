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

OLLAMA_API_BASE     = "http://localhost:1976/v1".freeze
OPENROUTER_API_BASE = "https://openrouter.ai/api/v1".freeze
RESULTS_CSV_PATH    = File.expand_path("results.csv", __dir__).freeze
OUTPUT_PATH         = File.expand_path("models.json", __dir__).freeze

PROVIDER_PRIORITY = %w[ollama openrouter openai anthropic gemini mistral xai].freeze

def benchmark_model_names
  CSV.foreach(RESULTS_CSV_PATH, headers: true).map { |row| row["model"] }.uniq
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

RubyLLM.configure do |config|
  config.ollama_api_base     = OLLAMA_API_BASE
  config.ollama_api_key      = "dummy-key"
  config.openrouter_api_base = OPENROUTER_API_BASE
  config.openrouter_api_key  = ENV["OPENROUTER_API_KEY"] if ENV["OPENROUTER_API_KEY"]
end

puts "Fetching models..."
RubyLLM.models.refresh!

benchmark_names = benchmark_model_names
matched = RubyLLM.models.all.select { |m| matches_benchmark_model?(m.id, benchmark_names) }

# Group by benchmark model name and pick best per group
by_benchmark = matched.group_by do |m|
  m.id.to_s.split("/").last.sub(":free", "")
end

deduped = by_benchmark.map { |_name, variants| pick_best(variants) }.compact.sort_by(&:id)

FileUtils.mkdir_p(File.dirname(OUTPUT_PATH))
File.write(OUTPUT_PATH, JSON.pretty_generate(deduped.map(&:to_h)))

puts "Exported #{deduped.size} models to #{OUTPUT_PATH}"
puts "Matched: #{by_benchmark.keys.join(', ')}"
missing = benchmark_names - by_benchmark.keys
puts "Missing (Ollama not connected?): #{missing.join(', ')}" if missing.any?
