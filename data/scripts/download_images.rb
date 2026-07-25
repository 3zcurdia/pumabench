#!/usr/bin/env ruby
# frozen_string_literal: true

require "net/http"
require "json"
require "fileutils"
require "uri"
require "digest"

IMAGES_DIR = File.expand_path("../test/2025/images", __dir__)
MANIFEST_PATH = File.join(IMAGES_DIR, "manifest.json")
TIMEOUT = 60

MANIFEST = [
  # area 1 — periodic table (shared)
  { path: "periodic-table-area-1.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/Tabla-periodica_pumas_becas_mate.webp", area: 1, kind: "shared", applies_to_subjects: ["Química"] },

  # area 1 — question figures
  { path: "area-1-q2.webp",  source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025areaIp2.webp",  area: 1, question: 2,  kind: "question" },
  { path: "area-1-q3.webp",  source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025areaIp3.webp",  area: 1, question: 3,  kind: "question" },
  { path: "area-1-q9.webp",  source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025areaIp9.webp",  area: 1, question: 9,  kind: "question" },
  { path: "area-1-q11.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025areaIp11.webp", area: 1, question: 11, kind: "question" },
  { path: "area-1-q12.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025areaIp12.webp", area: 1, question: 12, kind: "question" },
  { path: "area-1-q13.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025areaIp13.webp", area: 1, question: 13, kind: "question" },
  { path: "area-1-q38.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025area1p38.webp", area: 1, question: 38, kind: "question" },
  { path: "area-1-q60.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025area1p60.webp", area: 1, question: 60, kind: "question" },
  { path: "area-1-q69.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025area1p69.webp", area: 1, question: 69, kind: "question" },

  # area 1 — option images for Q3
  { path: "area-1-q3-opt-A.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025areaIp3-a.webp", area: 1, question: 3, option: "A", kind: "option" },
  { path: "area-1-q3-opt-B.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025areaIp3-b.webp", area: 1, question: 3, option: "B", kind: "option" },
  { path: "area-1-q3-opt-C.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025areaIp3-c.webp", area: 1, question: 3, option: "C", kind: "option" },
  { path: "area-1-q3-opt-D.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/unam2025areaIp3-d.webp", area: 1, question: 3, option: "D", kind: "option" },

  # area 2 — periodic table (shared)
  { path: "periodic-table-area-2.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/Tabla-periodica.webp", area: 2, kind: "shared", applies_to_subjects: ["Química"] },

  # area 2 — question figures
  { path: "area-2-q2.webp",  source_url: "https://pumabecas.com/wp-content/uploads/2025/01/UNAM2025areaIIp2.webp",  area: 2, question: 2,  kind: "question" },
  { path: "area-2-q3.webp",  source_url: "https://pumabecas.com/wp-content/uploads/2025/01/UNAM2025areaIIp3.webp",  area: 2, question: 3,  kind: "question" },
  { path: "area-2-q4.webp",  source_url: "https://pumabecas.com/wp-content/uploads/2025/01/UNAM2025areaIIp4.webp",  area: 2, question: 4,  kind: "question" },
  { path: "area-2-q8.webp",  source_url: "https://pumabecas.com/wp-content/uploads/2025/01/UNAM2025areaIIp8.webp",  area: 2, question: 8,  kind: "question" },
  { path: "area-2-q34.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/UNAM2025areaIIp34.webp", area: 2, question: 34, kind: "question" },
  { path: "area-2-q52.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/UNAM2025areaIIp52.webp", area: 2, question: 52, kind: "question" },
  { path: "area-2-q58.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/UNAM2025areaIIp58.webp", area: 2, question: 58, kind: "question" },
  { path: "area-2-q68.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/UNAM2025areaIIp68.webp", area: 2, question: 68, kind: "question" },

  # area 2 — option images for Q35
  { path: "area-2-q35-opt-A.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/UNAM2025areaIIp35a.webp", area: 2, question: 35, option: "A", kind: "option" },
  { path: "area-2-q35-opt-B.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/UNAM2025areaIIp35b.webp", area: 2, question: 35, option: "B", kind: "option" },
  { path: "area-2-q35-opt-C.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/UNAM2025areaIIp35c.webp", area: 2, question: 35, option: "C", kind: "option" },
  { path: "area-2-q35-opt-D.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/UNAM2025areaIIp35d.webp", area: 2, question: 35, option: "D", kind: "option" },

  # area 3 — periodic table (shared)
  { path: "periodic-table-area-3.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/Tabla-periodica.webp", area: 3, kind: "shared", applies_to_subjects: ["Química"] },

  # area 3 — question figures
  { path: "area-3-q1.webp",  source_url: "https://pumabecas.com/wp-content/uploads/2025/02/UNAM2025areaIIIp1.webp",  area: 3, question: 1,  kind: "question" },
  { path: "area-3-q3.webp",  source_url: "https://pumabecas.com/wp-content/uploads/2025/02/UNAM2025areaIIIp3.webp",  area: 3, question: 3,  kind: "question" },
  { path: "area-3-q5.webp",  source_url: "https://pumabecas.com/wp-content/uploads/2025/02/UNAM2025areaIIIp5.webp",  area: 3, question: 5,  kind: "question" },
  { path: "area-3-q8.webp",  source_url: "https://pumabecas.com/wp-content/uploads/2025/02/UNAM2025areaIIIp8.webp",  area: 3, question: 8,  kind: "question" },
  { path: "area-3-q10.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/02/UNAM2025areaIIIp10.webp", area: 3, question: 10, kind: "question" },
  { path: "area-3-q50.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/02/UNAM2025areaIIIp50.webp", area: 3, question: 50, kind: "question" },
  { path: "area-3-q54.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/02/UNAM2025areaIIIp54.webp", area: 3, question: 54, kind: "question" },
  { path: "area-3-q58.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/02/UNAM2025areaIIIp58.webp", area: 3, question: 58, kind: "question" },

  # area 3 — option images for Q51
  { path: "area-3-q51-opt-A.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/02/UNAM2025areaIIIp51a.webp", area: 3, question: 51, option: "A", kind: "option" },
  { path: "area-3-q51-opt-B.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/02/UNAM2025areaIIIp51b.webp", area: 3, question: 51, option: "B", kind: "option" },
  { path: "area-3-q51-opt-C.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/02/UNAM2025areaIIIp51c.webp", area: 3, question: 51, option: "C", kind: "option" },
  { path: "area-3-q51-opt-D.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/02/UNAM2025areaIIIp51d.webp", area: 3, question: 51, option: "D", kind: "option" },

  # area 4 — periodic table (shared)
  { path: "periodic-table-area-4.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/01/Tabla-periodica.webp", area: 4, kind: "shared", applies_to_subjects: ["Química"] },

  # area 4 — question figures
  { path: "area-4-q51.webp", source_url: "https://pumabecas.com/wp-content/uploads/2025/02/unam2025areaVp51.webp", area: 4, question: 51, kind: "question" }
].freeze

def download(url, dest, redirects_remaining: 5)
  uri = URI(url)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == "https"
  http.open_timeout = TIMEOUT
  http.read_timeout = TIMEOUT
  response = http.get(uri.request_uri)
  if response.is_a?(Net::HTTPRedirection) && redirects_remaining.positive? && response["location"]
    next_uri = URI(response["location"])
    next_uri = uri + next_uri if next_uri.relative?
    return download(next_uri.to_s, dest, redirects_remaining: redirects_remaining - 1)
  end
  return [false, "HTTP #{response.code}"] unless response.is_a?(Net::HTTPSuccess)
  File.binwrite(dest, response.body)
  [true, response.body.bytesize]
end

FileUtils.mkdir_p(IMAGES_DIR)

downloaded = skipped = failed = 0
File.open(MANIFEST_PATH, "w") do |f|
  f.puts "{"
  f.puts '  "images": ['
  MANIFEST.each_with_index do |entry, i|
    local = File.join(IMAGES_DIR, entry[:path])
    if File.exist?(local) && File.size(local) > 0
      status = "skip"
      skipped += 1
    else
      ok, info = download(entry[:source_url], local)
      if ok
        status = "ok (#{info} bytes)"
        downloaded += 1
      else
        status = "FAIL: #{info}"
        failed += 1
      end
    end
    puts "[#{status}] #{entry[:path]}"
    f.write("    " + JSON.generate(entry))
    f.write(",") unless i == MANIFEST.size - 1
    f.puts
  end
  f.puts "  ]"
  f.puts "}"
end

puts
puts "Downloaded: #{downloaded}, skipped: #{skipped}, failed: #{failed}"
puts "Manifest: #{MANIFEST_PATH}"
exit(failed.zero? ? 0 : 1)
