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

export function longestReviewStreak(reviewedAt: string[]): number {
  const days = [...new Set(reviewedAt.map((value) => value.slice(0, 10)))].sort();
  let longest = 0;
  let current = 0;
  let previous: number | undefined;
  days.forEach((day) => {
    const value = Date.parse(`${day}T00:00:00Z`);
    current = previous !== undefined && value - previous === 86_400_000 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = value;
  });
  return longest;
}

export function extractNoteFlashcards(
  note: Note,
  existing: Flashcard[] = [],
  dueDate = new Date().toISOString().slice(0, 10),
): Flashcard[] {
  const cards: Array<Pick<Flashcard, "id" | "blockId" | "front" | "back" | "cardType">> = [];
  [...note.body.matchAll(/<div\b[^>]*data-type=["']flashcard["'][^>]*>/gi)].forEach(
    (match, index) => {
      const attributes = match[0];
      cards.push({
        id: `${note.id}-basic-${index + 1}`,
        blockId: `basic-${index + 1}`,
        front: decodeHtml(attribute(attributes, "front") || "Question"),
        back: decodeHtml(attribute(attributes, "back") || "Answer"),
        cardType: "basic",
      });
    },
  );
  extractClozeCards(htmlToText(note.body)).forEach((card) =>
    cards.push({
      id: `${note.id}-cloze-${card.index}`,
      blockId: `cloze-${card.index}`,
      front: card.prompt,
      back: card.answer,
      cardType: "cloze",
    }),
  );
  return cards.map((card) => {
    const previous = existing.find((entry) => entry.id === card.id);
    return {
      ...(previous ?? {
        ease: 2.5,
        intervalDays: 0,
        dueDate,
        reps: 0,
        lapses: 0,
      }),
      ...card,
      workspaceId: note.workspaceId,
      noteId: note.id,
    };
  });
}

function attribute(html: string, name: string): string {
  return html.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"))?.[1] ?? "";
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function htmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
import type { Flashcard, Note } from "@/shared/models";
