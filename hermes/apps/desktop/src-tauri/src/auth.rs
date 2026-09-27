//! Local API / IPC session secret.
//!
//! Generated fresh on every launch, stored owner-readable only, and used to
//! HMAC-sign requests to the Python sidecar services. See
//! packages/agent-protocol/src/auth.ts for the verifying side and
//! docs/SECURITY.md for the threat model.

use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::Sha256;
use std::fs;
use std::io;
use std::path::Path;

type HmacSha256 = Hmac<Sha256>;

pub struct SessionSecret(String);

impl SessionSecret {
    pub fn generate() -> Self {
        let mut bytes = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut bytes);
        SessionSecret(hex::encode(bytes))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Persist for sidecar services to read. Never logged, never in settings.
    pub fn write_to(&self, path: &Path) -> io::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, format!("{{\"secret\":\"{}\"}}", self.0))?;
        restrict_permissions(path)
    }

    pub fn sign(&self, message: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(self.0.as_bytes()).expect("HMAC accepts any key length");
        mac.update(message.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }
}

impl std::fmt::Debug for SessionSecret {
    // Guarantees the secret cannot be accidentally logged via {:?}.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SessionSecret(<redacted>)")
    }
}

#[cfg(unix)]
fn restrict_permissions(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
}

#[cfg(windows)]
fn restrict_permissions(path: &Path) -> io::Result<()> {
    // TODO: tighten the DACL to the current user only via the windows crate.
    // The file already lives under %APPDATA%, which is per-user, so this is a
    // hardening improvement rather than the primary control.
    let mut perms = fs::metadata(path)?.permissions();
    perms.set_readonly(false);
    fs::set_permissions(path, perms)
}
