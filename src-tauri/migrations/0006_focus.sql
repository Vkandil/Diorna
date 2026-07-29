CREATE TABLE focus_priority (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_focus_priority_workspace ON focus_priority(workspace_id);

CREATE TABLE focus_session (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_focus_session_workspace ON focus_session(workspace_id);
