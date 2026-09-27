//! Native-side permission re-check.
//!
//! The TypeScript permission engine is the *policy* authority, but the Rust
//! core must never assume the webview is honest: a compromised renderer, an
//! XSS in a future plugin, or a bug could all produce an `execute_tool` call
//! that policy never approved. So the native side independently re-checks:
//!
//!   1. the tool exists and maps to a known capability,
//!   2. the current permission level allows that capability,
//!   3. filesystem arguments are inside a configured scope,
//!   4. emergency stop is not engaged.
//!
//! This is defence in depth, not duplication of the UX: risk escalation and
//! user confirmation stay in TypeScript, where the UI lives.

use serde::{Deserialize, Serialize};
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Level {
    Observe,
    Assist,
    Autonomous,
}

impl Default for Level {
    fn default() -> Self {
        Level::Observe
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Capability {
    Observe,
    Input,
    FsRead,
    FsWrite,
    FsDelete,
    Process,
    Shell,
}

impl Level {
    pub fn allows(self, capability: Capability) -> bool {
        match self {
            Level::Observe => matches!(capability, Capability::Observe | Capability::FsRead),
            Level::Assist | Level::Autonomous => true,
        }
    }
}

/// Single source of truth for tool -> capability on the native side.
/// Must stay in sync with packages/agent-protocol/src/tools.ts; the parity is
/// asserted by tests/native_tool_parity.test.ts.
pub fn capability_of(tool: &str) -> Option<Capability> {
    Some(match tool {
        "computer.screenshot" => Capability::Observe,
        "computer.mouse_move"
        | "computer.mouse_click"
        | "computer.mouse_scroll"
        | "computer.keyboard_type"
        | "computer.keyboard_press"
        | "computer.hotkey" => Capability::Input,
        "filesystem.list" | "filesystem.read" => Capability::FsRead,
        "filesystem.write" | "filesystem.copy" | "filesystem.move" => Capability::FsWrite,
        "filesystem.delete" => Capability::FsDelete,
        "applications.open" | "applications.close" | "applications.focus" => Capability::Process,
        "applications.list_windows" => Capability::Observe,
        "shell.cmd" | "shell.powershell" => Capability::Shell,
        "system.info" | "system.processes" => Capability::Observe,
        _ => return None,
    })
}

#[derive(Debug, thiserror::Error)]
pub enum PermissionError {
    #[error("unknown tool: {0}")]
    UnknownTool(String),
    #[error("permission level forbids this capability")]
    LevelForbids,
    #[error("path is outside every allowed filesystem scope: {0}")]
    OutsideScope(String),
    #[error("emergency stop is engaged")]
    EmergencyStop,
    #[error("path could not be resolved: {0}")]
    BadPath(String),
}

#[derive(Debug, Clone, Default)]
pub struct NativePolicy {
    pub level: Level,
    pub filesystem_scopes: Vec<PathBuf>,
    pub denylist: Vec<String>,
}

impl NativePolicy {
    pub fn check(
        &self,
        tool: &str,
        paths: &[&str],
        emergency_stop: bool,
    ) -> Result<(), PermissionError> {
        if emergency_stop {
            return Err(PermissionError::EmergencyStop);
        }
        if self.denylist.iter().any(|d| d == tool) {
            return Err(PermissionError::LevelForbids);
        }
        let capability =
            capability_of(tool).ok_or_else(|| PermissionError::UnknownTool(tool.to_string()))?;
        if !self.level.allows(capability) {
            return Err(PermissionError::LevelForbids);
        }
        for path in paths {
            if !self.path_allowed(path) {
                return Err(PermissionError::OutsideScope((*path).to_string()));
            }
        }
        Ok(())
    }

    fn path_allowed(&self, candidate: &str) -> bool {
        let Some(normalised) = normalise(candidate) else {
            return false;
        };
        self.filesystem_scopes.iter().any(|scope| {
            normalise_path(scope)
                .map(|scope| normalised.starts_with(&scope))
                .unwrap_or(false)
        })
    }
}

/// Lexically normalise a path: resolve `.`/`..` and lower-case on Windows.
/// Deliberately does NOT touch the filesystem, so it cannot be raced, and it
/// rejects anything that escapes above the root.
pub fn normalise(input: &str) -> Option<PathBuf> {
    normalise_path(Path::new(input))
}

fn normalise_path(input: &Path) -> Option<PathBuf> {
    let mut out = PathBuf::new();
    for component in input.components() {
        match component {
            Component::ParentDir => {
                if !out.pop() {
                    return None;
                }
            }
            Component::CurDir => {}
            Component::Prefix(prefix) => {
                out.push(prefix.as_os_str().to_string_lossy().to_uppercase());
            }
            other => {
                let part = other.as_os_str().to_string_lossy();
                if cfg!(windows) {
                    out.push(part.to_lowercase());
                } else {
                    out.push(part.as_ref());
                }
            }
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn observe_cannot_type() {
        let policy = NativePolicy {
            level: Level::Observe,
            ..Default::default()
        };
        assert!(policy.check("computer.keyboard_type", &[], false).is_err());
        assert!(policy.check("computer.screenshot", &[], false).is_ok());
    }

    #[test]
    fn emergency_stop_blocks_everything() {
        let policy = NativePolicy {
            level: Level::Autonomous,
            ..Default::default()
        };
        assert!(policy.check("computer.screenshot", &[], true).is_err());
    }

    #[test]
    fn traversal_cannot_escape_scope() {
        let policy = NativePolicy {
            level: Level::Assist,
            filesystem_scopes: vec![PathBuf::from("/home/user/docs")],
            ..Default::default()
        };
        assert!(policy
            .check("filesystem.read", &["/home/user/docs/a.txt"], false)
            .is_ok());
        assert!(policy
            .check("filesystem.read", &["/home/user/docs/../../etc/passwd"], false)
            .is_err());
    }

    #[test]
    fn denylist_wins() {
        let policy = NativePolicy {
            level: Level::Autonomous,
            denylist: vec!["shell.powershell".into()],
            ..Default::default()
        };
        assert!(policy.check("shell.powershell", &[], false).is_err());
    }
}
