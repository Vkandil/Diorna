import { describe, expect, it } from "vitest";
import { matchesShortcut } from "@/core/shortcuts";

describe("editable shortcuts", () => {
  it("matches modifiers and common key aliases exactly", () => {
    expect(
      matchesShortcut(new KeyboardEvent("keydown", { key: "K", ctrlKey: true }), "Ctrl+K"),
    ).toBe(true);
    expect(
      matchesShortcut(
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true, altKey: true }),
        "Ctrl+Alt+Space",
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        new KeyboardEvent("keydown", { key: "K", ctrlKey: true, shiftKey: true }),
        "Ctrl+K",
      ),
    ).toBe(false);
  });

  it("supports punctuation and disabled bindings", () => {
    expect(
      matchesShortcut(new KeyboardEvent("keydown", { key: "\\", ctrlKey: true }), "Ctrl+\\"),
    ).toBe(true);
    expect(matchesShortcut(new KeyboardEvent("keydown", { key: "K", ctrlKey: true }), "")).toBe(
      false,
    );
  });
});
