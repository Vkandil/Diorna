import { beforeEach, describe, expect, it } from "vitest";
import { useDiornaStore } from "@/core/store";

describe("trash lifecycle store", () => {
  beforeEach(() => useDiornaStore.getState().resetAll());

  it("duplicates, trashes, restores, and purges notes and maps", () => {
    const note = useDiornaStore.getState().addNote("Recoverable note");
    const duplicate = useDiornaStore.getState().duplicateNote(note.id);
    expect(duplicate?.title).toBe("Recoverable note copy");
    useDiornaStore.getState().trashNote(note.id);
    expect(
      useDiornaStore.getState().notes.find((entry) => entry.id === note.id)?.trashedAt,
    ).toBeTruthy();
    useDiornaStore.getState().restoreFileTrash("notes", "Recoverable note.md");
    expect(
      useDiornaStore.getState().notes.find((entry) => entry.id === note.id)?.trashedAt,
    ).toBeUndefined();

    const map = useDiornaStore.getState().addMap("Recoverable map");
    expect(useDiornaStore.getState().duplicateMap(map.id)?.name).toBe("Recoverable map copy");
    useDiornaStore.getState().trashMap(map.id);
    useDiornaStore.getState().purgeFileTrash("maps", "Recoverable map.canvas");
    expect(useDiornaStore.getState().maps.some((entry) => entry.id === map.id)).toBe(false);
  });

  it("restores items and purges entries older than thirty days", () => {
    const state = useDiornaStore.getState();
    const category = state.categories.find(
      (entry) => entry.workspaceId === state.activeWorkspaceId,
    )!;
    const item = state.addItem({
      kind: "task",
      title: "Recoverable task",
      description: "",
      categoryId: category.id,
      allDay: true,
      priority: "none",
      subtasks: [],
      rruleExceptions: [],
      reminders: [],
    });
    useDiornaStore.getState().updateItem(item.id, { trashedAt: "2026-05-01T00:00:00.000Z" });
    useDiornaStore.getState().restoreItem(item.id);
    expect(
      useDiornaStore.getState().items.find((entry) => entry.id === item.id)?.trashedAt,
    ).toBeUndefined();
    useDiornaStore.getState().updateItem(item.id, { trashedAt: "2026-05-01T00:00:00.000Z" });
    useDiornaStore.getState().purgeExpiredTrash("2026-07-22T00:00:00.000Z");
    expect(useDiornaStore.getState().items.some((entry) => entry.id === item.id)).toBe(false);
  });
});
