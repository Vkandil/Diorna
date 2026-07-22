PRAGMA foreign_keys = ON;

CREATE TABLE workspace (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  folder_name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE note (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  course_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(workspace_id, path),
  UNIQUE(id, workspace_id)
);
CREATE INDEX idx_note_workspace ON note(workspace_id);

CREATE TABLE note_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  source_note_id TEXT NOT NULL,
  target_note_id TEXT NOT NULL,
  context TEXT NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY(source_note_id, workspace_id) REFERENCES note(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY(target_note_id, workspace_id) REFERENCES note(id, workspace_id) ON DELETE CASCADE
);
CREATE INDEX idx_note_link_workspace ON note_link(workspace_id);

CREATE TABLE tag (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE(workspace_id, name),
  UNIQUE(id, workspace_id)
);
CREATE INDEX idx_tag_workspace ON tag(workspace_id);

CREATE TABLE note_tag (
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY(workspace_id, note_id, tag_id),
  FOREIGN KEY(note_id, workspace_id) REFERENCES note(id, workspace_id) ON DELETE CASCADE,
  FOREIGN KEY(tag_id, workspace_id) REFERENCES tag(id, workspace_id) ON DELETE CASCADE
);

CREATE TABLE note_property (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  value_type TEXT NOT NULL,
  FOREIGN KEY(note_id, workspace_id) REFERENCES note(id, workspace_id) ON DELETE CASCADE,
  UNIQUE(workspace_id, note_id, key)
);

CREATE TABLE note_revision (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(note_id, workspace_id) REFERENCES note(id, workspace_id) ON DELETE CASCADE
);
CREATE INDEX idx_revision_note_created ON note_revision(workspace_id, note_id, created_at DESC);

CREATE TABLE course (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  color TEXT NOT NULL,
  semester TEXT NOT NULL,
  instructor TEXT NOT NULL,
  credits REAL NOT NULL,
  schedule TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  UNIQUE(id, workspace_id)
);
CREATE INDEX idx_course_workspace ON course(workspace_id);

CREATE TABLE map (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_map_id TEXT,
  updated_at TEXT NOT NULL,
  trashed_at TEXT,
  UNIQUE(workspace_id, path),
  UNIQUE(id, workspace_id),
  FOREIGN KEY(parent_map_id, workspace_id) REFERENCES map(id, workspace_id)
);
CREATE INDEX idx_map_workspace ON map(workspace_id);

CREATE TABLE category (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  UNIQUE(workspace_id, name),
  UNIQUE(id, workspace_id)
);
CREATE INDEX idx_category_workspace ON category(workspace_id);

CREATE TABLE item (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('task', 'event')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category_id TEXT NOT NULL,
  start_at TEXT,
  end_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  due_at TEXT,
  completed_at TEXT,
  priority TEXT NOT NULL DEFAULT 'none' CHECK(priority IN ('none', 'low', 'medium', 'high')),
  subtasks_json TEXT NOT NULL DEFAULT '[]',
  rrule TEXT,
  rrule_exceptions TEXT NOT NULL DEFAULT '[]',
  parent_item_id TEXT,
  note_id TEXT,
  course_id TEXT,
  source_note_line INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  trashed_at TEXT,
  UNIQUE(id, workspace_id),
  FOREIGN KEY(category_id, workspace_id) REFERENCES category(id, workspace_id),
  FOREIGN KEY(parent_item_id, workspace_id) REFERENCES item(id, workspace_id),
  FOREIGN KEY(note_id, workspace_id) REFERENCES note(id, workspace_id),
  FOREIGN KEY(course_id, workspace_id) REFERENCES course(id, workspace_id)
);
CREATE INDEX idx_item_workspace_start ON item(workspace_id, start_at);
CREATE INDEX idx_item_workspace_due ON item(workspace_id, due_at);

CREATE TABLE item_reminder (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  minutes_before INTEGER NOT NULL,
  FOREIGN KEY(item_id, workspace_id) REFERENCES item(id, workspace_id) ON DELETE CASCADE
);

CREATE TABLE habit (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('checkbox', 'quantity')),
  unit TEXT,
  target REAL,
  active_weekdays INTEGER NOT NULL DEFAULT 127,
  start_date TEXT,
  end_date TEXT,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  UNIQUE(id, workspace_id),
  FOREIGN KEY(category_id, workspace_id) REFERENCES category(id, workspace_id)
);
CREATE INDEX idx_habit_workspace ON habit(workspace_id);

CREATE TABLE habit_entry (
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  habit_id TEXT NOT NULL,
  date TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  value REAL,
  note TEXT,
  PRIMARY KEY(workspace_id, habit_id, date),
  FOREIGN KEY(habit_id, workspace_id) REFERENCES habit(id, workspace_id) ON DELETE CASCADE
);

CREATE TABLE metric (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category_id TEXT NOT NULL,
  target REAL,
  sort_order INTEGER NOT NULL,
  UNIQUE(id, workspace_id),
  FOREIGN KEY(category_id, workspace_id) REFERENCES category(id, workspace_id)
);
CREATE INDEX idx_metric_workspace ON metric(workspace_id);

CREATE TABLE metric_entry (
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  metric_id TEXT NOT NULL,
  date TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY(workspace_id, metric_id, date),
  FOREIGN KEY(metric_id, workspace_id) REFERENCES metric(id, workspace_id) ON DELETE CASCADE
);

CREATE TABLE flashcard (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  card_type TEXT NOT NULL,
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TEXT,
  UNIQUE(id, workspace_id),
  FOREIGN KEY(note_id, workspace_id) REFERENCES note(id, workspace_id) ON DELETE CASCADE
);
CREATE INDEX idx_flashcard_workspace_due ON flashcard(workspace_id, due_date);

CREATE TABLE review_log (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  flashcard_id TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  grade TEXT NOT NULL,
  interval_before INTEGER NOT NULL,
  interval_after INTEGER NOT NULL,
  FOREIGN KEY(flashcard_id, workspace_id) REFERENCES flashcard(id, workspace_id) ON DELETE CASCADE
);

CREATE TABLE reference (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  citation_key TEXT NOT NULL,
  csl_json TEXT NOT NULL,
  UNIQUE(workspace_id, citation_key)
);
CREATE INDEX idx_reference_workspace ON reference(workspace_id);

CREATE TABLE recap (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  note_id TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  narrative TEXT NOT NULL,
  model_used TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  revision INTEGER NOT NULL,
  FOREIGN KEY(note_id, workspace_id) REFERENCES note(id, workspace_id)
);
CREATE INDEX idx_recap_workspace_period ON recap(workspace_id, period_start DESC);

CREATE VIRTUAL TABLE note_fts USING fts5(
  note_id UNINDEXED,
  workspace_id UNINDEXED,
  title,
  body,
  tags,
  properties,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER enforce_item_kind_dates_insert BEFORE INSERT ON item BEGIN
  SELECT CASE
    WHEN NEW.kind = 'event' AND NEW.start_at IS NULL THEN RAISE(ABORT, 'event requires start_at')
    WHEN NEW.kind = 'task' AND NEW.due_at IS NULL AND NEW.start_at IS NULL THEN RAISE(ABORT, 'task requires due_at or scheduled start_at')
  END;
END;
