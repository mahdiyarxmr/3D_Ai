//! Global emergency stop.
//!
//! Holds a process-wide flag plus a generation counter. Long-running tool
//! implementations poll `is_engaged()`; spawned child processes are killed by
//! the registry below so a runaway PowerShell script dies immediately rather
//! than finishing in the background.

use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Default)]
pub struct EmergencyStop {
    engaged: AtomicBool,
    generation: AtomicU64,
    children: Mutex<Vec<u32>>,
}

impl EmergencyStop {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn is_engaged(&self) -> bool {
        self.engaged.load(Ordering::SeqCst)
    }

    pub fn generation(&self) -> u64 {
        self.generation.load(Ordering::SeqCst)
    }

    /// Engage the stop and kill everything HERMES spawned.
    pub fn trigger(&self) {
        self.engaged.store(true, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);
        let pids: Vec<u32> = self.children.lock().drain(..).collect();
        for pid in pids {
            kill_process(pid);
        }
    }

    pub fn reset(&self) {
        self.engaged.store(false, Ordering::SeqCst);
    }

    pub fn register_child(&self, pid: u32) {
        self.children.lock().push(pid);
    }

    pub fn unregister_child(&self, pid: u32) {
        self.children.lock().retain(|p| *p != pid);
    }
}

#[cfg(windows)]
fn kill_process(pid: u32) {
    use std::process::Command;
    // /T also kills the process tree, which matters for cmd.exe wrappers.
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .output();
}

#[cfg(not(windows))]
fn kill_process(pid: u32) {
    use std::process::Command;
    let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
}
