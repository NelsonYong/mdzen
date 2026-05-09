// Tauri shell for Seren / 希莲.
//
// Architecture (small floating window + setPosition drag):
//   - main webview window: small floating window (~180×200) just big enough
//     to fit the sprite + bubble overhead. Transparent, frameless, always-
//     on-top, accept_first_mouse so macOS doesn't eat the first click.
//   - sprite drag: JS in window-drag.ts tracks mousedown→mousemove deltas
//     in screen-space (event.screenX/Y), invokes `drag_window_by` so the
//     Rust side computes new window position from a stashed origin and
//     calls `set_position()`. We do NOT use Tauri's `startDragging()` —
//     it has known bugs on macOS transparent + decorations:false windows
//     (issue #12042). We also do NOT use full-screen window + click-through
//     — `set_ignore_cursor_events` is broken on Tauri 2 transparent
//     windows (issues #11461, #13070). setPosition is the stable path.
//   - input + history webview windows: lazily built on first user invocation
//     (Cmd+Shift+K, click sprite, tray menu). Independent small windows in
//     the Codex Pet / Spotlight style.
//   - sidecar: Node child running @seren/pet only.
//
// Lifecycle:
//   1. spawn sidecar at startup, capture stdout to learn its port
//   2. on `setup`: install tray, register Cmd+Shift+K, build the small
//      main window (pointing at /sprite). Stash the port in AppState.
//   3. on first toggle/show command for input or history, build that window
//   4. on app exit, kill the sidecar child

mod sidecar;
mod tray;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use tauri::{
    AppHandle, Manager, PhysicalPosition, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

/// Mutable runtime state Tauri commands and tray callbacks share.
pub struct AppState {
    /// Sidecar port, set after the sidecar reports ready.
    pub sidecar_port: Mutex<Option<u16>>,
    /// Main-window position at the moment a drag started, in PHYSICAL pixels.
    /// `drag_window_by` adds JS-supplied logical deltas (× scale factor) to
    /// this origin and calls `set_position()`. None when no drag is in flight.
    pub drag_origin: Mutex<Option<(i32, i32)>>,
}

pub(crate) fn do_toggle_input(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("input") {
        let visible = w.is_visible().unwrap_or(false);
        if visible {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
        }
    } else if let Some(w) = build_input_window(app) {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub(crate) fn do_hide_input(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("input") {
        let _ = w.hide();
    }
}

pub(crate) fn do_show_history(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("history") {
        let _ = w.show();
        let _ = w.set_focus();
    } else if let Some(w) = build_history_window(app) {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub(crate) fn do_hide_history(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("history") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn toggle_input_window(app: AppHandle) {
    do_toggle_input(&app);
}

#[tauri::command]
fn hide_input_window(app: AppHandle) {
    do_hide_input(&app);
}

#[tauri::command]
fn show_history_window(app: AppHandle) {
    do_show_history(&app);
}

#[tauri::command]
fn hide_history_window(app: AppHandle) {
    do_hide_history(&app);
}

/// Snapshot the main window's current position. JS calls this on `mousedown`
/// before reporting screen-space deltas.
#[tauri::command]
fn begin_window_drag(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())?;
    let pos = win.outer_position().map_err(|e| e.to_string())?;
    let st = app.state::<AppState>();
    *st.drag_origin.lock().unwrap() = Some((pos.x, pos.y));
    Ok(())
}

/// Translate the main window by `dx` / `dy` LOGICAL pixels relative to the
/// origin captured by `begin_window_drag`. JS supplies the deltas using
/// `event.screenX/Y` so the calculation is monitor-coordinate-stable even
/// while the window itself is moving.
#[tauri::command]
fn drag_window_by(app: AppHandle, dx: f64, dy: f64) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window missing".to_string())?;
    let scale = win.scale_factor().map_err(|e| e.to_string())?;
    let st = app.state::<AppState>();
    let origin = *st.drag_origin.lock().unwrap();
    let Some((ox, oy)) = origin else { return Ok(()) };
    let new_x = ox + (dx * scale).round() as i32;
    let new_y = oy + (dy * scale).round() as i32;
    win.set_position(PhysicalPosition::new(new_x, new_y))
        .map_err(|e| e.to_string())
}

/// Clear the drag-origin stash so a stray `drag_window_by` after release is
/// a no-op. Idempotent.
#[tauri::command]
fn end_window_drag(app: AppHandle) {
    let st = app.state::<AppState>();
    *st.drag_origin.lock().unwrap() = None;
}

fn build_input_window(app: &AppHandle) -> Option<WebviewWindow> {
    let port = *app.state::<AppState>().sidecar_port.lock().unwrap();
    let port = port?;
    let url_str = format!("http://127.0.0.1:{port}/input");
    let url: tauri::Url = url_str.parse().ok()?;
    let monitor = app.primary_monitor().ok().flatten();
    let (mw, mh) = monitor_logical(monitor.as_ref());
    let w = WebviewWindowBuilder::new(app, "input", WebviewUrl::External(url))
        .title("Seren — 输入")
        .inner_size(520.0, 96.0)
        .min_inner_size(360.0, 80.0)
        .position((mw - 520.0) / 2.0, mh * 0.18)
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .shadow(true)
        .focused(true)
        .accept_first_mouse(true)
        .visible(false)
        .build()
        .ok()?;
    Some(w)
}

fn build_history_window(app: &AppHandle) -> Option<WebviewWindow> {
    let port = *app.state::<AppState>().sidecar_port.lock().unwrap();
    let port = port?;
    let url_str = format!("http://127.0.0.1:{port}/history");
    let url: tauri::Url = url_str.parse().ok()?;
    let w = WebviewWindowBuilder::new(app, "history", WebviewUrl::External(url))
        .title("Seren — 聊天记录")
        .inner_size(760.0, 560.0)
        .min_inner_size(420.0, 320.0)
        .resizable(true)
        .decorations(true)
        .visible(false)
        .build()
        .ok()?;
    Some(w)
}

fn monitor_logical(m: Option<&tauri::Monitor>) -> (f64, f64) {
    m.map(|m| {
        let s = m.size();
        let scale = m.scale_factor();
        ((s.width as f64) / scale, (s.height as f64) / scale)
    })
    .unwrap_or((1440.0, 900.0))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let workspace = sidecar::workspace_root();

    let (sidecar_slot, port_rx) = match sidecar::spawn_pet_host(&workspace) {
        Ok(spawned) => (
            Arc::new(Mutex::new(Some(spawned.sidecar))),
            Some(spawned.port_rx),
        ),
        Err(e) => {
            eprintln!("[seren] sidecar spawn failed: {e}");
            (Arc::new(Mutex::new(None)), None)
        }
    };

    let sidecar_for_exit = Arc::clone(&sidecar_slot);

    let app = tauri::Builder::default()
        .manage(AppState {
            sidecar_port: Mutex::new(None),
            drag_origin: Mutex::new(None),
        })
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        do_toggle_input(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            toggle_input_window,
            hide_input_window,
            show_history_window,
            hide_history_window,
            begin_window_drag,
            drag_window_by,
            end_window_drag,
        ])
        .setup(move |app| {
            if let Err(e) = tray::install(&app.handle()) {
                eprintln!("[seren] tray install failed: {e}");
            }

            let toggle_input =
                Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyK);
            if let Err(e) = app.global_shortcut().register(toggle_input) {
                eprintln!("[seren] global shortcut registration failed: {e}");
            }

            let monitor = app.primary_monitor().ok().flatten();
            let (mw, mh) = monitor_logical(monitor.as_ref());

            // ---- main (sprite) window — small floating frame
            // Just big enough for the sprite (72×72) + small bubble overhead.
            // Positioned bottom-right by default; window-state plugin restores
            // last-known position on subsequent launches.
            let main = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("Seren")
            .inner_size(180.0, 200.0)
            .min_inner_size(140.0, 160.0)
            .position(mw - 220.0, mh - 260.0)
            .transparent(true)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(true)
            .shadow(false)
            .accept_first_mouse(true)
            .visible(true)
            .build()?;

            // Park the loader page until the sidecar reports its port,
            // then navigate. Stash the port in AppState so lazy window
            // creates (input/history) can reach it.
            if let Some(rx) = port_rx {
                let main_handle = main.clone();
                let app_handle = app.handle().clone();
                std::thread::spawn(move || match rx.recv_timeout(Duration::from_secs(20)) {
                    Ok(port) => {
                        {
                            let state = app_handle.state::<AppState>();
                            *state.sidecar_port.lock().unwrap() = Some(port);
                        }
                        let _ = main_handle.eval(&format!(
                            "window.location.replace({:?});",
                            format!("http://127.0.0.1:{port}/sprite")
                        ));
                    }
                    Err(_) => {
                        let _ = main_handle.eval(
                            "var h=document.getElementById('hint');\
                             if(h){h.classList.add('err');\
                             h.textContent='sidecar 启动超时 (20s), 看终端 stderr';}",
                        );
                    }
                });
            } else {
                let _ = main.eval(
                    "var h=document.getElementById('hint');\
                     if(h){h.classList.add('err');\
                     h.textContent='sidecar 没启动 — 看终端报错';}",
                );
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri app");

    app.run(move |_app, event| {
        if matches!(event, RunEvent::Exit) {
            if let Some(mut sc) = sidecar_for_exit.lock().unwrap().take() {
                sidecar::shutdown(&mut sc);
            }
        }
    });
}
