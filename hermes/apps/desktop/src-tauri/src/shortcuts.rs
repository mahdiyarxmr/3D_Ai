//! OS-wide emergency stop shortcut: Ctrl+Alt+Esc.
//!
//! Registered globally so the user can halt the agent even when HERMES has no
//! focus — which is exactly the situation where a misbehaving agent is typing
//! into someone else's window.

use crate::AppState;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

pub const EMERGENCY_STOP: &str = "Ctrl+Alt+Escape";

pub fn register<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Escape);
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, triggered, event| {
                if triggered == &shortcut && event.state() == ShortcutState::Pressed {
                    if let Some(state) = app.try_state::<AppState>() {
                        state.emergency_stop.trigger();
                    }
                    let _ = app.emit("tray://action", "emergency-stop");
                }
            })
            .build(),
    )?;
    app.global_shortcut().register(shortcut)?;
    Ok(())
}
