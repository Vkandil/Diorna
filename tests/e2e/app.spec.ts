import { expect, test, type Page } from "@playwright/test";

async function completeOnboarding(page: Page) {
  await page.goto("/");
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
  await page.addInitScript(() => localStorage.clear());
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
  await expect(page.locator(".map-module select")).toHaveValue("map-gym");
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.getByText("Programme", { exact: true })).toBeVisible();
  await expect(page.getByText("Stretching", { exact: true })).toBeVisible();
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
