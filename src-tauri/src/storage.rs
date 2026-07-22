use std::{
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
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
};
use uuid::Uuid;
use walkdir::WalkDir;

use crate::error::{DiornaError, Result};

static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

#[derive(Clone)]
pub struct Vault {
    pub root: PathBuf,
    pub pool: SqlitePool,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRecord {
    pub id: String,
    pub name: String,
    pub color: String,
    pub folder_name: String,
    pub sort_order: i64,
    pub created_at: String,
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
        if db_path.exists() {
            backup_database_before_migration(&db_path, &root.join(".app").join("backups"))?;
        }
        let options =
            SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.to_string_lossy()))?
                .create_if_missing(true)
                .foreign_keys(true)
                .journal_mode(SqliteJournalMode::Wal)
                .synchronous(SqliteSynchronous::Full)
                .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(8)
            .connect_with(options)
            .await?;
        MIGRATOR.run(&pool).await?;
        seed_defaults(&pool).await?;
        let vault = Self { root, pool };
        vault.ensure_settings()?;
        Ok(vault)
    }

    fn ensure_settings(&self) -> Result<()> {
        let settings = self.root.join(".app").join("settings.json");
        if !settings.exists() {
            atomic_write(
                &settings,
                br##"{
  "language": "en",
  "theme": "system",
  "accentColor": "#5b5bd6",
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

    pub async fn workspaces(&self) -> Result<Vec<WorkspaceRecord>> {
        Ok(sqlx::query_as::<_, WorkspaceRecord>("SELECT id, name, color, folder_name, sort_order, created_at FROM workspace ORDER BY sort_order")
            .fetch_all(&self.pool).await?)
    }

    pub async fn workspace(&self, workspace_id: &str) -> Result<WorkspaceRecord> {
        sqlx::query_as::<_, WorkspaceRecord>("SELECT id, name, color, folder_name, sort_order, created_at FROM workspace WHERE id = ?")
            .bind(workspace_id).fetch_optional(&self.pool).await?
            .ok_or_else(|| DiornaError::WorkspaceNotFound(workspace_id.to_owned()))
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
    ) -> Result<SavedFile> {
        let workspace = self.workspace(workspace_id).await?;
        let mut relative = safe_relative_path(Path::new(relative_path))?;
        relative.set_extension("canvas");
        let value: serde_json::Value = serde_json::from_str(json)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        validate_canvas(&value)?;
        let pretty = serde_json::to_vec_pretty(&value)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        let path = self
            .root
            .join(&workspace.folder_name)
            .join("maps")
            .join(&relative);
        atomic_write(&path, &pretty)?;
        let now = Utc::now().to_rfc3339();
        let id = sqlx::query("SELECT id FROM map WHERE workspace_id = ? AND path = ?")
            .bind(workspace_id)
            .bind(relative.to_string_lossy().as_ref())
            .fetch_optional(&self.pool)
            .await?
            .map(|row| row.get::<String, _>(0))
            .or_else(|| map_id.map(ToOwned::to_owned))
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let name = relative
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Untitled");
        sqlx::query("INSERT INTO map(id, workspace_id, path, name, updated_at) VALUES(?, ?, ?, ?, ?) ON CONFLICT(workspace_id, path) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at")
            .bind(&id).bind(workspace_id).bind(relative.to_string_lossy().as_ref()).bind(name).bind(&now).execute(&self.pool).await?;
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
                let content: serde_json::Value =
                    serde_json::from_slice(&fs::read(path)?).map_err(|error| {
                        DiornaError::InvalidData(format!(
                            "Invalid Canvas {}: {error}",
                            path.display()
                        ))
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
                    parent_map_id: database.as_ref().and_then(|row| row.get("parent_map_id")),
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
    for relative in [
        ".app/logs",
        ".app/revisions",
        ".app/backups",
        "Student/notes",
        "Student/attachments",
        "Student/maps",
        "Student/templates",
        "Student/.trash",
        "Personal/notes",
        "Personal/attachments",
        "Personal/maps",
        "Personal/templates",
        "Personal/.trash",
    ] {
        fs::create_dir_all(root.join(relative))?;
    }
    Ok(())
}

async fn seed_defaults(pool: &SqlitePool) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    for (id, name, color, folder, order) in [
        ("workspace-student", "Student", "#5b5bd6", "Student", 0_i64),
        (
            "workspace-personal",
            "Personal",
            "#168a68",
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
        for (index, name) in names.iter().enumerate() {
            sqlx::query("INSERT OR IGNORE INTO category(id, workspace_id, name, color, icon, sort_order) VALUES(?, ?, ?, ?, 'Tag', ?)").bind(format!("{workspace}-{}", name.to_lowercase())).bind(workspace).bind(name).bind(if workspace.ends_with("student") { "#5b5bd6" } else { "#168a68" }).bind(index as i64).execute(pool).await?;
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

    #[test]
    fn canvas_validation_requires_geometry() {
        assert!(validate_canvas(&serde_json::json!({"nodes": [], "edges": []})).is_ok());
        assert!(validate_canvas(&serde_json::json!({"nodes": [{"id":"1"}], "edges": []})).is_err());
    }
}
