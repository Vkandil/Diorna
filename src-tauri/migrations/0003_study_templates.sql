CREATE TABLE study_template (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  built_in INTEGER NOT NULL DEFAULT 0,
  default_course_id TEXT,
  sort_order INTEGER NOT NULL,
  UNIQUE(id, workspace_id),
  FOREIGN KEY(default_course_id, workspace_id) REFERENCES course(id, workspace_id)
);

CREATE INDEX idx_study_template_workspace ON study_template(workspace_id, sort_order);
