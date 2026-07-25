#!/usr/bin/env ruby
# frozen_string_literal: true

require "net/http"
require "json"
require "base64"
require "fileutils"
require "uri"
require "optparse"

DATA_DIR    = File.expand_path("../test/2025", __dir__)
IMAGES_DIR  = File.join(DATA_DIR, "images")
AREA_FILES  = (1..4).map { |n| File.join(DATA_DIR, "area-#{n}.json") }
HTTP_TIMEOUT = 120
RETRIES      = 3

options = {
  model:    ENV.fetch("DESCRIBE_MODEL", "openai/gpt-4o-mini"),
  effort:   (ENV["DESCRIBE_EFFORT"] || "low").to_sym,
  dry_run:  false,
  only:     nil
}

OptionParser.new do |opts|
  opts.banner = "Usage: ruby describe_images.rb [--model=ID] [--effort=low|medium|high] [--only=question|shared|option] [--dry-run]"
  opts.on("--model=ID")      { |v| options[:model] = v }
  opts.on("--effort=LEVEL")  { |v| options[:effort] = v.to_sym }
  opts.on("--only=KIND")     { |v| options[:only] = v.to_sym }
  opts.on("--dry-run")        { options[:dry_run] = true }
end.parse!

API_KEY = ENV["OPENROUTER_API_KEY"]
abort "Error: OPENROUTER_API_KEY env var is required" if API_KEY.nil? || API_KEY.empty?

SYSTEM_PROMPT = <<~PROMPT.strip
  Eres un asistente que describe figuras e imágenes de exámenes académicos de nivel bachillerato UNAM.
  Tu descripción será usada por un modelo de lenguaje que NO puede ver la imagen, para que pueda responder la pregunta asociada.
  Debes describir con suficiente detalle técnico y visual (incluye etiquetas, números, ecuaciones, símbolos, posiciones y leyendas visibles en la imagen) para que el modelo pueda contestar la pregunta sin ver la imagen.
  Responde exclusivamente en español, en prosa clara, sin introducciones ni despedidas. No uses viñetas ni listas. No digas "la imagen muestra"; empieza directamente con el contenido.
PROMPT

def encode_image(path)
  ext = File.extname(path).downcase.delete(".")
  mime = case ext
         when "webp" then "image/webp"
         when "png"  then "image/png"
         when "jpg", "jpeg" then "image/jpeg"
         when "gif"  then "image/gif"
         else "application/octet-stream"
         end
  "data:#{mime};base64,#{Base64.strict_encode64(File.binread(path))}"
end

def call_openrouter(model:, image_paths:, extra_context:, effort:, retries: RETRIES)
  attempt = 0
  begin
    attempt += 1
    user_text = +"#{extra_context.strip}\n\n"
    user_text << "Número de imágenes: #{image_paths.size}.\n" if image_paths.size > 1

    content = [{ type: "text", text: user_text }]
    image_paths.each do |p|
      content << { type: "image_url", image_url: { url: encode_image(p) } }
    end

    body = {
      model: model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: content }
      ],
      temperature: 0
    }
    body[:reasoning] = { effort: effort.to_s } if effort

    uri = URI("https://openrouter.ai/api/v1/chat/completions")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.open_timeout = HTTP_TIMEOUT
    http.read_timeout = HTTP_TIMEOUT
    req = Net::HTTP::Post.new(uri.request_uri, {
      "Authorization" => "Bearer #{API_KEY}",
      "Content-Type"  => "application/json"
    })
    req.body = JSON.generate(body)
    response = http.request(req)
    unless response.is_a?(Net::HTTPSuccess)
      raise "HTTP #{response.code}: #{response.body[0, 400]}"
    end

    parsed = JSON.parse(response.body)
    parsed.dig("choices", 0, "message", "content").to_s.strip
  rescue StandardError => e
    if attempt < retries
      warn "  retry #{attempt}/#{retries} (#{e.message})"
      sleep(1.5 * attempt)
      retry
    end
    raise
  end
end

def resolve_local(path)
  File.join(IMAGES_DIR, File.basename(path))
end

def describe_question_reference(area_number, question_number, ref, model:, effort:, dry_run:)
  case ref["type"]
  when "text"
    false
  when "image"
    context = <<~CTX.strip
      Área: #{area_number}, Pregunta: #{question_number}
      Pregunta: (ver JSON)
      Describe la figura de manera que el modelo pueda usarla para responder la pregunta.
    CTX
    if dry_run
      puts "  [dry-run] image: #{ref['path']} (#{ref['alt']})"
      return false
    end
    description = call_openrouter(
      model: model,
      image_paths: [resolve_local(ref["path"])],
      extra_context: context,
      effort: effort
    )
    ref["type"]        = "text"
    ref["content"]     = description
    ref["derived_from"] = ref["path"]
    ref["source_url"] ||= nil
    true
  when "image_set"
    image_paths = ref["images"].map { |i| resolve_local(i["path"]) }
    image_labels = ref["images"].map { |i| "#{i['label']} (#{i['path']})" }.join(", ")
    context = <<~CTX.strip
      Área: #{area_number}, Pregunta: #{question_number}
      Título: #{ref['title']}
      Etiquetas: #{image_labels}
      Describe cada figura (en orden) de manera que el modelo pueda usarlas para responder la pregunta.
    CTX
    if dry_run
      puts "  [dry-run] image_set: #{image_paths.size} images for Q#{question_number}"
      return false
    end
    description = call_openrouter(
      model: model,
      image_paths: image_paths,
      extra_context: context,
      effort: effort
    )
    ref["type"]         = "text"
    ref["content"]      = description
    ref["derived_from"] = ref["images"].map { |i| i["path"] }
    ref.delete("images")
    true
  else
    false
  end
end

def describe_shared_reference(ref, model:, effort:, dry_run:)
  return false unless ref["type"] == "image"
  context = <<~CTX.strip
    Referencia compartida del examen UNAM (aplica a preguntas de #{ref['applies_to_subjects'].join(', ')}).
    Describe la tabla periódica con detalle: grupos, periodos, metales/no metales, gases nobles, etc., suficiente para responder preguntas de química general.
  CTX
  if dry_run
    puts "  [dry-run] shared: #{ref['path']}"
    return false
  end
  description = call_openrouter(
    model: model,
    image_paths: [resolve_local(ref["path"])],
    extra_context: context,
    effort: effort
  )
  ref["type"]        = "text"
  ref["content"]     = description
  ref["derived_from"] = ref["path"]
  ref["description"] = nil
  true
end

def describe_option_image(area_number, question_number, option_letter, opt, model:, effort:, dry_run:)
  return false unless opt.is_a?(Hash) && opt["image"]
  context = <<~CTX.strip
    Área: #{area_number}, Pregunta: #{question_number}, Opción #{option_letter}
    Describe el contenido de esta opción (es una respuesta de opción múltiple).
  CTX
  if dry_run
    puts "  [dry-run] option: area #{area_number} Q#{question_number} #{option_letter} -> #{opt['image']}"
    return false
  end
  description = call_openrouter(
    model: model,
    image_paths: [resolve_local(opt["image"])],
    extra_context: context,
    effort: effort
  )
  opt["image_description"] = description
  true
end

total = 0
AREA_FILES.each do |path|
  area_number = File.basename(path, ".json").split("-").last.to_i
  data = JSON.parse(File.read(path))
  changed = false

  if options[:only].nil? || options[:only] == :shared
    (data["shared_references"] || []).each do |ref|
      if describe_shared_reference(ref, model: options[:model], effort: options[:effort], dry_run: options[:dry_run])
        changed = true
        total += 1
        puts "  shared OK: #{ref['derived_from']}"
      end
    end
  end

  data["questions"].each do |q|
    if q["reference"] && (options[:only].nil? || options[:only] == :question)
      if describe_question_reference(area_number, q["number"], q["reference"], model: options[:model], effort: options[:effort], dry_run: options[:dry_run])
        changed = true
        total += 1
        puts "  Q#{q["number"]} ref OK"
      end
    end
    if options[:only].nil? || options[:only] == :option
      (q["options"] || {}).each do |letter, opt|
        if describe_option_image(area_number, q["number"], letter, opt, model: options[:model], effort: options[:effort], dry_run: options[:dry_run])
          changed = true
          total += 1
          puts "  Q#{q["number"]} opt #{letter} OK"
        end
      end
    end
  end

  if changed && !options[:dry_run]
    File.write(path, "#{JSON.pretty_generate(data)}\n")
    puts "Wrote #{path}"
  end
end

puts
puts "Described: #{total} entries"
