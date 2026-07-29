use std::{
    fs,
    path::{Path, PathBuf},
};

use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use sqlx::Row;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    error::{DiornaError, Result},
    storage::{Vault, atomic_write, safe_relative_path},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub operation_id: String,
    pub imported: usize,
    pub skipped: usize,
    pub warnings: Vec<String>,
    pub destination: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportManifest {
    operation_id: String,
    workspace_id: String,
    files: Vec<String>,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashRecord {
    pub id: String,
    pub workspace_id: String,
    pub kind: String,
    pub original_path: String,
    pub trash_path: String,
    pub deleted_at: String,
}

pub async fn import_obsidian(
    vault: &Vault,
    source: &Path,
    workspace_id: &str,
) -> Result<ImportReport> {
    import_tree(vault, source, workspace_id, "Obsidian", false).await
}

pub async fn import_notion(
    vault: &Vault,
    source: &Path,
    workspace_id: &str,
) -> Result<ImportReport> {
    import_tree(vault, source, workspace_id, "Notion", true).await
}

async fn import_tree(
    vault: &Vault,
    source: &Path,
    workspace_id: &str,
    source_name: &str,
    notion_mode: bool,
) -> Result<ImportReport> {
    if !source.is_dir() {
        return Err(DiornaError::InvalidData(
            "Import source must be a folder".into(),
        ));
    }
    let workspace = vault.workspace(workspace_id).await?;
    let operation_id = Uuid::new_v4().to_string();
    let dated = format!("Imports/{source_name}-{}", Utc::now().format("%Y-%m-%d"));
    let workspace_root = vault.root.join(&workspace.folder_name);
    let mut files = Vec::new();
    let mut warnings = Vec::new();
    let mut skipped = 0;

    for entry in WalkDir::new(source)
        .follow_links(false)
        .into_iter()
        .filter_map(std::result::Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        if relative
            .components()
            .any(|component| component.as_os_str() == ".obsidian")
        {
            skipped += 1;
            continue;
        }
        let extension = entry
            .path()
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let (area, mut target_relative) = match extension.as_str() {
            "md" => ("notes", PathBuf::from(&dated).join(relative)),
            "canvas" => ("maps", PathBuf::from(&dated).join(relative)),
            "csv" if notion_mode => (
                "notes",
                PathBuf::from(&dated).join(relative).with_extension("md"),
            ),
            _ => ("attachments", PathBuf::from(&dated).join(relative)),
        };
        target_relative = unique_relative(&workspace_root.join(area), target_relative);
        let target = workspace_root.join(area).join(&target_relative);
        let bytes = if notion_mode && extension == "csv" {
            match notion_csv_to_markdown(entry.path()) {
                Ok(markdown) => markdown.into_bytes(),
                Err(error) => {
                    warnings.push(format!("{}: {error}", relative.display()));
                    skipped += 1;
                    continue;
                }
            }
        } else {
            fs::read(entry.path())?
        };
        atomic_write(&target, &bytes)?;
        files.push(
            target
                .strip_prefix(&vault.root)
                .map_err(|error| DiornaError::InvalidData(error.to_string()))?
                .to_string_lossy()
                .into_owned(),
        );
    }
    let manifest = ImportManifest {
        operation_id: operation_id.clone(),
        workspace_id: workspace_id.to_owned(),
        files: files.clone(),
        created_at: Utc::now().to_rfc3339(),
    };
    let manifest_path = vault
        .root
        .join(".app")
        .join("imports")
        .join(format!("{operation_id}.json"));
    atomic_write(
        &manifest_path,
        &serde_json::to_vec_pretty(&manifest)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?,
    )?;
    vault.rebuild_file_index().await?;
    Ok(ImportReport {
        operation_id,
        imported: files.len(),
        skipped,
        warnings,
        destination: dated,
    })
}

pub async fn undo_import(vault: &Vault, operation_id: &str) -> Result<usize> {
    let id = safe_identifier(operation_id)?;
    let manifest_path = vault
        .root
        .join(".app")
        .join("imports")
        .join(format!("{id}.json"));
    let manifest: ImportManifest = serde_json::from_slice(&fs::read(&manifest_path)?)
        .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
    let mut removed = 0;
    for relative in manifest.files {
        let path = vault.root.join(safe_relative_path(Path::new(&relative))?);
        if path.is_file() {
            fs::remove_file(path)?;
            removed += 1;
        }
    }
    fs::remove_file(manifest_path)?;
    vault.rebuild_file_index().await?;
    Ok(removed)
}

pub async fn trash_file(
    vault: &Vault,
    workspace_id: &str,
    kind: &str,
    relative_path: &str,
) -> Result<TrashRecord> {
    if !matches!(kind, "notes" | "maps") {
        return Err(DiornaError::InvalidData(
            "Only notes and maps are file-backed trash entities".into(),
        ));
    }
    let workspace = vault.workspace(workspace_id).await?;
    let relative = safe_relative_path(Path::new(relative_path))?;
    let source = vault
        .root
        .join(&workspace.folder_name)
        .join(kind)
        .join(&relative);
    if !source.is_file() {
        return Err(DiornaError::InvalidData(format!(
            "File not found: {}",
            source.display()
        )));
    }
    let id = Uuid::new_v4().to_string();
    let trash_relative = PathBuf::from(&id).join(kind).join(&relative);
    let destination = vault
        .root
        .join(&workspace.folder_name)
        .join(".trash")
        .join(&trash_relative);
    fs::create_dir_all(destination.parent().expect("trash path has parent"))?;
    fs::rename(&source, &destination)?;
    let record = TrashRecord {
        id: id.clone(),
        workspace_id: workspace_id.to_owned(),
        kind: kind.to_owned(),
        original_path: relative.to_string_lossy().into_owned(),
        trash_path: trash_relative.to_string_lossy().into_owned(),
        deleted_at: Utc::now().to_rfc3339(),
    };
    atomic_write(
        &vault
            .root
            .join(&workspace.folder_name)
            .join(".trash")
            .join(format!("{id}.json")),
        &serde_json::to_vec_pretty(&record)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?,
    )?;
    vault.rebuild_file_index().await?;
    Ok(record)
}

pub async fn restore_trash(vault: &Vault, workspace_id: &str, trash_id: &str) -> Result<String> {
    let workspace = vault.workspace(workspace_id).await?;
    let id = safe_identifier(trash_id)?;
    let manifest_path = vault
        .root
        .join(&workspace.folder_name)
        .join(".trash")
        .join(format!("{id}.json"));
    let record: TrashRecord = serde_json::from_slice(&fs::read(&manifest_path)?)
        .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
    if record.workspace_id != workspace_id {
        return Err(DiornaError::WorkspaceNotFound(workspace_id.to_owned()));
    }
    let source = vault
        .root
        .join(&workspace.folder_name)
        .join(".trash")
        .join(safe_relative_path(Path::new(&record.trash_path))?);
    let requested = safe_relative_path(Path::new(&record.original_path))?;
    let relative = unique_relative(
        &vault.root.join(&workspace.folder_name).join(&record.kind),
        requested,
    );
    let destination = vault
        .root
        .join(&workspace.folder_name)
        .join(&record.kind)
        .join(&relative);
    fs::create_dir_all(destination.parent().expect("restore path has parent"))?;
    fs::rename(source, &destination)?;
    fs::remove_file(manifest_path)?;
    vault.rebuild_file_index().await?;
    Ok(relative.to_string_lossy().into_owned())
}

pub async fn list_trash(vault: &Vault, workspace_id: &str) -> Result<Vec<TrashRecord>> {
    let workspace = vault.workspace(workspace_id).await?;
    let directory = vault.root.join(&workspace.folder_name).join(".trash");
    if !directory.exists() {
        return Ok(Vec::new());
    }
    let mut records = Vec::new();
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        if path
            .extension()
            .is_some_and(|extension| extension == "json")
        {
            let record: TrashRecord = serde_json::from_slice(&fs::read(path)?)
                .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
            if record.workspace_id == workspace_id {
                records.push(record);
            }
        }
    }
    records.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
    Ok(records)
}

pub async fn purge_trash(vault: &Vault, workspace_id: &str, trash_id: &str) -> Result<()> {
    let workspace = vault.workspace(workspace_id).await?;
    let id = safe_identifier(trash_id)?;
    let directory = vault.root.join(&workspace.folder_name).join(".trash");
    let manifest = directory.join(format!("{id}.json"));
    if manifest.exists() {
        fs::remove_file(manifest)?;
    }
    let content = directory.join(id);
    if content.exists() {
        fs::remove_dir_all(content)?;
    }
    Ok(())
}

pub async fn purge_expired_trash(vault: &Vault) -> Result<usize> {
    let cutoff = Utc::now() - chrono::Duration::days(30);
    let mut purged = 0;
    for workspace in vault.workspaces().await? {
        for record in list_trash(vault, &workspace.id).await? {
            let deleted = chrono::DateTime::parse_from_rfc3339(&record.deleted_at)
                .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
            if deleted.with_timezone(&Utc) <= cutoff {
                purge_trash(vault, &workspace.id, &record.id).await?;
                purged += 1;
            }
        }
    }
    Ok(purged)
}

pub async fn export_vault(vault: &Vault, destination: &Path) -> Result<PathBuf> {
    fs::create_dir_all(destination)?;
    let output = destination.join(format!(
        "Diorna-export-{}",
        Utc::now().format("%Y%m%d-%H%M%S")
    ));
    fs::create_dir_all(&output)?;
    for workspace in vault.workspaces().await? {
        for area in ["notes", "attachments", "maps", "templates"] {
            let source = vault.root.join(&workspace.folder_name).join(area);
            if source.exists() {
                copy_tree(&source, &output.join(&workspace.folder_name).join(area))?;
            }
        }
    }
    let mut structured = Map::new();
    let queries = [
        (
            "workspaces",
            "SELECT COALESCE(json_group_array(json_object('id',id,'name',name,'color',color,'folderName',folder_name,'sortOrder',sort_order,'kind',kind,'createdAt',created_at)), '[]') FROM workspace",
        ),
        (
            "courses",
            "SELECT COALESCE(json_group_array(json_object('id',id,'workspaceId',workspace_id,'name',name,'code',code,'color',color,'semester',semester,'instructor',instructor,'credits',credits,'schedule',schedule,'sortOrder',sort_order)), '[]') FROM course",
        ),
        (
            "categories",
            "SELECT COALESCE(json_group_array(json_object('id',id,'workspaceId',workspace_id,'name',name,'color',color,'icon',icon,'sortOrder',sort_order)), '[]') FROM category",
        ),
        (
            "items",
            "SELECT COALESCE(json_group_array(json_object('id',item.id,'workspaceId',workspace_id,'kind',kind,'title',title,'description',description,'categoryId',category_id,'startAt',start_at,'endAt',end_at,'allDay',json(all_day),'dueAt',due_at,'completedAt',completed_at,'priority',priority,'rrule',rrule,'subtasks',json(subtasks_json),'rruleExceptions',json(rrule_exceptions),'noteId',note_id,'courseId',course_id,'sourceNoteLine',source_note_line,'reminders',json((SELECT COALESCE(json_group_array(minutes_before),'[]') FROM item_reminder WHERE item_id=item.id)),'createdAt',created_at,'updatedAt',updated_at,'trashedAt',trashed_at)), '[]') FROM item",
        ),
        (
            "habits",
            "SELECT COALESCE(json_group_array(json_object('id',id,'workspaceId',workspace_id,'name',name,'categoryId',category_id,'type',type,'unit',unit,'target',target,'activeWeekdays',active_weekdays,'startDate',start_date,'endDate',end_date,'description',description,'sortOrder',sort_order,'archived',json(archived))), '[]') FROM habit",
        ),
        (
            "habitEntries",
            "SELECT COALESCE(json_group_array(json_object('workspaceId',workspace_id,'habitId',habit_id,'date',date,'done',json(done),'value',value,'note',note)), '[]') FROM habit_entry",
        ),
        (
            "metrics",
            "SELECT COALESCE(json_group_array(json_object('id',id,'workspaceId',workspace_id,'name',name,'unit',unit,'categoryId',category_id,'target',target,'sortOrder',sort_order)), '[]') FROM metric",
        ),
        (
            "metricEntries",
            "SELECT COALESCE(json_group_array(json_object('workspaceId',workspace_id,'metricId',metric_id,'date',date,'value',value)), '[]') FROM metric_entry",
        ),
        (
            "flashcards",
            "SELECT COALESCE(json_group_array(json_object('id',id,'workspaceId',workspace_id,'noteId',note_id,'blockId',block_id,'front',front,'back',back,'cardType',card_type,'ease',ease,'intervalDays',interval_days,'dueDate',due_date,'reps',reps,'lapses',lapses,'lastReviewedAt',last_reviewed_at)), '[]') FROM flashcard",
        ),
        (
            "recaps",
            "SELECT COALESCE(json_group_array(json_object('id',id,'workspaceId',workspace_id,'periodType',period_type,'periodStart',period_start,'periodEnd',period_end,'noteId',note_id,'stats',json(stats_json),'narrative',narrative,'modelUsed',model_used,'generatedAt',generated_at,'revision',revision)), '[]') FROM recap",
        ),
    ];
    for (name, query) in queries {
        let row = sqlx::query(query).fetch_one(&vault.pool).await?;
        let encoded: String = row.get(0);
        structured.insert(
            name.to_owned(),
            serde_json::from_str(&encoded)
                .map_err(|error| DiornaError::InvalidData(error.to_string()))?,
        );
    }
    structured.insert("exportedAt".into(), json!(Utc::now().to_rfc3339()));
    structured.insert("formatVersion".into(), json!(1));
    atomic_write(
        &output.join("structured-data.json"),
        &serde_json::to_vec_pretty(&Value::Object(structured))
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?,
    )?;
    Ok(output)
}

fn notion_csv_to_markdown(path: &Path) -> Result<String> {
    let mut reader = csv::Reader::from_path(path)
        .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
    let headers = reader
        .headers()
        .map_err(|error| DiornaError::InvalidData(error.to_string()))?
        .clone();
    let title = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Notion database");
    let mut output = format!(
        "# {title}\n\n| {} |\n| {} |\n",
        headers.iter().collect::<Vec<_>>().join(" | "),
        headers
            .iter()
            .map(|_| "---")
            .collect::<Vec<_>>()
            .join(" | ")
    );
    for result in reader.records() {
        let record = result.map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        output.push_str(&format!(
            "| {} |\n",
            record
                .iter()
                .map(|value| value.replace('|', "\\|"))
                .collect::<Vec<_>>()
                .join(" | ")
        ));
    }
    Ok(output)
}

fn unique_relative(root: &Path, requested: PathBuf) -> PathBuf {
    if !root.join(&requested).exists() {
        return requested;
    }
    let stem = requested
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("imported");
    let extension = requested.extension().and_then(|value| value.to_str());
    for index in 2..10_000 {
        let name = match extension {
            Some(ext) => format!("{stem} ({index}).{ext}"),
            None => format!("{stem} ({index})"),
        };
        let candidate = requested.with_file_name(name);
        if !root.join(&candidate).exists() {
            return candidate;
        }
    }
    requested.with_file_name(format!("{stem}-{}", Uuid::new_v4()))
}

fn copy_tree(source: &Path, destination: &Path) -> Result<()> {
    for entry in WalkDir::new(source)
        .into_iter()
        .filter_map(std::result::Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        atomic_write(&destination.join(relative), &fs::read(entry.path())?)?;
    }
    Ok(())
}

fn safe_identifier(value: &str) -> Result<&str> {
    if value.is_empty()
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err(DiornaError::UnsafePath(value.to_owned()));
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_notion_csv_to_markdown() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("Projects.csv");
        fs::write(&path, "Name,Status\nDiorna,Active\n").unwrap();
        let output = notion_csv_to_markdown(&path).unwrap();
        assert!(output.contains("# Projects"));
        assert!(output.contains("| Diorna | Active |"));
    }

    #[test]
    fn generates_non_destructive_names() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("Note.md"), "existing").unwrap();
        assert_eq!(
            unique_relative(directory.path(), PathBuf::from("Note.md")),
            PathBuf::from("Note (2).md")
        );
    }

    #[test]
    fn validates_operation_identifiers() {
        assert!(safe_identifier("3e9b1d4c-1234").is_ok());
        assert!(safe_identifier("../escape").is_err());
    }

    #[tokio::test]
    async fn imports_and_undoes_a_large_nested_obsidian_vault() {
        let vault_directory = tempfile::tempdir().unwrap();
        let source_directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(vault_directory.path().to_path_buf())
            .await
            .unwrap();
        let source = source_directory.path();
        fs::create_dir_all(source.join("Areas/Research")).unwrap();
        fs::create_dir_all(source.join("Assets")).unwrap();
        fs::create_dir_all(source.join(".obsidian/plugins")).unwrap();
        for index in 0..250 {
            fs::write(
                source.join(format!("Areas/Research/Note {index}.md")),
                format!(
                    "---\ntags: [research, import]\n---\n# Note {index}\n\nLinks to [[Note {}]].\n",
                    (index + 1) % 250
                ),
            )
            .unwrap();
        }
        fs::write(source.join("Assets/diagram.png"), b"representative-binary").unwrap();
        fs::write(
            source.join("Strategy.canvas"),
            br#"{"nodes":[{"id":"one","type":"text","x":0,"y":0,"width":300,"height":120,"text":"Strategy"}],"edges":[]}"#,
        )
        .unwrap();
        fs::write(source.join(".obsidian/workspace.json"), "{}").unwrap();

        let report = import_obsidian(&vault, source, "workspace-student")
            .await
            .unwrap();
        assert_eq!(report.imported, 252);
        assert_eq!(report.skipped, 1);
        assert!(report.warnings.is_empty());
        assert!(
            vault_directory
                .path()
                .join(format!(
                    "Student/notes/{}/Areas/Research/Note 249.md",
                    report.destination
                ))
                .is_file()
        );
        assert!(
            vault_directory
                .path()
                .join(format!(
                    "Student/maps/{}/Strategy.canvas",
                    report.destination
                ))
                .is_file()
        );
        assert!(
            vault_directory
                .path()
                .join(format!(
                    "Student/attachments/{}/Assets/diagram.png",
                    report.destination
                ))
                .is_file()
        );

        assert_eq!(
            undo_import(&vault, &report.operation_id).await.unwrap(),
            report.imported
        );
    }

    #[tokio::test]
    async fn imports_mixed_notion_exports_and_converts_databases() {
        let vault_directory = tempfile::tempdir().unwrap();
        let source_directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(vault_directory.path().to_path_buf())
            .await
            .unwrap();
        let source = source_directory.path();
        fs::create_dir_all(source.join("Workspace/Assets")).unwrap();
        fs::write(
            source.join("Workspace/Projects.csv"),
            "Name,Status,Summary\nDiorna,Active,\"Local-first, private\"\nCoffee,Idea,\"Taste | ritual\"\n",
        )
        .unwrap();
        fs::write(
            source.join("Workspace/Project brief.md"),
            "# Project brief\n\n[Projects](Projects.csv)\n",
        )
        .unwrap();
        fs::write(
            source.join("Workspace/Assets/cover.jpg"),
            b"representative-image",
        )
        .unwrap();

        let report = import_notion(&vault, source, "workspace-personal")
            .await
            .unwrap();
        assert_eq!(report.imported, 3);
        assert_eq!(report.skipped, 0);
        let database = vault_directory.path().join(format!(
            "Personal/notes/{}/Workspace/Projects.md",
            report.destination
        ));
        let markdown = fs::read_to_string(database).unwrap();
        assert!(markdown.contains("| Diorna | Active | Local-first, private |"));
        assert!(markdown.contains("Taste \\| ritual"));
        assert!(
            vault_directory
                .path()
                .join(format!(
                    "Personal/attachments/{}/Workspace/Assets/cover.jpg",
                    report.destination
                ))
                .is_file()
        );
    }

    #[tokio::test]
    async fn trashes_lists_restores_and_purges_files() {
        let directory = tempfile::tempdir().unwrap();
        let vault = Vault::open(directory.path().to_path_buf()).await.unwrap();
        let source = directory.path().join("Student/notes/Trash me.md");
        atomic_write(&source, b"# Recoverable").unwrap();
        let record = trash_file(&vault, "workspace-student", "notes", "Trash me.md")
            .await
            .unwrap();
        assert!(!source.exists());
        assert_eq!(
            list_trash(&vault, "workspace-student").await.unwrap().len(),
            1
        );
        let restored = restore_trash(&vault, "workspace-student", &record.id)
            .await
            .unwrap();
        assert_eq!(restored, "Trash me.md");
        assert!(source.exists());

        let record = trash_file(&vault, "workspace-student", "notes", "Trash me.md")
            .await
            .unwrap();
        purge_trash(&vault, "workspace-student", &record.id)
            .await
            .unwrap();
        assert!(
            list_trash(&vault, "workspace-student")
                .await
                .unwrap()
                .is_empty()
        );
    }
}
