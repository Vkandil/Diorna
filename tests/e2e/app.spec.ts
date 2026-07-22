import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function completeOnboarding(page: Page) {
  await expect(page.getByRole("heading", { name: "Choose your vault" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Make it comfortable" })).toBeVisible();
  await page.getByRole("button", { name: "Dark" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Study workspace", { exact: true }).fill("University");
  await page.getByLabel("Personal workspace", { exact: true }).fill("Studio");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Improve your recaps" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Enter Diorna" }).click();
  await expect(page.getByRole("heading", { name: "University" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
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
  await attachment.click();
  await attachment.getByLabel("Image width").evaluate((input) => {
    (input as HTMLInputElement).value = "60";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await attachment.getByLabel("Align image right").click();
  await attachment.getByPlaceholder("Add a caption…").fill("Screenshot evidence");
  await expect(attachment).toHaveClass(/align-right/);
  await expect(attachment).toHaveAttribute("style", /width: 60%/);

  await editor.evaluate((target) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["%PDF-1.7"], "reading.pdf", { type: "application/pdf" }));
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
  });
  await expect(page.locator(".attachment-node.pdf iframe")).toBeVisible();
  await expect(page.locator(".attachment-node video")).toBeVisible();
});
