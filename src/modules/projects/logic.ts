import type {
  CalendarItem,
  Goal,
  MetricEntry,
  Project,
  ProjectKind,
  ProjectMilestone,
} from "@/shared/models";

export interface ProjectTemplateDefinition {
  id: string;
  kind: ProjectKind;
  name: string;
  description: string;
  outcomePlaceholder: string;
  milestones: string[];
}

export const PROJECT_TEMPLATES: ProjectTemplateDefinition[] = [
  {
    id: "client-engagement",
    kind: "work",
    name: "Client engagement",
    description: "Calls, decisions, deliverables and follow-ups for a client or brand.",
    outcomePlaceholder: "The client has accepted the final deliverable.",
    milestones: [
      "Scope confirmed",
      "Kickoff call",
      "First delivery",
      "Client review",
      "Final handoff",
    ],
  },
  {
    id: "business-launch",
    kind: "work",
    name: "Business launch",
    description: "Research, validate, build and launch a product or service.",
    outcomePlaceholder: "The offer is live and has its first paying customer.",
    milestones: [
      "Problem and audience validated",
      "Offer defined",
      "Prototype completed",
      "Launch prepared",
      "First results reviewed",
    ],
  },
  {
    id: "study-assignment",
    kind: "study",
    name: "Assignment or thesis",
    description: "Sources, writing, supervisor meetings and submission.",
    outcomePlaceholder: "The work is submitted on time and meets the grading criteria.",
    milestones: [
      "Requirements understood",
      "Sources collected",
      "Outline approved",
      "First draft completed",
      "Final submission",
    ],
  },
  {
    id: "exam-preparation",
    kind: "study",
    name: "Exam preparation",
    description: "Course coverage, practice, revision and exam readiness.",
    outcomePlaceholder: "Every topic is reviewed and practice results meet the target.",
    milestones: [
      "Syllabus mapped",
      "Core notes completed",
      "First practice exam",
      "Weak topics revised",
      "Final review",
    ],
  },
  {
    id: "personal-plan",
    kind: "personal",
    name: "Personal project",
    description: "A trip, move, purchase, event or meaningful personal outcome.",
    outcomePlaceholder: "The planned personal outcome is completed without loose ends.",
    milestones: ["Outcome defined", "Plan ready", "Main work completed", "Final review"],
  },
  {
    id: "health-change",
    kind: "health",
    name: "Health objective",
    description: "Connect a measurable outcome with habits, metrics and Training.",
    outcomePlaceholder: "The target is reached sustainably and the routine is established.",
    milestones: ["Baseline recorded", "Routine started", "Midpoint review", "Target review"],
  },
  {
    id: "blank",
    kind: "custom",
    name: "Blank project",
    description: "Start with an outcome and add only the structure you need.",
    outcomePlaceholder: "Describe what will be observably true when this is finished.",
    milestones: [],
  },
];

export function projectProgress(
  project: Project,
  items: CalendarItem[],
  metricEntries: MetricEntry[],
): number {
  if (project.status === "completed") return 100;
  if (project.status === "cancelled") return 0;
  if (project.progressMode === "manual") return clamp(project.manualProgress);
  if (project.progressMode === "metric")
    return metricProgress(
      project.metricId,
      project.metricStartValue,
      project.metricTargetValue,
      metricEntries,
    );
  const taskStats = projectTaskStats(project.id, items);
  const milestoneStats = projectMilestoneStats(project.milestones);
  const values = [
    ...(taskStats.total ? [taskStats.rate] : []),
    ...(milestoneStats.total ? [milestoneStats.rate] : []),
  ];
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : clamp(project.manualProgress);
}

export function goalProgress(
  goal: Goal,
  projects: Project[],
  items: CalendarItem[],
  metricEntries: MetricEntry[],
): number {
  if (goal.status === "completed") return 100;
  if (goal.status === "cancelled") return 0;
  if (goal.progressMode === "manual") return clamp(goal.manualProgress);
  if (goal.progressMode === "metric")
    return metricProgress(
      goal.metricId,
      goal.metricStartValue,
      goal.metricTargetValue,
      metricEntries,
    );
  const linked = projects.filter(
    (project) => project.goalId === goal.id && project.status !== "cancelled" && !project.archived,
  );
  return linked.length
    ? Math.round(
        linked.reduce((sum, project) => sum + projectProgress(project, items, metricEntries), 0) /
          linked.length,
      )
    : clamp(goal.manualProgress);
}

export function projectTaskStats(projectId: string, items: CalendarItem[]) {
  const tasks = items.filter(
    (item) => item.projectId === projectId && item.kind === "task" && !item.trashedAt,
  );
  const completed = tasks.filter((task) => task.completedAt).length;
  return {
    total: tasks.length,
    completed,
    rate: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
  };
}

export function projectMilestoneStats(milestones: ProjectMilestone[]) {
  const completed = milestones.filter((milestone) => milestone.completedAt).length;
  return {
    total: milestones.length,
    completed,
    rate: milestones.length ? Math.round((completed / milestones.length) * 100) : 0,
  };
}

export function projectDeadlineState(
  project: Project,
  today = new Date(),
): "none" | "future" | "soon" | "overdue" | "done" {
  if (project.status === "completed") return "done";
  if (!project.targetDate) return "none";
  const target = new Date(`${project.targetDate}T12:00:00`);
  const current = new Date(today);
  current.setHours(12, 0, 0, 0);
  const days = Math.round((target.getTime() - current.getTime()) / 86_400_000);
  if (days < 0) return "overdue";
  if (days <= 7) return "soon";
  return "future";
}

export function buildProjectReview(
  project: Project,
  items: CalendarItem[],
  metricEntries: MetricEntry[],
): string {
  const related = items.filter((item) => item.projectId === project.id && !item.trashedAt);
  const tasks = projectTaskStats(project.id, related);
  const calls = related.filter(
    (item) => item.kind === "event" && /call|meeting|réunion|appel/i.test(item.title),
  ).length;
  const milestone = projectMilestoneStats(project.milestones);
  return [
    `${project.name} is ${projectProgress(project, items, metricEntries)}% complete and ${project.health.replace("-", " ")}.`,
    `${tasks.completed} of ${tasks.total} linked tasks and ${milestone.completed} of ${milestone.total} milestones are complete.`,
    `${calls} linked call${calls === 1 ? "" : "s"} or meeting${calls === 1 ? "" : "s"} recorded.`,
    project.nextAction ? `Next action: ${project.nextAction}` : "No next action has been defined.",
  ].join(" ");
}

function metricProgress(
  metricId: string | undefined,
  start: number | undefined,
  target: number | undefined,
  entries: MetricEntry[],
): number {
  if (!metricId || start === undefined || target === undefined || start === target) return 0;
  const latest = entries
    .filter((entry) => entry.metricId === metricId)
    .sort((left, right) => right.date.localeCompare(left.date))[0]?.value;
  if (latest === undefined) return 0;
  return clamp(Math.round(((latest - start) / (target - start)) * 100));
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}
