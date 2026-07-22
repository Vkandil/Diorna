import { beforeEach, describe, expect, it } from "vitest";
import { useDiornaStore } from "@/core/store";

describe("shell layout store", () => {
  beforeEach(() => useDiornaStore.getState().resetAll());

  it("creates mixed persisted splits, caps them at four, and closes panes", () => {
    useDiornaStore.getState().setModule("notes");
    useDiornaStore.getState().splitPane("horizontal");
    useDiornaStore.getState().splitPane("vertical");
    useDiornaStore.getState().splitPane("horizontal");
    expect(useDiornaStore.getState().panes).toHaveLength(4);
    useDiornaStore.getState().splitPane("vertical");
    expect(useDiornaStore.getState().panes).toHaveLength(4);
    expect(useDiornaStore.getState().paneLayout.kind).toBe("split");

    const activePaneId = useDiornaStore.getState().activePaneId;
    useDiornaStore.getState().closePane(activePaneId);
    const current = useDiornaStore.getState();
    expect(current.panes).toHaveLength(3);
    expect(current.panes.some((pane) => pane.id === current.activePaneId)).toBe(true);
    expect(current.tabs.some((tab) => tab.id === current.activeTabId)).toBe(true);
  });

  it("restores each workspace tab and pane session without cross-workspace tabs", () => {
    const student = useDiornaStore.getState().addNote("Student session");
    useDiornaStore.getState().openTab({
      module: "notes",
      title: student.title,
      entityId: student.id,
    });
    useDiornaStore.getState().splitPane("horizontal");
    const studentTabIds = useDiornaStore.getState().tabs.map((tab) => tab.id);

    useDiornaStore.getState().setWorkspace("workspace-personal");
    useDiornaStore.getState().setModule("maps");
    const personalTabIds = useDiornaStore.getState().tabs.map((tab) => tab.id);
    expect(personalTabIds.some((id) => studentTabIds.includes(id))).toBe(false);

    useDiornaStore.getState().setWorkspace("workspace-student");
    const restored = useDiornaStore.getState();
    expect(restored.panes).toHaveLength(2);
    expect(restored.tabs.map((tab) => tab.id)).toEqual(studentTabIds);
    expect(restored.tabs.some((tab) => personalTabIds.includes(tab.id))).toBe(false);
  });

  it("tracks most-recently-used tabs", () => {
    useDiornaStore.getState().setModule("notes");
    const notesId = useDiornaStore.getState().activeTabId;
    useDiornaStore.getState().setModule("maps");
    const mapsId = useDiornaStore.getState().activeTabId;
    useDiornaStore.getState().setActiveTab(notesId);
    expect(useDiornaStore.getState().recentTabIds.slice(0, 2)).toEqual([notesId, mapsId]);
  });
});
