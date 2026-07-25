#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "fileutils"

DATA_DIR     = File.expand_path("../test/2025", __dir__)
IMAGES_DIR   = File.join(DATA_DIR, "images")
MANIFEST     = JSON.parse(File.read(File.join(IMAGES_DIR, "manifest.json")))
PASSAGES_DIR = File.expand_path("../test/2025/passages", __dir__)
FileUtils.mkdir_p(PASSAGES_DIR)

SPANISH_PASSAGES = {
  1 => { range: 77..81, title: "Metamorfosis",       author: "Maruja Torres",
         source: "El País, 8 de julio de 1986" },
  2 => { range: 74..78, title: "Tiempo libre",       author: "Guillermo Samperio",
         source: nil },
  3 => { range: 69..73, title: "El misterio de las joyas de concha",
         author: nil, source: "El Universal" },
  4 => { range: 67..71, title: "La mente colectiva", author: nil,
         source: "Texto sobre la novela *Más que humano* (1953) de Theodore Sturgeon" }
}.freeze

COMPOSITE_FIGURES = {
  3 => {
    51 => {
      layout: "horizontal",
      labels: { "A" => "I", "B" => "II", "C" => "III", "D" => "IV" },
      title:  "Cuatro gráficas etiquetadas I, II, III y IV"
    }
  }
}.freeze

def passage_text(area)
  path = File.join(PASSAGES_DIR, "area-#{area}.txt")
  return File.read(path) if File.exist?(path)
  nil
end

def image_entry_for(area:, question:, option: nil)
  if option
    MANIFEST["images"].find { |e| e["area"] == area && e["question"] == question && e["option"] == option && e["kind"] == "option" }
  else
    MANIFEST["images"].find { |e| e["area"] == area && e["question"] == question && e["kind"] == "question" }
  end
end

def option_entries_for(area:, question:)
  MANIFEST["images"].select { |e| e["area"] == area && e["question"] == question && e["kind"] == "option" }
                     .sort_by { |e| e["option"] }
end

def shared_entry_for(area)
  MANIFEST["images"].find { |e| e["area"] == area && e["kind"] == "shared" }
end

AREA_FILES = (1..4).map { |n| File.join(DATA_DIR, "area-#{n}.json") }

AREA_FILES.each do |path|
  area_number = File.basename(path, ".json").split("-").last.to_i
  data = JSON.parse(File.read(path))

  data["shared_references"] = []
  shared = shared_entry_for(area_number)
  if shared
    data["shared_references"] << {
      "id"                  => "periodic-table-area-#{area_number}",
      "type"                => "image",
      "path"                => shared["path"],
      "source_url"          => shared["source_url"],
      "applies_to_subjects" => ["Química"],
      "description"         => "Tabla periódica de los elementos químicos."
    }
  end

  passage_meta = SPANISH_PASSAGES[area_number]
  passage_text_str = passage_text(area_number)

  data["questions"].each do |q|
    q.delete("reference")
    q["question"] = q["question"].gsub(/\s*\[imagen\]\s*/, " ").gsub(/\s{2,}/, " ").rstrip

    if q["options"].is_a?(Hash)
      q["options"].each do |letter, value|
        is_image_placeholder =
          value.is_a?(String) && (
            value.match?(/^[A-D]\)\s*\[imagen\]\s*$/) ||
            value.match?(/^[A-D]\)\s*Opción\s+[A-D]\s*$/)
          )
        if is_image_placeholder
          entry = image_entry_for(area: area_number, question: q["number"], option: letter)
          if entry
            q["options"][letter] = {
              "label" => letter,
              "image" => entry["path"],
              "alt"   => "Opción #{letter} para la pregunta #{q["number"]}."
            }
          end
        end
      end
    end

    if passage_meta && passage_text_str && passage_meta[:range].cover?(q["number"])
      q["reference"] = {
        "type"    => "text",
        "content" => passage_text_str.strip,
        "title"   => passage_meta[:title],
        "author"  => passage_meta[:author],
        "source"  => passage_meta[:source]
      }
    end

    composite = COMPOSITE_FIGURES.dig(area_number, q["number"])
    if composite && !q["reference"]
      opt_entries = option_entries_for(area: area_number, question: q["number"])
      if opt_entries.any?
        q["reference"] = {
          "type"        => "image_set",
          "title"       => composite[:title],
          "layout"      => composite[:layout],
          "images"      => opt_entries.map do |e|
            label = composite[:labels][e["option"]] || e["option"]
            {
              "label"      => label,
              "path"       => e["path"],
              "source_url" => e["source_url"]
            }
          end
        }
      end
    end

    if q["reference"].nil?
      entry = image_entry_for(area: area_number, question: q["number"])
      if entry
        q["reference"] = {
          "type"       => "image",
          "path"       => entry["path"],
          "source_url" => entry["source_url"],
          "alt"        => "Figura asociada a la pregunta #{q["number"]}."
        }
      end
    end
  end

  File.write(path, "#{JSON.pretty_generate(data)}\n")
  puts "Wrote #{path}"
end
