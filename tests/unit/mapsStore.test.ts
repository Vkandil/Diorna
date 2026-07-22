import { beforeEach, describe, expect, it } from "vitest";
import { useDiornaStore } from "@/core/store";

describe("maps store integration", () => {
  beforeEach(() => useDiornaStore.getState().resetAll());

  it("keeps linked note nodes attached when a note path changes", () => {
    useDiornaStore.getState().setWorkspace("workspace-personal");
    const state = useDiornaStore.getState();
    const note = state.notes.find((entry) => entry.workspaceId === state.activeWorkspaceId)!;
    const map = state.maps.find((entry) => entry.workspaceId === state.activeWorkspaceId)!;
    state.updateMap(map.id, {
      nodes: [
        ...map.nodes,
        {
          id: "linked-note-node",
          type: "file",
          x: 10,
          y: 20,
          width: 260,
          height: 180,
          text: note.title,
          file: note.path,
          diorna: { nodeType: "note" },
        },
      ],
    });

    state.updateNote(note.id, {
      title: "Renamed linked note",
      path: "notes/Renamed linked note.md",
    });

    const linked = useDiornaStore
      .getState()
      .maps.find((entry) => entry.id === map.id)!
      .nodes.find((node) => node.id === "linked-note-node");
    expect(linked).toMatchObject({
      file: "notes/Renamed linked note.md",
      text: "Renamed linked note",
    });
  });
});
