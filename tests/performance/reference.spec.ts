import { expect, test, type Page } from "@playwright/test";

async function onboard(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  for (let step = 0; step < 4; step += 1)
    await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Enter Diorna" }).click();
  await expect(page.locator(".app-shell")).toBeVisible();
  await page.waitForTimeout(250);
}

async function seedReferenceDataset(page: Page) {
  await page.evaluate(async () => {
    const persistedValue = await new Promise<unknown>((resolve, reject) => {
      const opening = indexedDB.open("diorna-web-state", 1);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const request = opening.result
          .transaction("state", "readonly")
          .objectStore("state")
          .get("diorna-state-v1");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      };
    });
    const persisted =
      typeof persistedValue === "string" ? JSON.parse(persistedValue) : persistedValue;
    const state = persisted.state;
    const workspaceId = "workspace-student";
    const baseNote =
      state.notes.find((note: { workspaceId: string }) => note.workspaceId === workspaceId) ??
      state.notes[0];
    const baseMap =
      state.maps.find((map: { workspaceId: string }) => map.workspaceId === workspaceId) ??
      state.maps[0];
    const baseItem =
      state.items.find((item: { workspaceId: string }) => item.workspaceId === workspaceId) ??
      state.items[0];
    const now = new Date().toISOString();
    state.notes = Array.from({ length: 5_000 }, (_, index) => ({
      ...baseNote,
      id: `reference-note-${index}`,
      path: `notes/Reference/Note-${index}.md`,
      title: index === 4_999 ? "Reference needle 4999" : `Reference note ${index}`,
      body: `<h1>Reference note ${index}</h1><p>${"ten words of realistic local first study content ".repeat(index === 0 ? 1_000 : 2)}</p>`,
      tags: [`reference/${index % 20}`],
      createdAt: now,
      updatedAt: now,
      wordCount: index === 0 ? 10_000 : 20,
    }));
    state.maps = Array.from({ length: 50 }, (_, index) => ({
      ...baseMap,
      workspaceId,
      id: `reference-map-${index}`,
      path: `maps/Reference-${index}.canvas`,
      name: `Reference map ${index}`,
      nodes: Array.from({ length: index === 0 ? 200 : 8 }, (__, nodeIndex) => ({
        ...baseMap.nodes[0],
        id: `node-${index}-${nodeIndex}`,
        position: { x: (nodeIndex % 20) * 180, y: Math.floor(nodeIndex / 20) * 110 },
        data: { text: `Node ${nodeIndex}` },
      })),
      edges: [],
      updatedAt: now,
    }));
    state.items = Array.from({ length: 3_000 }, (_, index) => ({
      ...baseItem,
      workspaceId,
      id: `reference-item-${index}`,
      title: `Reference task ${index}`,
      dueAt: new Date(Date.now() + (index % 365) * 86_400_000).toISOString(),
      createdAt: now,
      updatedAt: now,
    }));
    const habits = state.habits.filter(
      (habit: { workspaceId: string }) => habit.workspaceId === workspaceId,
    );
    state.habitEntries = [];
    for (let day = 0; day < 730; day += 1) {
      const date = new Date(Date.now() - day * 86_400_000).toISOString().slice(0, 10);
      for (const habit of habits) {
        state.habitEntries.push({
          workspaceId,
          habitId: habit.id,
          date,
          done: day % 3 !== 0,
          value: null,
          note: "",
        });
      }
    }
    localStorage.setItem("diorna-state-v1", JSON.stringify(persisted));
  });
}

test("reference-vault interaction budgets", async ({ page }) => {
  await onboard(page);
  await seedReferenceDataset(page);
  await page.reload();
  await expect(page.locator(".app-shell")).toBeVisible();
  const interactiveMs = await page.evaluate(() => performance.now());
  expect(interactiveMs, "web shell interactive time").toBeLessThan(2_000);

  await page.getByRole("button", { name: /^Notes/ }).click();
  await expect(page.locator(".note-list-row").first()).toBeVisible();
  const searchMs = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>(".note-filter input")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    const start = performance.now();
    setter.call(input, "Reference needle 4999");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    while (!document.body.textContent?.includes("Reference needle 4999")) {
      await new Promise(requestAnimationFrame);
    }
    return performance.now() - start;
  });
  expect(searchMs, "incremental note search").toBeLessThan(200);

  const openMs = await page.evaluate(async () => {
    const row = [...document.querySelectorAll<HTMLElement>(".note-list-row")].find((entry) =>
      entry.textContent?.includes("Reference needle 4999"),
    )!;
    const start = performance.now();
    row.querySelector<HTMLButtonElement>("button")!.click();
    while (
      document.querySelector<HTMLInputElement>(".note-title-input")?.value !==
      "Reference needle 4999"
    ) {
      await new Promise(requestAnimationFrame);
    }
    return performance.now() - start;
  });
  expect(openMs, "note open").toBeLessThan(100);

  const heap = await page.evaluate(() => {
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    return memory.memory?.usedJSHeapSize ?? 0;
  });
  if (heap) expect(heap, "renderer JavaScript heap").toBeLessThan(400 * 1024 * 1024);
});
