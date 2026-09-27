//! System tray. Labels are localized from the frontend via `tray_set_language`
//! so the tray never drifts from the UI language.

use crate::AppState;
use serde::Deserialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime};

#[derive(Debug, Clone, Deserialize)]
pub struct TrayLabels {
    pub show: String,
    pub companion: String,
    pub expanded: String,
    pub emergency_stop: String,
    pub quit: String,
}

impl Default for TrayLabels {
    fn default() -> Self {
        TrayLabels {
            show: "Show HERMES".into(),
            companion: "Companion mode".into(),
            expanded: "Expanded mode".into(),
            emergency_stop: "Emergency stop".into(),
            quit: "Quit".into(),
        }
    }
}

pub fn build<R: Runtime>(app: &AppHandle<R>, labels: &TrayLabels) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", &labels.show, true, None::<&str>)?;
    let companion = MenuItem::with_id(app, "companion", &labels.companion, true, None::<&str>)?;
    let expanded = MenuItem::with_id(app, "expanded", &labels.expanded, true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "emergency-stop", &labels.emergency_stop, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", &labels.quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &companion, &expanded, &stop, &quit])?;

    TrayIconBuilder::with_id("hermes-tray")
        .icon(app.default_window_icon().cloned().expect("bundled icon"))
        .menu(&menu)
        .tooltip("HERMES")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "emergency-stop" => {
                // Engage natively first: the kill switch must not depend on
                // the webview being responsive.
                if let Some(state) = app.try_state::<AppState>() {
                    state.emergency_stop.trigger();
                }
                let _ = app.emit("tray://action", "emergency-stop");
            }
            id @ ("show" | "companion" | "expanded") => {
                let label = if id == "expanded" { "expanded" } else { "companion" };
                if let Some(window) = app.get_webview_window(label) {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                let _ = app.emit("tray://action", id);
            }
            _ => {}
        })
        .build(app)?;
    Ok(())
}
