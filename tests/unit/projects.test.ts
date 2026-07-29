import { beforeEach, describe, expect, it } from "vitest";
import { useDiornaStore } from "@/core/store";
import {
  buildProjectReview,
  goalProgress,
  projectDeadlineState,
  projectProgress,
} from "@/modules/projects/logic";

describe("Projects & Goals", () => {
  beforeEach(() => {
    useDiornaStore.getState().resetAll();
    useDiornaStore.getState().setWorkspace("workspace-personal");
  });

  it("coordinates calendar, notes, maps, daily and training without duplicating them", () => {
    const state = useDiornaStore.getState();
    const goal = state.addGoal({
      title: "Launch a sustainable business",
      purpose: "Build an independent source of income.",
      successDefinition: "The offer has its first paying customer.",
      horizon: "year",
    });
    const project = state.addProject({
      name: "Adaptogenic coffee launch",
      outcome: "The store is live and the first order has shipped.",
      description: "Validate, prepare and launch the differentiated offer.",
      kind: "work",
      goalId: goal.id,
      milestones: [{ title: "Validate audience" }, { title: "Launch store" }],
    });
    const note = state.addNote("Customer research");
    const map = state.addMap("Launch strategy");
    const category = state.categories.find((entry) => entry.workspaceId === "workspace-personal")!;
    const habit = state.addHabit({
      name: "Customer interview",
      categoryId: category.id,
      type: "checkbox",
    });
    const activity = state.addTrainingActivity({
      name: "Founder walk",
      kind: "custom",
    });
    state.linkProjectResource(project.id, "note", note.id);
    state.linkProjectResource(project.id, "map", map.id);
    state.linkProjectResource(project.id, "habit", habit.id);
    state.linkProjectResource(project.id, "training", activity.id);
    const task = state.addItem({
      kind: "task",
      title: "Interview five customers",
      description: "",
      categoryId: category.id,
      dueAt: "2026-08-01T18:00:00.000Z",
      allDay: false,
      priority: "high",
      subtasks: [],
      projectId: project.id,
      rruleExceptions: [],
      reminders: [],
    });

    const coordinated = useDiornaStore
      .getState()
      .projects.find((entry) => entry.id === project.id)!;
    expect(coordinated).toMatchObject({
      goalId: goal.id,
      linkedNoteIds: [note.id],
      linkedMapIds: [map.id],
      linkedHabitIds: [habit.id],
      linkedTrainingActivityIds: [activity.id],
    });
    expect(useDiornaStore.getState().items.find((entry) => entry.id === task.id)?.projectId).toBe(
      project.id,
    );
    expect(useDiornaStore.getState().notes.find((entry) => entry.id === note.id)).toBeDefined();
    expect(useDiornaStore.getState().maps.find((entry) => entry.id === map.id)).toBeDefined();
  });

  it("calculates automatic project and goal progress from tasks and milestones", () => {
    const state = useDiornaStore.getState();
    const goal = state.addGoal({ title: "Finish the semester" });
    const project = state.addProject({
      name: "Submit thesis",
      outcome: "The thesis is submitted and accepted.",
      kind: "study",
      goalId: goal.id,
      targetDate: "2026-08-05",
      milestones: [{ title: "Draft" }, { title: "Submission" }],
    });
    const category = state.categories.find((entry) => entry.workspaceId === "workspace-personal")!;
    state.addItem({
      kind: "task",
      title: "Write conclusion",
      description: "",
      categoryId: category.id,
      allDay: true,
      priority: "medium",
      subtasks: [],
      completedAt: "2026-07-29T12:00:00.000Z",
      projectId: project.id,
      rruleExceptions: [],
      reminders: [],
    });
    state.addItem({
      kind: "task",
      title: "Submit PDF",
      description: "",
      categoryId: category.id,
      allDay: true,
      priority: "high",
      subtasks: [],
      projectId: project.id,
      rruleExceptions: [],
      reminders: [],
    });
    const current = useDiornaStore.getState().projects.find((entry) => entry.id === project.id)!;
    state.updateProjectMilestone(current.id, current.milestones[0]!.id, {
      completedAt: "2026-07-29T12:00:00.000Z",
    });
    const updated = useDiornaStore.getState();
    const result = updated.projects.find((entry) => entry.id === project.id)!;
    expect(projectProgress(result, updated.items, updated.metricEntries)).toBe(50);
    expect(goalProgress(goal, updated.projects, updated.items, updated.metricEntries)).toBe(50);
    expect(projectDeadlineState(result, new Date("2026-07-29T12:00:00.000Z"))).toBe("soon");
    expect(buildProjectReview(result, updated.items, updated.metricEntries)).toContain(
      "1 of 2 linked tasks",
    );
  });

  it("records reviews and safely detaches calendar links when a project is removed", () => {
    const state = useDiornaStore.getState();
    const project = state.addProject({
      name: "Move apartment",
      outcome: "The move is complete.",
      kind: "personal",
    });
    const update = state.addProjectUpdate(project.id, {
      summary: "Signed the lease",
      wins: "New home confirmed",
      blockers: "",
      nextSteps: "Book the van",
    });
    expect(update?.summary).toBe("Signed the lease");
    expect(
      useDiornaStore.getState().projects.find((entry) => entry.id === project.id)?.updates,
    ).toHaveLength(1);
    state.purgeProject(project.id);
    expect(useDiornaStore.getState().projects.some((entry) => entry.id === project.id)).toBe(false);
  });
});
