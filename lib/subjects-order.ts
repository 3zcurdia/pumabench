export const SUBJECT_ORDER: readonly string[] = [
	"Matemáticas",
  "Física",
  "Química",
  "Biología",
  "Español",
  "Filosofía",
  "Literatura",
  "Historia Universal",
  "Historia de México",
  "Geografía",
];

const ORDER_INDEX: Record<string, number> = Object.fromEntries(
  SUBJECT_ORDER.map((name, i) => [name, i]),
);

export function subjectIndex(name: string): number {
  return ORDER_INDEX[name] ?? Number.MAX_SAFE_INTEGER;
}

export function sortSubjects(names: Iterable<string>): string[] {
  return Array.from(names).sort((a, b) => {
    const ai = subjectIndex(a);
    const bi = subjectIndex(b);
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b, "es");
  });
}
