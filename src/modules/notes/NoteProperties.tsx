import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Course, Note, NoteProperty } from "@/shared/models";

const propertyTypes: NoteProperty["type"][] = [
  "text",
  "number",
  "date",
  "deadline",
  "checkbox",
  "single-select",
  "multi-select",
  "url",
  "note-reference",
];

export function NotePropertiesPanel({
  note,
  courses,
  notes,
  onChange,
}: {
  note: Note;
  courses: Course[];
  notes: Note[];
  onChange: (changes: Partial<Note>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<NoteProperty["type"]>("text");

  const setProperty = (key: string, property?: NoteProperty) => {
    const properties = { ...note.properties };
    if (property) properties[key] = property;
    else delete properties[key];
    onChange({ properties });
  };

  const add = () => {
    const key = name.trim();
    if (!key || note.properties[key]) return;
    setProperty(key, { type, value: defaultValue(type) });
    setName("");
    setAdding(false);
  };

  return (
    <section className="property-panel" aria-label="Note properties">
      <div className="property-row course-property">
        <span>Course</span>
        <select
          aria-label="Course"
          value={note.courseId ?? ""}
          onChange={(event) =>
            onChange({ courseId: event.target.value || undefined } as Partial<Note>)
          }
        >
          <option value="">None</option>
          {courses.map((course) => (
            <option value={course.id} key={course.id}>
              {course.code} · {course.name}
            </option>
          ))}
        </select>
      </div>
      {Object.entries(note.properties).map(([key, property]) => (
        <div className="property-row" key={key}>
          <span title={property.type}>{key}</span>
          <PropertyValue
            property={property}
            notes={notes}
            onChange={(value) => setProperty(key, { ...property, value })}
          />
          <button
            className="icon-button"
            aria-label={`Delete ${key} property`}
            onClick={() => setProperty(key)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      {adding ? (
        <div className="property-add-row">
          <input
            autoFocus
            aria-label="Property name"
            placeholder="Property name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add();
              if (event.key === "Escape") setAdding(false);
            }}
          />
          <select
            aria-label="Property type"
            value={type}
            onChange={(event) => setType(event.target.value as NoteProperty["type"])}
          >
            {propertyTypes.map((entry) => (
              <option value={entry} key={entry}>
                {entry.replace("-", " ")}
              </option>
            ))}
          </select>
          <button className="button compact primary" onClick={add} disabled={!name.trim()}>
            Add
          </button>
          <button className="button compact" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button className="property-add" onClick={() => setAdding(true)}>
          <Plus size={13} /> Add property
        </button>
      )}
    </section>
  );
}

function PropertyValue({
  property,
  notes,
  onChange,
}: {
  property: NoteProperty;
  notes: Note[];
  onChange: (value: NoteProperty["value"]) => void;
}) {
  if (property.type === "checkbox")
    return (
      <input
        type="checkbox"
        checked={Boolean(property.value)}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  if (property.type === "note-reference")
    return (
      <select value={String(property.value)} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select a note</option>
        {notes.map((note) => (
          <option value={note.id} key={note.id}>
            {note.title}
          </option>
        ))}
      </select>
    );
  if (property.type === "multi-select")
    return (
      <input
        value={Array.isArray(property.value) ? property.value.join(", ") : ""}
        placeholder="Comma-separated values"
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
          )
        }
      />
    );
  return (
    <input
      type={
        property.type === "number"
          ? "number"
          : property.type === "date" || property.type === "deadline"
            ? "date"
            : property.type === "url"
              ? "url"
              : "text"
      }
      value={String(property.value)}
      onChange={(event) =>
        onChange(property.type === "number" ? Number(event.target.value) : event.target.value)
      }
    />
  );
}

function defaultValue(type: NoteProperty["type"]): NoteProperty["value"] {
  if (type === "number") return 0;
  if (type === "checkbox") return false;
  if (type === "multi-select") return [];
  return "";
}
