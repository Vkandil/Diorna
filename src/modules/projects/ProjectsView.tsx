import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Dumbbell,
  Flag,
  FolderKanban,
  Goal as GoalIcon,
  HeartPulse,
  Link2,
  ListChecks,
  Map,
  MoreHorizontal,
  Plus,
  Sparkles,
  Target,
  Timer,
  Trash2,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { useDiornaStore } from "@/core/store";
import type {
  Goal,
  GoalHorizon,
  Project,
  ProjectHealth,
  ProjectKind,
  ProjectStatus,
} from "@/shared/models";
import {
  buildProjectReview,
  goalProgress,
  PROJECT_TEMPLATES,
  projectDeadlineState,
  projectMilestoneStats,
  projectProgress,
  projectTaskStats,
} from "./logic";
import "./projects.css";

type PortfolioView = "portfolio" | "board" | "goals" | "reviews";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: "Ideas",
  planned: "Planned",
  active: "Active",
  "on-hold": "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const KIND_LABELS: Record<ProjectKind, string> = {
  work: "Work",
  study: "Study",
  personal: "Personal",
  health: "Health",
  custom: "Custom",
};

export function ProjectsView({ tabId }: { tabId?: string }) {
  const state = useDiornaStore();
  const tab = state.tabs.find((entry) => entry.id === tabId);
  const selected = state.projects.find(
    (project) => project.id === tab?.entityId && project.workspaceId === state.activeWorkspaceId,
  );
  const [view, setView] = useState<PortfolioView>("portfolio");
  const [projectDialog, setProjectDialog] = useState(false);
  const [goalDialog, setGoalDialog] = useState(false);

  if (selected) return <ProjectDetail project={selected} />;

  const projects = state.projects
    .filter((project) => project.workspaceId === state.activeWorkspaceId && !project.archived)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const goals = state.goals
    .filter((goal) => goal.workspaceId === state.activeWorkspaceId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const active = projects.filter((project) =>
    ["planned", "active", "on-hold"].includes(project.status),
  );
  const atRisk = active.filter(
    (project) => project.health !== "on-track" || projectDeadlineState(project) === "overdue",
  );

  return (
    <div className="module-page projects-page">
      <header className="projects-heading">
        <div>
          <span className="eyebrow">Direction and delivery</span>
          <h1>Projects & Goals</h1>
          <p>
            Turn outcomes into coordinated work without moving tasks, knowledge or routines out of
            their natural home.
          </p>
        </div>
        <div className="button-row">
          <button className="button" onClick={() => setGoalDialog(true)}>
            <GoalIcon size={15} /> New goal
          </button>
          <button className="button primary" onClick={() => setProjectDialog(true)}>
            <Plus size={15} /> New project
          </button>
        </div>
      </header>

      <nav className="projects-tabs" aria-label="Projects views">
        {(
          [
            ["portfolio", "Portfolio"],
            ["board", "Board"],
            ["goals", "Goals"],
            ["reviews", "Reviews"],
          ] as Array<[PortfolioView, string]>
        ).map(([id, label]) => (
          <button className={view === id ? "active" : ""} key={id} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </nav>

      {view === "portfolio" && (
        <main className="projects-portfolio">
          <section className="projects-kpis" aria-label="Project summary">
            <div>
              <FolderKanban size={18} />
              <span>Active projects</span>
              <strong>{active.length}</strong>
            </div>
            <div className={atRisk.length ? "risk" : ""}>
              <Flag size={18} />
              <span>Need attention</span>
              <strong>{atRisk.length}</strong>
            </div>
            <div>
              <GoalIcon size={18} />
              <span>Active goals</span>
              <strong>{goals.filter((goal) => goal.status === "active").length}</strong>
            </div>
            <div>
              <CheckCircle2 size={18} />
              <span>Completed</span>
              <strong>{projects.filter((project) => project.status === "completed").length}</strong>
            </div>
          </section>

          {!!goals.length && (
            <section className="projects-section">
              <div className="projects-section-heading">
                <div>
                  <span className="eyebrow">Why this work matters</span>
                  <h2>Goals</h2>
                </div>
                <button className="text-button" onClick={() => setView("goals")}>
                  See all
                </button>
              </div>
              <div className="goal-strip">
                {goals
                  .filter((goal) => goal.status === "active")
                  .slice(0, 4)
                  .map((goal) => (
                    <GoalCard key={goal.id} goal={goal} projects={projects} />
                  ))}
              </div>
            </section>
          )}

          <section className="projects-section">
            <div className="projects-section-heading">
              <div>
                <span className="eyebrow">Finite commitments</span>
                <h2>Project portfolio</h2>
              </div>
              <span className="muted">{projects.length} total</span>
            </div>
            {projects.length ? (
              <div className="project-grid">
                {projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            ) : (
              <EmptyProjects onCreate={() => setProjectDialog(true)} />
            )}
          </section>
        </main>
      )}

      {view === "board" && <ProjectBoard projects={projects} />}
      {view === "goals" && (
        <GoalsView goals={goals} projects={projects} onCreate={() => setGoalDialog(true)} />
      )}
      {view === "reviews" && <ReviewsView projects={projects} />}

      {projectDialog && <ProjectDialog onClose={() => setProjectDialog(false)} />}
      {goalDialog && <GoalDialog onClose={() => setGoalDialog(false)} />}
    </div>
  );
}

function EmptyProjects({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="projects-empty">
      <div className="projects-empty-icon">
        <Target />
      </div>
      <h2>Start with an observable outcome</h2>
      <p>
        A project can be a client engagement, an exam, a move, a launch or a health change. Its
        tasks stay in Calendar, knowledge in Notes and Maps, and routines in Daily or Training.
      </p>
      <button className="button primary" onClick={onCreate}>
        <Plus size={15} /> Create your first project
      </button>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const state = useDiornaStore();
  const progress = projectProgress(project, state.items, state.metricEntries);
  const tasks = projectTaskStats(project.id, state.items);
  const milestones = projectMilestoneStats(project.milestones);
  const deadline = projectDeadlineState(project);
  return (
    <button
      className={`project-card health-${project.health}`}
      onClick={() =>
        state.openTab({
          module: "projects",
          title: project.name,
          entityId: project.id,
        })
      }
    >
      <span className="project-card-accent" style={{ background: project.color }} />
      <header>
        <span className={`project-kind kind-${project.kind}`}>{KIND_LABELS[project.kind]}</span>
        <span className={`project-health ${project.health}`}>
          {project.health.replace("-", " ")}
        </span>
      </header>
      <h3>{project.name}</h3>
      <p>{project.outcome || project.description || "No outcome defined yet."}</p>
      <div className="project-progress">
        <span style={{ width: `${progress}%`, background: project.color }} />
      </div>
      <div className="project-card-meta">
        <span>
          <ListChecks size={13} /> {tasks.completed}/{tasks.total}
        </span>
        <span>
          <Flag size={13} /> {milestones.completed}/{milestones.total}
        </span>
        {project.targetDate && (
          <span className={deadline}>
            <Clock3 size={13} /> {format(new Date(`${project.targetDate}T12:00:00`), "d MMM")}
          </span>
        )}
        <strong>{progress}%</strong>
      </div>
      {project.nextAction && <small>Next: {project.nextAction}</small>}
    </button>
  );
}

function GoalCard({ goal, projects }: { goal: Goal; projects: Project[] }) {
  const state = useDiornaStore();
  const progress = goalProgress(goal, projects, state.items, state.metricEntries);
  const linked = projects.filter((project) => project.goalId === goal.id && !project.archived);
  return (
    <article className="goal-card">
      <i style={{ background: goal.color }} />
      <span>{goal.horizon.replace("-", " ")}</span>
      <h3>{goal.title}</h3>
      <p>{goal.purpose || goal.successDefinition || "Define why this goal matters."}</p>
      <div className="project-progress">
        <span style={{ width: `${progress}%`, background: goal.color }} />
      </div>
      <footer>
        <span>
          {linked.length} project{linked.length === 1 ? "" : "s"}
        </span>
        <strong>{progress}%</strong>
      </footer>
    </article>
  );
}

function ProjectBoard({ projects }: { projects: Project[] }) {
  const state = useDiornaStore();
  const columns: ProjectStatus[] = ["idea", "planned", "active", "on-hold", "completed"];
  const drop = (event: DragEvent, status: ProjectStatus) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/project-id");
    if (id) state.updateProject(id, { status });
  };
  return (
    <main className="project-board">
      {columns.map((status) => {
        const entries = projects.filter((project) => project.status === status);
        return (
          <section
            className="project-column"
            key={status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => drop(event, status)}
          >
            <header>
              <strong>{STATUS_LABELS[status]}</strong>
              <span>{entries.length}</span>
            </header>
            <div>
              {entries.map((project) => (
                <article
                  draggable
                  key={project.id}
                  onDragStart={(event) => event.dataTransfer.setData("text/project-id", project.id)}
                  onClick={() =>
                    state.openTab({
                      module: "projects",
                      title: project.name,
                      entityId: project.id,
                    })
                  }
                >
                  <i style={{ background: project.color }} />
                  <h3>{project.name}</h3>
                  <p>{project.nextAction || project.outcome}</p>
                  <footer>
                    <span>{KIND_LABELS[project.kind]}</span>
                    <strong>{projectProgress(project, state.items, state.metricEntries)}%</strong>
                  </footer>
                </article>
              ))}
              {!entries.length && <div className="board-drop-zone">Drop a project here</div>}
            </div>
          </section>
        );
      })}
    </main>
  );
}

function GoalsView({
  goals,
  projects,
  onCreate,
}: {
  goals: Goal[];
  projects: Project[];
  onCreate: () => void;
}) {
  const state = useDiornaStore();
  if (!goals.length)
    return (
      <div className="projects-empty">
        <GoalIcon />
        <h2>Give projects a direction</h2>
        <p>
          Goals are durable outcomes: finish a degree, grow a client portfolio or build a healthier
          life. Projects are the finite commitments that move them.
        </p>
        <button className="button primary" onClick={onCreate}>
          <Plus size={15} /> Create a goal
        </button>
      </div>
    );
  return (
    <main className="goals-view">
      {goals.map((goal) => {
        const progress = goalProgress(goal, projects, state.items, state.metricEntries);
        const linked = projects.filter((project) => project.goalId === goal.id);
        return (
          <article className="goal-detail-card" key={goal.id}>
            <header>
              <i style={{ background: goal.color }} />
              <select
                aria-label={`${goal.title} status`}
                value={goal.status}
                onChange={(event) =>
                  state.updateGoal(goal.id, { status: event.target.value as Goal["status"] })
                }
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </header>
            <input
              className="goal-title-input"
              value={goal.title}
              onChange={(event) => state.updateGoal(goal.id, { title: event.target.value })}
            />
            <textarea
              aria-label="Goal purpose"
              placeholder="Why does this matter?"
              value={goal.purpose}
              onChange={(event) => state.updateGoal(goal.id, { purpose: event.target.value })}
            />
            <label>
              Success looks like
              <textarea
                value={goal.successDefinition}
                onChange={(event) =>
                  state.updateGoal(goal.id, { successDefinition: event.target.value })
                }
              />
            </label>
            <div className="goal-settings-grid">
              <label>
                Horizon
                <select
                  value={goal.horizon}
                  onChange={(event) =>
                    state.updateGoal(goal.id, {
                      horizon: event.target.value as GoalHorizon,
                    })
                  }
                >
                  <option value="month">Month</option>
                  <option value="quarter">Quarter</option>
                  <option value="year">Year</option>
                  <option value="multi-year">Multi-year</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label>
                Target date
                <input
                  type="date"
                  value={goal.targetDate ?? ""}
                  onChange={(event) =>
                    state.updateGoal(goal.id, {
                      targetDate: event.target.value || undefined,
                    })
                  }
                />
              </label>
              <label>
                Progress from
                <select
                  value={goal.progressMode}
                  onChange={(event) =>
                    state.updateGoal(goal.id, {
                      progressMode: event.target.value as Goal["progressMode"],
                    })
                  }
                >
                  <option value="projects">Linked projects</option>
                  <option value="manual">Manual</option>
                  <option value="metric">Daily metric</option>
                </select>
              </label>
              {goal.progressMode === "manual" && (
                <label>
                  Manual %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={goal.manualProgress}
                    onChange={(event) =>
                      state.updateGoal(goal.id, {
                        manualProgress: Number(event.target.value),
                      })
                    }
                  />
                </label>
              )}
              {goal.progressMode === "metric" && (
                <>
                  <label>
                    Metric
                    <select
                      value={goal.metricId ?? ""}
                      onChange={(event) =>
                        state.updateGoal(goal.id, {
                          metricId: event.target.value || undefined,
                        })
                      }
                    >
                      <option value="">Choose metric…</option>
                      {state.metrics
                        .filter((metric) => metric.workspaceId === state.activeWorkspaceId)
                        .map((metric) => (
                          <option value={metric.id} key={metric.id}>
                            {metric.name} ({metric.unit})
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Baseline → target
                    <span className="goal-number-pair">
                      <input
                        type="number"
                        aria-label={`${goal.title} metric baseline`}
                        value={goal.metricStartValue ?? 0}
                        onChange={(event) =>
                          state.updateGoal(goal.id, {
                            metricStartValue: Number(event.target.value),
                          })
                        }
                      />
                      <input
                        type="number"
                        aria-label={`${goal.title} metric target`}
                        value={goal.metricTargetValue ?? 100}
                        onChange={(event) =>
                          state.updateGoal(goal.id, {
                            metricTargetValue: Number(event.target.value),
                          })
                        }
                      />
                    </span>
                  </label>
                </>
              )}
            </div>
            <label>
              Supporting Daily routine
              <select
                value=""
                onChange={(event) => {
                  if (!event.target.value) return;
                  state.updateGoal(goal.id, {
                    linkedHabitIds: [...new Set([...goal.linkedHabitIds, event.target.value])],
                  });
                }}
              >
                <option value="">Link a habit…</option>
                {state.habits
                  .filter(
                    (habit) =>
                      habit.workspaceId === state.activeWorkspaceId &&
                      !habit.archived &&
                      !goal.linkedHabitIds.includes(habit.id),
                  )
                  .map((habit) => (
                    <option value={habit.id} key={habit.id}>
                      {habit.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className="goal-habit-links">
              {goal.linkedHabitIds.map((habitId) => {
                const habit = state.habits.find((entry) => entry.id === habitId);
                return habit ? (
                  <button
                    key={habit.id}
                    title="Unlink routine"
                    onClick={() =>
                      state.updateGoal(goal.id, {
                        linkedHabitIds: goal.linkedHabitIds.filter((entry) => entry !== habit.id),
                      })
                    }
                  >
                    <Check size={12} /> {habit.name} ×
                  </button>
                ) : null;
              })}
            </div>
            <div className="project-progress">
              <span style={{ width: `${progress}%`, background: goal.color }} />
            </div>
            <div className="goal-linked-projects">
              {linked.map((project) => (
                <button
                  key={project.id}
                  onClick={() =>
                    state.openTab({
                      module: "projects",
                      title: project.name,
                      entityId: project.id,
                    })
                  }
                >
                  <span>{project.name}</span>
                  <strong>{projectProgress(project, state.items, state.metricEntries)}%</strong>
                </button>
              ))}
              {!linked.length && <small>No project is moving this goal yet.</small>}
            </div>
          </article>
        );
      })}
    </main>
  );
}

function ReviewsView({ projects }: { projects: Project[] }) {
  const state = useDiornaStore();
  const active = projects.filter((project) =>
    ["planned", "active", "on-hold"].includes(project.status),
  );
  return (
    <main className="reviews-view">
      <header>
        <span className="eyebrow">Weekly review</span>
        <h2>Decide what needs attention next</h2>
        <p>
          Diorna calculates the evidence locally. Use the summary to update health, unblock work and
          choose one concrete next action.
        </p>
      </header>
      {active.map((project) => (
        <article key={project.id}>
          <div>
            <i style={{ background: project.color }} />
            <strong>{project.name}</strong>
            <span>{projectProgress(project, state.items, state.metricEntries)}%</span>
          </div>
          <p>{buildProjectReview(project, state.items, state.metricEntries)}</p>
          <footer>
            <select
              aria-label={`${project.name} health`}
              value={project.health}
              onChange={(event) =>
                state.updateProject(project.id, {
                  health: event.target.value as ProjectHealth,
                })
              }
            >
              <option value="on-track">On track</option>
              <option value="at-risk">At risk</option>
              <option value="blocked">Blocked</option>
            </select>
            <input
              aria-label={`${project.name} next action`}
              placeholder="Define the next action"
              value={project.nextAction}
              onChange={(event) =>
                state.updateProject(project.id, { nextAction: event.target.value })
              }
            />
            <button
              className="button"
              onClick={() =>
                state.openTab({
                  module: "projects",
                  title: project.name,
                  entityId: project.id,
                })
              }
            >
              Open
            </button>
          </footer>
        </article>
      ))}
      {!active.length && <div className="empty-mini">No active projects to review.</div>}
    </main>
  );
}

function ProjectDetail({ project }: { project: Project }) {
  const state = useDiornaStore();
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [resourceKind, setResourceKind] = useState<"note" | "map" | "habit" | "training">("note");
  const [resourceId, setResourceId] = useState("");
  const [itemTitle, setItemTitle] = useState("");
  const [itemKind, setItemKind] = useState<"task" | "event">("task");
  const [itemDate, setItemDate] = useState("");
  const [updateSummary, setUpdateSummary] = useState("");
  const [updateWins, setUpdateWins] = useState("");
  const [updateBlockers, setUpdateBlockers] = useState("");
  const [updateNext, setUpdateNext] = useState("");

  const items = state.items
    .filter(
      (item) =>
        item.workspaceId === state.activeWorkspaceId &&
        item.projectId === project.id &&
        !item.trashedAt,
    )
    .sort((left, right) =>
      (left.startAt ?? left.dueAt ?? left.createdAt).localeCompare(
        right.startAt ?? right.dueAt ?? right.createdAt,
      ),
    );
  const notes = project.linkedNoteIds
    .map((id) => state.notes.find((note) => note.id === id && !note.trashedAt))
    .filter((note) => note !== undefined);
  const maps = project.linkedMapIds
    .map((id) => state.maps.find((map) => map.id === id && !map.trashedAt))
    .filter((map) => map !== undefined);
  const habits = project.linkedHabitIds
    .map((id) => state.habits.find((habit) => habit.id === id && !habit.archived))
    .filter((habit) => habit !== undefined);
  const activities = project.linkedTrainingActivityIds
    .map((id) =>
      state.trainingActivities.find((activity) => activity.id === id && !activity.archived),
    )
    .filter((activity) => activity !== undefined);
  const progress = projectProgress(project, items, state.metricEntries);
  const taskStats = projectTaskStats(project.id, items);
  const milestoneStats = projectMilestoneStats(project.milestones);
  const goal = state.goals.find((entry) => entry.id === project.goalId);

  const candidates = useMemo(() => {
    if (resourceKind === "note")
      return state.notes
        .filter(
          (entry) =>
            entry.workspaceId === state.activeWorkspaceId &&
            !entry.trashedAt &&
            !project.linkedNoteIds.includes(entry.id),
        )
        .map((entry) => ({ id: entry.id, label: entry.title }));
    if (resourceKind === "map")
      return state.maps
        .filter(
          (entry) =>
            entry.workspaceId === state.activeWorkspaceId &&
            !entry.trashedAt &&
            !project.linkedMapIds.includes(entry.id),
        )
        .map((entry) => ({ id: entry.id, label: entry.name }));
    if (resourceKind === "habit")
      return state.habits
        .filter(
          (entry) =>
            entry.workspaceId === state.activeWorkspaceId &&
            !entry.archived &&
            !project.linkedHabitIds.includes(entry.id),
        )
        .map((entry) => ({ id: entry.id, label: entry.name }));
    return state.trainingActivities
      .filter(
        (entry) =>
          entry.workspaceId === state.activeWorkspaceId &&
          !entry.archived &&
          !project.linkedTrainingActivityIds.includes(entry.id),
      )
      .map((entry) => ({ id: entry.id, label: entry.name }));
  }, [project, resourceKind, state]);

  const addItem = (event: FormEvent) => {
    event.preventDefault();
    if (!itemTitle.trim()) return;
    const category =
      state.categories.find(
        (entry) => entry.id === project.categoryId && entry.workspaceId === state.activeWorkspaceId,
      ) ?? state.categories.find((entry) => entry.workspaceId === state.activeWorkspaceId);
    if (!category) return;
    const date = itemDate
      ? new Date(`${itemDate}T${itemKind === "event" ? "09:00" : "18:00"}:00`).toISOString()
      : undefined;
    state.addItem({
      kind: itemKind,
      title: itemTitle.trim(),
      description: "",
      categoryId: category.id,
      ...(itemKind === "event"
        ? {
            startAt: date,
            endAt: date ? new Date(new Date(date).getTime() + 3_600_000).toISOString() : undefined,
          }
        : { dueAt: date }),
      allDay: false,
      priority: "none",
      subtasks: [],
      projectId: project.id,
      rruleExceptions: [],
      reminders: itemKind === "event" ? [10] : [],
    } as Parameters<typeof state.addItem>[0]);
    setItemTitle("");
  };

  return (
    <div className="module-page project-detail">
      <header className="project-detail-heading">
        <button
          className="icon-button"
          aria-label="Back to projects"
          onClick={() => state.setModule("projects")}
        >
          <ArrowLeft size={17} />
        </button>
        <div className="project-detail-title">
          <div>
            <span className={`project-kind kind-${project.kind}`}>{KIND_LABELS[project.kind]}</span>
            <select
              aria-label="Project status"
              value={project.status}
              onChange={(event) =>
                state.updateProject(project.id, {
                  status: event.target.value as ProjectStatus,
                })
              }
            >
              {Object.entries(STATUS_LABELS).map(([status, label]) => (
                <option value={status} key={status}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <input
            aria-label="Project name"
            value={project.name}
            onChange={(event) => state.updateProject(project.id, { name: event.target.value })}
          />
          <textarea
            aria-label="Project outcome"
            placeholder="What will be observably true when this project is finished?"
            value={project.outcome}
            onChange={(event) => state.updateProject(project.id, { outcome: event.target.value })}
          />
        </div>
        <div className="project-heading-actions">
          <button
            className="button"
            onClick={() => {
              const session = state.addFocusSession({
                title: project.nextAction || project.name,
                intention: project.outcome,
                mode: project.kind === "study" ? "study" : "deep-work",
                plannedMinutes: 50,
                sourceType: "project",
                sourceId: project.id,
              });
              state.startFocusSession(session.id);
              state.setModule("focus");
            }}
          >
            <Timer size={15} /> Focus next
          </button>
          <button
            className="button ai-project-button"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("diorna-open-ai", {
                  detail: {
                    prompt: `Help me plan and advance the existing project "${project.name}". Its intended outcome is: ${project.outcome}. Use or create relevant notes, maps, calendar items, habits and realistic focus blocks, then attach them to this project.`,
                  },
                }),
              )
            }
          >
            <Sparkles size={15} /> Plan with Diorna AI
          </button>
        </div>
      </header>

      <section className="project-detail-summary">
        <div className="project-score">
          <strong>{progress}%</strong>
          <span>overall progress</span>
          <div className="project-progress">
            <span style={{ width: `${progress}%`, background: project.color }} />
          </div>
        </div>
        <label>
          Health
          <select
            value={project.health}
            onChange={(event) =>
              state.updateProject(project.id, {
                health: event.target.value as ProjectHealth,
              })
            }
          >
            <option value="on-track">On track</option>
            <option value="at-risk">At risk</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
        <label>
          Target date
          <input
            type="date"
            value={project.targetDate ?? ""}
            onChange={(event) =>
              state.updateProject(project.id, {
                targetDate: event.target.value || undefined,
              })
            }
          />
        </label>
        <label>
          Supports goal
          <select
            value={project.goalId ?? ""}
            onChange={(event) =>
              state.updateProject(project.id, {
                goalId: event.target.value || undefined,
              })
            }
          >
            <option value="">No goal</option>
            {state.goals
              .filter(
                (entry) =>
                  entry.workspaceId === state.activeWorkspaceId && entry.status !== "cancelled",
              )
              .map((entry) => (
                <option value={entry.id} key={entry.id}>
                  {entry.title}
                </option>
              ))}
          </select>
        </label>
      </section>

      <main className="project-detail-grid">
        <div className="project-main-column">
          <ProjectSection
            icon={<Target size={17} />}
            eyebrow="Direction"
            title="Brief and next action"
          >
            <label>
              Description
              <textarea
                rows={4}
                value={project.description}
                onChange={(event) =>
                  state.updateProject(project.id, { description: event.target.value })
                }
              />
            </label>
            <label>
              One concrete next action
              <input
                placeholder="e.g. Send the revised proposal to Alice"
                value={project.nextAction}
                onChange={(event) =>
                  state.updateProject(project.id, { nextAction: event.target.value })
                }
              />
            </label>
            <label>
              People / stakeholders
              <input
                placeholder="Alice, Client brand, Professor…"
                value={project.stakeholders.join(", ")}
                onChange={(event) =>
                  state.updateProject(project.id, {
                    stakeholders: event.target.value
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <div className="project-direction-grid">
              <label>
                Category
                <select
                  value={project.categoryId ?? ""}
                  onChange={(event) =>
                    state.updateProject(project.id, {
                      categoryId: event.target.value || undefined,
                    })
                  }
                >
                  <option value="">No category</option>
                  {state.categories
                    .filter((entry) => entry.workspaceId === state.activeWorkspaceId)
                    .map((entry) => (
                      <option value={entry.id} key={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Progress from
                <select
                  value={project.progressMode}
                  onChange={(event) =>
                    state.updateProject(project.id, {
                      progressMode: event.target.value as Project["progressMode"],
                    })
                  }
                >
                  <option value="automatic">Tasks + milestones</option>
                  <option value="manual">Manual</option>
                  <option value="metric">Daily metric</option>
                </select>
              </label>
            </div>
            {project.progressMode === "manual" && (
              <label>
                Manual progress: {project.manualProgress}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={project.manualProgress}
                  onChange={(event) =>
                    state.updateProject(project.id, {
                      manualProgress: Number(event.target.value),
                    })
                  }
                />
              </label>
            )}
            {project.progressMode === "metric" && (
              <div className="project-direction-grid metric-target-fields">
                <label>
                  Daily metric
                  <select
                    value={project.metricId ?? ""}
                    onChange={(event) =>
                      state.updateProject(project.id, {
                        metricId: event.target.value || undefined,
                      })
                    }
                  >
                    <option value="">Choose metric…</option>
                    {state.metrics
                      .filter((metric) => metric.workspaceId === state.activeWorkspaceId)
                      .map((metric) => (
                        <option value={metric.id} key={metric.id}>
                          {metric.name} ({metric.unit})
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Baseline
                  <input
                    type="number"
                    value={project.metricStartValue ?? 0}
                    onChange={(event) =>
                      state.updateProject(project.id, {
                        metricStartValue: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Target
                  <input
                    type="number"
                    value={project.metricTargetValue ?? 100}
                    onChange={(event) =>
                      state.updateProject(project.id, {
                        metricTargetValue: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
            )}
          </ProjectSection>

          <ProjectSection
            icon={<Flag size={17} />}
            eyebrow={`${milestoneStats.completed}/${milestoneStats.total} completed`}
            title="Milestones"
          >
            <div className="milestone-list">
              {project.milestones
                .slice()
                .sort((left, right) => left.sortOrder - right.sortOrder)
                .map((milestone) => (
                  <div className={milestone.completedAt ? "completed" : ""} key={milestone.id}>
                    <button
                      className="milestone-check"
                      aria-label={`${milestone.completedAt ? "Reopen" : "Complete"} ${milestone.title}`}
                      onClick={() =>
                        state.updateProjectMilestone(project.id, milestone.id, {
                          completedAt: milestone.completedAt ? undefined : new Date().toISOString(),
                        })
                      }
                    >
                      {milestone.completedAt ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                    </button>
                    <MilestoneTitleInput
                      projectId={project.id}
                      milestoneId={milestone.id}
                      title={milestone.title}
                    />
                    <input
                      type="date"
                      aria-label={`${milestone.title} due date`}
                      value={milestone.dueDate ?? ""}
                      onChange={(event) =>
                        state.updateProjectMilestone(project.id, milestone.id, {
                          dueDate: event.target.value || undefined,
                        })
                      }
                    />
                    <button
                      className="icon-button"
                      aria-label={`Delete ${milestone.title}`}
                      onClick={() =>
                        state.updateProject(project.id, {
                          milestones: project.milestones.filter(
                            (entry) => entry.id !== milestone.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
            </div>
            <form
              className="project-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (state.addProjectMilestone(project.id, { title: milestoneTitle }))
                  setMilestoneTitle("");
              }}
            >
              <input
                aria-label="New milestone"
                placeholder="Add a meaningful checkpoint"
                value={milestoneTitle}
                onChange={(event) => setMilestoneTitle(event.target.value)}
              />
              <button className="button">
                <Plus size={14} /> Add
              </button>
            </form>
          </ProjectSection>

          <ProjectSection
            icon={<ListChecks size={17} />}
            eyebrow={`${taskStats.completed}/${taskStats.total} tasks completed`}
            title="Tasks, deadlines and calls"
          >
            <form className="project-item-form" onSubmit={addItem}>
              <select
                aria-label="Calendar item type"
                value={itemKind}
                onChange={(event) => setItemKind(event.target.value as "task" | "event")}
              >
                <option value="task">Task</option>
                <option value="event">Event / call</option>
              </select>
              <input
                aria-label="Calendar item title"
                placeholder={itemKind === "event" ? "Client call" : "Next deliverable"}
                value={itemTitle}
                onChange={(event) => setItemTitle(event.target.value)}
              />
              <input
                aria-label="Calendar item date"
                type="date"
                value={itemDate}
                onChange={(event) => setItemDate(event.target.value)}
              />
              <button className="button primary">
                <Plus size={14} /> Add
              </button>
            </form>
            <div className="project-item-list">
              {items.map((item) => (
                <div className={item.completedAt ? "completed" : ""} key={item.id}>
                  {item.kind === "task" ? (
                    <button
                      className="milestone-check"
                      aria-label={`Complete ${item.title}`}
                      onClick={() =>
                        state.updateItem(item.id, {
                          completedAt: item.completedAt ? undefined : new Date().toISOString(),
                        } as Partial<typeof item>)
                      }
                    >
                      {item.completedAt ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                    </button>
                  ) : (
                    <CalendarDays size={17} />
                  )}
                  <button
                    onClick={() => {
                      state.selectCalendarItem(item.id);
                      state.setModule("calendar");
                    }}
                  >
                    <strong>{item.title}</strong>
                    <small>
                      {item.startAt || item.dueAt
                        ? format(new Date(item.startAt ?? item.dueAt!), "d MMM yyyy · HH:mm")
                        : "Unscheduled"}
                    </small>
                  </button>
                </div>
              ))}
              {!items.length && (
                <div className="empty-mini">
                  Project tasks and calls will appear here and in Calendar.
                </div>
              )}
            </div>
          </ProjectSection>

          <ProjectSection icon={<BookOpen size={17} />} eyebrow="Knowledge" title="Notes and maps">
            <div className="project-resource-toolbar">
              <button
                className="button"
                onClick={() => {
                  const note = state.addNote(project.name, `Projects/${safeFolder(project.name)}`);
                  state.updateNote(note.id, {
                    tags: [...new Set([...note.tags, "project", safeTag(project.name)])],
                  });
                  state.linkProjectResource(project.id, "note", note.id);
                  state.openTab({ module: "notes", title: note.title, entityId: note.id });
                }}
              >
                <Plus size={14} /> Project note
              </button>
              <button
                className="button"
                onClick={() => {
                  const map = state.addMap(`${project.name} map`);
                  state.linkProjectResource(project.id, "map", map.id);
                  state.openTab({ module: "maps", title: map.name, entityId: map.id });
                }}
              >
                <Plus size={14} /> Project map
              </button>
            </div>
            <div className="project-linked-grid">
              {notes.map((note) => (
                <ResourceCard
                  key={note.id}
                  icon={<BookOpen size={16} />}
                  label={note.title}
                  meta="Note"
                  onOpen={() =>
                    state.openTab({ module: "notes", title: note.title, entityId: note.id })
                  }
                  onUnlink={() => state.linkProjectResource(project.id, "note", note.id, false)}
                />
              ))}
              {maps.map((map) => (
                <ResourceCard
                  key={map.id}
                  icon={<Map size={16} />}
                  label={map.name}
                  meta="Map"
                  onOpen={() =>
                    state.openTab({ module: "maps", title: map.name, entityId: map.id })
                  }
                  onUnlink={() => state.linkProjectResource(project.id, "map", map.id, false)}
                />
              ))}
            </div>
            <div className="project-link-existing">
              <select
                aria-label="Resource type"
                value={resourceKind}
                onChange={(event) => {
                  setResourceKind(event.target.value as typeof resourceKind);
                  setResourceId("");
                }}
              >
                <option value="note">Note</option>
                <option value="map">Map</option>
                <option value="habit">Daily habit</option>
                <option value="training">Training activity</option>
              </select>
              <select
                aria-label="Existing resource"
                value={resourceId}
                onChange={(event) => setResourceId(event.target.value)}
              >
                <option value="">Choose an existing item…</option>
                {candidates.map((candidate) => (
                  <option value={candidate.id} key={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </select>
              <button
                className="button"
                disabled={!resourceId}
                onClick={() => {
                  if (!resourceId) return;
                  state.linkProjectResource(project.id, resourceKind, resourceId);
                  setResourceId("");
                }}
              >
                <Link2 size={14} /> Link
              </button>
            </div>
          </ProjectSection>

          <ProjectSection
            icon={<MoreHorizontal size={17} />}
            eyebrow="Decision trail"
            title="Project updates"
          >
            <form
              className="project-update-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  state.addProjectUpdate(project.id, {
                    summary: updateSummary,
                    wins: updateWins,
                    blockers: updateBlockers,
                    nextSteps: updateNext,
                  })
                ) {
                  setUpdateSummary("");
                  setUpdateWins("");
                  setUpdateBlockers("");
                  setUpdateNext("");
                }
              }}
            >
              <input
                placeholder="What changed?"
                aria-label="Update summary"
                value={updateSummary}
                onChange={(event) => setUpdateSummary(event.target.value)}
              />
              <input
                placeholder="Wins"
                aria-label="Update wins"
                value={updateWins}
                onChange={(event) => setUpdateWins(event.target.value)}
              />
              <input
                placeholder="Blockers"
                aria-label="Update blockers"
                value={updateBlockers}
                onChange={(event) => setUpdateBlockers(event.target.value)}
              />
              <input
                placeholder="Next steps"
                aria-label="Update next steps"
                value={updateNext}
                onChange={(event) => setUpdateNext(event.target.value)}
              />
              <button className="button primary">Record update</button>
            </form>
            <div className="project-update-list">
              {project.updates.map((update) => (
                <article key={update.id}>
                  <header>
                    <strong>{update.summary}</strong>
                    <time>{format(new Date(update.createdAt), "d MMM yyyy")}</time>
                  </header>
                  {update.wins && (
                    <p>
                      <b>Wins:</b> {update.wins}
                    </p>
                  )}
                  {update.blockers && (
                    <p>
                      <b>Blockers:</b> {update.blockers}
                    </p>
                  )}
                  {update.nextSteps && (
                    <p>
                      <b>Next:</b> {update.nextSteps}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </ProjectSection>
        </div>

        <aside className="project-side-column">
          <section>
            <span className="eyebrow">At a glance</span>
            <h3>Project connections</h3>
            <dl>
              <dt>
                <ListChecks size={14} /> Calendar items
              </dt>
              <dd>{items.length}</dd>
              <dt>
                <BookOpen size={14} /> Notes
              </dt>
              <dd>{notes.length}</dd>
              <dt>
                <Map size={14} /> Maps
              </dt>
              <dd>{maps.length}</dd>
              <dt>
                <Check size={14} /> Daily habits
              </dt>
              <dd>{habits.length}</dd>
              <dt>
                <Dumbbell size={14} /> Training
              </dt>
              <dd>{activities.length}</dd>
            </dl>
          </section>
          {goal && (
            <section className="project-goal-summary">
              <GoalIcon size={18} style={{ color: goal.color }} />
              <span className="eyebrow">Supports goal</span>
              <h3>{goal.title}</h3>
              <p>{goal.purpose}</p>
            </section>
          )}
          {(habits.length > 0 || activities.length > 0) && (
            <section>
              <span className="eyebrow">Supporting rhythms</span>
              <h3>Daily & Training</h3>
              {[
                ...habits.map((entry) => ({ ...entry, module: "daily" as const })),
                ...activities.map((entry) => ({ ...entry, module: "training" as const })),
              ].map((entry) => (
                <div className="project-rhythm" key={entry.id}>
                  <button onClick={() => state.setModule(entry.module)}>
                    {entry.module === "daily" ? <Check size={14} /> : <Dumbbell size={14} />}
                    <span>{entry.name}</span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Unlink ${entry.name}`}
                    onClick={() =>
                      state.linkProjectResource(
                        project.id,
                        entry.module === "daily" ? "habit" : "training",
                        entry.id,
                        false,
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </section>
          )}
          <section className="project-local-review">
            <span className="eyebrow">Local review</span>
            <h3>Evidence-based status</h3>
            <p>{buildProjectReview(project, items, state.metricEntries)}</p>
          </section>
        </aside>
      </main>
    </div>
  );
}

function MilestoneTitleInput({
  projectId,
  milestoneId,
  title,
}: {
  projectId: string;
  milestoneId: string;
  title: string;
}) {
  const updateProjectMilestone = useDiornaStore((state) => state.updateProjectMilestone);
  const [draft, setDraft] = useState(title);

  useEffect(() => setDraft(title), [milestoneId, title]);

  const commit = () => {
    const normalized = draft.trim();
    if (!normalized) {
      setDraft(title);
      return;
    }
    if (normalized !== title) updateProjectMilestone(projectId, milestoneId, { title: normalized });
    if (draft !== normalized) setDraft(normalized);
  };

  return (
    <input
      aria-label={`Milestone title: ${title}`}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

function ProjectSection({
  icon,
  eyebrow,
  title,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="project-section-card">
      <header>
        <span>{icon}</span>
        <div>
          <small>{eyebrow}</small>
          <h2>{title}</h2>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

function ResourceCard({
  icon,
  label,
  meta,
  onOpen,
  onUnlink,
}: {
  icon: React.ReactNode;
  label: string;
  meta: string;
  onOpen: () => void;
  onUnlink: () => void;
}) {
  return (
    <article className="project-resource-card">
      <button onClick={onOpen}>
        {icon}
        <span>
          <strong>{label}</strong>
          <small>{meta}</small>
        </span>
      </button>
      <button className="icon-button" aria-label={`Unlink ${label}`} onClick={onUnlink}>
        <Trash2 size={13} />
      </button>
    </article>
  );
}

function ProjectDialog({ onClose }: { onClose: () => void }) {
  const state = useDiornaStore();
  const [templateId, setTemplateId] = useState("client-engagement");
  const template = PROJECT_TEMPLATES.find((entry) => entry.id === templateId)!;
  const [name, setName] = useState("");
  const [outcome, setOutcome] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [goalId, setGoalId] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const project = state.addProject({
      name: name || template.name,
      outcome: outcome || template.outcomePlaceholder,
      description: template.description,
      kind: template.kind,
      status: template.id === "blank" ? "idea" : "active",
      targetDate: targetDate || undefined,
      goalId: goalId || undefined,
      milestones: template.milestones.map((title) => ({ title })),
      tags: [template.kind, template.id],
    });
    state.openTab({ module: "projects", title: project.name, entityId: project.id });
    onClose();
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="projects-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create project"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <header>
          <div>
            <span className="eyebrow">New finite commitment</span>
            <h2>Create a project</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="project-template-grid">
          {PROJECT_TEMPLATES.map((entry) => (
            <button
              type="button"
              className={templateId === entry.id ? "active" : ""}
              key={entry.id}
              onClick={() => {
                setTemplateId(entry.id);
                if (!outcome) setOutcome(entry.outcomePlaceholder);
              }}
            >
              {templateIcon(entry.kind)}
              <strong>{entry.name}</strong>
              <small>{entry.description}</small>
            </button>
          ))}
        </div>
        <div className="projects-dialog-fields">
          <label>
            Project name
            <input
              autoFocus
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Observable outcome
            <textarea
              required
              placeholder={template.outcomePlaceholder}
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            />
          </label>
          <label>
            Target date
            <input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </label>
          <label>
            Supports goal
            <select value={goalId} onChange={(event) => setGoalId(event.target.value)}>
              <option value="">No goal yet</option>
              {state.goals
                .filter(
                  (goal) =>
                    goal.workspaceId === state.activeWorkspaceId && goal.status === "active",
                )
                .map((goal) => (
                  <option value={goal.id} key={goal.id}>
                    {goal.title}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <footer>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">Create project</button>
        </footer>
      </form>
    </div>
  );
}

function GoalDialog({ onClose }: { onClose: () => void }) {
  const state = useDiornaStore();
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [success, setSuccess] = useState("");
  const [horizon, setHorizon] = useState<GoalHorizon>("quarter");
  const [targetDate, setTargetDate] = useState("");
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="projects-dialog goal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Create goal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          state.addGoal({
            title,
            purpose,
            successDefinition: success,
            horizon,
            targetDate: targetDate || undefined,
          });
          onClose();
        }}
      >
        <header>
          <div>
            <span className="eyebrow">Long-term direction</span>
            <h2>Create a goal</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="projects-dialog-fields one-column">
          <label>
            Goal
            <input
              autoFocus
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Why it matters
            <textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} />
          </label>
          <label>
            Success looks like
            <textarea value={success} onChange={(event) => setSuccess(event.target.value)} />
          </label>
          <label>
            Horizon
            <select
              value={horizon}
              onChange={(event) => setHorizon(event.target.value as GoalHorizon)}
            >
              <option value="month">This month</option>
              <option value="quarter">This quarter</option>
              <option value="year">This year</option>
              <option value="multi-year">Multi-year</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Target date
            <input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
            />
          </label>
        </div>
        <footer>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">Create goal</button>
        </footer>
      </form>
    </div>
  );
}

function templateIcon(kind: ProjectKind) {
  if (kind === "work") return <Users size={18} />;
  if (kind === "study") return <BookOpen size={18} />;
  if (kind === "health") return <HeartPulse size={18} />;
  if (kind === "personal") return <Target size={18} />;
  return <FolderKanban size={18} />;
}

function safeFolder(value: string) {
  return value.replace(/[<>:"/\\|?*]/g, "-").trim() || "Project";
}

function safeTag(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9À-ÿ]+/g, "-")
    .replace(/^-|-$/g, "");
}
