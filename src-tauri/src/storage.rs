use std::{
    borrow::Cow,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    str::FromStr,
    time::Duration,
};

use chrono::Utc;
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{
    Row, SqlitePool,
    migrate::{Migration, MigrationType, Migrator},
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::error::{DiornaError, Result};

#[derive(Clone)]
pub struct Vault {
    pub root: PathBuf,
    pub pool: SqlitePool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRecord {
    pub id: String,
    pub name: String,
    pub color: String,
    pub folder_name: String,
    pub sort_order: i64,
    pub created_at: String,
}

impl<'row> sqlx::FromRow<'row, sqlx::sqlite::SqliteRow> for WorkspaceRecord {
    fn from_row(row: &'row sqlx::sqlite::SqliteRow) -> std::result::Result<Self, sqlx::Error> {
        Ok(Self {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            color: row.try_get("color")?,
            folder_name: row.try_get("folder_name")?,
            sort_order: row.try_get("sort_order")?,
            created_at: row.try_get("created_at")?,
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteInput {
    pub id: Option<String>,
    pub workspace_id: String,
    pub relative_path: String,
    pub title: String,
    pub markdown: String,
    #[serde(default)]
    pub course_id: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub properties: serde_json::Value,
    #[serde(default)]
    pub starred: bool,
    pub expected_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedFile {
    pub id: String,
    pub path: String,
    pub hash: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskContent {
    pub notes: Vec<DiskNote>,
    pub maps: Vec<DiskMap>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskNote {
    pub id: String,
    pub workspace_id: String,
    pub path: String,
    pub title: String,
    pub markdown: String,
    pub course_id: Option<String>,
    pub tags: Vec<String>,
    pub properties: serde_json::Value,
    pub starred: bool,
    pub created_at: String,
    pub updated_at: String,
    pub word_count: usize,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteRevision {
    pub id: String,
    pub note_id: String,
    pub markdown: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskMap {
    pub id: String,
    pub workspace_id: String,
    pub path: String,
    pub name: String,
    pub parent_map_id: Option<String>,
    pub nodes: serde_json::Value,
    pub edges: serde_json::Value,
    pub updated_at: String,
    pub hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub note_id: String,
    pub title: String,
    pub excerpt: String,
    pub rank: f64,
}

impl Vault {
    pub async fn open(root: PathBuf) -> Result<Self> {
        create_vault_layout(&root)?;
        let db_path = root.join(".app").join("index.db");
        let mut database_existed = db_path.exists();
        let mut recovered_from_header = false;
        if database_existed && !has_sqlite_header(&db_path)? {
            archive_corrupted_database(&db_path, &root.join(".app").join("recovery"))?;
            database_existed = false;
            recovered_from_header = true;
            log::error!("The SQLite index header was invalid; rebuilding file-backed content");
        }
        if database_existed {
            backup_database_before_migration(&db_path, &root.join(".app").join("backups"))?;
        }
        let (mut pool, mut recovered) = match connect_database(&db_path).await {
            Ok(pool) => (pool, false),
            Err(error) if database_existed && database_error_is_corruption(&error) => {
                archive_corrupted_database(&db_path, &root.join(".app").join("recovery"))?;
                log::error!(
                    "Unable to open SQLite index ({error}); rebuilding file-backed content"
                );
                (connect_database(&db_path).await?, true)
            }
            Err(error) => return Err(error),
        };
        recovered |= recovered_from_header;
        let integrity = sqlx::query_scalar::<_, String>("PRAGMA quick_check")
            .fetch_one(&pool)
            .await;
        if !matches!(integrity, Ok(ref value) if value.eq_ignore_ascii_case("ok")) {
            pool.close().await;
            archive_corrupted_database(&db_path, &root.join(".app").join("recovery"))?;
            pool = connect_database(&db_path).await?;
            recovered = true;
            log::error!(
                "The SQLite index was corrupt and has been archived; rebuilding file-backed content"
            );
        }
        embedded_migrator().run(&pool).await?;
        seed_defaults(&pool).await?;
        ensure_workspace_layout(&root, &pool).await?;
        let vault = Self { root, pool };
        vault.ensure_settings()?;
        if recovered {
            vault.rebuild_file_index().await?;
        }
        Ok(vault)
    }

    fn ensure_settings(&self) -> Result<()> {
        let settings = self.root.join(".app").join("settings.json");
        if !settings.exists() {
            atomic_write(
                &settings,
                br##"{
  "language": "en",
  "theme": "diorna",
  "accentColor": "#1D518A",
  "minimizeToTray": true,
  "updateEnabled": true,
  "telemetry": false
}
"##,
            )?;
        }
        let keymap = self.root.join(".app").join("keymap.json");
        if !keymap.exists() {
            atomic_write(
                &keymap,
                br#"{
  "commandPalette": "Ctrl+K",
  "quickCapture": "Ctrl+Alt+Space",
  "toggleSidebar": "Ctrl+B",
  "closeTab": "Ctrl+W"
}
"#,
            )?;
        }
        Ok(())
    }

    pub fn read_settings(&self) -> Result<serde_json::Value> {
        let path = self.root.join(".app").join("settings.json");
        serde_json::from_slice(&fs::read(path)?)
            .map_err(|error| DiornaError::InvalidData(format!("Invalid settings.json: {error}")))
    }

    pub fn write_settings(&self, settings: &serde_json::Value) -> Result<()> {
        if !settings.is_object() {
            return Err(DiornaError::InvalidData(
                "Settings must be a JSON object".into(),
            ));
        }
        let path = self.root.join(".app").join("settings.json");
        let bytes = serde_json::to_vec_pretty(settings)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        atomic_write(&path, &bytes)
    }

    pub fn read_keymap(&self) -> Result<serde_json::Value> {
        let path = self.root.join(".app").join("keymap.json");
        serde_json::from_slice(&fs::read(path)?)
            .map_err(|error| DiornaError::InvalidData(format!("Invalid keymap.json: {error}")))
    }

    pub fn write_keymap(&self, keymap: &serde_json::Value) -> Result<()> {
        if !keymap.is_object() {
            return Err(DiornaError::InvalidData(
                "Keymap must be a JSON object".into(),
            ));
        }
        let path = self.root.join(".app").join("keymap.json");
        let bytes = serde_json::to_vec_pretty(keymap)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        atomic_write(&path, &bytes)
    }

    pub async fn workspaces(&self) -> Result<Vec<WorkspaceRecord>> {
        Ok(sqlx::query_as::<_, WorkspaceRecord>("SELECT id, name, color, folder_name, sort_order, created_at FROM workspace ORDER BY sort_order")
            .fetch_all(&self.pool).await?)
    }

    pub async fn workspace(&self, workspace_id: &str) -> Result<WorkspaceRecord> {
        sqlx::query_as::<_, WorkspaceRecord>("SELECT id, name, color, folder_name, sort_order, created_at FROM workspace WHERE id = ?")
            .bind(workspace_id).fetch_optional(&self.pool).await?
            .ok_or_else(|| DiornaError::WorkspaceNotFound(workspace_id.to_owned()))
    }

    pub async fn delete_workspace(&self, workspace_id: &str) -> Result<()> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workspace")
            .fetch_one(&self.pool)
            .await?;
        if count <= 1 {
            return Err(DiornaError::InvalidData(
                "The final workspace cannot be deleted".into(),
            ));
        }
        let workspace = self.workspace(workspace_id).await?;
        let source = self.root.join(&workspace.folder_name);
        let archive_root = self.root.join(".app").join("deleted-workspaces");
        fs::create_dir_all(&archive_root)?;
        let archived = archive_root.join(format!(
            "{}-{}",
            workspace_id,
            Utc::now().format("%Y%m%d-%H%M%S")
        ));
        if source.exists() {
            fs::rename(&source, &archived)?;
        }
        if let Err(error) = sqlx::query("DELETE FROM workspace WHERE id = ?")
            .bind(workspace_id)
            .execute(&self.pool)
            .await
        {
            if archived.exists() {
                let _ = fs::rename(&archived, &source);
            }
            return Err(error.into());
        }
        Ok(())
    }

    pub async fn save_note(&self, input: SaveNoteInput) -> Result<SavedFile> {
        let workspace = self.workspace(&input.workspace_id).await?;
        let relative = safe_relative_path(Path::new(&input.relative_path))?;
        let relative = if relative
            .extension()
            .is_some_and(|value| value.eq_ignore_ascii_case("md"))
        {
            relative
        } else {
            relative.with_extension("md")
        };
        let path = self
            .root
            .join(&workspace.folder_name)
            .join("notes")
            .join(&relative);
        let existing = if let Some(id) = input.id.as_deref() {
            sqlx::query("SELECT id, path, created_at FROM note WHERE workspace_id = ? AND id = ?")
                .bind(&input.workspace_id)
                .bind(id)
                .fetch_optional(&self.pool)
                .await?
        } else {
            sqlx::query("SELECT id, path, created_at FROM note WHERE workspace_id = ? AND path = ?")
                .bind(&input.workspace_id)
                .bind(relative.to_string_lossy().as_ref())
                .fetch_optional(&self.pool)
                .await?
        };
        let old_relative = existing
            .as_ref()
            .map(|row| safe_relative_path(Path::new(row.get::<String, _>("path").as_str())))
            .transpose()?;
        let old_path = old_relative.as_ref().map(|value| {
            self.root
                .join(&workspace.folder_name)
                .join("notes")
                .join(value)
        });
        let content_path = old_path
            .as_ref()
            .filter(|value| value.exists())
            .unwrap_or(&path);
        if let Some(expected) = input.expected_hash.as_deref() {
            if content_path.exists() && file_hash(content_path)? != expected {
                return Err(DiornaError::SyncConflict);
            }
        }
        let old_content = fs::read_to_string(content_path).ok();
        let now = Utc::now().to_rfc3339();
        let id = existing
            .as_ref()
            .map(|row| row.get::<String, _>("id"))
            .or(input.id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let created_at = existing
            .as_ref()
            .map(|row| row.get::<String, _>("created_at"))
            .unwrap_or_else(|| now.clone());
        let markdown = serialize_note(&input, &id, &created_at, &now)?;
        atomic_write(&path, markdown.as_bytes())?;
        let hash = bytes_hash(markdown.as_bytes());
        let mut transaction = self.pool.begin().await?;
        if let Some(content) = old_content
            .as_ref()
            .filter(|content| note_semantic_content(content) != note_semantic_content(&markdown))
        {
            sqlx::query("INSERT INTO note_revision(id, workspace_id, note_id, content, created_at) VALUES(?, ?, ?, ?, ?)")
                .bind(Uuid::new_v4().to_string()).bind(&input.workspace_id).bind(&id).bind(content).bind(&now).execute(&mut *transaction).await?;
        }
        let words = input.markdown.split_whitespace().count() as i64;
        sqlx::query("INSERT INTO note(id, workspace_id, path, title, course_id, created_at, updated_at, word_count) VALUES(?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET path=excluded.path, title=excluded.title, course_id=excluded.course_id, updated_at=excluded.updated_at, word_count=excluded.word_count")
            .bind(&id).bind(&input.workspace_id).bind(relative.to_string_lossy().as_ref()).bind(&input.title).bind(&input.course_id).bind(&created_at).bind(&now).bind(words).execute(&mut *transaction).await?;
        sqlx::query("DELETE FROM note_tag WHERE workspace_id = ? AND note_id = ?")
            .bind(&input.workspace_id)
            .bind(&id)
            .execute(&mut *transaction)
            .await?;
        for tag in &input.tags {
            let name = tag.trim().trim_start_matches('#').to_lowercase();
            if name.is_empty() {
                continue;
            }
            let tag_id = format!(
                "tag-{}",
                &bytes_hash(format!("{}:{name}", input.workspace_id).as_bytes())[..24]
            );
            sqlx::query("INSERT INTO tag(id, workspace_id, name) VALUES(?, ?, ?) ON CONFLICT(workspace_id, name) DO NOTHING")
                .bind(&tag_id).bind(&input.workspace_id).bind(&name).execute(&mut *transaction).await?;
            let stored_tag_id: String =
                sqlx::query_scalar("SELECT id FROM tag WHERE workspace_id = ? AND name = ?")
                    .bind(&input.workspace_id)
                    .bind(&name)
                    .fetch_one(&mut *transaction)
                    .await?;
            sqlx::query(
                "INSERT OR IGNORE INTO note_tag(workspace_id, note_id, tag_id) VALUES(?, ?, ?)",
            )
            .bind(&input.workspace_id)
            .bind(&id)
            .bind(stored_tag_id)
            .execute(&mut *transaction)
            .await?;
        }
        sqlx::query("DELETE FROM note_property WHERE workspace_id = ? AND note_id = ?")
            .bind(&input.workspace_id)
            .bind(&id)
            .execute(&mut *transaction)
            .await?;
        if let Some(properties) = input.properties.as_object() {
            for (key, property) in properties {
                let value_type = property
                    .get("type")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("text");
                let value = serde_json::to_string(
                    property.get("value").unwrap_or(&serde_json::Value::Null),
                )
                .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
                sqlx::query("INSERT INTO note_property(workspace_id, note_id, key, value, value_type) VALUES(?, ?, ?, ?, ?)")
                    .bind(&input.workspace_id).bind(&id).bind(key).bind(value).bind(value_type).execute(&mut *transaction).await?;
            }
        }
        sqlx::query("DELETE FROM note_fts WHERE workspace_id = ? AND note_id = ?")
            .bind(&input.workspace_id)
            .bind(&id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query("INSERT INTO note_fts(note_id, workspace_id, title, body, tags, properties) VALUES(?, ?, ?, ?, ?, ?)").bind(&id).bind(&input.workspace_id).bind(&input.title).bind(&input.markdown).bind(input.tags.join(" ")).bind(input.properties.to_string()).execute(&mut *transaction).await?;
        prune_revisions(&mut transaction, &input.workspace_id, &id).await?;
        transaction.commit().await?;
        if old_path.as_ref().is_some_and(|old| old != &path) {
            if let Some(old) = old_path {
                let _ = fs::remove_file(old);
            }
        }
        Ok(SavedFile {
            id,
            path: relative.to_string_lossy().into_owned(),
            hash,
            updated_at: now,
        })
    }

    pub async fn note_revisions(
        &self,
        workspace_id: &str,
        note_id: &str,
    ) -> Result<Vec<NoteRevision>> {
        self.workspace(workspace_id).await?;
        let rows = sqlx::query("SELECT id, note_id, content, created_at FROM note_revision WHERE workspace_id = ? AND note_id = ? ORDER BY created_at DESC")
            .bind(workspace_id).bind(note_id).fetch_all(&self.pool).await?;
        Ok(rows
            .into_iter()
            .map(|row| {
                let content: String = row.get("content");
                NoteRevision {
                    id: row.get("id"),
                    note_id: row.get("note_id"),
                    markdown: without_frontmatter(&content).to_owned(),
                    created_at: row.get("created_at"),
                }
            })
            .collect())
    }

    pub async fn save_canvas(
        &self,
        map_id: Option<&str>,
        workspace_id: &str,
        relative_path: &str,
        json: &str,
        expected_hash: Option<&str>,
    ) -> Result<SavedFile> {
        let workspace = self.workspace(workspace_id).await?;
        let mut relative = safe_relative_path(Path::new(relative_path))?;
        relative.set_extension("canvas");
        let value: serde_json::Value = serde_json::from_str(json)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        validate_canvas(&value)?;
        let pretty = serde_json::to_vec_pretty(&value)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        let parent_map_id = value
            .get("diorna")
            .and_then(|metadata| metadata.get("parentMapId"))
            .and_then(serde_json::Value::as_str);
        let path = self
            .root
            .join(&workspace.folder_name)
            .join("maps")
            .join(&relative);
        let existing = if let Some(map_id) = map_id {
            sqlx::query("SELECT id, path FROM map WHERE id = ? AND workspace_id = ?")
                .bind(map_id)
                .bind(workspace_id)
                .fetch_optional(&self.pool)
                .await?
        } else {
            None
        };
        let old_path = existing.as_ref().and_then(|row| {
            let old_relative =
                safe_relative_path(Path::new(row.get::<String, _>("path").as_str())).ok()?;
            Some(
                self.root
                    .join(&workspace.folder_name)
                    .join("maps")
                    .join(old_relative),
            )
        });
        let content_path = old_path
            .as_ref()
            .filter(|value| value.exists())
            .unwrap_or(&path);
        if let Some(expected) = expected_hash {
            if content_path.exists() && file_hash(content_path)? != expected {
                return Err(DiornaError::SyncConflict);
            }
        }
        atomic_write(&path, &pretty)?;
        let now = Utc::now().to_rfc3339();
        let id = existing
            .map(|row| row.get::<String, _>("id"))
            .or_else(|| map_id.map(ToOwned::to_owned))
            .or(
                sqlx::query("SELECT id FROM map WHERE workspace_id = ? AND path = ?")
                    .bind(workspace_id)
                    .bind(relative.to_string_lossy().as_ref())
                    .fetch_optional(&self.pool)
                    .await?
                    .map(|row| row.get::<String, _>(0)),
            )
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let name = relative
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Untitled");
        sqlx::query("INSERT INTO map(id, workspace_id, path, name, parent_map_id, updated_at) VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET path=excluded.path, name=excluded.name, parent_map_id=excluded.parent_map_id, updated_at=excluded.updated_at")
            .bind(&id).bind(workspace_id).bind(relative.to_string_lossy().as_ref()).bind(name).bind(parent_map_id).bind(&now).execute(&self.pool).await?;
        if old_path.as_ref().is_some_and(|old| old != &path) {
            if let Some(old) = old_path {
                let _ = fs::remove_file(old);
            }
        }
        Ok(SavedFile {
            id,
            path: relative.to_string_lossy().into_owned(),
            hash: bytes_hash(&pretty),
            updated_at: now,
        })
    }

    pub async fn search_notes(
        &self,
        workspace_id: &str,
        query: &str,
        limit: i64,
    ) -> Result<Vec<SearchHit>> {
        self.workspace(workspace_id).await?;
        let query = if query.trim().is_empty() { "*" } else { query };
        let rows = sqlx::query("SELECT note_id, title, snippet(note_fts, 3, '<mark>', '</mark>', ' … ', 24) AS excerpt, bm25(note_fts) AS rank FROM note_fts WHERE workspace_id = ? AND note_fts MATCH ? ORDER BY rank LIMIT ?")
            .bind(workspace_id).bind(query).bind(limit.clamp(1, 100)).fetch_all(&self.pool).await?;
        Ok(rows
            .into_iter()
            .map(|row| SearchHit {
                note_id: row.get(0),
                title: row.get(1),
                excerpt: row.get(2),
                rank: row.get(3),
            })
            .collect())
    }

    pub async fn rebuild_file_index(&self) -> Result<u64> {
        let workspaces = self.workspaces().await?;
        let mut count = 0_u64;
        let mut transaction = self.pool.begin().await?;
        sqlx::query("DELETE FROM note_fts")
            .execute(&mut *transaction)
            .await?;
        for workspace in workspaces {
            let notes_root = self.root.join(&workspace.folder_name).join("notes");
            for entry in WalkDir::new(&notes_root)
                .into_iter()
                .filter_map(std::result::Result::ok)
                .filter(|entry| {
                    entry
                        .path()
                        .extension()
                        .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
                })
            {
                let path = entry.path();
                let content = fs::read_to_string(path)?;
                let title = frontmatter_value(&content, "title")
                    .or_else(|| {
                        path.file_stem()
                            .and_then(|value| value.to_str())
                            .map(str::to_owned)
                    })
                    .unwrap_or_else(|| "Untitled".to_owned());
                let id =
                    frontmatter_value(&content, "id").unwrap_or_else(|| Uuid::new_v4().to_string());
                let relative = path
                    .strip_prefix(&notes_root)
                    .map_err(|error| DiornaError::InvalidData(error.to_string()))?
                    .to_string_lossy();
                let metadata = fs::metadata(path)?;
                let created = metadata.created().unwrap_or(std::time::SystemTime::now());
                let modified = metadata.modified().unwrap_or(created);
                let created: chrono::DateTime<Utc> = created.into();
                let modified: chrono::DateTime<Utc> = modified.into();
                sqlx::query("INSERT INTO note(id, workspace_id, path, title, created_at, updated_at, word_count) VALUES(?, ?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, path) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at, word_count=excluded.word_count")
                    .bind(&id).bind(&workspace.id).bind(relative.as_ref()).bind(&title).bind(created.to_rfc3339()).bind(modified.to_rfc3339()).bind(content.split_whitespace().count() as i64).execute(&mut *transaction).await?;
                sqlx::query("INSERT INTO note_fts(note_id, workspace_id, title, body, tags, properties) VALUES(?, ?, ?, ?, '', '')").bind(&id).bind(&workspace.id).bind(&title).bind(&content).execute(&mut *transaction).await?;
                count += 1;
            }
        }
        transaction.commit().await?;
        Ok(count)
    }

    pub async fn load_file_content(&self) -> Result<DiskContent> {
        let mut notes = Vec::new();
        let mut maps = Vec::new();
        for workspace in self.workspaces().await? {
            let notes_root = self.root.join(&workspace.folder_name).join("notes");
            for entry in WalkDir::new(&notes_root)
                .into_iter()
                .filter_map(std::result::Result::ok)
                .filter(|entry| {
                    entry.file_type().is_file()
                        && entry
                            .path()
                            .extension()
                            .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
                })
            {
                let path = entry.path();
                let content = fs::read_to_string(path)?;
                let relative = path
                    .strip_prefix(&notes_root)
                    .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
                let metadata = fs::metadata(path)?;
                let created: chrono::DateTime<Utc> = metadata
                    .created()
                    .unwrap_or(std::time::SystemTime::now())
                    .into();
                let updated: chrono::DateTime<Utc> = metadata
                    .modified()
                    .unwrap_or(std::time::SystemTime::now())
                    .into();
                let title = frontmatter_value(&content, "title")
                    .or_else(|| {
                        path.file_stem()
                            .and_then(|value| value.to_str())
                            .map(str::to_owned)
                    })
                    .unwrap_or_else(|| "Untitled".into());
                let id = frontmatter_value(&content, "id")
                    .unwrap_or_else(|| stable_content_id("note", &workspace.id, relative));
                let markdown = without_frontmatter(&content).to_owned();
                let frontmatter = frontmatter_json(&content);
                let tags = frontmatter
                    .as_ref()
                    .and_then(|value| value.get("tags"))
                    .and_then(serde_json::Value::as_array)
                    .map(|values| {
                        values
                            .iter()
                            .filter_map(serde_json::Value::as_str)
                            .map(str::to_owned)
                            .collect()
                    })
                    .unwrap_or_else(|| extract_markdown_tags(&markdown));
                let properties = frontmatter
                    .as_ref()
                    .and_then(|value| value.get("properties"))
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({}));
                let course_id = frontmatter
                    .as_ref()
                    .and_then(|value| value.get("courseId"))
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned)
                    .or_else(|| frontmatter_value(&content, "courseId"));
                let starred = frontmatter
                    .as_ref()
                    .and_then(|value| value.get("starred"))
                    .and_then(serde_json::Value::as_bool)
                    .unwrap_or(false);
                notes.push(DiskNote {
                    id,
                    workspace_id: workspace.id.clone(),
                    path: format!("notes/{}", relative.to_string_lossy().replace('\\', "/")),
                    title,
                    course_id,
                    tags,
                    properties,
                    starred,
                    word_count: markdown.split_whitespace().count(),
                    markdown,
                    created_at: created.to_rfc3339(),
                    updated_at: updated.to_rfc3339(),
                    hash: bytes_hash(content.as_bytes()),
                });
            }
            let maps_root = self.root.join(&workspace.folder_name).join("maps");
            for entry in WalkDir::new(&maps_root)
                .into_iter()
                .filter_map(std::result::Result::ok)
                .filter(|entry| {
                    entry.file_type().is_file()
                        && entry
                            .path()
                            .extension()
                            .is_some_and(|ext| ext.eq_ignore_ascii_case("canvas"))
                })
            {
                let path = entry.path();
                let raw = fs::read(path)?;
                let content: serde_json::Value = serde_json::from_slice(&raw).map_err(|error| {
                    DiornaError::InvalidData(format!("Invalid Canvas {}: {error}", path.display()))
                })?;
                validate_canvas(&content)?;
                let relative = path
                    .strip_prefix(&maps_root)
                    .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
                let relative_text = relative.to_string_lossy().replace('\\', "/");
                let database = sqlx::query("SELECT id,parent_map_id,name,updated_at FROM map WHERE workspace_id=? AND path=?")
                    .bind(&workspace.id).bind(&relative_text).fetch_optional(&self.pool).await?;
                let metadata = fs::metadata(path)?;
                let updated: chrono::DateTime<Utc> = metadata
                    .modified()
                    .unwrap_or(std::time::SystemTime::now())
                    .into();
                let fallback_name = path
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .unwrap_or("Untitled")
                    .to_owned();
                maps.push(DiskMap {
                    id: database
                        .as_ref()
                        .map(|row| row.get("id"))
                        .unwrap_or_else(|| stable_content_id("map", &workspace.id, relative)),
                    workspace_id: workspace.id.clone(),
                    path: format!("maps/{relative_text}"),
                    name: database
                        .as_ref()
                        .map(|row| row.get("name"))
                        .unwrap_or(fallback_name),
                    parent_map_id: database
                        .as_ref()
                        .and_then(|row| row.get("parent_map_id"))
                        .or_else(|| {
                            content
                                .get("diorna")
                                .and_then(|metadata| metadata.get("parentMapId"))
                                .and_then(serde_json::Value::as_str)
                                .map(str::to_owned)
                        }),
                    nodes: content
                        .get("nodes")
                        .cloned()
                        .unwrap_or_else(|| serde_json::json!([])),
                    edges: content
                        .get("edges")
                        .cloned()
                        .unwrap_or_else(|| serde_json::json!([])),
                    updated_at: database
                        .as_ref()
                        .map(|row| row.get("updated_at"))
                        .unwrap_or_else(|| updated.to_rfc3339()),
                    hash: bytes_hash(&raw),
                });
            }
        }
        Ok(DiskContent { notes, maps })
    }

    pub fn backup(&self, destination: &Path) -> Result<PathBuf> {
        fs::create_dir_all(destination)?;
        let output = destination.join(format!("Diorna-{}.zip", Utc::now().format("%Y%m%d-%H%M%S")));
        let file = File::create(&output)?;
        let mut archive = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for entry in WalkDir::new(&self.root)
            .into_iter()
            .filter_map(std::result::Result::ok)
            .filter(|entry| entry.file_type().is_file())
        {
            let relative = entry
                .path()
                .strip_prefix(&self.root)
                .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
            if relative
                .components()
                .any(|component| component.as_os_str() == "backups")
            {
                continue;
            }
            archive
                .start_file(relative.to_string_lossy().replace('\\', "/"), options)
                .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
            let mut source = File::open(entry.path())?;
            std::io::copy(&mut source, &mut archive)?;
        }
        archive
            .finish()
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        Ok(output)
    }
}

fn embedded_migrator() -> Migrator {
    Migrator {
        migrations: Cow::Owned(vec![
            Migration::new(
                1,
                Cow::Borrowed("initial"),
                MigrationType::Simple,
                Cow::Borrowed(include_str!("../migrations/0001_initial.sql")),
                false,
            ),
            Migration::new(
                2,
                Cow::Borrowed("workspace kind"),
                MigrationType::Simple,
                Cow::Borrowed(include_str!("../migrations/0002_workspace_kind.sql")),
                false,
            ),
            Migration::new(
                3,
                Cow::Borrowed("study templates"),
                MigrationType::Simple,
                Cow::Borrowed(include_str!("../migrations/0003_study_templates.sql")),
                false,
            ),
            Migration::new(
                4,
                Cow::Borrowed("training"),
                MigrationType::Simple,
                Cow::Borrowed(include_str!("../migrations/0004_training.sql")),
                false,
            ),
            Migration::new(
                5,
                Cow::Borrowed("projects"),
                MigrationType::Simple,
                Cow::Borrowed(include_str!("../migrations/0005_projects.sql")),
                false,
            ),
            Migration::new(
                6,
                Cow::Borrowed("focus"),
                MigrationType::Simple,
                Cow::Borrowed(include_str!("../migrations/0006_focus.sql")),
                false,
            ),
        ]),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    }
}

async fn connect_database(path: &Path) -> Result<SqlitePool> {
    let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", path.to_string_lossy()))?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Full)
        .busy_timeout(Duration::from_secs(5));
    Ok(SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(options)
        .await?)
}

fn archive_corrupted_database(database: &Path, recovery: &Path) -> Result<()> {
    fs::create_dir_all(recovery)?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    for suffix in ["", "-wal", "-shm"] {
        let source = PathBuf::from(format!("{}{}", database.to_string_lossy(), suffix));
        if !source.exists() {
            continue;
        }
        let name = if suffix.is_empty() {
            format!("index-corrupt-{stamp}.db")
        } else {
            format!("index-corrupt-{stamp}.db{suffix}")
        };
        rename_released_database(&source, &recovery.join(name))?;
    }
    Ok(())
}

fn rename_released_database(source: &Path, destination: &Path) -> std::io::Result<()> {
    const MAX_ATTEMPTS: usize = 20;
    for attempt in 0..MAX_ATTEMPTS {
        match fs::rename(source, destination) {
            Ok(()) => return Ok(()),
            Err(error)
                if cfg!(windows)
                    && matches!(error.raw_os_error(), Some(32) | Some(33))
                    && attempt + 1 < MAX_ATTEMPTS =>
            {
                // SQLite and virus scanners can retain a Windows file handle briefly
                // after the pool closes. Recovery is rare, so a bounded wait is safer
                // than abandoning otherwise recoverable file-backed content.
                std::thread::sleep(Duration::from_millis(25));
            }
            Err(error) => return Err(error),
        }
    }
    unreachable!("the final rename attempt always returns")
}

fn has_sqlite_header(database: &Path) -> Result<bool> {
    let mut file = File::open(database)?;
    let mut header = [0_u8; 16];
    Ok(file.read_exact(&mut header).is_ok() && &header == b"SQLite format 3\0")
}

fn database_error_is_corruption(error: &DiornaError) -> bool {
    let message = error.to_string().to_ascii_lowercase();
    message.contains("malformed")
        || message.contains("not a database")
        || message.contains("file is encrypted")
}

pub fn safe_relative_path(path: &Path) -> Result<PathBuf> {
    if path.as_os_str().is_empty()
        || path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(DiornaError::UnsafePath(path.to_string_lossy().into_owned()));
    }
    Ok(path.to_path_buf())
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| DiornaError::UnsafePath(path.to_string_lossy().into_owned()))?;
    fs::create_dir_all(parent)?;
    let lock_path = path.with_extension(format!(
        "{}.lock",
        path.extension()
            .and_then(|value| value.to_str())
            .unwrap_or("file")
    ));
    let lock = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(&lock_path)?;
    lock.try_lock_exclusive()
        .map_err(|_| DiornaError::SyncConflict)?;
    let temporary = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("diorna"),
        Uuid::new_v4()
    ));
    let result = (|| -> Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        replace_file(&temporary, path)?;
        #[cfg(not(windows))]
        File::open(parent)?.sync_all()?;
        Ok(())
    })();
    let _ = fs::remove_file(&temporary);
    let _ = FileExt::unlock(&lock);
    let _ = fs::remove_file(lock_path);
    result
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> Result<()> {
    if !destination.exists() {
        return Ok(fs::rename(source, destination)?);
    }
    use std::os::windows::ffi::OsStrExt;
    use windows::{
        Win32::Storage::FileSystem::{
            MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH, MoveFileExW,
        },
        core::PCWSTR,
    };
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        MoveFileExW(
            PCWSTR(source_wide.as_ptr()),
            PCWSTR(destination_wide.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|error| DiornaError::Io(std::io::Error::other(error)))
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> Result<()> {
    fs::rename(source, destination)?;
    Ok(())
}

fn create_vault_layout(root: &Path) -> Result<()> {
    for relative in [".app/logs", ".app/revisions", ".app/backups"] {
        fs::create_dir_all(root.join(relative))?;
    }
    Ok(())
}

async fn ensure_workspace_layout(root: &Path, pool: &SqlitePool) -> Result<()> {
    let folders = sqlx::query("SELECT folder_name FROM workspace")
        .fetch_all(pool)
        .await?;
    for row in folders {
        let folder: String = row.get("folder_name");
        for relative in ["notes", "attachments", "maps", "templates", ".trash"] {
            fs::create_dir_all(root.join(&folder).join(relative))?;
        }
    }
    Ok(())
}

async fn seed_defaults(pool: &SqlitePool) -> Result<()> {
    let existing: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workspace")
        .fetch_one(pool)
        .await?;
    if existing > 0 {
        return Ok(());
    }
    let now = Utc::now().to_rfc3339();
    for (id, name, color, folder, order) in [
        ("workspace-student", "Student", "#1D518A", "Student", 0_i64),
        (
            "workspace-personal",
            "Personal",
            "#7C8E58",
            "Personal",
            1_i64,
        ),
    ] {
        sqlx::query("INSERT OR IGNORE INTO workspace(id, name, color, folder_name, sort_order, created_at) VALUES(?, ?, ?, ?, ?, ?)").bind(id).bind(name).bind(color).bind(folder).bind(order).bind(&now).execute(pool).await?;
    }
    let groups = [
        (
            "workspace-student",
            &["Courses", "Assignments", "Exams", "Revision", "Admin"][..],
        ),
        (
            "workspace-personal",
            &["Work", "Projects", "Sport", "Health", "Social", "Errands"][..],
        ),
    ];
    for (workspace, names) in groups {
        let colors: &[&str] = if workspace.ends_with("student") {
            &["#1D518A", "#DAA343", "#C66542", "#3F6495", "#7C8E58"]
        } else {
            &[
                "#3F6495", "#1D518A", "#7C8E58", "#7C8E58", "#C66542", "#DAA343",
            ]
        };
        for (index, name) in names.iter().enumerate() {
            sqlx::query("INSERT OR IGNORE INTO category(id, workspace_id, name, color, icon, sort_order) VALUES(?, ?, ?, ?, 'Tag', ?)").bind(format!("{workspace}-{}", name.to_lowercase())).bind(workspace).bind(name).bind(colors[index]).bind(index as i64).execute(pool).await?;
        }
    }
    Ok(())
}

fn backup_database_before_migration(database: &Path, directory: &Path) -> Result<()> {
    fs::create_dir_all(directory)?;
    let destination = directory.join(format!(
        "pre-migration-{}.db",
        Utc::now().format("%Y%m%d-%H%M%S")
    ));
    fs::copy(database, destination)?;
    Ok(())
}

async fn prune_revisions(
    transaction: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    workspace_id: &str,
    note_id: &str,
) -> Result<()> {
    sqlx::query("DELETE FROM note_revision WHERE workspace_id = ? AND note_id = ? AND id NOT IN (SELECT id FROM note_revision WHERE workspace_id = ? AND note_id = ? ORDER BY created_at DESC LIMIT 50) AND created_at < datetime('now', '-30 days')")
        .bind(workspace_id).bind(note_id).bind(workspace_id).bind(note_id).execute(&mut **transaction).await?;
    Ok(())
}

fn validate_canvas(value: &serde_json::Value) -> Result<()> {
    let nodes = value
        .get("nodes")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| DiornaError::InvalidData("Canvas must contain a nodes array".into()))?;
    value
        .get("edges")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| DiornaError::InvalidData("Canvas must contain an edges array".into()))?;
    for node in nodes {
        for field in ["id", "type", "x", "y", "width", "height"] {
            if node.get(field).is_none() {
                return Err(DiornaError::InvalidData(format!(
                    "Canvas node is missing {field}"
                )));
            }
        }
    }
    Ok(())
}

fn serialize_note(
    input: &SaveNoteInput,
    id: &str,
    created_at: &str,
    updated_at: &str,
) -> Result<String> {
    let metadata = serde_json::json!({
        "id": id,
        "title": input.title.replace(['\n', '\r'], " "),
        "courseId": input.course_id,
        "tags": input.tags,
        "properties": input.properties,
        "starred": input.starred,
        "created": created_at,
        "updated": updated_at,
    });
    let frontmatter = serde_json::to_string_pretty(&metadata)
        .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
    Ok(format!(
        "---\n{frontmatter}\n---\n\n{}",
        without_frontmatter(&input.markdown)
    ))
}

fn frontmatter_json(content: &str) -> Option<serde_json::Value> {
    frontmatter_block(content).and_then(|value| serde_json::from_str(value).ok())
}

fn frontmatter_value(content: &str, key: &str) -> Option<String> {
    if let Some(value) = frontmatter_json(content).and_then(|value| value.get(key).cloned()) {
        return match value {
            serde_json::Value::String(value) => Some(value),
            serde_json::Value::Number(value) => Some(value.to_string()),
            serde_json::Value::Bool(value) => Some(value.to_string()),
            _ => None,
        };
    }
    if !content.starts_with("---") {
        return None;
    }
    content
        .lines()
        .skip(1)
        .take_while(|line| *line != "---")
        .find_map(|line| line.strip_prefix(&format!("{key}: ")).map(str::to_owned))
}

fn frontmatter_block(content: &str) -> Option<&str> {
    let content = content.strip_prefix("---\n")?;
    let end = content.find("\n---\n")?;
    Some(&content[..end])
}

fn without_frontmatter(content: &str) -> &str {
    if !content.starts_with("---") {
        return content;
    }
    content
        .find("\n---\n")
        .map(|index| content[index + 5..].trim_start())
        .unwrap_or(content)
}

fn note_semantic_content(content: &str) -> String {
    let mut metadata = frontmatter_json(content).unwrap_or_else(|| serde_json::json!({}));
    if let Some(object) = metadata.as_object_mut() {
        object.remove("updated");
    }
    format!("{}\n{}", metadata, without_frontmatter(content).trim_end())
}

fn extract_markdown_tags(content: &str) -> Vec<String> {
    let pattern = regex::Regex::new(r"(?:^|\s)#([\p{L}\p{N}_/-]+)").expect("valid tag regex");
    let mut tags = pattern
        .captures_iter(content)
        .map(|capture| capture[1].to_owned())
        .collect::<Vec<_>>();
    tags.sort();
    tags.dedup();
    tags
}

fn stable_content_id(kind: &str, workspace_id: &str, relative: &Path) -> String {
    let digest = bytes_hash(format!("{workspace_id}:{}", relative.to_string_lossy()).as_bytes());
    format!("{kind}-{}", &digest[..24])
}

fn file_hash(path: &Path) -> Result<String> {
    let mut file = File::open(path)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    Ok(bytes_hash(&bytes))
}
fn bytes_hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_traversal() {
        assert!(safe_relative_path(Path::new("../secret")).is_err());
        assert!(safe_relative_path(Path::new("C:\\Windows\\file")).is_err());
        assert_eq!(
            safe_relative_path(Path::new("Courses/Week 1.md")).unwrap(),
            PathBuf::from("Courses/Week 1.md")
        );
    }

    #[test]
    fn atomic_write_replaces_complete_content() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("note.md");
        atomic_write(&path, b"first").unwrap();
        atomic_write(&path, b"second complete value").unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "second complete value");
    }

    #[tokio::test]
    async fn preserves_frontend_ids_for_notes_and_canvases() {
        let directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(directory.path().to_path_buf()).await.unwrap();
        let note = vault
            .save_note(SaveNoteInput {
                id: Some("note-stable".into()),
                workspace_id: "workspace-student".into(),
                relative_path: "Stable.md".into(),
                title: "Stable".into(),
                markdown: "# Stable\n\n#course/statistics".into(),
                course_id: None,
                tags: vec!["course/statistics".into()],
                properties: serde_json::json!({
                    "status": { "type": "single-select", "value": "Active" }
                }),
                starred: true,
                expected_hash: None,
            })
            .await
            .unwrap();
        let map = vault
            .save_canvas(
                Some("map-stable"),
                "workspace-student",
                "Stable.canvas",
                r#"{"nodes":[],"edges":[]}"#,
                None,
            )
            .await
            .unwrap();
        assert_eq!(note.id, "note-stable");
        assert_eq!(map.id, "map-stable");
        let content = vault.load_file_content().await.unwrap();
        assert_eq!(content.notes[0].id, "note-stable");
        assert_eq!(content.notes[0].tags, vec!["course/statistics"]);
        assert!(content.notes[0].starred);
        assert_eq!(content.notes[0].properties["status"]["value"], "Active");
        assert_eq!(content.maps[0].id, "map-stable");
    }

    #[tokio::test]
    async fn renames_canvas_files_while_preserving_the_map_id() {
        let directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(directory.path().to_path_buf()).await.unwrap();
        vault
            .save_canvas(
                Some("map-parent"),
                "workspace-personal",
                "Parent.canvas",
                r#"{"nodes":[],"edges":[]}"#,
                None,
            )
            .await
            .unwrap();
        vault
            .save_canvas(
                Some("map-rename"),
                "workspace-personal",
                "Old.canvas",
                r#"{"nodes":[],"edges":[]}"#,
                None,
            )
            .await
            .unwrap();
        let saved = vault
            .save_canvas(
                Some("map-rename"),
                "workspace-personal",
                "Folder/New.canvas",
                r#"{"nodes":[],"edges":[],"diorna":{"parentMapId":"map-parent"}}"#,
                None,
            )
            .await
            .unwrap();
        assert_eq!(saved.id, "map-rename");
        assert!(!directory.path().join("Personal/maps/Old.canvas").exists());
        assert!(
            directory
                .path()
                .join("Personal/maps/Folder/New.canvas")
                .exists()
        );
        let content = vault.load_file_content().await.unwrap();
        let renamed = content
            .maps
            .iter()
            .find(|map| map.id == "map-rename")
            .unwrap();
        assert_eq!(renamed.parent_map_id.as_deref(), Some("map-parent"));
    }

    #[tokio::test]
    async fn renames_note_files_and_retains_revisions() {
        let directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(directory.path().to_path_buf()).await.unwrap();
        let input = |path: &str, title: &str, markdown: &str| SaveNoteInput {
            id: Some("note-rename".into()),
            workspace_id: "workspace-student".into(),
            relative_path: path.into(),
            title: title.into(),
            markdown: markdown.into(),
            course_id: None,
            tags: vec![],
            properties: serde_json::json!({}),
            starred: false,
            expected_hash: None,
        };
        vault
            .save_note(input("Old.md", "Old", "first version"))
            .await
            .unwrap();
        vault
            .save_note(input("Folder/New.md", "New", "second version"))
            .await
            .unwrap();
        assert!(!directory.path().join("Student/notes/Old.md").exists());
        assert!(
            directory
                .path()
                .join("Student/notes/Folder/New.md")
                .exists()
        );
        let revisions = vault
            .note_revisions("workspace-student", "note-rename")
            .await
            .unwrap();
        assert_eq!(revisions.len(), 1);
        assert_eq!(revisions[0].markdown, "first version");
    }

    #[tokio::test]
    async fn detects_external_note_and_canvas_changes() {
        let directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(directory.path().to_path_buf()).await.unwrap();
        let note_input = |expected_hash: Option<String>| SaveNoteInput {
            id: Some("note-conflict".into()),
            workspace_id: "workspace-student".into(),
            relative_path: "Conflict.md".into(),
            title: "Conflict".into(),
            markdown: "original".into(),
            course_id: None,
            tags: vec![],
            properties: serde_json::json!({}),
            starred: false,
            expected_hash,
        };
        let saved_note = vault.save_note(note_input(None)).await.unwrap();
        fs::write(
            directory.path().join("Student/notes/Conflict.md"),
            "external note change",
        )
        .unwrap();
        assert!(matches!(
            vault
                .save_note(note_input(Some(saved_note.hash)))
                .await
                .unwrap_err(),
            DiornaError::SyncConflict
        ));

        let saved_map = vault
            .save_canvas(
                Some("map-conflict"),
                "workspace-student",
                "Conflict.canvas",
                r#"{"nodes":[],"edges":[]}"#,
                None,
            )
            .await
            .unwrap();
        fs::write(
            directory.path().join("Student/maps/Conflict.canvas"),
            r#"{"nodes":[{"id":"external"}],"edges":[]}"#,
        )
        .unwrap();
        assert!(matches!(
            vault
                .save_canvas(
                    Some("map-conflict"),
                    "workspace-student",
                    "Conflict.canvas",
                    r#"{"nodes":[],"edges":[]}"#,
                    Some(&saved_map.hash),
                )
                .await
                .unwrap_err(),
            DiornaError::SyncConflict
        ));
    }

    #[tokio::test]
    async fn recovers_file_backed_content_from_a_corrupt_index() {
        let source = tempfile::tempdir().unwrap();
        let vault = Vault::open(source.path().to_path_buf()).await.unwrap();
        vault
            .save_note(SaveNoteInput {
                id: Some("note-recover".into()),
                workspace_id: "workspace-student".into(),
                relative_path: "Recovered.md".into(),
                title: "Recovered".into(),
                markdown: "content survives".into(),
                course_id: None,
                tags: vec![],
                properties: serde_json::json!({}),
                starred: false,
                expected_hash: None,
            })
            .await
            .unwrap();
        vault.pool.close().await;
        drop(vault);

        let directory = tempfile::tempdir().unwrap();
        create_vault_layout(directory.path()).unwrap();
        let notes = directory.path().join("Student/notes");
        fs::create_dir_all(&notes).unwrap();
        fs::copy(
            source.path().join("Student/notes/Recovered.md"),
            notes.join("Recovered.md"),
        )
        .unwrap();
        let database = directory.path().join(".app/index.db");
        fs::write(&database, b"this is not sqlite").unwrap();
        assert!(!has_sqlite_header(&database).unwrap());

        let recovered = Vault::open(directory.path().to_path_buf()).await.unwrap();
        let content = recovered.load_file_content().await.unwrap();
        assert!(content.notes.iter().any(|note| note.id == "note-recover"));
    }

    #[tokio::test]
    async fn settings_and_keymap_are_human_readable_and_round_trip() {
        let directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(directory.path().to_path_buf()).await.unwrap();
        let settings = serde_json::json!({"language":"fr","theme":"dark"});
        let keymap = serde_json::json!({"commandPalette":"Ctrl+P"});
        vault.write_settings(&settings).unwrap();
        vault.write_keymap(&keymap).unwrap();
        assert_eq!(vault.read_settings().unwrap(), settings);
        assert_eq!(vault.read_keymap().unwrap(), keymap);
        assert!(
            fs::read_to_string(directory.path().join(".app/settings.json"))
                .unwrap()
                .contains("\n  \"language\"")
        );
    }

    #[tokio::test]
    async fn backup_contains_portable_vault_files() {
        let directory = tempfile::tempdir().unwrap();
        let backups = tempfile::tempdir().unwrap();
        let vault = Vault::open(directory.path().to_path_buf()).await.unwrap();
        atomic_write(
            &directory.path().join("Student/notes/Portable.md"),
            b"# Portable",
        )
        .unwrap();
        let output = vault.backup(backups.path()).unwrap();
        let file = File::open(output).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        assert!(archive.by_name(".app/settings.json").is_ok());
        assert!(archive.by_name("Student/notes/Portable.md").is_ok());
    }

    #[tokio::test]
    async fn deleted_workspace_is_archived_and_not_reseeded() {
        let directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(directory.path().to_path_buf()).await.unwrap();
        atomic_write(
            &directory.path().join("Student/notes/Before deletion.md"),
            b"# Before deletion",
        )
        .unwrap();
        vault.delete_workspace("workspace-student").await.unwrap();
        assert_eq!(vault.workspaces().await.unwrap().len(), 1);
        assert!(!directory.path().join("Student").exists());
        assert!(
            directory
                .path()
                .join(".app/deleted-workspaces")
                .read_dir()
                .unwrap()
                .next()
                .is_some()
        );
        vault.pool.close().await;
        let reopened = Vault::open(directory.path().to_path_buf()).await.unwrap();
        assert_eq!(reopened.workspaces().await.unwrap().len(), 1);
        assert_eq!(
            reopened.workspaces().await.unwrap()[0].id,
            "workspace-personal"
        );
    }

    #[test]
    fn canvas_validation_requires_geometry() {
        assert!(validate_canvas(&serde_json::json!({"nodes": [], "edges": []})).is_ok());
        assert!(validate_canvas(&serde_json::json!({"nodes": [{"id":"1"}], "edges": []})).is_err());
    }
}
