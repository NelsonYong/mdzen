// Sidecar = a child Node process running ONLY @seren/pet (no markdown reader).
// The desktop product is the companion alone — mdzen is fully decoupled.
//
// We spawn `packages/desktop/host/server.ts`, parse its stdout to learn which
// port it bound, then have the Tauri webview navigate to http://127.0.0.1:PORT/.
//
// In dev: `node --experimental-strip-types <workspace>/packages/desktop/host/server.ts`.
// The Node runtime is the user's system Node (>=22.6 required by @seren/pet).
//
// In bundled production builds: this approach won't work as-is — the bundled
// .app doesn't include the workspace source. M3.2 will ship `dist/` + a Node
// binary as resources. For now we detect that case and fail loudly.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::thread;

pub struct Sidecar {
    pub child: Child,
}

pub struct Spawned {
    pub sidecar: Sidecar,
    pub port_rx: Receiver<u16>,
}

pub fn spawn_pet_host(workspace: &Path) -> std::io::Result<Spawned> {
    let entry = workspace.join("packages/desktop/host/server.ts");
    if !entry.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!(
                "pet host entry not found at {:?} — bundled production runs aren't supported yet",
                entry
            ),
        ));
    }

    let mut cmd = Command::new("node");
    cmd.arg("--experimental-strip-types")
        .arg(&entry)
        // Working dir doesn't materially affect the host (paths are resolved
        // via env / homedir), but we set it to the workspace root so any
        // relative ENOENT paths surface with a recognizable prefix.
        .current_dir(workspace)
        .env("SEREN_DESKTOP", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn()?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");

    let (tx, rx) = channel::<u16>();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let mut emitted = false;
        for line in reader.lines() {
            let Ok(line) = line else { break };
            eprintln!("[sidecar] {}", line);
            if !emitted {
                if let Some(port) = parse_port(&line) {
                    let _ = tx.send(port);
                    emitted = true;
                }
            }
        }
    });

    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            eprintln!("[sidecar:err] {}", line);
        }
    });

    Ok(Spawned { sidecar: Sidecar { child }, port_rx: rx })
}

/// Find the first `localhost:PORT` or `127.0.0.1:PORT` token in a stdout line.
fn parse_port(line: &str) -> Option<u16> {
    for needle in ["://localhost:", "://127.0.0.1:"] {
        if let Some(idx) = line.find(needle) {
            let tail = &line[idx + needle.len()..];
            let digits: String = tail.chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(p) = digits.parse::<u16>() {
                if p > 0 {
                    return Some(p);
                }
            }
        }
    }
    None
}

/// Best-effort kill — send terminate, wait briefly, then SIGKILL on hangs.
pub fn shutdown(sidecar: &mut Sidecar) {
    let _ = sidecar.child.kill();
    let _ = sidecar.child.wait();
}

/// In dev, the workspace root is two levels up from CARGO_MANIFEST_DIR
/// (packages/desktop/src-tauri → packages/desktop → repo root).
/// In production we'd resolve it from app resource_dir; that's a follow-up.
pub fn workspace_root() -> PathBuf {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .map(|p| p.to_path_buf())
        .unwrap_or(manifest)
}

#[cfg(test)]
mod tests {
    use super::parse_port;

    #[test]
    fn parses_localhost_url() {
        assert_eq!(parse_port("📍 访问地址: http://localhost:3001"), Some(3001));
    }

    #[test]
    fn parses_127001() {
        assert_eq!(parse_port("Listening at http://127.0.0.1:5173/"), Some(5173));
    }

    #[test]
    fn ignores_other_lines() {
        assert_eq!(parse_port("starting up..."), None);
    }
}
