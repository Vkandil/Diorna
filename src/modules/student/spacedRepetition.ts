import { addDays, formatISO, parseISO } from "date-fns";
import type { Flashcard, FlashcardGrade } from "@/shared/models";

const gradeQuality: Record<FlashcardGrade, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

export interface ReviewResult extends Flashcard {
  intervalBefore: number;
  grade: FlashcardGrade;
}

export function reviewCard(
  card: Flashcard,
  grade: FlashcardGrade,
  reviewedOn = formatISO(new Date(), { representation: "date" }),
): ReviewResult {
  const quality = gradeQuality[grade];
  const intervalBefore = card.intervalDays;
  let ease = Math.max(1.3, card.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  let reps = card.reps;
  let lapses = card.lapses;
  let intervalDays: number;

  if (quality < 3) {
    reps = 0;
    lapses += 1;
    intervalDays = 1;
  } else {
    reps += 1;
    if (grade === "hard") ease = Math.max(1.3, ease - 0.15);
    if (grade === "easy") ease += 0.15;
    if (reps === 1) intervalDays = 1;
    else if (reps === 2) intervalDays = grade === "easy" ? 6 : 4;
    else {
      const modifier = grade === "hard" ? 0.8 : grade === "easy" ? 1.3 : 1;
      intervalDays = Math.max(1, Math.round(card.intervalDays * ease * modifier));
    }
  }

  return {
    ...card,
    ease: Number(ease.toFixed(2)),
    intervalDays,
    dueDate: formatISO(addDays(parseISO(reviewedOn), intervalDays), {
      representation: "date",
    }),
    reps,
    lapses,
    lastReviewedAt: `${reviewedOn}T12:00:00.000Z`,
    intervalBefore,
    grade,
  };
}
