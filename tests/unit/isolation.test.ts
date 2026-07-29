import { describe, expect, it } from "vitest";
import { WorkspaceIsolationError, WorkspaceRepository } from "@/core/workspaceRepository";

const entityTypes = [
  "note",
  "map",
  "task",
  "event",
  "habit",
  "habit-entry",
  "metric",
  "metric-entry",
  "tag",
  "category",
  "course",
  "template",
  "reference",
  "flashcard",
  "review-log",
  "training-activity",
  "training-exercise",
  "training-template",
  "training-session",
  "project",
  "goal",
  "focus-priority",
  "focus-session",
  "recap",
];

describe("workspace isolation by construction", () => {
  it.each(entityTypes)("scopes every %s repository", (entityType) => {
    const own = { id: `${entityType}-own`, workspaceId: "student", value: "visible" };
    const foreign = { id: `${entityType}-foreign`, workspaceId: "personal", value: "secret" };
    const repository = new WorkspaceRepository("student", [own, foreign]);
    expect(repository.list()).toEqual([own]);
    expect(repository.get(foreign.id)).toBeUndefined();
    expect(() => repository.put(foreign)).toThrow(WorkspaceIsolationError);
    expect(repository.query(() => true)).toEqual([own]);
  });
  it("returns defensive copies", () => {
    const original = { id: "n1", workspaceId: "student", nested: { value: 1 } };
    const repository = new WorkspaceRepository("student", [original]);
    repository.list()[0]!.nested.value = 99;
    expect(repository.get("n1")!.nested.value).toBe(1);
  });
  it("allows writes only to its bound workspace", () => {
    const repository = new WorkspaceRepository<{ id: string; workspaceId: string; title: string }>(
      "student",
    );
    expect(repository.put({ id: "n1", workspaceId: "student", title: "Safe" }).title).toBe("Safe");
  });
  it("removes only an entity in the bound store", () => {
    const repository = new WorkspaceRepository("student", [{ id: "n1", workspaceId: "student" }]);
    expect(repository.remove("n1")).toBe(true);
    expect(repository.list()).toEqual([]);
  });
});
