import { expect, test, type Page } from "@playwright/test";

async function completeOnboarding(page: Page) {
  await expect(page.getByRole("heading", { name: "Choose your vault" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Make it comfortable" })).toBeVisible();
  await page.getByRole("button", { name: "Dark" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Study workspace").fill("University");
  await page.getByLabel("Personal workspace").fill("Studio");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Enter Diorna" }).click();
  await expect(page.getByRole("heading", { name: "University" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
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
  await page.screenshot({ path: "test-results/gym-map.png", fullPage: true });
  expect(errors).toEqual([]);
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

test("creates a deterministic recap and stores it as a note", async ({ page }) => {
  await completeOnboarding(page);
  await page.getByLabel("Workspace").selectOption("workspace-personal");
  await page.getByRole("button", { name: "Recap Ctrl 5" }).click();
  await page.getByRole("button", { name: "Generate now" }).click();
  await expect(
    page.getByText("Every figure below is traceable to local statistics."),
  ).toBeVisible();
  await expect(page.getByText("deterministic-template", { exact: false })).toBeVisible();
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
  await expect(editor).toContainText("[[Welcome to Diorna]]");
  await expect(page.getByRole("button", { name: "Outline", exact: true })).toBeVisible();
  await page.getByPlaceholder("Search notes or use tag:, folder:, course:…").fill("research");
  await expect(page.locator(".note-list-row").filter({ hasText: "Research plan" })).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".note-browser").getByText("research", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Export note" }).click();
  await expect(page.getByRole("dialog", { name: "Export notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Markdown" })).toBeVisible();
  await page.getByRole("button", { name: "Close export" }).click();
  await page.getByRole("button", { name: "Revision history" }).click();
  await expect(page.getByRole("complementary", { name: "Revision history" })).toBeVisible();
  await page.screenshot({ path: "test-results/notes-workflow.png", fullPage: true });
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
