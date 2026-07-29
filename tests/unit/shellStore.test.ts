import { beforeEach, describe, expect, it } from "vitest";
import { useDiornaStore } from "@/core/store";

describe("shell layout store", () => {
  beforeEach(() => useDiornaStore.getState().resetAll());

  it("starts with the Diorna brand theme and cobalt accent", () => {
    expect(useDiornaStore.getState().settings).toMatchObject({
      theme: "diorna",
      accentColor: "#1D518A",
      linkPreviewEnabled: true,
      linkPreviewSettingsVersion: 1,
    });
  });

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

  it("keeps the parent page on linked note tabs", () => {
    const parent = useDiornaStore.getState().addNote("Parent");
    const child = useDiornaStore.getState().addNote("Child");
    useDiornaStore.getState().openTab({
      module: "notes",
      title: child.title,
      entityId: child.id,
      previousNoteId: parent.id,
    });
    expect(
      useDiornaStore.getState().tabs.find((tab) => tab.entityId === child.id)?.previousNoteId,
    ).toBe(parent.id);

    const otherParent = useDiornaStore.getState().addNote("Other parent");
    useDiornaStore.getState().openTab({
      module: "notes",
      title: child.title,
      entityId: child.id,
      previousNoteId: otherParent.id,
    });
    expect(
      useDiornaStore.getState().tabs.find((tab) => tab.entityId === child.id)?.previousNoteId,
    ).toBe(otherParent.id);
  });

  it("accepts a fully customized onboarding workspace list", async () => {
    const createdAt = new Date().toISOString();
    await useDiornaStore.getState().finishOnboarding(
      [
        {
          id: "workspace-personal",
          name: "Life",
          color: "#168a68",
          folderName: "Personal",
          sortOrder: 0,
          kind: "personal",
          createdAt,
        },
        {
          id: "workspace-custom-test",
          name: "Studio",
          color: "#657287",
          folderName: "Studio",
          sortOrder: 1,
          kind: "custom",
          createdAt,
        },
      ],
      "dark",
      true,
    );
    const state = useDiornaStore.getState();
    expect(state.workspaces.map(({ id, name, kind }) => ({ id, name, kind }))).toEqual([
      { id: "workspace-personal", name: "Life", kind: "personal" },
      { id: "workspace-custom-test", name: "Studio", kind: "custom" },
    ]);
    expect(state.activeWorkspaceId).toBe("workspace-personal");
    expect(state.settings.defaultWorkspaceId).toBe("workspace-personal");
    expect(state.categories.some((entry) => entry.workspaceId === "workspace-custom-test")).toBe(
      true,
    );
    expect(state.notes.some((entry) => entry.workspaceId === "workspace-student")).toBe(false);
  });
});
