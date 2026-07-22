import { describe, expect, it } from "vitest";
import {
  extractDatedNoteTasks,
  noteTaskDueAt,
  setDatedNoteTaskChecked,
} from "@/modules/calendar/noteTasks";

describe("dated note tasks", () => {
  it("extracts supported date annotations with stable task lines", () => {
    const result = extractDatedNoteTasks(`
      <ul data-type="taskList">
        <li data-checked="false"><p>Submit essay 📅 2026-08-02</p></li>
        <li data-checked="true"><p>Book room @due(2026-08-03)</p></li>
        <li data-checked="false"><p>No date here</p></li>
      </ul>
    `);
    expect(result).toEqual([
      { line: 1, title: "Submit essay", date: "2026-08-02", checked: false },
      { line: 2, title: "Book room", date: "2026-08-03", checked: true },
    ]);
  });

  it("updates the source checkbox without changing its text", () => {
    const html =
      '<ul data-type="taskList"><li data-checked="false"><label><input type="checkbox"></label><p>Read @2026-09-01</p></li></ul>';
    const changed = setDatedNoteTaskChecked(html, 1, true);
    expect(changed).toContain('data-checked="true"');
    expect(changed).toContain("Read @2026-09-01");
  });

  it("uses the local end of the annotated day", () => {
    const due = new Date(noteTaskDueAt("2026-10-12"));
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(9);
    expect(due.getDate()).toBe(12);
    expect(due.getHours()).toBe(23);
    expect(due.getMinutes()).toBe(59);
  });
});
