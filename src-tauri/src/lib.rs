mod error;
mod lifecycle;
mod link_preview;
mod secrets;
mod spreadsheet;
mod storage;
mod structured;
mod windows_integration;

use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use base64::Engine;
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use sha2::Digest;
use storage::{DiskContent, SaveNoteInput, SavedFile, SearchHit, Vault, WorkspaceRecord};
use tauri::{
    AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder,
    menu::{MenuBuilder, MenuItem, MenuItemBuilder},
    tray::TrayIconBuilder,
};
use tauri_plugin_autostart::ManagerExt as AutostartManagerExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

use crate::error::{DiornaError, Result};
use crate::lifecycle::{ImportReport, TrashRecord};

#[derive(Clone, Default)]
struct AppState {
    vault: Arc<RwLock<Option<Vault>>>,
    open_requests: Arc<RwLock<Vec<String>>>,
}

#[derive(Clone)]
struct CloseBehavior(Arc<AtomicBool>);

#[derive(Clone)]
struct TrayScoreItem(MenuItem<tauri::Wry>);

#[derive(Clone, Default)]
struct RegisteredShortcut(Arc<RwLock<String>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    portable: bool,
    log_directory: String,
}

fn executable_directory() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(std::path::Path::to_path_buf))
}

fn portable_mode() -> bool {
    executable_directory()
        .map(|path| path.join("portable.flag").is_file())
        .unwrap_or(false)
}

fn application_data_directory() -> PathBuf {
    if portable_mode() {
        return executable_directory()
            .unwrap_or_else(std::env::temp_dir)
            .join("data");
    }
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join("Diorna")
}

fn preferred_vault_path() -> Result<PathBuf> {
    if portable_mode() {
        return executable_directory()
            .map(|path| path.join("DiornaVault"))
            .ok_or_else(|| DiornaError::InvalidData("Executable directory is unavailable".into()));
    }
    let pointer = application_data_directory().join("vault-location.txt");
    if let Ok(value) = std::fs::read_to_string(pointer) {
        let path = PathBuf::from(value.trim());
        if !value.trim().is_empty() {
            return Ok(path);
        }
    }
    let profile = std::env::var_os("USERPROFILE")
        .ok_or_else(|| DiornaError::InvalidData("USERPROFILE is unavailable".into()))?;
    Ok(PathBuf::from(profile).join("Documents").join("Diorna"))
}

fn remember_vault_path(path: &std::path::Path) -> Result<()> {
    if portable_mode() {
        return Ok(());
    }
    let data = application_data_directory();
    std::fs::create_dir_all(&data)?;
    storage::atomic_write(
        &data.join("vault-location.txt"),
        path.to_string_lossy().as_bytes(),
    )
}

#[tauri::command]
fn runtime_info() -> RuntimeInfo {
    RuntimeInfo {
        portable: portable_mode(),
        log_directory: application_data_directory()
            .join("logs")
            .to_string_lossy()
            .into_owned(),
    }
}

impl Default for CloseBehavior {
    fn default() -> Self {
        Self(Arc::new(AtomicBool::new(true)))
    }
}

#[tauri::command]
fn set_close_to_tray(enabled: bool, behavior: State<'_, CloseBehavior>) {
    behavior.0.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn set_start_with_windows(enabled: bool, app: AppHandle) -> Result<()> {
    if enabled {
        app.autolaunch()
            .enable()
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
    } else {
        app.autolaunch()
            .disable()
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
fn update_tray_score(score: Option<u8>, item: State<'_, TrayScoreItem>) -> Result<()> {
    let label = score
        .map(|value| format!("Today: {}%", value.min(100)))
        .unwrap_or_else(|| "Today: —".to_string());
    item.0
        .set_text(label)
        .map_err(|error| DiornaError::InvalidData(error.to_string()))
}

#[tauri::command]
fn set_global_shortcut(
    shortcut: String,
    app: AppHandle,
    registered: State<'_, RegisteredShortcut>,
) -> Result<()> {
    let current = registered.0.read().clone();
    if shortcut == current {
        return Ok(());
    }
    app.global_shortcut()
        .unregister_all()
        .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
    if let Err(error) = app.global_shortcut().register(shortcut.as_str()) {
        if !current.is_empty() {
            let _ = app.global_shortcut().register(current.as_str());
        }
        return Err(DiornaError::InvalidData(format!(
            "The shortcut {shortcut} is unavailable: {error}"
        )));
    }
    *registered.0.write() = shortcut;
    Ok(())
}

impl AppState {
    fn get_vault(&self) -> Result<Vault> {
        self.vault
            .read()
            .clone()
            .ok_or(DiornaError::VaultNotInitialised)
    }
}

fn queue_open_requests(state: &AppState, args: impl IntoIterator<Item = String>) {
    let mut requests = state.open_requests.write();
    for argument in args {
        if matches!(
            argument.as_str(),
            "--new-note" | "--quick-capture" | "--today"
        ) {
            if !requests.iter().any(|entry| entry == &argument) {
                requests.push(argument);
            }
            continue;
        }
        let path = PathBuf::from(&argument);
        let supported = path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "md" | "canvas"))
            .unwrap_or(false);
        if supported && path.is_file() && !requests.iter().any(|entry| entry == &argument) {
            requests.push(argument);
        }
    }
}

#[tauri::command]
fn take_open_requests(state: State<'_, AppState>) -> Vec<String> {
    std::mem::take(&mut *state.open_requests.write())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultStatus {
    path: String,
    workspaces: Vec<WorkspaceRecord>,
    rebuilt_files: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceStorageUsage {
    workspace_id: String,
    name: String,
    folder_name: String,
    bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultInfo {
    path: String,
    total_bytes: u64,
    workspaces: Vec<WorkspaceStorageUsage>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedAttachment {
    relative_path: String,
    absolute_path: String,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LinkPreviewResult {
    url: String,
    final_url: String,
    title: String,
    description: String,
    site_name: String,
    image_url: String,
    image_relative_path: String,
    image_absolute_path: String,
    favicon_url: String,
    favicon_relative_path: String,
    favicon_absolute_path: String,
    fetched_at: String,
}

fn safe_attachment_name(name: &str) -> String {
    let candidate = std::path::Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("attachment.bin");
    let cleaned: String = candidate
        .chars()
        .map(|value| {
            if value.is_control()
                || matches!(value, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
            {
                '_'
            } else {
                value
            }
        })
        .collect();
    if cleaned.trim_matches(['.', ' ']).is_empty() {
        "attachment.bin".into()
    } else {
        cleaned
    }
}

fn available_attachment_path(directory: &std::path::Path, name: &str) -> PathBuf {
    let requested = directory.join(name);
    if !requested.exists() {
        return requested;
    }
    let path = std::path::Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("attachment");
    let extension = path.extension().and_then(|value| value.to_str());
    for suffix in 2..10_000 {
        let next = match extension {
            Some(extension) => format!("{stem}-{suffix}.{extension}"),
            None => format!("{stem}-{suffix}"),
        };
        let candidate = directory.join(next);
        if !candidate.exists() {
            return candidate;
        }
    }
    directory.join(format!("{}-{}", stem, uuid::Uuid::new_v4()))
}

#[tauri::command]
async fn import_attachment(
    workspace_id: String,
    name: String,
    source_path: Option<String>,
    data_base64: Option<String>,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<SavedAttachment> {
    let vault = state.get_vault()?;
    let workspace = vault
        .workspaces()
        .await?
        .into_iter()
        .find(|workspace| workspace.id == workspace_id)
        .ok_or_else(|| DiornaError::InvalidData("Unknown workspace".into()))?;
    let directory = vault.root.join(workspace.folder_name).join("attachments");
    std::fs::create_dir_all(&directory)?;
    let destination = available_attachment_path(&directory, &safe_attachment_name(&name));
    let bytes = if let Some(source_path) = source_path {
        std::fs::read(PathBuf::from(source_path))?
    } else if let Some(encoded) = data_base64 {
        base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?
    } else {
        return Err(DiornaError::InvalidData(
            "Attachment data is missing".into(),
        ));
    };
    storage::atomic_write(&destination, &bytes)?;
    app.asset_protocol_scope()
        .allow_file(&destination)
        .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
    Ok(SavedAttachment {
        relative_path: format!(
            "attachments/{}",
            destination
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
        ),
        absolute_path: destination.to_string_lossy().into_owned(),
        size: bytes.len() as u64,
    })
}

#[tauri::command]
async fn fetch_link_preview(
    url: String,
    workspace_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<LinkPreviewResult> {
    let vault = state.get_vault()?;
    let workspace = vault
        .workspaces()
        .await?
        .into_iter()
        .find(|workspace| workspace.id == workspace_id)
        .ok_or_else(|| DiornaError::InvalidData("Unknown workspace".into()))?;
    let directory = vault.root.join(workspace.folder_name).join("attachments");
    std::fs::create_dir_all(&directory)?;
    let preview = link_preview::fetch(&url).await?;
    let save_asset =
        |asset: Option<link_preview::PreviewAsset>, kind: &str| -> Result<(String, String)> {
            let Some(asset) = asset else {
                return Ok((String::new(), String::new()));
            };
            let digest = sha2::Sha256::digest(format!("{kind}:{url}").as_bytes());
            let short_hash = digest[..8]
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>();
            let name = format!("link-preview-{kind}-{short_hash}.{}", asset.extension);
            let destination = directory.join(name);
            storage::atomic_write(&destination, &asset.bytes)?;
            app.asset_protocol_scope()
                .allow_file(&destination)
                .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
            Ok((
                format!(
                    "attachments/{}",
                    destination
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                ),
                destination.to_string_lossy().into_owned(),
            ))
        };
    let (image_relative_path, image_absolute_path) = save_asset(preview.image, "image")?;
    let (favicon_relative_path, favicon_absolute_path) = save_asset(preview.favicon, "favicon")?;
    Ok(LinkPreviewResult {
        url,
        final_url: preview.final_url,
        title: preview.title,
        description: preview.description,
        site_name: preview.site_name,
        image_url: preview.image_url,
        image_relative_path,
        image_absolute_path,
        favicon_url: preview.favicon_url,
        favicon_relative_path,
        favicon_absolute_path,
        fetched_at: chrono::Utc::now().to_rfc3339(),
    })
}

fn allow_existing_attachments(
    app: &AppHandle,
    root: &std::path::Path,
    workspaces: &[WorkspaceRecord],
) -> Result<()> {
    let scope = app.asset_protocol_scope();
    for workspace in workspaces {
        let attachments = root.join(&workspace.folder_name).join("attachments");
        if attachments.is_dir() {
            scope
                .allow_directory(attachments, true)
                .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        }
    }
    Ok(())
}

fn directory_size(path: &std::path::Path) -> u64 {
    walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(std::result::Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .filter_map(|entry| entry.metadata().ok().map(|metadata| metadata.len()))
        .sum()
}

fn copy_directory(source: &std::path::Path, destination: &std::path::Path) -> Result<()> {
    std::fs::create_dir_all(destination)?;
    for entry in walkdir::WalkDir::new(source) {
        let entry = entry.map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        let relative = entry
            .path()
            .strip_prefix(source)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        let target = destination.join(relative);
        if entry.file_type().is_dir() {
            std::fs::create_dir_all(&target)?;
        } else if entry.file_type().is_file() {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn initialise_vault(
    path: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<VaultStatus> {
    let root = PathBuf::from(path);
    remember_vault_path(&root)?;
    let database_existed = root.join(".app").join("index.db").exists();
    let vault = Vault::open(root.clone()).await?;
    let rebuilt_files = if database_existed {
        0
    } else {
        vault.rebuild_file_index().await?
    };
    let workspaces = vault.workspaces().await?;
    allow_existing_attachments(&app, &root, &workspaces)?;
    lifecycle::purge_expired_trash(&vault).await?;
    *state.vault.write() = Some(vault);
    Ok(VaultStatus {
        path: root.to_string_lossy().into_owned(),
        workspaces,
        rebuilt_files,
    })
}

#[tauri::command]
async fn initialise_default_vault(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<VaultStatus> {
    let root = preferred_vault_path()?;
    let database_existed = root.join(".app").join("index.db").exists();
    let vault = Vault::open(root.clone()).await?;
    let rebuilt_files = if database_existed {
        0
    } else {
        vault.rebuild_file_index().await?
    };
    let workspaces = vault.workspaces().await?;
    allow_existing_attachments(&app, &root, &workspaces)?;
    lifecycle::purge_expired_trash(&vault).await?;
    *state.vault.write() = Some(vault);
    Ok(VaultStatus {
        path: root.to_string_lossy().into_owned(),
        workspaces,
        rebuilt_files,
    })
}

#[tauri::command]
async fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<WorkspaceRecord>> {
    state.get_vault()?.workspaces().await
}

#[tauri::command]
async fn delete_workspace(workspace_id: String, state: State<'_, AppState>) -> Result<()> {
    state.get_vault()?.delete_workspace(&workspace_id).await
}

#[tauri::command]
async fn save_note(input: SaveNoteInput, state: State<'_, AppState>) -> Result<SavedFile> {
    state.get_vault()?.save_note(input).await
}

#[tauri::command]
async fn save_canvas(
    map_id: Option<String>,
    workspace_id: String,
    relative_path: String,
    canvas_json: String,
    expected_hash: Option<String>,
    state: State<'_, AppState>,
) -> Result<SavedFile> {
    state
        .get_vault()?
        .save_canvas(
            map_id.as_deref(),
            &workspace_id,
            &relative_path,
            &canvas_json,
            expected_hash.as_deref(),
        )
        .await
}

#[tauri::command]
async fn search_notes(
    workspace_id: String,
    query: String,
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<SearchHit>> {
    state
        .get_vault()?
        .search_notes(&workspace_id, &query, limit.unwrap_or(30))
        .await
}

#[tauri::command]
async fn rebuild_index(state: State<'_, AppState>) -> Result<u64> {
    state.get_vault()?.rebuild_file_index().await
}

#[tauri::command]
fn read_settings(state: State<'_, AppState>) -> Result<serde_json::Value> {
    state.get_vault()?.read_settings()
}

#[tauri::command]
fn write_settings(settings: serde_json::Value, state: State<'_, AppState>) -> Result<()> {
    state.get_vault()?.write_settings(&settings)
}

#[tauri::command]
fn read_keymap(state: State<'_, AppState>) -> Result<serde_json::Value> {
    state.get_vault()?.read_keymap()
}

#[tauri::command]
fn write_keymap(keymap: serde_json::Value, state: State<'_, AppState>) -> Result<()> {
    state.get_vault()?.write_keymap(&keymap)
}

#[tauri::command]
async fn vault_info(state: State<'_, AppState>) -> Result<VaultInfo> {
    let vault = state.get_vault()?;
    let workspaces = vault.workspaces().await?;
    Ok(VaultInfo {
        path: vault.root.to_string_lossy().into_owned(),
        total_bytes: directory_size(&vault.root),
        workspaces: workspaces
            .into_iter()
            .map(|workspace| WorkspaceStorageUsage {
                workspace_id: workspace.id,
                name: workspace.name,
                bytes: directory_size(&vault.root.join(&workspace.folder_name)),
                folder_name: workspace.folder_name,
            })
            .collect(),
    })
}

#[tauri::command]
async fn move_vault(destination: String, state: State<'_, AppState>) -> Result<VaultInfo> {
    if portable_mode() {
        return Err(DiornaError::InvalidData(
            "The portable build keeps its vault beside Diorna.exe".into(),
        ));
    }
    let vault = state.get_vault()?;
    let source = vault.root.canonicalize()?;
    let destination = PathBuf::from(destination);
    let parent = destination
        .parent()
        .ok_or_else(|| DiornaError::UnsafePath(destination.to_string_lossy().into_owned()))?;
    std::fs::create_dir_all(parent)?;
    let parent = parent.canonicalize()?;
    let file_name = destination
        .file_name()
        .ok_or_else(|| DiornaError::UnsafePath(destination.to_string_lossy().into_owned()))?;
    let destination = parent.join(file_name);
    if destination == source || destination.starts_with(&source) {
        return Err(DiornaError::InvalidData(
            "Choose an empty folder outside the current vault".into(),
        ));
    }
    if destination.exists() {
        if destination.read_dir()?.next().is_some() {
            return Err(DiornaError::InvalidData(
                "The destination folder must be empty".into(),
            ));
        }
        std::fs::remove_dir(&destination)?;
    }

    vault.pool.close().await;
    *state.vault.write() = None;
    let move_result = match std::fs::rename(&source, &destination) {
        Ok(()) => Ok(()),
        Err(_) => (|| -> Result<()> {
            copy_directory(&source, &destination)?;
            if directory_size(&source) != directory_size(&destination) {
                return Err(DiornaError::InvalidData(
                    "The copied vault did not pass verification".into(),
                ));
            }
            std::fs::remove_dir_all(&source)?;
            Ok(())
        })(),
    };
    if let Err(error) = move_result {
        if destination.exists() {
            let _ = std::fs::remove_dir_all(&destination);
        }
        if let Ok(reopened) = Vault::open(source).await {
            *state.vault.write() = Some(reopened);
        }
        return Err(error);
    }
    let reopened = Vault::open(destination.clone()).await?;
    let workspaces = reopened.workspaces().await?;
    let info = VaultInfo {
        path: destination.to_string_lossy().into_owned(),
        total_bytes: directory_size(&destination),
        workspaces: workspaces
            .into_iter()
            .map(|workspace| WorkspaceStorageUsage {
                workspace_id: workspace.id,
                name: workspace.name,
                bytes: directory_size(&destination.join(&workspace.folder_name)),
                folder_name: workspace.folder_name,
            })
            .collect(),
    };
    *state.vault.write() = Some(reopened);
    remember_vault_path(&destination)?;
    Ok(info)
}

#[tauri::command]
async fn create_backup(
    destination: String,
    retention: Option<usize>,
    state: State<'_, AppState>,
) -> Result<String> {
    let mut destination = PathBuf::from(destination);
    if !destination.is_absolute() {
        let profile = std::env::var_os("USERPROFILE")
            .ok_or_else(|| DiornaError::InvalidData("USERPROFILE is unavailable".into()))?;
        destination = PathBuf::from(profile).join(destination);
    }
    let path = state.get_vault()?.backup(&destination)?;
    let mut backups = destination
        .read_dir()?
        .filter_map(std::result::Result::ok)
        .map(|entry| entry.path())
        .filter(|entry| {
            entry
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("Diorna-") && name.ends_with(".zip"))
        })
        .collect::<Vec<_>>();
    backups.sort();
    let keep = retention.unwrap_or(10).clamp(1, 100);
    let remove_count = backups.len().saturating_sub(keep);
    for expired in backups.into_iter().take(remove_count) {
        std::fs::remove_file(expired)?;
    }
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn restore_backup(backup: String, state: State<'_, AppState>) -> Result<String> {
    let vault = state.get_vault()?;
    let root = vault.root.canonicalize()?;
    let parent = root
        .parent()
        .ok_or_else(|| DiornaError::UnsafePath(root.to_string_lossy().into_owned()))?;
    let temporary = parent.join(format!(".Diorna-restore-{}", uuid::Uuid::new_v4()));
    let rollback = parent.join(format!(
        ".Diorna-pre-restore-{}",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    ));
    std::fs::create_dir_all(&temporary)?;
    let extraction = (|| -> Result<()> {
        let file = std::fs::File::open(PathBuf::from(backup))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
            let relative = entry
                .enclosed_name()
                .ok_or_else(|| DiornaError::UnsafePath(entry.name().to_owned()))?;
            let target = temporary.join(relative);
            if entry.is_dir() {
                std::fs::create_dir_all(&target)?;
            } else {
                if let Some(parent) = target.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                let mut output = std::fs::File::create(target)?;
                std::io::copy(&mut entry, &mut output)?;
            }
        }
        if !temporary.join(".app").join("settings.json").is_file() {
            return Err(DiornaError::InvalidData(
                "The selected archive is not a Diorna vault backup".into(),
            ));
        }
        Ok(())
    })();
    if let Err(error) = extraction {
        let _ = std::fs::remove_dir_all(&temporary);
        return Err(error);
    }

    vault.pool.close().await;
    *state.vault.write() = None;
    if let Err(error) = std::fs::rename(&root, &rollback) {
        let _ = std::fs::remove_dir_all(&temporary);
        if let Ok(reopened) = Vault::open(root.clone()).await {
            *state.vault.write() = Some(reopened);
        }
        return Err(error.into());
    }
    if let Err(error) = std::fs::rename(&temporary, &root) {
        let _ = std::fs::rename(&rollback, &root);
        if let Ok(reopened) = Vault::open(root.clone()).await {
            *state.vault.write() = Some(reopened);
        }
        return Err(error.into());
    }
    match Vault::open(root.clone()).await {
        Ok(reopened) => {
            *state.vault.write() = Some(reopened);
            Ok(rollback.to_string_lossy().into_owned())
        }
        Err(error) => {
            let failed = parent.join(format!(".Diorna-failed-restore-{}", uuid::Uuid::new_v4()));
            let _ = std::fs::rename(&root, failed);
            let _ = std::fs::rename(&rollback, &root);
            if let Ok(reopened) = Vault::open(root).await {
                *state.vault.write() = Some(reopened);
            }
            Err(error)
        }
    }
}

#[tauri::command]
async fn import_obsidian(
    source: String,
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<ImportReport> {
    lifecycle::import_obsidian(&state.get_vault()?, &PathBuf::from(source), &workspace_id).await
}

#[tauri::command]
async fn import_notion(
    source: String,
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<ImportReport> {
    lifecycle::import_notion(&state.get_vault()?, &PathBuf::from(source), &workspace_id).await
}

#[tauri::command]
async fn undo_import(operation_id: String, state: State<'_, AppState>) -> Result<usize> {
    lifecycle::undo_import(&state.get_vault()?, &operation_id).await
}

#[tauri::command]
async fn trash_file(
    workspace_id: String,
    kind: String,
    relative_path: String,
    state: State<'_, AppState>,
) -> Result<TrashRecord> {
    lifecycle::trash_file(&state.get_vault()?, &workspace_id, &kind, &relative_path).await
}

#[tauri::command]
async fn restore_trash(
    workspace_id: String,
    trash_id: String,
    state: State<'_, AppState>,
) -> Result<String> {
    lifecycle::restore_trash(&state.get_vault()?, &workspace_id, &trash_id).await
}

#[tauri::command]
async fn list_trash(workspace_id: String, state: State<'_, AppState>) -> Result<Vec<TrashRecord>> {
    lifecycle::list_trash(&state.get_vault()?, &workspace_id).await
}

#[tauri::command]
async fn purge_trash(
    workspace_id: String,
    trash_id: String,
    state: State<'_, AppState>,
) -> Result<()> {
    lifecycle::purge_trash(&state.get_vault()?, &workspace_id, &trash_id).await
}

#[tauri::command]
async fn export_vault(destination: String, state: State<'_, AppState>) -> Result<String> {
    Ok(
        lifecycle::export_vault(&state.get_vault()?, &PathBuf::from(destination))
            .await?
            .to_string_lossy()
            .into_owned(),
    )
}

#[tauri::command]
fn protect_api_key(api_key: String) -> Result<String> {
    secrets::protect(&api_key)
}

#[tauri::command]
fn reveal_api_key(protected_value: String) -> Result<String> {
    secrets::unprotect(&protected_value)
}

#[tauri::command]
fn store_api_key(provider: String, api_key: String, app: AppHandle) -> Result<()> {
    if provider.is_empty()
        || !provider
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(DiornaError::InvalidData(
            "Invalid provider identifier".into(),
        ));
    }
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| DiornaError::Io(std::io::Error::other(error)))?
        .join("secrets.json");
    let mut values: serde_json::Map<String, serde_json::Value> = if path.exists() {
        serde_json::from_slice::<serde_json::Value>(&std::fs::read(&path)?)
            .ok()
            .and_then(|value| value.as_object().cloned())
            .unwrap_or_default()
    } else {
        serde_json::Map::new()
    };
    values.insert(
        provider,
        serde_json::Value::String(secrets::protect(&api_key)?),
    );
    storage::atomic_write(
        &path,
        &serde_json::to_vec_pretty(&values)
            .map_err(|error| DiornaError::InvalidData(error.to_string()))?,
    )
}

#[tauri::command]
fn load_api_key(provider: String, app: AppHandle) -> Result<Option<String>> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| DiornaError::Io(std::io::Error::other(error)))?
        .join("secrets.json");
    if !path.exists() {
        return Ok(None);
    }
    let values: serde_json::Value = serde_json::from_slice(&std::fs::read(path)?)
        .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
    values
        .get(provider)
        .and_then(serde_json::Value::as_str)
        .map(secrets::unprotect)
        .transpose()
}

#[tauri::command]
fn has_api_key(provider: String, app: AppHandle) -> Result<bool> {
    Ok(load_api_key(provider, app)?.is_some())
}

#[tauri::command]
fn export_xlsx(path: String, sheets: Vec<spreadsheet::SheetInput>) -> Result<()> {
    spreadsheet::export_xlsx(&PathBuf::from(path), sheets)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextExportFile {
    relative_path: String,
    content: String,
}

#[tauri::command]
fn export_text_file(path: String, content: String) -> Result<String> {
    let path = PathBuf::from(path);
    storage::atomic_write(&path, content.as_bytes())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn export_binary_file(path: String, data_base64: String) -> Result<String> {
    let path = PathBuf::from(path);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64)
        .map_err(|error| DiornaError::InvalidData(error.to_string()))?;
    storage::atomic_write(&path, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn export_text_bundle(destination: String, files: Vec<TextExportFile>) -> Result<String> {
    let destination = PathBuf::from(destination);
    std::fs::create_dir_all(&destination)?;
    for file in files {
        let relative = storage::safe_relative_path(std::path::Path::new(&file.relative_path))?;
        storage::atomic_write(&destination.join(relative), file.content.as_bytes())?;
    }
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
async fn persist_structured_state(
    snapshot: structured::StructuredSnapshot,
    state: State<'_, AppState>,
) -> Result<()> {
    structured::persist(&state.get_vault()?.pool, snapshot).await
}

#[tauri::command]
async fn load_structured_state(
    state: State<'_, AppState>,
) -> Result<structured::LoadedStructuredState> {
    structured::load(&state.get_vault()?.pool).await
}

#[tauri::command]
async fn load_file_content(state: State<'_, AppState>) -> Result<DiskContent> {
    state.get_vault()?.load_file_content().await
}

#[tauri::command]
async fn list_note_revisions(
    workspace_id: String,
    note_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<storage::NoteRevision>> {
    state
        .get_vault()?
        .note_revisions(&workspace_id, &note_id)
        .await
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn show_quick_capture(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("quick-capture") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(
        app,
        "quick-capture",
        WebviewUrl::App("index.html?quick-capture=1".into()),
    )
    .title("Diorna — Quick capture")
    .inner_size(620.0, 180.0)
    .min_inner_size(420.0, 160.0)
    .always_on_top(true)
    .resizable(false)
    .decorations(false)
    .center()
    .build();
}

pub fn run() {
    let state = AppState::default();
    let builder = tauri::Builder::default()
        .manage(state)
        .manage(CloseBehavior::default())
        .manage(RegisteredShortcut::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            queue_open_requests(&app.state::<AppState>(), args);
            show_main(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());
    let builder = if portable_mode() {
        builder
    } else {
        builder.plugin(tauri_plugin_window_state::Builder::default().build())
    };
    builder
        .plugin(
            tauri_plugin_log::Builder::new()
                .max_file_size(10_000_000)
                .rotation_strategy(RotationStrategy::KeepSome(4))
                .target(Target::new(TargetKind::Folder {
                    path: application_data_directory().join("logs"),
                    file_name: Some("diorna".into()),
                }))
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        log::debug!("Global shortcut invoked: {shortcut}");
                        show_quick_capture(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            initialise_vault,
            initialise_default_vault,
            list_workspaces,
            delete_workspace,
            save_note,
            save_canvas,
            search_notes,
            rebuild_index,
            read_settings,
            write_settings,
            read_keymap,
            write_keymap,
            vault_info,
            move_vault,
            create_backup,
            restore_backup,
            import_obsidian,
            import_notion,
            undo_import,
            trash_file,
            restore_trash,
            list_trash,
            purge_trash,
            export_vault,
            protect_api_key,
            reveal_api_key,
            store_api_key,
            load_api_key,
            has_api_key,
            export_xlsx,
            persist_structured_state,
            load_structured_state,
            load_file_content,
            list_note_revisions,
            export_text_file,
            export_binary_file,
            export_text_bundle,
            set_close_to_tray,
            set_start_with_windows,
            update_tray_score,
            set_global_shortcut,
            runtime_info,
            take_open_requests,
            import_attachment,
            fetch_link_preview
        ])
        .setup(|app| {
            queue_open_requests(&app.state::<AppState>(), std::env::args().skip(1));
            if !portable_mode()
                && let Ok(executable) = std::env::current_exe()
                && let Err(error) = windows_integration::install_jump_list(&executable)
            {
                log::warn!("Unable to install taskbar jump list: {error}");
            }
            let show = MenuItemBuilder::with_id("show", "Show / Hide").build(app)?;
            let capture = MenuItemBuilder::with_id("capture", "Quick capture")
                .accelerator("Ctrl+Alt+Space")
                .build(app)?;
            let score = MenuItemBuilder::with_id("score", "Today: —")
                .enabled(false)
                .build(app)?;
            app.manage(TrayScoreItem(score.clone()));
            let quit = MenuItemBuilder::with_id("quit", "Quit Diorna").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show, &capture, &score, &quit])
                .build()?;
            TrayIconBuilder::new()
                .tooltip("Diorna")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                show_main(app);
                            }
                        }
                    }
                    "capture" => show_quick_capture(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            if let Err(error) = app.global_shortcut().register("Ctrl+Alt+Space") {
                log::warn!("Global quick-capture shortcut unavailable: {error}");
            } else {
                *app.state::<RegisteredShortcut>().0.write() = "Ctrl+Alt+Space".into();
            }
            if let Some(window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                window.on_window_event({
                    let window = window.clone();
                    move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            if app_handle
                                .state::<CloseBehavior>()
                                .0
                                .load(Ordering::Relaxed)
                            {
                                api.prevent_close();
                                let _ = window.hide();
                            } else {
                                app_handle.exit(0);
                            }
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Diorna");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attachment_names_are_safe_and_non_destructive() {
        assert_eq!(
            safe_attachment_name("..\\screen:shot?.png"),
            "screen_shot_.png"
        );
        let directory = tempfile::tempdir().unwrap();
        std::fs::write(directory.path().join("image.png"), b"existing").unwrap();
        assert_eq!(
            available_attachment_path(directory.path(), "image.png")
                .file_name()
                .unwrap(),
            "image-2.png"
        );
    }

    #[test]
    fn queues_only_supported_file_open_requests_and_shell_tasks() {
        let directory = tempfile::tempdir().unwrap();
        let note = directory.path().join("Résumé.md");
        std::fs::write(&note, "# Résumé").unwrap();
        let state = AppState::default();
        queue_open_requests(
            &state,
            [
                note.to_string_lossy().into_owned(),
                "--new-note".into(),
                "ignored.txt".into(),
            ],
        );
        let requests = state.open_requests.read();
        assert_eq!(requests.len(), 2);
        assert!(requests.iter().any(|request| request == "--new-note"));
    }
}
