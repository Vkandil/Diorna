import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: [
        "src/core/workspaceRepository.ts",
        "src/modules/calendar/parser.ts",
        "src/modules/calendar/recurrence.ts",
        "src/modules/daily/logic.ts",
        "src/modules/recap/logic.ts",
        "src/modules/recap/summarizer.ts",
        "src/modules/student/spacedRepetition.ts",
        "src/modules/student/flashcards.ts",
        "src/modules/student/bibliography.ts",
        "src/modules/notes/logic.ts",
      ],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
});
