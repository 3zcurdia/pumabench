import type { OptionValue } from "./types";

/**
 * Renders an answer option for display. Options may be plain strings or image
 * objects; for images we prefer the multimodal description, falling back to a
 * labelled placeholder.
 */
export function renderOptionValue(val: OptionValue): string {
  if (typeof val === "string") return val;
  return val.image_description ?? `[Imagen: ${val.label}]`;
}
