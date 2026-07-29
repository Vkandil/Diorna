CREATE TABLE project (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_project_workspace ON project(workspace_id);

CREATE TABLE goal (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL
);

CREATE INDEX idx_goal_workspace ON goal(workspace_id);

ALTER TABLE item ADD COLUMN project_id TEXT;
