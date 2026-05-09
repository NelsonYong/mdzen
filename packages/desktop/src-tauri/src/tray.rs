// System tray icon + right-click menu.
// Lives in its own module so lib.rs stays the orchestrator.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let toggle_input = MenuItem::with_id(
        app,
        "toggle-input",
        "对话框 (⌘⇧K)",
        true,
        None::<&str>,
    )?;
    let show_history = MenuItem::with_id(app, "show-history", "聊天记录", true, None::<&str>)?;
    let separator_a = PredefinedMenuItem::separator(app)?;
    let show = MenuItem::with_id(app, "show", "显示精灵", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "隐藏精灵", true, None::<&str>)?;
    let separator_b = PredefinedMenuItem::separator(app)?;
    let sleep = MenuItem::with_id(app, "sleep", "让她睡觉", true, None::<&str>)?;
    let separator_c = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &toggle_input,
            &show_history,
            &separator_a,
            &show,
            &hide,
            &separator_b,
            &sleep,
            &separator_c,
            &quit,
        ],
    )?;

    let _tray = TrayIconBuilder::with_id("seren-main")
        .tooltip("Seren — 希莲")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle-input" => crate::do_toggle_input(app),
            "show-history" => crate::do_show_history(app),
            "show" => toggle_main_visibility(app, Some(true)),
            "hide" => toggle_main_visibility(app, Some(false)),
            "sleep" => post_sleep_event(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            // Left click on tray = toggle the input prompt (Codex-style).
            // It's the most-used surface, so a single click should reach it.
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::do_toggle_input(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn toggle_main_visibility(app: &AppHandle, force: Option<bool>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let want_visible = force.unwrap_or_else(|| !window.is_visible().unwrap_or(true));
    let _ = if want_visible { window.show() } else { window.hide() };
    if want_visible {
        let _ = window.set_focus();
    }
}

fn post_sleep_event(app: &AppHandle) {
    // "Let her sleep" = trigger an immediate dream consolidation via the
    // pet API and hide the sprite window. fetch() runs in the loaded
    // page's origin (http://127.0.0.1:PORT) so the relative URL resolves
    // correctly. If still on the loader page (sidecar not ready yet),
    // the fetch fails silently — sleep is a no-op before she's awake.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(
            "fetch('/api/pet/dream', { method: 'POST' }).catch(function(){});",
        );
        let _ = window.hide();
    }
}
