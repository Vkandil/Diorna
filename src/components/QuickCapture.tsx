import { useEffect, useRef, useState } from "react";
import { CheckSquare, Inbox, Tag, X } from "lucide-react";
import { useDiornaStore } from "@/core/store";
import { BrandLogo } from "./BrandLogo";

export function QuickCapture({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const state = useDiornaStore();
  useEffect(() => input.current?.focus(), []);
  const route = value.startsWith("[]")
    ? "task"
    : value.startsWith("#")
      ? "tagged note"
      : "inbox note";
  const submit = () => {
    const text = value.replace(/^\[\]\s*/, "").trim();
    if (!text) return;
    if (route === "task") {
      const category = state.categories.find(
        (entry) => entry.workspaceId === state.activeWorkspaceId,
      )!;
      state.addItem({
        kind: "task",
        title: text,
        description: "",
        categoryId: category.id,
        dueAt: new Date().toISOString(),
        allDay: true,
        priority: "none",
        subtasks: [],
        rruleExceptions: [],
        reminders: [],
      });
    } else {
      const note = state.addNote(text.replace(/^#[^\s]+\s*/, "").slice(0, 80));
      if (route === "tagged note")
        state.updateNote(note.id, {
          tags: [text.split(/\s/)[0]!.slice(1)],
          body: `<p>${text}</p>`,
        });
    }
    onClose();
  };
  return (
    <div className="capture-layer">
      <div className="quick-capture">
        <div className="capture-title">
          <BrandLogo className="capture-brand-logo" />
          <strong>Quick capture</strong>
          <button onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <input
          ref={input}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter") submit();
          }}
          placeholder="Write anything…"
        />
        <footer>
          {route === "task" ? <CheckSquare /> : route === "tagged note" ? <Tag /> : <Inbox />}
          <span>Save as {route}</span>
          <kbd>Enter</kbd>
        </footer>
      </div>
    </div>
  );
}
