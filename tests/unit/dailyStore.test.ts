import { beforeEach, describe, expect, it } from "vitest";
import { useDiornaStore } from "@/core/store";

describe("daily store integration", () => {
  beforeEach(() => useDiornaStore.getState().resetAll());

  it("creates, edits, archives, restores, and reorders habits without losing entries", () => {
    const state = useDiornaStore.getState();
    state.setWorkspace("workspace-personal");
    const category = useDiornaStore
      .getState()
      .categories.find((entry) => entry.workspaceId === "workspace-personal")!;
    const first = useDiornaStore.getState().addHabit({
      name: "Water",
      categoryId: category.id,
      type: "quantity",
      target: 2,
      unit: "L",
      startDate: "2026-07-01",
      endDate: "2026-12-31",
    });
    const second = useDiornaStore.getState().addHabit({
      name: "Walk",
      categoryId: category.id,
      type: "checkbox",
    });
    useDiornaStore.getState().updateHabitEntry(first.id, "2026-07-20", 2.5);
    useDiornaStore.getState().updateHabitEntryNote(first.id, "2026-07-20", "After training");
    useDiornaStore.getState().moveHabit(second.id, first.id);
    useDiornaStore.getState().updateHabit(first.id, {
      archived: true,
      unit: null,
      target: null,
      startDate: null,
      endDate: null,
    });

    const current = useDiornaStore.getState();
    expect(current.habits.find((habit) => habit.id === second.id)!.sortOrder).toBeLessThan(
      current.habits.find((habit) => habit.id === first.id)!.sortOrder,
    );
    expect(current.habits.find((habit) => habit.id === first.id)).toMatchObject({
      archived: true,
    });
    expect(current.habits.find((habit) => habit.id === first.id)).not.toHaveProperty("target");
    expect(current.habitEntries.find((entry) => entry.habitId === first.id)).toMatchObject({
      value: 2.5,
      done: true,
      note: "After training",
    });
    useDiornaStore.getState().updateHabit(first.id, { archived: false });
    expect(useDiornaStore.getState().habits.find((habit) => habit.id === first.id)?.archived).toBe(
      false,
    );
    useDiornaStore.getState().clearHabitEntry(first.id, "2026-07-20");
    expect(useDiornaStore.getState().habitEntries.some((entry) => entry.habitId === first.id)).toBe(
      false,
    );
  });

  it("creates, updates, clears, and deletes a metric series", () => {
    useDiornaStore.getState().setWorkspace("workspace-personal");
    const category = useDiornaStore
      .getState()
      .categories.find((entry) => entry.workspaceId === "workspace-personal")!;
    const metric = useDiornaStore.getState().addMetric({
      name: "Sleep",
      unit: "h",
      categoryId: category.id,
      target: 8,
    });
    useDiornaStore.getState().updateMetricEntry(metric.id, "2026-07-20", 7.5);
    expect(useDiornaStore.getState().metricEntries.at(-1)).toMatchObject({ value: 7.5 });
    useDiornaStore.getState().updateMetric(metric.id, { target: null, name: "Deep sleep" });
    expect(useDiornaStore.getState().metrics.find((entry) => entry.id === metric.id)).toMatchObject(
      {
        name: "Deep sleep",
      },
    );
    expect(
      useDiornaStore.getState().metrics.find((entry) => entry.id === metric.id),
    ).not.toHaveProperty("target");
    useDiornaStore.getState().clearMetricEntry(metric.id, "2026-07-20");
    expect(
      useDiornaStore.getState().metricEntries.some((entry) => entry.metricId === metric.id),
    ).toBe(false);
    useDiornaStore.getState().updateMetricEntry(metric.id, "2026-07-21", 8);
    useDiornaStore.getState().deleteMetric(metric.id);
    expect(useDiornaStore.getState().metrics.some((entry) => entry.id === metric.id)).toBe(false);
    expect(
      useDiornaStore.getState().metricEntries.some((entry) => entry.metricId === metric.id),
    ).toBe(false);
  });
});
