import { beforeEach, describe, expect, it } from "vitest";
import { useDiornaStore } from "@/core/store";
import {
  buildFocusRecommendations,
  findFocusStudioSession,
  focusElapsedSeconds,
  focusPeriodStats,
  focusTimerState,
  formatFocusTimer,
} from "@/modules/focus/logic";
import type { FocusReview } from "@/shared/models";

const completedReview: FocusReview = {
  focusRating: 4,
  energyBefore: 3,
  energyAfter: 4,
  outcome: "The draft is ready.",
  wins: "Stayed with one outcome.",
  blockers: "",
  nextAction: "Ask for review.",
  sourceCompleted: true,
};

describe("Focus", () => {
  beforeEach(() => {
    useDiornaStore.getState().resetAll();
    useDiornaStore.getState().setWorkspace("workspace-personal");
  });

  it("keeps an accurate timer through pause, resume and completion", () => {
    const state = useDiornaStore.getState();
    const session = state.addFocusSession({
      title: "Write the proposal",
      intention: "Complete the first draft.",
      mode: "deep-work",
      plannedMinutes: 50,
      sourceType: "custom",
    });
    state.startFocusSession(session.id, "2026-07-29T10:00:00.000Z");
    expect(
      focusElapsedSeconds(
        useDiornaStore.getState().focusSessions.find((entry) => entry.id === session.id)!,
        Date.parse("2026-07-29T10:30:00.000Z"),
      ),
    ).toBe(1_800);
    state.pauseFocusSession(session.id, "2026-07-29T10:30:00.000Z");
    state.resumeFocusSession(session.id, "2026-07-29T10:40:00.000Z");
    state.completeFocusSession(session.id, completedReview, "2026-07-29T11:00:00.000Z");

    expect(
      useDiornaStore.getState().focusSessions.find((entry) => entry.id === session.id),
    ).toMatchObject({
      status: "completed",
      elapsedSeconds: 3_000,
      pauseCount: 1,
      review: { focusRating: 4, sourceCompleted: true },
    });
  });

  it("uses one timer state for remaining time, overtime and the latest paused session", () => {
    const state = useDiornaStore.getState();
    const older = state.addFocusSession({
      title: "Older paused block",
      mode: "deep-work",
      plannedMinutes: 25,
    });
    state.startFocusSession(older.id, "2026-07-29T08:00:00.000Z");
    state.pauseFocusSession(older.id, "2026-07-29T08:05:00.000Z");
    const latest = state.addFocusSession({
      title: "Latest paused block",
      mode: "study",
      plannedMinutes: 1,
    });
    state.startFocusSession(latest.id, "2026-07-29T10:00:00.000Z");
    state.pauseFocusSession(latest.id, "2026-07-29T10:00:30.000Z");

    const sessions = useDiornaStore.getState().focusSessions;
    expect(findFocusStudioSession(sessions)?.id).toBe(latest.id);

    const running = {
      ...sessions.find((entry) => entry.id === latest.id)!,
      status: "running" as const,
      plannedMinutes: 1,
      elapsedSeconds: 0,
      timerStartedAt: "2026-07-29T10:00:00.000Z",
    };
    expect(focusTimerState(running, Date.parse("2026-07-29T10:00:45.000Z"))).toMatchObject({
      elapsedSeconds: 45,
      remainingSeconds: 15,
      displaySeconds: 15,
      overtime: false,
    });
    expect(focusTimerState(running, Date.parse("2026-07-29T10:01:05.000Z"))).toMatchObject({
      elapsedSeconds: 65,
      remainingSeconds: 0,
      overtimeSeconds: 5,
      displaySeconds: 5,
      overtime: true,
    });
    expect(formatFocusTimer(3_665)).toBe("01:01:05");
  });

  it("closes the loop with a linked priority and Calendar task", () => {
    const state = useDiornaStore.getState();
    const category = state.categories.find(
      (entry) => entry.workspaceId === state.activeWorkspaceId,
    )!;
    const task = state.addItem({
      kind: "task",
      title: "Submit the assignment",
      description: "",
      categoryId: category.id,
      dueAt: "2026-07-29T18:00:00.000Z",
      allDay: false,
      priority: "high",
      subtasks: [],
      rruleExceptions: [],
      reminders: [],
    });
    const priority = state.addFocusPriority({
      date: "2026-07-29",
      title: task.title,
      sourceType: "calendar",
      sourceId: task.id,
      plannedMinutes: 25,
    });
    const session = state.addFocusSession({
      title: task.title,
      mode: "study",
      plannedMinutes: 25,
      sourceType: "calendar",
      sourceId: task.id,
      priorityId: priority.id,
    });
    state.startFocusSession(session.id, "2026-07-29T12:00:00.000Z");
    state.completeFocusSession(session.id, completedReview, "2026-07-29T12:25:00.000Z");

    const current = useDiornaStore.getState();
    expect(current.focusPriorities.find((entry) => entry.id === priority.id)?.completedAt).toBe(
      "2026-07-29T12:25:00.000Z",
    );
    expect(current.items.find((entry) => entry.id === task.id)?.completedAt).toBe(
      "2026-07-29T12:25:00.000Z",
    );
  });

  it("records completed linked quantity habits in Daily", () => {
    const state = useDiornaStore.getState();
    const category = state.categories.find(
      (entry) => entry.workspaceId === state.activeWorkspaceId,
    )!;
    const habit = state.addHabit({
      name: "Deep work",
      categoryId: category.id,
      type: "quantity",
      unit: "min",
      target: 45,
    });
    const session = state.addFocusSession({
      title: "Deep work",
      mode: "deep-work",
      plannedMinutes: 45,
      sourceType: "habit",
      sourceId: habit.id,
    });
    state.startFocusSession(session.id, "2026-07-29T08:00:00.000Z");
    state.completeFocusSession(session.id, completedReview, "2026-07-29T08:45:00.000Z");

    expect(
      useDiornaStore
        .getState()
        .habitEntries.find((entry) => entry.habitId === habit.id && entry.date === "2026-07-29"),
    ).toMatchObject({ done: true, value: 45, note: "Logged from Focus: Deep work" });
  });

  it("builds priority recommendations and period evidence", () => {
    const state = useDiornaStore.getState();
    const category = state.categories.find(
      (entry) => entry.workspaceId === state.activeWorkspaceId,
    )!;
    state.addItem({
      kind: "task",
      title: "Urgent client reply",
      description: "",
      categoryId: category.id,
      dueAt: "2026-07-29T14:00:00.000Z",
      allDay: false,
      priority: "high",
      subtasks: [],
      rruleExceptions: [],
      reminders: [],
    });
    const project = state.addProject({
      name: "Client campaign",
      outcome: "The campaign is approved.",
      kind: "work",
      health: "at-risk",
      nextAction: "Prepare the creative review",
    });
    const session = state.addFocusSession({
      title: "Creative review",
      mode: "creative",
      plannedMinutes: 50,
      sourceType: "project",
      sourceId: project.id,
    });
    state.startFocusSession(session.id, "2026-07-29T09:00:00.000Z");
    state.addFocusDistraction(session.id, { kind: "message", note: "Reply to chat" });
    state.completeFocusSession(session.id, completedReview, "2026-07-29T09:50:00.000Z");

    const current = useDiornaStore.getState();
    const suggestions = buildFocusRecommendations(
      current.items,
      current.projects,
      new Date("2026-07-29T08:00:00.000Z"),
    );
    expect(suggestions.urgent[0]?.title).toBe("Urgent client reply");
    expect(suggestions.projectActions[0]?.title).toBe("Prepare the creative review");
    expect(focusPeriodStats(current.focusSessions, "2026-07-01", "2026-07-31")).toMatchObject({
      sessions: 1,
      plannedMinutes: 50,
      actualMinutes: 50,
      averageRating: 4,
      distractions: 1,
      byMode: { creative: 50 },
    });
  });
});
