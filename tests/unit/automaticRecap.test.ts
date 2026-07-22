import { beforeEach, describe, expect, it } from "vitest";
import { useDiornaStore } from "@/core/store";
import { generateDueAutomaticRecaps } from "@/modules/recap/automatic";

describe("automatic recap generation", () => {
  beforeEach(() => useDiornaStore.getState().resetAll());

  it("does nothing away from the first day of a month", async () => {
    expect(await generateDueAutomaticRecaps(new Date("2026-08-02T12:00:00"))).toEqual([]);
    expect(useDiornaStore.getState().recaps).toHaveLength(0);
  });

  it("generates one deterministic previous-month recap per workspace exactly once", async () => {
    const generated = await generateDueAutomaticRecaps(new Date("2026-08-01T12:00:00"));
    expect(generated).toHaveLength(2);
    expect(useDiornaStore.getState().recaps).toHaveLength(2);
    expect(
      useDiornaStore.getState().recaps.every((recap) => recap.periodStart === "2026-07-01"),
    ).toBe(true);
    expect(
      useDiornaStore
        .getState()
        .recaps.every((recap) => recap.modelUsed === "deterministic-template"),
    ).toBe(true);
    expect(
      useDiornaStore.getState().notes.filter((note) => note.tags.includes("recap")),
    ).toHaveLength(2);
    expect(await generateDueAutomaticRecaps(new Date("2026-08-01T18:00:00"))).toEqual([]);
  });

  it("honours disabled automatic triggers", async () => {
    useDiornaStore.getState().updateSettings({
      recapAutoMonthly: false,
      recapAutoYearly: false,
    });
    expect(await generateDueAutomaticRecaps(new Date("2027-01-01T12:00:00"))).toEqual([]);
  });

  it("creates yearly reports with their generated December monthly summary", async () => {
    const generated = await generateDueAutomaticRecaps(new Date("2027-01-01T12:00:00"));
    expect(generated).toHaveLength(4);
    const yearly = useDiornaStore.getState().recaps.filter((recap) => recap.periodType === "year");
    expect(yearly).toHaveLength(2);
    expect(yearly.every((recap) => recap.stats.monthlyRecaps?.length === 1)).toBe(true);
  });
});
