CREATE TABLE training_activity (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_training_activity_workspace ON training_activity(workspace_id);

CREATE TABLE training_exercise (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_training_exercise_workspace ON training_exercise(workspace_id);

CREATE TABLE training_template (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_training_template_workspace ON training_template(workspace_id);

CREATE TABLE training_session (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_training_session_workspace ON training_session(workspace_id);

ALTER TABLE item ADD COLUMN training_template_id TEXT;
ALTER TABLE item ADD COLUMN training_session_id TEXT;
