import { beforeEach, describe, expect, it } from "vitest";
import { useDiornaStore } from "@/core/store";

describe("calendar store integration", () => {
  beforeEach(() => useDiornaStore.getState().resetAll());

  it("round-trips a dated note checkbox through a linked calendar task", () => {
    const state = useDiornaStore.getState();
    const note = state.notes.find((entry) => entry.workspaceId === state.activeWorkspaceId)!;
    state.updateNote(note.id, {
      body: '<ul data-type="taskList"><li data-checked="false"><p>Submit lab 📅 2026-08-14</p></li></ul>',
    });
    const linked = useDiornaStore
      .getState()
      .items.find((item) => item.noteId === note.id && item.sourceNoteLine === 1);
    expect(linked).toMatchObject({ title: "Submit lab", kind: "task", allDay: true });
    useDiornaStore.getState().updateItem(linked!.id, {
      completedAt: new Date().toISOString(),
    });
    expect(useDiornaStore.getState().notes.find((entry) => entry.id === note.id)!.body).toContain(
      'data-checked="true"',
    );
  });

  it("trashes a linked checkbox task when its source line disappears", () => {
    const state = useDiornaStore.getState();
    const note = state.notes.find((entry) => entry.workspaceId === state.activeWorkspaceId)!;
    state.updateNote(note.id, {
      body: '<ul><li data-checked="false"><p>Review notes @2026-09-04</p></li></ul>',
    });
    const linked = useDiornaStore
      .getState()
      .items.find((item) => item.noteId === note.id && item.sourceNoteLine === 1)!;
    useDiornaStore.getState().updateNote(note.id, { body: "<p>Done.</p>" });
    expect(
      useDiornaStore.getState().items.find((item) => item.id === linked.id)?.trashedAt,
    ).toBeTruthy();
  });
});
