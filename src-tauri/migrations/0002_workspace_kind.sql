ALTER TABLE workspace ADD COLUMN kind TEXT NOT NULL DEFAULT 'custom'
  CHECK(kind IN ('student', 'personal', 'custom'));

UPDATE workspace SET kind = 'student' WHERE id = 'workspace-student';
UPDATE workspace SET kind = 'personal' WHERE id = 'workspace-personal';

CREATE TABLE app_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
