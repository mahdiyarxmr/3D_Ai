//! HERMES native core.
//!
//! Command surface exposed to the webview. Note what is NOT here: there is no
//! generic "run shell" or "write file" command. The only way to reach the OS
//! is `execute_tool`, which re-checks policy natively before dispatching.

pub mod auth;
pub mod emergency;
pub mod permissions;
pub mod shortcuts;
pub mod storage;
pub mod tools;
pub mod tray;

use emergency::EmergencyStop;
use parking_lot::RwLock;
use permissions::{Level, NativePolicy};
use serde_json::Value;
use std::path::PathBuf;
use std::sync::Arc;
use storage::{Store, StoreError};
use tauri::{Emitter, Manager};

pub struct AppState {
    pub store: Arc<Store>,
    pub emergency_stop: Arc<EmergencyStop>,
    pub policy: RwLock<NativePolicy>,
    pub session: auth::SessionSecret,
}

impl AppState {
    /// Mirror the persisted settings into the native policy cache so the two
    /// checks cannot drift apart.
    pub fn sync_policy_from_settings(&self, settings: &Value) {
        let agent = settings.get("agent");
        let level = agent
            .and_then(|a| a.get("permissionLevel"))
            .and_then(Value::as_str)
            .map(|l| match l {
                "ASSIST" => Level::Assist,
                "AUTONOMOUS" => Level::Autonomous,
                _ => Level::Observe,
            })
            .unwrap_or(Level::Observe);

        let scopes = agent
            .and_then(|a| a.get("filesystemScopes"))
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(|v| v.as_str().map(PathBuf::from))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let denylist = agent
            .and_then(|a| a.get("toolDenylist"))
            .and_then(Value::as_array)
            .map(|values| {
                values
                    .iter()
                    .filter_map(|v| v.as_str().map(str::to_string))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        *self.policy.write() = NativePolicy {
            level,
            filesystem_scopes: scopes,
            denylist,
        };
    }
}

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Tool(#[from] tools::ToolError),
    #[error("permission denied: {0}")]
    Permission(#[from] permissions::PermissionError),
}

impl serde::Serialize for CommandError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

type CmdResult<T> = Result<T, CommandError>;

/* ------------------------------ commands ------------------------------ */

#[tauri::command]
fn settings_load(state: tauri::State<'_, AppState>) -> CmdResult<Value> {
    let settings = state.store.load_settings()?;
    state.sync_policy_from_settings(&settings);
    Ok(settings)
}

#[tauri::command]
fn settings_save(state: tauri::State<'_, AppState>, settings: Value) -> CmdResult<()> {
    state.store.save_settings(&settings)?;
    state.sync_policy_from_settings(&settings);
    Ok(())
}

#[tauri::command]
fn characters_list(state: tauri::State<'_, AppState>) -> CmdResult<Vec<Value>> {
    Ok(state.store.list_characters()?)
}

#[tauri::command]
fn character_save(state: tauri::State<'_, AppState>, character: Value) -> CmdResult<()> {
    Ok(state.store.save_character(&character)?)
}

#[tauri::command]
fn character_delete(state: tauri::State<'_, AppState>, id: String) -> CmdResult<()> {
    Ok(state.store.delete_character(&id)?)
}

#[tauri::command]
fn character_save_vrm(state: tauri::State<'_, AppState>, id: String, bytes: Vec<u8>) -> CmdResult<String> {
    Ok(state.store.save_vrm(&id, &bytes)?)
}

#[tauri::command]
fn character_load_vrm(state: tauri::State<'_, AppState>, id: String) -> CmdResult<Option<Vec<u8>>> {
    Ok(state.store.load_vrm(&id)?)
}

#[tauri::command]
fn audit_append(state: tauri::State<'_, AppState>, record: Value) -> CmdResult<()> {
    Ok(state.store.audit_append(&record)?)
}

#[derive(serde::Deserialize, Default)]
pub struct AuditFilter {
    #[serde(default)]
    pub tool: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
}

#[tauri::command]
fn audit_query(state: tauri::State<'_, AppState>, filter: Option<AuditFilter>) -> CmdResult<Vec<Value>> {
    let filter = filter.unwrap_or_default();
    Ok(state
        .store
        .audit_query(filter.limit.unwrap_or(200).clamp(1, 5000), filter.tool.as_deref())?)
}

/// The single gateway to the operating system.
#[tauri::command]
async fn execute_tool(
    state: tauri::State<'_, AppState>,
    request: tools::ToolRequest,
) -> CmdResult<tools::ToolResponse> {
    // 1. Native re-check. The webview's approval is necessary, not sufficient.
    let paths = tools::path_args(&request.tool, &request.args);
    let path_refs: Vec<&str> = paths.iter().map(String::as_str).collect();
    state
        .policy
        .read()
        .check(&request.tool, &path_refs, state.emergency_stop.is_engaged())?;

    // 2. Dispatch on a blocking thread — input synthesis and capture are not
    //    async, and we must not stall the IPC runtime.
    let stop = state.emergency_stop.clone();
    let response = tauri::async_runtime::spawn_blocking(move || tools::execute(&request, &stop))
        .await
        .map_err(|e| CommandError::Tool(tools::ToolError::Failed(e.to_string())))??;
    Ok(response)
}

#[tauri::command]
fn emergency_stop(state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> CmdResult<()> {
    state.emergency_stop.trigger();
    let _ = app.emit("hermes://emergency-stop", true);
    Ok(())
}

#[tauri::command]
fn emergency_reset(state: tauri::State<'_, AppState>, app: tauri::AppHandle) -> CmdResult<()> {
    state.emergency_stop.reset();
    let _ = app.emit("hermes://emergency-stop", false);
    Ok(())
}

#[tauri::command]
fn tray_set_labels(app: tauri::AppHandle, labels: tray::TrayLabels) -> CmdResult<()> {
    // Rebuilding is cheaper and less error-prone than mutating menu items.
    let _ = tray::build(&app, &labels);
    Ok(())
}

/* ------------------------------- startup ------------------------------ */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let root = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let store = Arc::new(Store::open(&root)?);

            // Retention sweep on launch (docs/PRIVACY.md).
            let retain = store
                .load_settings()
                .ok()
                .and_then(|s| {
                    s.get("privacy")
                        .and_then(|p| p.get("retainAuditLogDays"))
                        .and_then(Value::as_i64)
                })
                .unwrap_or(90);
            let _ = store.audit_prune(retain);

            let session = auth::SessionSecret::generate();
            session.write_to(&root.join("settings").join("session.json"))?;

            let state = AppState {
                store: store.clone(),
                emergency_stop: EmergencyStop::new(),
                policy: RwLock::new(NativePolicy::default()),
                session,
            };
            if let Ok(settings) = store.load_settings() {
                state.sync_policy_from_settings(&settings);
            }
            app.manage(state);

            tray::build(app.handle(), &tray::TrayLabels::default())?;
            if let Err(error) = shortcuts::register(app.handle()) {
                // A taken shortcut must not prevent startup; the in-app button
                // and the tray entry still work.
                eprintln!("could not register the global emergency stop: {error}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Closing hides to tray rather than quitting.
                if window.label() == "expanded" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            settings_load,
            settings_save,
            characters_list,
            character_save,
            character_delete,
            character_save_vrm,
            character_load_vrm,
            audit_append,
            audit_query,
            execute_tool,
            emergency_stop,
            emergency_reset,
            tray_set_labels,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HERMES");
}
