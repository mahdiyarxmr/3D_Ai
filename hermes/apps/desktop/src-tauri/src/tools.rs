//! Native tool executors.
//!
//! Reached only via the audited `execute_tool` command in lib.rs, which
//! re-checks policy first (see permissions.rs). Every executor is expected to
//! be cancellable: long operations poll the emergency stop generation.

use crate::emergency::EmergencyStop;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

#[derive(Debug, Deserialize)]
pub struct ToolRequest {
    pub tool: String,
    #[serde(default)]
    pub args: Value,
}

#[derive(Debug, Serialize)]
pub struct ToolResponse {
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Debug, thiserror::Error)]
pub enum ToolError {
    #[error("unknown tool: {0}")]
    Unknown(String),
    #[error("missing or invalid argument: {0}")]
    BadArgument(&'static str),
    #[error("cancelled by emergency stop")]
    Cancelled,
    #[error("timed out after {0:?}")]
    Timeout(Duration),
    #[error("{0}")]
    Failed(String),
}

impl serde::Serialize for ToolError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

type Result<T> = std::result::Result<T, ToolError>;

/// Collect filesystem-bearing arguments so the policy layer can scope-check
/// them before we ever reach an executor.
pub fn path_args(tool: &str, args: &Value) -> Vec<String> {
    let get = |key: &str| args.get(key).and_then(Value::as_str).map(str::to_string);
    match tool {
        "filesystem.list" | "filesystem.read" | "filesystem.write" | "filesystem.delete" => {
            get("path").into_iter().collect()
        }
        "filesystem.copy" | "filesystem.move" => {
            get("from").into_iter().chain(get("to")).collect()
        }
        _ => Vec::new(),
    }
}

pub fn execute(request: &ToolRequest, stop: &Arc<EmergencyStop>) -> Result<ToolResponse> {
    if stop.is_engaged() {
        return Err(ToolError::Cancelled);
    }
    let args = &request.args;
    match request.tool.as_str() {
        "computer.screenshot" => screenshot(args),
        "computer.mouse_move" => mouse_move(args),
        "computer.mouse_click" => mouse_click(args),
        "computer.mouse_scroll" => mouse_scroll(args),
        "computer.keyboard_type" => keyboard_type(args, stop),
        "computer.keyboard_press" => keyboard_press(args),
        "computer.hotkey" => hotkey(args),
        "filesystem.list" => fs_list(args),
        "filesystem.read" => fs_read(args),
        "filesystem.write" => fs_write(args),
        "filesystem.copy" => fs_copy(args),
        "filesystem.move" => fs_move(args),
        "filesystem.delete" => fs_delete(args),
        "applications.open" => app_open(args),
        "applications.list_windows" => list_windows(),
        "applications.close" | "applications.focus" => Err(ToolError::Failed(
            "window management is not implemented yet (see docs/TASKS.md)".into(),
        )),
        "shell.cmd" => shell(args, ShellKind::Cmd, stop),
        "shell.powershell" => shell(args, ShellKind::PowerShell, stop),
        "system.info" => system_info(),
        "system.processes" => system_processes(args),
        other => Err(ToolError::Unknown(other.to_string())),
    }
}

/* ----------------------------- observation ----------------------------- */

fn screenshot(args: &Value) -> Result<ToolResponse> {
    let index = args.get("display").and_then(Value::as_u64).unwrap_or(0) as usize;
    let monitors = xcap::Monitor::all().map_err(|e| ToolError::Failed(e.to_string()))?;
    let monitor = monitors
        .get(index)
        .ok_or(ToolError::BadArgument("display out of range"))?;
    let image = monitor
        .capture_image()
        .map_err(|e| ToolError::Failed(e.to_string()))?;
    let (width, height) = (image.width(), image.height());

    let mut png = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| ToolError::Failed(e.to_string()))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(png.into_inner());

    Ok(ToolResponse {
        summary: format!("captured display {index} at {width}x{height}"),
        // The agent receives a reference, not the pixels — the vision service
        // fetches the bytes only if the privacy settings allow it.
        data: Some(json!({ "width": width, "height": height, "png_base64": encoded })),
    })
}

fn system_info() -> Result<ToolResponse> {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();
    let cores = sys.cpus().len();
    let total_gb = sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
    let os = sysinfo::System::long_os_version().unwrap_or_else(|| "unknown".into());
    Ok(ToolResponse {
        summary: format!("{os} · {cores} logical cores · {total_gb:.0} GB RAM"),
        data: Some(json!({ "os": os, "cores": cores, "memoryGb": total_gb.round() })),
    })
}

fn system_processes(args: &Value) -> Result<ToolResponse> {
    let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(100) as usize;
    let mut sys = sysinfo::System::new_all();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let mut processes: Vec<_> = sys
        .processes()
        .iter()
        .map(|(pid, process)| {
            json!({
                "pid": pid.as_u32(),
                "name": process.name().to_string_lossy(),
                "memoryMb": process.memory() / 1024 / 1024,
            })
        })
        .collect();
    processes.truncate(limit);
    Ok(ToolResponse {
        summary: format!("{} processes", processes.len()),
        data: Some(json!({ "processes": processes })),
    })
}

#[cfg(windows)]
fn list_windows() -> Result<ToolResponse> {
    use windows::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW, IsWindowVisible,
    };

    struct Collector(Vec<Value>);

    unsafe extern "system" fn callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let collector = &mut *(lparam.0 as *mut Collector);
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }
        let length = GetWindowTextLengthW(hwnd);
        if length == 0 {
            return BOOL(1);
        }
        let mut buffer = vec![0u16; length as usize + 1];
        let written = GetWindowTextW(hwnd, &mut buffer);
        let title = String::from_utf16_lossy(&buffer[..written as usize]);
        collector.0.push(json!({ "id": format!("{:?}", hwnd.0), "title": title }));
        BOOL(1)
    }

    let mut collector = Collector(Vec::new());
    unsafe {
        let _ = EnumWindows(
            Some(callback),
            LPARAM(&mut collector as *mut Collector as isize),
        );
    }
    Ok(ToolResponse {
        summary: format!("{} open windows", collector.0.len()),
        data: Some(json!({ "windows": collector.0 })),
    })
}

#[cfg(not(windows))]
fn list_windows() -> Result<ToolResponse> {
    Err(ToolError::Failed(
        "window enumeration is implemented for Windows only".into(),
    ))
}

/* -------------------------------- input -------------------------------- */

fn enigo() -> Result<enigo::Enigo> {
    enigo::Enigo::new(&enigo::Settings::default()).map_err(|e| ToolError::Failed(e.to_string()))
}

fn mouse_move(args: &Value) -> Result<ToolResponse> {
    use enigo::Mouse;
    let x = args.get("x").and_then(Value::as_i64).ok_or(ToolError::BadArgument("x"))? as i32;
    let y = args.get("y").and_then(Value::as_i64).ok_or(ToolError::BadArgument("y"))? as i32;
    enigo()?
        .move_mouse(x, y, enigo::Coordinate::Abs)
        .map_err(|e| ToolError::Failed(e.to_string()))?;
    Ok(ToolResponse {
        summary: format!("moved the cursor to {x},{y}"),
        data: None,
    })
}

fn mouse_click(args: &Value) -> Result<ToolResponse> {
    use enigo::{Button, Direction, Mouse};
    let mut device = enigo()?;
    if let (Some(x), Some(y)) = (
        args.get("x").and_then(Value::as_i64),
        args.get("y").and_then(Value::as_i64),
    ) {
        device
            .move_mouse(x as i32, y as i32, enigo::Coordinate::Abs)
            .map_err(|e| ToolError::Failed(e.to_string()))?;
    }
    let button = match args.get("button").and_then(Value::as_str).unwrap_or("left") {
        "right" => Button::Right,
        "middle" => Button::Middle,
        _ => Button::Left,
    };
    let clicks = args.get("clicks").and_then(Value::as_u64).unwrap_or(1).min(3);
    for _ in 0..clicks {
        device
            .button(button, Direction::Click)
            .map_err(|e| ToolError::Failed(e.to_string()))?;
        std::thread::sleep(Duration::from_millis(40));
    }
    Ok(ToolResponse {
        summary: format!("clicked {clicks}×"),
        data: None,
    })
}

fn mouse_scroll(args: &Value) -> Result<ToolResponse> {
    use enigo::{Axis, Mouse};
    let dx = args.get("dx").and_then(Value::as_i64).unwrap_or(0) as i32;
    let dy = args.get("dy").and_then(Value::as_i64).unwrap_or(0) as i32;
    let mut device = enigo()?;
    if dx != 0 {
        device.scroll(dx, Axis::Horizontal).map_err(|e| ToolError::Failed(e.to_string()))?;
    }
    if dy != 0 {
        device.scroll(dy, Axis::Vertical).map_err(|e| ToolError::Failed(e.to_string()))?;
    }
    Ok(ToolResponse {
        summary: format!("scrolled {dx},{dy}"),
        data: None,
    })
}

fn keyboard_type(args: &Value, stop: &Arc<EmergencyStop>) -> Result<ToolResponse> {
    use enigo::Keyboard;
    let text = args
        .get("text")
        .and_then(Value::as_str)
        .ok_or(ToolError::BadArgument("text"))?;
    let delay = args.get("delayMs").and_then(Value::as_u64).unwrap_or(8);
    let mut device = enigo()?;
    // Typed in chunks so an emergency stop interrupts mid-string rather than
    // after the whole payload has been delivered.
    for chunk in text.chars().collect::<Vec<_>>().chunks(16) {
        if stop.is_engaged() {
            return Err(ToolError::Cancelled);
        }
        let piece: String = chunk.iter().collect();
        device.text(&piece).map_err(|e| ToolError::Failed(e.to_string()))?;
        std::thread::sleep(Duration::from_millis(delay));
    }
    Ok(ToolResponse {
        summary: format!("typed {} characters", text.chars().count()),
        data: None,
    })
}

fn keyboard_press(args: &Value) -> Result<ToolResponse> {
    use enigo::{Direction, Keyboard};
    let name = args
        .get("key")
        .and_then(Value::as_str)
        .ok_or(ToolError::BadArgument("key"))?;
    let key = parse_key(name).ok_or(ToolError::BadArgument("key"))?;
    enigo()?
        .key(key, Direction::Click)
        .map_err(|e| ToolError::Failed(e.to_string()))?;
    Ok(ToolResponse {
        summary: format!("pressed {name}"),
        data: None,
    })
}

fn hotkey(args: &Value) -> Result<ToolResponse> {
    use enigo::{Direction, Keyboard};
    let keys: Vec<String> = args
        .get("keys")
        .and_then(Value::as_array)
        .ok_or(ToolError::BadArgument("keys"))?
        .iter()
        .filter_map(|v| v.as_str().map(str::to_string))
        .collect();
    let parsed: Vec<_> = keys
        .iter()
        .map(|k| parse_key(k).ok_or(ToolError::BadArgument("keys")))
        .collect::<Result<Vec<_>>>()?;

    let mut device = enigo()?;
    for key in &parsed {
        device.key(*key, Direction::Press).map_err(|e| ToolError::Failed(e.to_string()))?;
    }
    for key in parsed.iter().rev() {
        device.key(*key, Direction::Release).map_err(|e| ToolError::Failed(e.to_string()))?;
    }
    Ok(ToolResponse {
        summary: format!("pressed {}", keys.join("+")),
        data: None,
    })
}

fn parse_key(name: &str) -> Option<enigo::Key> {
    use enigo::Key;
    let lower = name.to_lowercase();
    Some(match lower.as_str() {
        "enter" | "return" => Key::Return,
        "tab" => Key::Tab,
        "escape" | "esc" => Key::Escape,
        "space" => Key::Space,
        "backspace" => Key::Backspace,
        "delete" | "del" => Key::Delete,
        "up" => Key::UpArrow,
        "down" => Key::DownArrow,
        "left" => Key::LeftArrow,
        "right" => Key::RightArrow,
        "home" => Key::Home,
        "end" => Key::End,
        "pageup" => Key::PageUp,
        "pagedown" => Key::PageDown,
        "ctrl" | "control" => Key::Control,
        "alt" => Key::Alt,
        "shift" => Key::Shift,
        "win" | "meta" | "super" => Key::Meta,
        "f1" => Key::F1,
        "f2" => Key::F2,
        "f3" => Key::F3,
        "f4" => Key::F4,
        "f5" => Key::F5,
        "f6" => Key::F6,
        "f7" => Key::F7,
        "f8" => Key::F8,
        "f9" => Key::F9,
        "f10" => Key::F10,
        "f11" => Key::F11,
        "f12" => Key::F12,
        other => {
            // Anything else must be a single printable character.
            let mut chars = other.chars();
            let first = chars.next()?;
            if chars.next().is_some() {
                return None;
            }
            Key::Unicode(first)
        }
    })
}

/* ----------------------------- filesystem ------------------------------ */

fn arg_path(args: &Value, key: &'static str) -> Result<PathBuf> {
    args.get(key)
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .ok_or(ToolError::BadArgument(key))
}

fn fs_list(args: &Value) -> Result<ToolResponse> {
    let path = arg_path(args, "path")?;
    let max = args.get("maxEntries").and_then(Value::as_u64).unwrap_or(200) as usize;
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(&path).map_err(|e| ToolError::Failed(e.to_string()))? {
        let entry = entry.map_err(|e| ToolError::Failed(e.to_string()))?;
        let metadata = entry.metadata().ok();
        entries.push(json!({
            "name": entry.file_name().to_string_lossy(),
            "kind": if metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false) { "dir" } else { "file" },
            "size": metadata.as_ref().map(|m| m.len()).unwrap_or(0),
        }));
        if entries.len() >= max {
            break;
        }
    }
    Ok(ToolResponse {
        summary: format!("{} entries in {}", entries.len(), path.display()),
        data: Some(json!({ "entries": entries })),
    })
}

fn fs_read(args: &Value) -> Result<ToolResponse> {
    let path = arg_path(args, "path")?;
    let max = args.get("maxBytes").and_then(Value::as_u64).unwrap_or(200_000) as usize;
    let bytes = std::fs::read(&path).map_err(|e| ToolError::Failed(e.to_string()))?;
    let truncated = bytes.len() > max;
    let content = String::from_utf8_lossy(&bytes[..bytes.len().min(max)]).to_string();
    Ok(ToolResponse {
        summary: format!("read {} bytes from {}", content.len(), path.display()),
        data: Some(json!({ "content": content, "truncated": truncated })),
    })
}

fn fs_write(args: &Value) -> Result<ToolResponse> {
    let path = arg_path(args, "path")?;
    let content = args
        .get("content")
        .and_then(Value::as_str)
        .ok_or(ToolError::BadArgument("content"))?;
    if args.get("createDirs").and_then(Value::as_bool).unwrap_or(false) {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| ToolError::Failed(e.to_string()))?;
        }
    }
    std::fs::write(&path, content).map_err(|e| ToolError::Failed(e.to_string()))?;
    Ok(ToolResponse {
        summary: format!("wrote {} bytes to {}", content.len(), path.display()),
        data: None,
    })
}

fn fs_copy(args: &Value) -> Result<ToolResponse> {
    let from = arg_path(args, "from")?;
    let to = arg_path(args, "to")?;
    if to.exists() && !args.get("overwrite").and_then(Value::as_bool).unwrap_or(false) {
        return Err(ToolError::Failed("destination exists and overwrite is false".into()));
    }
    std::fs::copy(&from, &to).map_err(|e| ToolError::Failed(e.to_string()))?;
    Ok(ToolResponse {
        summary: format!("copied {} to {}", from.display(), to.display()),
        data: None,
    })
}

fn fs_move(args: &Value) -> Result<ToolResponse> {
    let from = arg_path(args, "from")?;
    let to = arg_path(args, "to")?;
    if to.exists() && !args.get("overwrite").and_then(Value::as_bool).unwrap_or(false) {
        return Err(ToolError::Failed("destination exists and overwrite is false".into()));
    }
    std::fs::rename(&from, &to).map_err(|e| ToolError::Failed(e.to_string()))?;
    Ok(ToolResponse {
        summary: format!("moved {} to {}", from.display(), to.display()),
        data: None,
    })
}

fn fs_delete(args: &Value) -> Result<ToolResponse> {
    let path = arg_path(args, "path")?;
    let recursive = args.get("recursive").and_then(Value::as_bool).unwrap_or(false);
    let metadata = std::fs::metadata(&path).map_err(|e| ToolError::Failed(e.to_string()))?;
    if metadata.is_dir() {
        if recursive {
            std::fs::remove_dir_all(&path).map_err(|e| ToolError::Failed(e.to_string()))?;
        } else {
            std::fs::remove_dir(&path).map_err(|e| ToolError::Failed(e.to_string()))?;
        }
    } else {
        std::fs::remove_file(&path).map_err(|e| ToolError::Failed(e.to_string()))?;
    }
    Ok(ToolResponse {
        summary: format!("deleted {}", path.display()),
        data: None,
    })
}

/* ----------------------------- applications ---------------------------- */

fn app_open(args: &Value) -> Result<ToolResponse> {
    let target = args
        .get("target")
        .and_then(Value::as_str)
        .ok_or(ToolError::BadArgument("target"))?;
    let extra: Vec<String> = args
        .get("args")
        .and_then(Value::as_array)
        .map(|values| values.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    // Spawned directly — never through a shell — so arguments cannot be
    // reinterpreted as additional commands.
    let child = std::process::Command::new(target)
        .args(&extra)
        .spawn()
        .map_err(|e| ToolError::Failed(e.to_string()))?;
    Ok(ToolResponse {
        summary: format!("launched {target} (pid {})", child.id()),
        data: Some(json!({ "pid": child.id() })),
    })
}

/* -------------------------------- shell -------------------------------- */

enum ShellKind {
    Cmd,
    PowerShell,
}

fn shell(args: &Value, kind: ShellKind, stop: &Arc<EmergencyStop>) -> Result<ToolResponse> {
    let (key, program, prefix): (&str, &str, Vec<&str>) = match kind {
        ShellKind::Cmd => ("command", "cmd.exe", vec!["/C"]),
        ShellKind::PowerShell => (
            "script",
            "powershell.exe",
            // -NoProfile so user profile scripts cannot alter behaviour.
            vec!["-NoProfile", "-NonInteractive", "-Command"],
        ),
    };
    let script = args
        .get(key)
        .and_then(Value::as_str)
        .ok_or(ToolError::BadArgument("command"))?;
    let timeout = Duration::from_millis(args.get("timeoutMs").and_then(Value::as_u64).unwrap_or(30_000));

    let mut command = std::process::Command::new(program);
    command.args(&prefix).arg(script);
    if let Some(cwd) = args.get("cwd").and_then(Value::as_str) {
        command.current_dir(cwd);
    }
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let mut child = command.spawn().map_err(|e| ToolError::Failed(e.to_string()))?;
    let pid = child.id();
    stop.register_child(pid);

    let deadline = std::time::Instant::now() + timeout;
    loop {
        if stop.is_engaged() {
            let _ = child.kill();
            stop.unregister_child(pid);
            return Err(ToolError::Cancelled);
        }
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) => {
                if std::time::Instant::now() > deadline {
                    let _ = child.kill();
                    stop.unregister_child(pid);
                    return Err(ToolError::Timeout(timeout));
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => {
                stop.unregister_child(pid);
                return Err(ToolError::Failed(e.to_string()));
            }
        }
    }

    stop.unregister_child(pid);
    let output = child
        .wait_with_output()
        .map_err(|e| ToolError::Failed(e.to_string()))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let code = output.status.code().unwrap_or(-1);

    Ok(ToolResponse {
        summary: format!("exit {code}, {} bytes stdout", stdout.len()),
        data: Some(json!({ "stdout": truncate(&stdout, 20_000), "stderr": truncate(&stderr, 8_000), "exitCode": code })),
    })
}

fn truncate(input: &str, max: usize) -> String {
    if input.len() <= max {
        input.to_string()
    } else {
        format!("{}…[truncated]", &input[..max])
    }
}
