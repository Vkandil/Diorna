export interface ClozeCard {
  index: number;
  answer: string;
  prompt: string;
}

export function extractClozeCards(text: string): ClozeCard[] {
  const matches = [...text.matchAll(/\{\{c(\d+)::(.+?)\}\}/g)];
  const groups = new Map<number, string[]>();
  for (const match of matches) {
    const index = Number(match[1]);
    groups.set(index, [...(groups.get(index) ?? []), match[2]!]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, answers]) => ({
      index,
      answer: answers.join("; "),
      prompt: text.replace(/\{\{c(\d+)::(.+?)\}\}/g, (_, number: string, answer: string) =>
        Number(number) === index ? "[…]" : answer,
      ),
    }));
}

export function retentionRate(grades: Array<"again" | "hard" | "good" | "easy">): number | null {
  if (!grades.length) return null;
  return Math.round((grades.filter((grade) => grade !== "again").length / grades.length) * 100);
}
