#!/usr/bin/env ruby
# frozen_string_literal: true

require "csv"
require "json"
require "fileutils"
require "set"

TEST_DIR    = "test/2025".freeze
ANSWERS_DIR = "answers".freeze
RESULTS_DIR = "results".freeze
RESULTS_CSV = "results.csv".freeze
NUM_AREAS   = 4

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

def build_area_payload(area_data, model, timestamp, correct, total, subjects, all_subjects)
  subjects_out = all_subjects.sort.to_h do |name|
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

ALL_SUBJECTS = all_subjects

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

  Dir.glob(File.join(ANSWERS_DIR, "*", "*-area-#{area_number}.csv")).sort.each do |csv_path|
    model     = File.basename(File.dirname(csv_path))
    timestamp = File.basename(csv_path, ".csv").sub(/-area-\d+\z/, "")
    correct, total, subjects = score_csv(q_by_number, csv_path)
    payload = build_area_payload(area_data, model, timestamp, correct, total, subjects, ALL_SUBJECTS)
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

subject_cols = ALL_SUBJECTS.sort
header = ["model", "score", "avg points"]
header.concat((1..NUM_AREAS).map { |n| "area #{n}" })
header.concat(subject_cols)

CSV.open(RESULTS_CSV, "w") do |csv|
  csv << header
  aggregates.keys.sort.each do |model|
    agg = aggregates[model]
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
    csv << row
  end
end

puts "Wrote #{RESULTS_CSV}"
