import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { jsPDF } from "jspdf";

async function completeOnboarding(page: Page, openRouterApiKey?: string) {
  await expect(page.getByRole("heading", { name: "Choose your vault" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Make it comfortable" })).toBeVisible();
  await page.getByRole("button", { name: "Dark" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Study workspace", { exact: true }).fill("University");
  await page.getByLabel("Personal workspace", { exact: true }).fill("Studio");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Improve your recaps" })).toBeVisible();
  if (openRouterApiKey) await page.getByLabel("OpenRouter API key").fill(openRouterApiKey);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Enter Diorna" }).click();
  await expect(page.getByRole("heading", { name: "University" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
});

test("customizes and replaces both starter workspaces during onboarding", async ({ page }) => {
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Dark" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Remove Student workspace" }).click();
  await page.getByRole("button", { name: "Add workspace" }).click();
  await page.getByLabel("Workspace 2 name").fill("Projects");
  await page.getByLabel("Projects workspace type").selectOption("custom");
  await page.getByRole("button", { name: "Remove Personal workspace" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Enter Diorna" }).click();
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByLabel("Workspace").locator("option")).toHaveCount(2);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("configures OpenRouter during onboarding and manages its API key in settings", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("OpenRouter API key").fill("sk-or-v1-test-only");
  await page.screenshot({ path: "test-results/openrouter-onboarding.png", fullPage: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Enter Diorna" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator(".settings-layout aside").getByRole("button", { name: "Recap" }).click();
  await expect(page.getByLabel("OpenRouter API key")).toHaveValue("");
  await expect(page.getByLabel("Endpoint")).toHaveValue("https://openrouter.ai/api/v1");
  await expect(page.getByLabel("Model")).toHaveValue("moonshotai/kimi-k2.6");
  await expect(page.getByLabel("Provider")).toHaveValue("remote");
  await page.getByLabel("Provider").selectOption("none");
  await page.getByLabel("OpenRouter API key").fill("replacement-key");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByLabel("Provider")).toHaveValue("remote");
  await expect(page.getByText("API key saved securely with Windows DPAPI.")).toBeVisible();
  await page.screenshot({ path: "test-results/openrouter-recap-settings.png", fullPage: true });
});

test("plans, previews, creates, and undoes workspace content with Diorna AI", async ({ page }) => {
  let submittedPayload: Record<string, unknown> | undefined;
  await page.route("**/chat/completions", async (route) => {
    const request = route.request();
    const body = request.postDataJSON() as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format: { json_schema: { strict: boolean } };
      provider: { data_collection: string };
    };
    submittedPayload = JSON.parse(body.messages.at(-1)!.content) as Record<string, unknown>;
    expect(body.model).toBe("moonshotai/kimi-k2.6");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.provider.data_collection).toBe("deny");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                version: 1,
                summary: "Prepare the kernel project and personal schedule.",
                assumptions: ["Football lasts one hour."],
                operations: [
                  {
                    id: "kernel-note",
                    type: "create_note",
                    title: "AI Kernel Guide",
                    bodyMarkdown:
                      "# Kernel processes\n\nThe kernel schedules processes and isolates resources.",
                    tags: ["systems"],
                  },
                  {
                    id: "business-map",
                    type: "create_map",
                    name: "AI Coffee Business",
                    nodes: [
                      {
                        id: "root",
                        kind: "text",
                        title: "Adaptogenic coffee",
                        body: null,
                        noteOperationId: null,
                        locked: true,
                      },
                      {
                        id: "research",
                        kind: "note",
                        title: "Research",
                        body: null,
                        noteOperationId: "kernel-note",
                        locked: false,
                      },
                    ],
                    edges: [{ from: "root", to: "research", label: "uses" }],
                  },
                  {
                    id: "football",
                    type: "create_calendar_item",
                    kind: "event",
                    title: "AI Football",
                    description: "",
                    startAt: "2026-07-23T19:00:00+02:00",
                    endAt: "2026-07-23T20:00:00+02:00",
                    allDay: false,
                    category: "",
                    priority: "none",
                  },
                  {
                    id: "stretch",
                    type: "create_habit",
                    name: "AI Stretch",
                    description: "Track time completed.",
                    category: "",
                    tracking: "quantity",
                    unit: "minutes",
                    target: 20,
                    activeWeekdays: [1, 2, 3, 4, 5, 6],
                  },
                ],
              }),
            },
          },
        ],
      }),
    });
  });
  page.on("dialog", (dialog) => void dialog.accept());

  await completeOnboarding(page, "sk-or-v1-e2e-only");
  const launcher = page.getByRole("button", { name: "Diorna AI" });
  await expect(launcher).toBeVisible();
  await launcher.click();
  const drawer = page.getByRole("dialog", { name: "Diorna AI" });
  await expect(drawer.getByRole("heading", { name: "Diorna AI" })).toBeVisible();
  const composer = drawer.getByLabel("Ask Diorna AI");
  await composer.fill("Create a useful project from /");
  const mentionMenu = drawer.getByRole("listbox", { name: "Mention a note" });
  await expect(mentionMenu).toBeVisible();
  await mentionMenu.getByRole("option", { name: /Welcome to Diorna/ }).click();
  await expect(drawer.getByLabel("Referenced notes")).toContainText("Welcome to Diorna");
  await composer.fill(
    `${await composer.inputValue()} plus a football event and a 20 minute stretching habit`,
  );
  await drawer.getByRole("button", { name: "Plan", exact: true }).click();

  const preview = drawer.getByLabel("AI plan preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByText("AI Kernel Guide", { exact: true })).toBeVisible();
  await expect(preview.getByText("AI Coffee Business", { exact: true })).toBeVisible();
  await expect(preview.getByText("AI Football", { exact: true })).toBeVisible();
  await expect(preview.getByText("AI Stretch", { exact: true })).toBeVisible();
  expect(submittedPayload).toMatchObject({
    workspace: "University",
    timezone: "Europe/Brussels",
    referencedNotes: [expect.objectContaining({ title: "Welcome to Diorna" })],
  });
  await page.screenshot({ path: "test-results/diorna-ai-plan.png", fullPage: true });

  await preview.getByRole("button", { name: "Apply 4 actions" }).click();
  await expect(drawer.getByRole("heading", { name: "Created in University" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /AI Kernel Guide/ })).toBeVisible();
  await expect(drawer.getByRole("button", { name: /AI Coffee Business/ })).toBeVisible();
  await drawer.getByRole("button", { name: "Undo this batch" }).click();

  await drawer.getByRole("button", { name: "Close Diorna AI" }).click();
  await page.getByRole("button", { name: "Notes Ctrl 1" }).click();
  await expect(
    page.locator(".context-sidebar").getByRole("button", { name: "AI Kernel Guide" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Maps Ctrl 2" }).click();
  await expect(
    page.locator(".context-sidebar").getByRole("button", { name: "AI Coffee Business" }),
  ).toHaveCount(0);
});

test("onboards, isolates workspaces, and opens the Gym canvas", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await completeOnboarding(page);
  await page.getByLabel("Workspace").selectOption("workspace-personal");
  await expect(page.getByRole("heading", { name: "Studio" })).toBeVisible();
  await page.getByRole("button", { name: "Maps Ctrl 2" }).click();
  await expect(page.getByLabel("Current map")).toHaveValue("map-gym");
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.getByText("Programme", { exact: true })).toBeVisible();
  await expect(page.getByText("Stretching", { exact: true })).toBeVisible();
  await page.getByTitle("Text card").click();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await page.getByLabel("Undo").click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByLabel("Redo").click();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await page.getByText("New idea", { exact: true }).click();
  await expect(page.locator(".right-panel").getByLabel("Node text")).toBeVisible();
  await expect(page.locator(".canvas-wrap .map-inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "Close inspector" }).click();
  await expect(page.getByRole("button", { name: "Open node inspector" })).toBeVisible();
  await page.getByRole("button", { name: "Open node inspector" }).click();
  await page.getByLabel("Node text").fill("Map acceptance node\nPosition must survive restart");
  const added = page.locator(".react-flow__node").filter({ hasText: "Map acceptance node" });
  const box = await added.boundingBox();
  if (!box) throw new Error("Added map node has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + 18);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + 88, { steps: 8 });
  await page.mouse.up();
  const transform = await added.evaluate((element) => (element as HTMLElement).style.transform);
  await page.reload();
  const restored = page.locator(".react-flow__node").filter({ hasText: "Map acceptance node" });
  await expect(restored).toBeVisible();
  await expect
    .poll(() => restored.evaluate((element) => (element as HTMLElement).style.transform))
    .toBe(transform);
  await restored.click();
  await page.getByLabel("Node type").selectOption("submap");
  await page.getByRole("button", { name: "Create linked sub-map" }).click();
  const breadcrumb = page.getByRole("navigation", { name: "Map breadcrumb" });
  await expect(breadcrumb.getByRole("button", { name: "Gym" })).toBeVisible();
  await breadcrumb.getByRole("button", { name: "Gym" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(5);
  await page.getByRole("button", { name: /Present/ }).click();
  await expect(page.locator(".map-module.presenting")).toBeVisible();
  await page.getByRole("button", { name: "Exit" }).click();
  const mapSidebar = page.locator(".context-sidebar");
  await mapSidebar.getByRole("button", { name: "Add map" }).click();
  await expect(page.getByLabel("Current map")).not.toHaveValue("map-gym");
  await mapSidebar.getByRole("button", { name: "Gym", exact: true }).click();
  await expect(page.getByLabel("Current map")).toHaveValue("map-gym");
  await page.screenshot({ path: "test-results/gym-map.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("drops, renders, moves, and restores media on a map", async ({ page }) => {
  await completeOnboarding(page);
  await page.getByLabel("Workspace").selectOption("workspace-personal");
  await page.getByRole("button", { name: "Maps Ctrl 2" }).click();
  const canvas = page.locator(".react-flow");
  await expect(canvas).toBeVisible();
  await canvas.evaluate((target) => {
    const image = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (character) => character.charCodeAt(0),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([image], "map-image.png", { type: "image/png" }));
    transfer.items.add(new File(["video"], "map-lecture.mp4", { type: "video/mp4" }));
    transfer.items.add(new File(["audio"], "map-audio.mp3", { type: "audio/mpeg" }));
    transfer.items.add(new File(["%PDF-1.7"], "map-reading.pdf", { type: "application/pdf" }));
    const bounds = target.getBoundingClientRect();
    target.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        clientX: bounds.left + bounds.width * 0.18,
        clientY: bounds.top + bounds.height * 0.18,
        dataTransfer: transfer,
      }),
    );
  });

  const imageNode = page.locator(
    '.react-flow__node:has(.canvas-card[data-media-name="map-image.png"])',
  );
  const videoNode = page.locator(
    '.react-flow__node:has(.canvas-card[data-media-name="map-lecture.mp4"])',
  );
  const audioNode = page.locator(
    '.react-flow__node:has(.canvas-card[data-media-name="map-audio.mp3"])',
  );
  const pdfNode = page.locator(
    '.react-flow__node:has(.canvas-card[data-media-name="map-reading.pdf"])',
  );
  const image = imageNode.getByRole("img", { name: "map-image.png" });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("draggable", "false");
  await expect(imageNode.getByText("map-image.png", { exact: true })).toHaveCount(0);
  await expect(videoNode.getByLabel("map-lecture.mp4")).toBeVisible();
  await expect(audioNode.getByLabel("map-audio.mp3")).toBeVisible();
  await expect(pdfNode.locator("iframe")).toBeVisible();
  await page.screenshot({ path: "test-results/map-media-drop.png", fullPage: true });

  const before = await imageNode.evaluate((element) => (element as HTMLElement).style.transform);
  const box = await image.boundingBox();
  if (!box) throw new Error("Map image has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 96, box.y + box.height / 2 + 64, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => imageNode.evaluate((element) => (element as HTMLElement).style.transform))
    .not.toBe(before);
  await expect(page.locator(".canvas-wrap")).not.toHaveClass(/native-drop-active/);

  const existingNode = page.locator(".react-flow__node").filter({ hasText: "Stretching" });
  const existingBefore = await existingNode.evaluate(
    (element) => (element as HTMLElement).style.transform,
  );
  const existingHandle = existingNode.locator("header");
  const existingBox = await existingHandle.boundingBox();
  if (!existingBox) throw new Error("Existing map node has no drag handle");
  await page.mouse.move(
    existingBox.x + existingBox.width / 2,
    existingBox.y + existingBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    existingBox.x + existingBox.width / 2 + 64,
    existingBox.y + existingBox.height / 2 - 48,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(() => existingNode.evaluate((element) => (element as HTMLElement).style.transform))
    .not.toBe(existingBefore);
  await expect(page.locator(".canvas-wrap")).not.toHaveClass(/native-drop-active/);

  await imageNode.locator(".canvas-card").click();
  const resizeHandle = imageNode.locator(".react-flow__resize-control.handle.bottom.right");
  await expect(resizeHandle).toBeVisible();
  const sizeBefore = await imageNode.boundingBox();
  const resizeBox = await resizeHandle.boundingBox();
  if (!sizeBefore || !resizeBox) throw new Error("Map media resize handle has no bounding box");
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    resizeBox.x + resizeBox.width / 2 + 72,
    resizeBox.y + resizeBox.height / 2 + 40,
    {
      steps: 8,
    },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await imageNode.boundingBox())?.width ?? 0)
    .toBeGreaterThan(sizeBefore.width + 40);

  await page.reload();
  const restoredImage = page
    .locator('.react-flow__node:has(.canvas-card[data-media-name="map-image.png"])')
    .getByRole("img", { name: "map-image.png" });
  await expect(restoredImage).toBeVisible();
  await expect
    .poll(() => restoredImage.evaluate((element) => (element as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(
    page.locator('.react-flow__node:has(.canvas-card[data-media-name="map-lecture.mp4"])'),
  ).toBeVisible();
});

test("keeps linked map notes current with complete rich media", async ({ page }) => {
  await completeOnboarding(page);
  await page.getByLabel("Workspace").selectOption("workspace-personal");
  await page.getByRole("button", { name: "Notes Ctrl 1" }).click();
  await page.getByRole("button", { name: "New note" }).click();
  const liveEditor = page.locator(".note-editor-live:not([hidden])");
  const title = liveEditor.getByLabel("Note title");
  await expect(title).toHaveValue(/^Untitled/);
  await title.fill("Map live note");
  await title.blur();
  await expect(title).toHaveValue("Map live note");
  const editor = liveEditor.locator('.prose-editor[contenteditable="true"]');
  await editor.fill("Initial map note content");
  await page.waitForTimeout(800);

  await page.getByRole("button", { name: "Maps Ctrl 2" }).click();
  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByText("New idea", { exact: true }).click();
  await page.getByLabel("Node type").selectOption("note");
  await page.getByLabel("Linked note").selectOption({ label: "Map live note" });
  const noteNode = page.locator(".react-flow__node:has(.canvas-card.type-note)");
  await expect(noteNode.getByText("Map live note", { exact: true })).toBeVisible();
  await expect(noteNode.locator(".canvas-note-preview")).toContainText("Initial map note content");

  await page.getByRole("button", { name: "Notes Ctrl 1" }).click();
  await page.locator(".note-list-row").filter({ hasText: "Map live note" }).click();
  await title.fill("Map live note updated");
  await title.blur();
  await editor.click();
  await editor.press("Control+End");
  await editor.press("Enter");
  await editor.pressSequentially(
    `${"Complete updated content. ".repeat(14)}Final synchronized marker.`,
  );
  await editor.evaluate((target) => {
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (character) => character.charCodeAt(0),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "map-note-image.png", { type: "image/png" }));
    (target as HTMLElement).focus();
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: transfer });
    target.dispatchEvent(event);
  });
  await expect(page.locator("figure.attachment-node.image").getByRole("img")).toBeVisible();
  await page.waitForTimeout(800);

  await page.getByRole("button", { name: "Maps Ctrl 2" }).click();
  await expect(noteNode.getByText("Map live note updated", { exact: true })).toBeVisible();
  const preview = noteNode.locator(".canvas-note-preview");
  await expect(preview).toContainText("Final synchronized marker.");
  const previewImage = preview.getByRole("img", { name: "map-note-image.png" });
  await expect(previewImage).toBeAttached();
  await preview.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(previewImage).toBeVisible();
  await page.screenshot({ path: "test-results/map-linked-note-update.png", fullPage: true });
});

test("supports keyboard command palette and daily habit entry", async ({ page }) => {
  await completeOnboarding(page);
  await page.getByLabel("Workspace").selectOption("workspace-personal");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.getByPlaceholder("Search or type a command…").fill("daily");
  await page.getByPlaceholder("Search or type a command…").press("Enter");
  await expect(page.locator(".daily-score")).toBeVisible();
  const grid = page.getByLabel("Habit grid");
  await grid.focus();
  await page.keyboard.press("Space");
  await expect(grid).toBeVisible();
});

test("defines, backfills, analyses, and restores daily series", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await completeOnboarding(page);
  await page.getByLabel("Workspace").selectOption("workspace-personal");
  await page.getByRole("button", { name: "Daily Ctrl 4" }).click();

  await page.getByRole("button", { name: "Add habit" }).click();
  const habitDialog = page.getByRole("dialog", { name: "Add habit" });
  await habitDialog.getByLabel("Name").fill("Hydration acceptance");
  await habitDialog.getByLabel("Type").selectOption("quantity");
  await habitDialog.getByLabel("Daily target").fill("2");
  await habitDialog.getByLabel("Unit").fill("L");
  await habitDialog.getByLabel("Note / protocol").fill("Backfill after each training session");
  await habitDialog.getByRole("button", { name: "Save habit" }).click();
  const habitRow = page.locator(".habit-name").filter({ hasText: "Hydration acceptance" });
  await expect(habitRow).toBeVisible();
  const habitCell = habitRow.locator("+ .habit-cell");
  await habitCell.click();
  await habitCell.getByRole("spinbutton").fill("2.5");
  await habitCell.getByRole("spinbutton").press("Enter");
  await expect(habitCell).toContainText("2.5");
  await habitRow.click();
  await expect(page.getByRole("heading", { name: "Hydration acceptance" })).toBeVisible();

  await page.getByRole("button", { name: "Metrics", exact: true }).click();
  await page.getByRole("button", { name: "Add metric" }).click();
  const metricDialog = page.getByRole("dialog", { name: "Add metric" });
  await metricDialog.getByLabel("Name").fill("Sleep acceptance");
  await metricDialog.getByLabel("Unit").fill("h");
  await metricDialog.getByLabel("Optional target").fill("8");
  await metricDialog.getByRole("button", { name: "Save metric" }).click();
  const metricRow = page.locator(".metric-name").filter({ hasText: "Sleep acceptance" });
  await expect(metricRow).toBeVisible();
  const metricCell = metricRow.locator("+ .metric-cell");
  await metricCell.click();
  await metricCell.getByRole("spinbutton").fill("7.5");
  await metricCell.getByRole("spinbutton").press("Enter");
  await expect(metricCell).toContainText("7.5 h");
  await metricRow.click();
  await expect(page.getByRole("dialog", { name: "Sleep acceptance chart" })).toBeVisible();
  await page.getByRole("dialog", { name: "Sleep acceptance chart" }).getByLabel("Close").click();

  await page.getByLabel("Date window").selectOption("custom");
  await page.getByLabel("Range start").fill("2026-07-01");
  await page.getByLabel("Range end").fill("2026-07-03");
  await expect(page.locator(".date-cell")).toHaveCount(3);
  await page.reload();
  await expect(page.getByLabel("Date window")).toHaveValue("custom");
  await expect(page.getByLabel("Range start")).toHaveValue("2026-07-01");
  await expect(page.getByLabel("Range end")).toHaveValue("2026-07-03");
  await page.getByRole("button", { name: "Statistics", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Completion statistics" })).toBeVisible();
  await expect(page.getByText("Trailing twelve months")).toBeVisible();
  await page.screenshot({ path: "test-results/daily-grid.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("creates a deterministic recap and stores it as a note", async ({ page }) => {
  await completeOnboarding(page);
  await page.getByLabel("Workspace").selectOption("workspace-personal");
  await page.getByRole("button", { name: "Recap Ctrl 5" }).click();
  await page.getByRole("button", { name: "Generate now" }).click();
  await expect(
    page.getByText("Every figure below is traceable to local statistics."),
  ).toBeVisible();
  await expect(page.getByText("deterministic-template", { exact: false })).toBeVisible();
  await expect(page.getByText(/revision 1/)).toBeVisible();
  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect(page.getByText(/revision 2/)).toBeVisible();
  await page.getByRole("button", { name: "← Timeline" }).click();
  await page.getByRole("button", { name: "Year", exact: true }).click();
  await page.getByText("Combine all workspaces").click();
  await page.getByRole("button", { name: "Generate now" }).click();
  await expect(
    page.getByText("Every figure below is traceable to local statistics."),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/yearly-recap.png", fullPage: true });
  await page.getByRole("button", { name: "← Timeline" }).click();
  await expect(page.getByText("All workspaces", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Start").fill("2026-07-01");
  await page.getByLabel("End").fill("2026-07-03");
  await page.getByRole("button", { name: "Generate now" }).click();
  await expect(page.getByText(/Jul 1, 2026/)).toBeVisible();
});

test("plans, recurs, completes, and reloads a calendar item", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await completeOnboarding(page);
  await page.getByRole("button", { name: "Calendar Ctrl 3" }).click();
  await expect(page.locator(".calendar-page")).toBeVisible();
  await page.getByRole("button", { name: "New item" }).click();
  const dialog = page.getByRole("dialog", { name: "New calendar item" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "task" }).click();
  await dialog.getByLabel("Title *").fill("Calendar acceptance review");
  await dialog.getByLabel("Description").fill("A fully linked recurring study session");
  await dialog.getByLabel("Priority").selectOption("high");
  await dialog.getByLabel("Repeats").selectOption("weekly");
  await dialog.getByPlaceholder("Add a subtask and press Enter").fill("Bring lecture notes");
  await dialog.getByPlaceholder("Add a subtask and press Enter").press("Enter");
  await dialog.getByRole("button", { name: "Save item" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "A", exact: true }).click();
  const agendaItem = page
    .locator(".agenda-view article")
    .filter({
      hasText: "Calendar acceptance review",
    })
    .first();
  await expect(agendaItem).toBeVisible();
  await expect(agendaItem).toContainText("week");
  await agendaItem.getByRole("button", { name: "Details" }).click();
  const edit = page.getByRole("dialog", { name: "Edit calendar item" });
  await expect(edit.locator(".subtasks-editor label input").nth(1)).toHaveValue(
    "Bring lecture notes",
  );
  await edit.getByLabel("Completed").check();
  await edit.getByLabel("Apply edits to").selectOption("all");
  await edit.getByRole("button", { name: "Save item" }).click();
  await expect(agendaItem).toHaveClass(/complete/);
  await page.reload();
  await expect(
    page.locator(".agenda-view article").filter({ hasText: "Calendar acceptance review" }).first(),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/calendar-workflow.png", fullPage: true });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator(".settings-layout aside").getByRole("button", { name: "Categories" }).click();
  await page.getByRole("button", { name: "New category" }).click();
  await page
    .locator(".category-settings-list > div")
    .last()
    .getByLabel("Category name")
    .fill("Focus");
  await page.getByRole("button", { name: "Calendar Ctrl 3" }).click();
  await expect(
    page.locator(".category-filter").getByRole("button", { name: "Focus" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("moves a calendar event to another day in month view", async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole("button", { name: "Calendar Ctrl 3" }).click();
  await page.getByRole("button", { name: "New item" }).click();
  const dialog = page.getByRole("dialog", { name: "New calendar item" });
  await dialog.getByLabel("Title *").fill("Month drag acceptance");
  await dialog.getByRole("button", { name: "Save item" }).click();
  await page.getByRole("button", { name: "M", exact: true }).click();
  const event = page.getByTitle("Drag Month drag acceptance to another day");
  await expect(event).toBeVisible();
  const original = await event.evaluate(
    (element) => element.closest<HTMLElement>("[data-date]")!.dataset.date!,
  );
  const target = new Date(`${original}T12:00:00`);
  target.setDate(target.getDate() + 2);
  const targetDate = [
    target.getFullYear(),
    String(target.getMonth() + 1).padStart(2, "0"),
    String(target.getDate()).padStart(2, "0"),
  ].join("-");
  const sourceBox = await event.boundingBox();
  const targetBox = await page.locator(`[data-date="${targetDate}"]`).boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Calendar drag source or target is not visible");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(() =>
      event.evaluate((element) => element.closest<HTMLElement>("[data-date]")!.dataset.date),
    )
    .toBe(targetDate);
});

test("organises, annotates, searches, and revises notes", async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole("button", { name: "Notes Ctrl 1" }).click();
  await page.getByRole("button", { name: "New note" }).click();
  const title = page.getByLabel("Note title");
  await title.fill("Research plan");
  await title.blur();
  await page.getByRole("button", { name: "Add property" }).click();
  await page.getByLabel("Property name").fill("status");
  await page.getByLabel("Property type").selectOption("single-select");
  await page.locator(".property-add-row").getByRole("button", { name: "Add" }).click();
  await expect(page.locator(".property-row").filter({ hasText: "status" })).toBeVisible();
  await page.getByRole("button", { name: "+ tag" }).click();
  await page.getByLabel("New tag").fill("research/methods");
  await page.getByLabel("New tag").press("Enter");
  await expect(page.getByRole("button", { name: "#research/methods ×" })).toBeVisible();
  const editor = page.getByLabel("Note editor");
  await editor.click();
  await editor.pressSequentially("# Outline");
  await editor.press("Enter");
  await editor.press("Enter");
  await editor.pressSequentially("Findings and next steps");
  await editor.pressSequentially(" [[Wel");
  await expect(page.getByRole("listbox", { name: "Link a note" })).toBeVisible();
  await page.getByRole("option", { name: /Welcome to Diorna/ }).click();
  await expect(editor.getByRole("link", { name: "Welcome to Diorna" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Outline", exact: true })).toBeVisible();
  await page.getByPlaceholder("Search notes or use tag:, folder:, course:…").fill("research");
  await expect(page.locator(".note-list-row").filter({ hasText: "Research plan" })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".note-browser").getByText("research", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Export note" }).click();
  await expect(page.getByRole("dialog", { name: "Export notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Markdown" })).toBeVisible();
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect((await pdfDownload).suggestedFilename()).toMatch(/Research plan\.pdf$/);
  await page.getByRole("button", { name: "Close export" }).click();
  await page.getByRole("button", { name: "Revision history" }).click();
  await expect(page.getByRole("complementary", { name: "Revision history" })).toBeVisible();
  await page.screenshot({ path: "test-results/notes-workflow.png", fullPage: true });
});

test("creates and follows a visual child page with the slash command", async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole("button", { name: "Notes Ctrl 1" }).click();
  await page.getByRole("button", { name: "New note" }).click();
  const liveEditor = page.locator(".note-editor-live:not([hidden])");
  const title = liveEditor.getByLabel("Note title");
  await expect(title).toHaveValue(/^Untitled/);
  await title.fill("Parent page");
  await title.blur();
  const editor = liveEditor.locator('.prose-editor[contenteditable="true"]');
  await editor.click();
  await editor.pressSequentially("/");
  const slashMenu = page.locator(".slash-menu");
  await expect(slashMenu).toBeVisible();
  await slashMenu.getByPlaceholder("Search blocks…").fill("page");
  await slashMenu.getByRole("button", { name: /Page/ }).click();

  await expect(liveEditor.getByLabel("Note title")).toHaveValue("Untitled page");
  const backToParent = liveEditor.getByRole("button", { name: "Back to Parent page" });
  await expect(backToParent).toBeVisible();
  await page.screenshot({ path: "test-results/nested-page-back.png", fullPage: true });
  await backToParent.click();
  const pageLink = liveEditor.getByRole("link", { name: "Untitled page" });
  await expect(pageLink).toBeVisible();
  await expect(pageLink).toHaveCSS("text-decoration-line", "underline");
  await expect(pageLink).toHaveCSS("cursor", "pointer");
  await pageLink.click();
  const childTitle = liveEditor.getByLabel("Note title");
  await expect(childTitle).toHaveValue("Untitled page");
  await childTitle.fill("Child page");
  await childTitle.blur();

  await editor.click();
  await editor.press("Control+End");
  await editor.pressSequentially("/");
  await expect(slashMenu).toBeVisible();
  await slashMenu.getByPlaceholder("Search blocks…").fill("page");
  await slashMenu.getByRole("button", { name: /Page/ }).click();
  await expect(liveEditor.getByLabel("Note title")).toHaveValue("Untitled page");
  await liveEditor.getByRole("button", { name: "Back to Child page" }).click();
  await expect(liveEditor.getByLabel("Note title")).toHaveValue("Child page");
  await liveEditor.getByRole("button", { name: "Back to Parent page" }).click();
  const renamedLink = liveEditor.getByRole("link", { name: "Child page" });
  await expect(renamedLink).toBeVisible();
  await page.screenshot({ path: "test-results/nested-page-link.png", fullPage: true });
  await renamedLink.click();
  await expect(liveEditor.getByLabel("Note title")).toHaveValue("Child page");
  await page
    .locator(".context-sidebar")
    .getByRole("button", { name: "Parent page", exact: true })
    .click();
  await expect(liveEditor.getByLabel("Note title")).toHaveValue("Parent page");
});

test("expands a complete nested note tree into connected map nodes", async ({ page }) => {
  await completeOnboarding(page);
  await page.getByLabel("Workspace").selectOption("workspace-personal");
  await page.getByRole("button", { name: "Notes Ctrl 1" }).click();
  const liveEditor = page.locator(".note-editor-live:not([hidden])");
  const title = liveEditor.getByLabel("Note title");
  const editor = liveEditor.locator('.prose-editor[contenteditable="true"]');

  await page.getByRole("button", { name: "New note" }).click();
  await title.fill("Map grandchild");
  await title.blur();

  await page.getByRole("button", { name: "New note" }).click();
  await title.fill("Map child");
  await title.blur();
  await editor.click();
  await editor.pressSequentially("[[Map grand");
  await page.getByRole("option", { name: /Map grandchild/ }).click();

  await page.getByRole("button", { name: "New note" }).click();
  await title.fill("Map root");
  await title.blur();
  await editor.click();
  await editor.pressSequentially("[[Map chi");
  await page.getByRole("option", { name: /Map child/ }).click();
  await page.waitForTimeout(800);

  await page.getByRole("button", { name: "Maps Ctrl 2" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  const existingEdgeCount = await page.locator(".react-flow__edge").count();
  await page.getByRole("button", { name: "Add node" }).click();
  await page.getByText("New idea", { exact: true }).click();
  const inspector = page.locator(".right-panel");
  await inspector.getByLabel("Node type").selectOption("note");
  await inspector.getByLabel("Linked note").selectOption({ label: "Map root" });
  await inspector.getByRole("button", { name: "Expand all linked pages" }).click();

  await expect(page.locator(".canvas-card.type-note")).toHaveCount(3);
  await expect(page.getByText("2 linked pages expanded.")).toBeVisible();
  await expect(page.locator(".react-flow__edge")).toHaveCount(existingEdgeCount + 2);
  await page.waitForTimeout(350);
  await page.screenshot({ path: "test-results/map-linked-page-tree.png", fullPage: true });
  await page.setViewportSize({ width: 1000, height: 720 });
  await expect(inspector).toBeVisible();
  await inspector.getByRole("button", { name: "Close inspector" }).click();
  await expect(page.getByRole("button", { name: "Open node inspector" })).toBeVisible();
  await page.getByRole("button", { name: "Open node inspector" }).click();
  await expect(inspector.getByLabel("Linked note")).toBeVisible();
});

test("creates a course lecture and reviews an authored flashcard", async ({ page }) => {
  test.setTimeout(60_000);
  await completeOnboarding(page);
  await page.getByRole("button", { name: "Notes Ctrl 1" }).click();
  const browser = page.locator(".note-browser");
  await browser.getByRole("button", { name: "Courses" }).click();
  await expect(page.getByRole("heading", { name: /Distributed Systems/ })).toBeVisible();
  await page.getByRole("button", { name: "New lecture" }).click();
  await expect(page.getByLabel("Note title")).toHaveValue(/INFO-H515/);
  const lectureTitle = await page.getByLabel("Note title").inputValue();
  const editor = page.getByLabel("Note editor");
  await page.getByLabel("Insert math").click();
  await page.getByLabel("Search mathematical symbols").fill("E = mc^2");
  await page.getByRole("button", { name: "Insert display equation" }).click();
  await page.locator(".math-node").dblclick();
  await page.getByLabel("Number equation").check();
  await page.getByLabel("Equation label").fill("mass");
  await page.locator(".math-editor-fields").getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".equation-number")).toHaveText("(1)");
  await editor.click();
  await editor.press("Control+End");
  await editor.pressSequentially("/");
  await page
    .locator(".slash-menu")
    .getByRole("button", { name: /Flashcard/ })
    .click();
  await expect(page.locator(".flashcard-node")).toBeVisible();
  await page.waitForTimeout(800);
  await browser.getByRole("button", { name: /Review/ }).click();
  await expect(page.getByRole("heading", { name: "1 cards due" })).toBeVisible();
  await page.getByRole("button", { name: "Show answer" }).click();
  await page.getByRole("button", { name: "Good" }).click();
  await expect(page.getByRole("heading", { name: "0 cards due" })).toBeVisible();
  await browser.getByRole("button", { name: "Bibliography" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "library.bib",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "@article{smith2026, title={Local First Learning}, author={Smith, Jane}, year={2026}}",
    ),
  });
  await expect(page.getByText("Local First Learning", { exact: true })).toBeVisible();
  await page.locator(".note-list-row").filter({ hasText: lectureTitle }).click();
  await editor.click();
  await editor.press("Control+End");
  await editor.press("Enter");
  await editor.pressSequentially("@smi");
  await page.getByRole("option", { name: /Local First Learning/ }).click();
  await editor.press("Enter");
  await editor.pressSequentially("/");
  await page
    .locator(".slash-menu")
    .getByRole("button", { name: /Reference list/ })
    .click();
  await expect(page.locator(".reference-list-node")).toContainText("Local First Learning");
  await page.screenshot({ path: "test-results/student-workflow.png", fullPage: true });
});

test("customizes the dashboard, split layout, appearance, and keymap", async ({ page }) => {
  await completeOnboarding(page);

  await page.getByText("Customize", { exact: true }).click();
  const flashcardsToggle = page.getByRole("checkbox", { name: "Flashcards due" });
  await flashcardsToggle.uncheck();
  await expect(page.getByText("Flashcards due today", { exact: true })).toHaveCount(0);
  await flashcardsToggle.check();
  await expect(page.getByText("Flashcards due today", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Split pane right" }).click();
  await expect(page.locator(".workspace-pane")).toHaveCount(2);
  await page.getByRole("button", { name: "Split pane down" }).last().click();
  await expect(page.locator(".workspace-pane")).toHaveCount(3);
  await expect(page.getByRole("separator", { name: /Resize .* split/ })).toHaveCount(2);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByLabel("Interface font").selectOption("Inter");
  await page.getByLabel("Editor font size").fill("18");
  await expect(page.locator("html")).toHaveCSS("--editor-font-size", "18px");

  await page.getByRole("button", { name: "Shortcuts" }).click();
  const quickCapture = page.locator(".shortcut-list label").filter({ hasText: "Quick capture" });
  await quickCapture.locator("input").fill("Ctrl+K");
  await expect(page.locator(".shortcut-list label.conflict")).toHaveCount(2);
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect(page.locator(".shortcut-list label.conflict")).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".workspace-pane")).toHaveCount(3);
  await page.screenshot({ path: "test-results/custom-shell-settings.png", fullPage: true });
});

test("duplicates, trashes, and restores a note", async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole("button", { name: "Notes Ctrl 1" }).click();
  await page.getByRole("button", { name: "New note" }).click();
  const title = page.getByLabel("Note title");
  await title.fill("Trash acceptance");
  await title.blur();
  const originalRow = page
    .locator(".note-list-row")
    .filter({ hasText: "Trash acceptance" })
    .first();
  await originalRow.hover();
  await page.getByRole("button", { name: "Duplicate Trash acceptance" }).click();
  await expect(
    page.locator(".note-list-row").filter({ hasText: "Trash acceptance copy" }),
  ).toBeVisible();
  await originalRow.hover();
  await page.getByRole("button", { name: "Move Trash acceptance to trash" }).click();
  await expect(
    page.locator(".note-list-row").filter({ hasText: /^Trash acceptance(?! copy)/ }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Vault" }).click();
  const trashGroup = page.locator(".settings-group").filter({
    has: page.getByRole("heading", { name: "Trash", exact: true }),
  });
  await expect(trashGroup.getByText("Trash acceptance.md", { exact: true })).toBeVisible();
  await trashGroup.getByRole("button", { name: "Restore" }).click();
  await expect(trashGroup.getByText("Trash is empty.")).toBeVisible();
  await page.getByRole("button", { name: "Notes Ctrl 1" }).click();
  await expect(
    page.locator(".note-list-row").filter({ hasText: /^Trash acceptance(?! copy)/ }),
  ).toBeVisible();
});

test("meets the shell accessibility gate and switches to French", async ({ page }) => {
  await completeOnboarding(page);
  for (const module of ["Home", "Notes", "Maps", "Calendar", "Daily", "Recap", "Settings"]) {
    await page
      .getByRole("button", { name: module === "Home" ? "Home" : new RegExp(`^${module}`) })
      .first()
      .click();
    await page.waitForTimeout(150);
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      accessibility.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.map((node) => node.target),
      })),
      `${module} accessibility violations`,
    ).toEqual([]);
  }

  await page.getByLabel("Language").selectOption("fr");
  await expect(page.getByRole("heading", { name: "Général", level: 1 })).toBeVisible();
  await expect(page.getByText("Mises à jour automatiques", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
});

test("pastes a screenshot into a portable attachment block", async ({ page }) => {
  await completeOnboarding(page);
  await page.getByRole("button", { name: /^Notes/ }).click();
  const editor = page.locator(
    '.note-editor-live:not([hidden]) .prose-editor[contenteditable="true"]',
  );
  await expect(editor).toBeVisible();
  await editor.click();
  await editor.evaluate((target) => {
    const bytes = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (character) => character.charCodeAt(0),
    );
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "screenshot.png", { type: "image/png" }));
    (target as HTMLElement).focus();
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: transfer });
    target.dispatchEvent(event);
  });
  const attachment = page.locator("figure.attachment-node.image");
  await expect(attachment.getByRole("img")).toBeVisible();
  await attachment.getByRole("button", { name: "Open screenshot.png full screen" }).click();
  const imagePreview = page.getByRole("dialog", { name: "screenshot.png preview" });
  await expect(imagePreview.getByRole("img", { name: "screenshot.png" })).toBeVisible();
  await imagePreview.getByRole("button", { name: "Close image preview" }).click();
  await expect(imagePreview).toHaveCount(0);
  await attachment.click({ position: { x: 4, y: 4 } });
  await expect(attachment.getByLabel("Image width")).toBeVisible();
  await attachment.getByLabel("Image width").evaluate((input) => {
    (input as HTMLInputElement).value = "60";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await attachment.getByLabel("Align image right").click();
  await attachment.getByPlaceholder("Add a caption…").fill("Screenshot evidence");
  await expect(attachment).toHaveClass(/align-right/);
  await expect(attachment).toHaveAttribute("style", /width: 60%/);

  const generatedPdf = new jsPDF();
  generatedPdf.text("A page anchored acceptance quote", 20, 30);
  generatedPdf.addPage();
  generatedPdf.text("Second lecture page", 20, 30);
  const pdfBytes = Array.from(new Uint8Array(generatedPdf.output("arraybuffer")));
  await editor.evaluate((target, bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([Uint8Array.from(bytes)], "reading.pdf", { type: "application/pdf" }),
    );
    transfer.items.add(new File(["video"], "lecture.mp4", { type: "video/mp4" }));
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + 20,
        clientY: rect.bottom - 20,
        dataTransfer: transfer,
      }),
    );
  }, pdfBytes);
  const pdf = page.locator(".attachment-node.pdf");
  const video = page.locator(".attachment-node.video");
  await expect(pdf.getByRole("button", { name: "Next PDF page" })).toBeVisible();
  await expect(pdf.getByText("A page anchored acceptance quote")).toBeVisible();
  await expect(pdf.getByRole("button", { name: "Open PDF page 2" })).toBeVisible();
  await pdf.getByRole("button", { name: "Next PDF page" }).click();
  await expect(pdf.getByText("Second lecture page")).toBeVisible();
  await pdf.getByRole("button", { name: "Previous PDF page" }).click();
  await pdf.getByRole("button", { name: "Zoom PDF in" }).click();
  await expect(pdf.getByText("120%")).toBeVisible();
  const selectableText = pdf.getByLabel("Selectable text from page 1");
  await selectableText.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await pdf.getByRole("button", { name: "Quote into note" }).click();
  await expect(editor.locator("blockquote")).toContainText("A page anchored acceptance quote");
  await expect(editor.getByRole("link", { name: "reading.pdf, page 1" })).toHaveAttribute(
    "href",
    "diorna-pdf:attachments%2Freading.pdf#page=1",
  );
  await pdf.getByRole("button", { name: "Next PDF page" }).click();
  await expect(pdf.getByText("Second lecture page")).toBeVisible();
  await editor.getByRole("link", { name: "reading.pdf, page 1" }).click();
  await expect(pdf.getByLabel("PDF page number")).toHaveValue("1");
  await expect(pdf.getByText("A page anchored acceptance quote")).toBeVisible();
  await expect(video.locator("video")).toBeVisible();
  const handle = video.getByLabel("Move lecture.mp4 block");
  await handle.scrollIntoViewIfNeeded();
  const handleBox = await handle.boundingBox();
  const pdfBox = await pdf.boundingBox();
  if (!handleBox || !pdfBox) throw new Error("Attachment drag source or target is not visible");
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(pdfBox.x + pdfBox.width / 2, pdfBox.y + 4, { steps: 8 });
  await expect(page.locator("body")).toHaveClass(/moving-attachment/);
  await page.mouse.up();
  await expect
    .poll(() =>
      video.evaluate((node) => {
        const target = document.querySelector(".attachment-node.pdf");
        return Boolean(
          target && node.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    )
    .toBe(true);
});
