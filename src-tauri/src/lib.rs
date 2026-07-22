mod error;
mod lifecycle;
mod secrets;
mod spreadsheet;
mod storage;
mod structured;

use std::{path::PathBuf, sync::Arc};

use parking_lot::RwLock;
use serde::Serialize;
use storage::{DiskContent, SaveNoteInput, SavedFile, SearchHit, Vault, WorkspaceRecord};
use tauri::{
    AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::error::{DiornaError, Result};
use crate::lifecycle::{ImportReport, TrashRecord};

#[derive(Clone, Default)]
struct AppState {
    vault: Arc<RwLock<Option<Vault>>>,
}

impl AppState {
    fn get_vault(&self) -> Result<Vault> {
        self.vault
            .read()
            .clone()
            .ok_or(DiornaError::VaultNotInitialised)
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultStatus {
    path: String,
    workspaces: Vec<WorkspaceRecord>,
    rebuilt_files: u64,
}

#[tauri::command]
async fn initialise_vault(path: String, state: State<'_, AppState>) -> Result<VaultStatus> {
    let root = PathBuf::from(path);
    let database_existed = root.join(".app").join("index.db").exists();
    let vault = Vault::open(root.clone()).await?;
    let rebuilt_files = if database_existed {
        0
    } else {
        vault.rebuild_file_index().await?
    };
    let workspaces = vault.workspaces().await?;
    *state.vault.write() = Some(vault);
    Ok(VaultStatus {
        path: root.to_string_lossy().into_owned(),
        workspaces,
        rebuilt_files,
    })
}

#[tauri::command]
async fn initialise_default_vault(state: State<'_, AppState>) -> Result<VaultStatus> {
    let profile = std::env::var_os("USERPROFILE")
        .ok_or_else(|| DiornaError::InvalidData("USERPROFILE is unavailable".into()))?;
    let root = PathBuf::from(profile).join("Documents").join("Diorna");
    let database_existed = root.join(".app").join("index.db").exists();
    let vault = Vault::open(root.clone()).await?;
    let rebuilt_files = if database_existed {
        0
    } else {
        vault.rebuild_file_index().await?
    };
    let workspaces = vault.workspaces().await?;
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
async fn save_note(input: SaveNoteInput, state: State<'_, AppState>) -> Result<SavedFile> {
    state.get_vault()?.save_note(input).await
}

#[tauri::command]
async fn save_canvas(
    map_id: Option<String>,
    workspace_id: String,
    relative_path: String,
    canvas_json: String,
    state: State<'_, AppState>,
) -> Result<SavedFile> {
    state
        .get_vault()?
        .save_canvas(
            map_id.as_deref(),
            &workspace_id,
            &relative_path,
            &canvas_json,
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
async fn create_backup(destination: String, state: State<'_, AppState>) -> Result<String> {
    let path = state.get_vault()?.backup(&PathBuf::from(destination))?;
    Ok(path.to_string_lossy().into_owned())
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
fn export_xlsx(path: String, sheets: Vec<spreadsheet::SheetInput>) -> Result<()> {
    spreadsheet::export_xlsx(&PathBuf::from(path), sheets)
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
    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app)
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .max_file_size(10_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed
                        && shortcut.matches(
                            tauri_plugin_global_shortcut::Modifiers::CONTROL
                                | tauri_plugin_global_shortcut::Modifiers::ALT,
                            tauri_plugin_global_shortcut::Code::Space,
                        )
                    {
                        show_quick_capture(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            initialise_vault,
            initialise_default_vault,
            list_workspaces,
            save_note,
            save_canvas,
            search_notes,
            rebuild_index,
            read_settings,
            write_settings,
            create_backup,
            import_obsidian,
            import_notion,
            undo_import,
            trash_file,
            restore_trash,
            export_vault,
            protect_api_key,
            reveal_api_key,
            store_api_key,
            load_api_key,
            export_xlsx,
            persist_structured_state,
            load_structured_state,
            load_file_content
        ])
        .setup(|app| {
            let show = MenuItemBuilder::with_id("show", "Show / Hide").build(app)?;
            let capture = MenuItemBuilder::with_id("capture", "Quick capture")
                .accelerator("Ctrl+Alt+Space")
                .build(app)?;
            let score = MenuItemBuilder::with_id("score", "Today: —")
                .enabled(false)
                .build(app)?;
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
            }
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event({
                    let window = window.clone();
                    move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = window.hide();
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Diorna");
}
