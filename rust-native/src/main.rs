#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod dash;
mod dashtask;
mod engine;
mod filetask;
mod hls;
mod model;
mod scan;
mod server;
mod share;
mod store;

use engine::AppState;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::utils::config::WindowEffectsConfig;
use tauri::utils::WindowEffect;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

struct Backend {
    state: Arc<AppState>,
    url: String,
    startup_item: std::sync::Mutex<Option<CheckMenuItem<tauri::Wry>>>,
    _runtime: tokio::runtime::Runtime,
}

const BRIDGE_SCRIPT: &str = r#"
(() => {
  const invoke = (command, args) => {
    const internals = window.__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== 'function') return Promise.resolve(null);
    return internals.invoke(command, args).catch(() => null);
  };
  window.arus = {
    isDesktop: true,
    windowControl: (action) => { invoke('window_action', { action }); },
    pickFolder: (current) => invoke('pick_folder', { current: current || null }),
    setLaunchAtLogin: (enabled) => { invoke('launch_at_login', { enabled: Boolean(enabled) }); },
    setWindowTheme: (dark) => { invoke('window_theme', { dark: Boolean(dark) }); },
    syncSettings: (settings) => { invoke('sync_settings', { settings: settings || {} }); },
    notify: (title, body) => { invoke('notify', { title: String(title || 'Arus'), body: String(body || '') }); }
  };
  window.addEventListener('DOMContentLoaded', () => {
    const bar = document.querySelector('.titlebar');
    if (!bar) return;
    bar.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      invoke('window_action', { action: 'drag' });
    });
  });
})();
"#;

const POPUP_BRIDGE: &str = r#"
(() => {
  const invoke = (action) => {
    const internals = window.__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== 'function') return null;
    return internals.invoke('window_action', { action });
  };
  window.arusPopupClose = () => {
    const pending = invoke('close');
    if (pending) pending.catch(() => window.close());
    else window.close();
  };
  window.arusPopupReady = () => {
    setTimeout(() => {
      const pending = invoke('show');
      if (pending) pending.catch(() => {});
    }, 80);
  };
})();
"#;

#[tauri::command]
fn window_action(action: String, window: tauri::WebviewWindow) -> Result<(), String> {
    let result = match action.as_str() {
        "minimize" => window.minimize(),
        "maximize" => {
            if window.is_maximized().unwrap_or(false) {
                window.unmaximize()
            } else {
                window.maximize()
            }
        }
        "close" => {
            if window.label() == "main" {
                window.close()
            } else {
                window.destroy()
            }
        }
        "drag" => window.start_dragging(),
        "show" => window.show(),
        _ => Ok(()),
    };
    result.map_err(|err| err.to_string())
}

#[tauri::command]
async fn pick_folder(current: Option<String>) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = rfd::FileDialog::new();
        if let Some(dir) = current.filter(|value| !value.trim().is_empty()) {
            dialog = dialog.set_directory(dir);
        }
        dialog
            .pick_folder()
            .map(|path| path.to_string_lossy().to_string())
    })
    .await
    .ok()
    .flatten()
}

#[tauri::command]
fn notify(app: tauri::AppHandle, backend: tauri::State<'_, Backend>, title: String, body: String) {
    if !backend.state.core.lock().settings.notifications {
        return;
    }
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
}

#[tauri::command]
fn launch_at_login(enabled: bool) {
    set_launch_at_login(enabled);
}

#[cfg(windows)]
fn set_backdrop_dark(window: &tauri::WebviewWindow, dark: bool) {
    use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_IMMERSIVE_DARK_MODE};
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let value: i32 = i32::from(dark);
    unsafe {
        DwmSetWindowAttribute(
            hwnd.0 as *mut core::ffi::c_void,
            DWMWA_USE_IMMERSIVE_DARK_MODE as u32,
            &value as *const i32 as *const core::ffi::c_void,
            std::mem::size_of::<i32>() as u32,
        );
    }
}

#[tauri::command]
fn window_theme(dark: bool, window: tauri::WebviewWindow) {
    #[cfg(windows)]
    set_backdrop_dark(&window, dark);
    #[cfg(not(windows))]
    let _ = (dark, window);
}

#[cfg(windows)]
fn restore_window(window: &tauri::WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetForegroundWindow, ShowWindow, SW_RESTORE,
    };
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let handle = hwnd.0 as *mut core::ffi::c_void;
    unsafe {
        ShowWindow(handle, SW_RESTORE);
        SetForegroundWindow(handle);
    }
}

#[cfg(not(windows))]
fn restore_window(window: &tauri::WebviewWindow) {
    let _ = window.set_focus();
}

#[tauri::command]
fn sync_settings(backend: tauri::State<'_, Backend>, settings: serde_json::Value) {
    if let Some(enabled) = settings
        .get("launchAtLogin")
        .and_then(|value| value.as_bool())
    {
        if let Some(item) = backend.startup_item.lock().ok().and_then(|guard| guard.clone()) {
            let _ = item.set_checked(enabled);
        }
    }
}

fn open_download_folder(dir: &str) {
    let path = PathBuf::from(dir);
    if path.as_os_str().is_empty() {
        return;
    }
    let _ = std::fs::create_dir_all(&path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("explorer")
            .arg(&path)
            .creation_flags(0x0800_0000)
            .spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&path).spawn();
    }
}

#[cfg(windows)]
fn read_clipboard_text() -> Option<String> {
    use windows_sys::Win32::Foundation::HGLOBAL;
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    };
    use windows_sys::Win32::System::Memory::{GlobalLock, GlobalUnlock};

    const CF_UNICODETEXT: u32 = 13;
    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return None;
        }
        let mut text = None;
        if IsClipboardFormatAvailable(CF_UNICODETEXT) != 0 {
            let handle = GetClipboardData(CF_UNICODETEXT);
            if !handle.is_null() {
                let pointer = GlobalLock(handle as HGLOBAL);
                if !pointer.is_null() {
                    let wide = pointer as *const u16;
                    let mut length = 0usize;
                    while length < 16384 && *wide.add(length) != 0 {
                        length += 1;
                    }
                    text = Some(String::from_utf16_lossy(std::slice::from_raw_parts(wide, length)));
                    let _ = GlobalUnlock(handle as HGLOBAL);
                }
            }
        }
        CloseClipboard();
        text
    }
}

#[cfg(not(windows))]
fn read_clipboard_text() -> Option<String> {
    None
}

fn looks_like_link(text: &str) -> bool {
    if text.split_whitespace().count() != 1 {
        return false;
    }
    let lower = text.to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn watch_clipboard(state: Arc<AppState>) {
    std::thread::spawn(move || {
        let mut last = read_clipboard_text()
            .map(|text| text.trim().to_string())
            .unwrap_or_default();
        loop {
            std::thread::sleep(std::time::Duration::from_millis(900));
            if !state.core.lock().settings.clipboard_watch {
                continue;
            }
            let Some(text) = read_clipboard_text() else {
                continue;
            };
            let text = text.trim().to_string();
            if text.is_empty() || text.len() > 2048 || text == last {
                continue;
            }
            last = text.clone();
            if looks_like_link(&text) {
                state.set_clipboard_link(text);
            }
        }
    });
}

fn resolve_dir(exe_dir: &Path, name: &str) -> PathBuf {
    let portable = exe_dir.join(name);
    if portable.is_dir() {
        return portable;
    }
    if let Some(project) = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent() {
        let candidate = project.join(name);
        if candidate.is_dir() {
            return candidate;
        }
    }
    portable
}

fn cdp_browser_args() -> Option<String> {
    std::env::var("ARUS_CDP_PORT").ok().map(|port| {
        format!(
            "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --autoplay-policy=no-user-gesture-required --remote-debugging-port={port}"
        )
    })
}

fn webview_data_dir() -> Option<std::path::PathBuf> {
    std::env::var_os("ARUS_WEBVIEW_DATA").map(std::path::PathBuf::from)
}

fn tune_builder<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    mut builder: WebviewWindowBuilder<'a, R, M>,
) -> WebviewWindowBuilder<'a, R, M> {
    if let Some(dir) = webview_data_dir() {
        builder = builder.data_directory(dir);
    }
    if let Some(args) = cdp_browser_args() {
        builder = builder.additional_browser_args(&args);
    }
    builder
}

fn open_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        restore_window(&window);
        let _ = window.set_focus();
        return;
    }
    let Some(backend) = app.try_state::<Backend>() else {
        return;
    };
    let Ok(parsed) = url::Url::parse(&backend.url) else {
        return;
    };
    let studio_opaque = std::env::var("ARUS_OPAQUE_WINDOW").as_deref() == Ok("1");
    let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
        .title("Arus")
        .inner_size(1160.0, 720.0)
        .min_inner_size(760.0, 500.0)
        .center()
        .decorations(false)
        .transparent(!studio_opaque)
        .initialization_script(BRIDGE_SCRIPT);
    let built = tune_builder(builder).build();
    match built {
        Ok(window) => {
            if !studio_opaque {
                let effects = WindowEffectsConfig {
                    effects: vec![WindowEffect::Acrylic],
                    state: None,
                    radius: None,
                    color: Some(tauri::window::Color(20, 22, 24, 170)),
                    interactive: false,
                };
                if let Err(err) = window.set_effects(effects) {
                    let _ = std::fs::write(
                        std::env::temp_dir().join("arus-effects-error.txt"),
                        format!("{err:#?}"),
                    );
                }
            }
            #[cfg(windows)]
            set_backdrop_dark(&window, true);
            let _ = window.show();
            let _ = window.unminimize();
            restore_window(&window);
            let _ = window.set_focus();
        }
        Err(err) => {
            let _ = std::fs::write(
                std::env::temp_dir().join("arus-window-error.txt"),
                format!("{err:#?}"),
            );
        }
    }
}

fn popup_corner(app: &tauri::AppHandle, width: f64, height: f64) -> (f64, f64) {
    let Some(monitor) = app.primary_monitor().ok().flatten() else {
        return (40.0, 40.0);
    };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let right = (area.position.x as f64 + area.size.width as f64) / scale;
    let bottom = (area.position.y as f64 + area.size.height as f64) / scale;
    ((right - width - 16.0).max(0.0), (bottom - height - 16.0).max(0.0))
}

fn show_complete_popup(app: &tauri::AppHandle, notice: engine::CompletedNotice) {
    let Some(backend) = app.try_state::<Backend>() else {
        return;
    };
    if let Some(window) = app.get_webview_window(&format!("progress-{}", notice.id)) {
        let _ = window.destroy();
    }
    let base = backend.url.clone();
    let theme = backend.state.core.lock().settings.theme.clone();
    for (label, window) in app.webview_windows() {
        if label.starts_with("complete-") {
            let _ = window.destroy();
        }
    }
    let encode = |value: &str| {
        percent_encoding::utf8_percent_encode(value, percent_encoding::NON_ALPHANUMERIC).to_string()
    };
    let url = format!(
        "{base}/popup.html?id={}&name={}&size={}&folder={}&theme={}",
        encode(&notice.id),
        encode(&notice.name),
        notice.bytes,
        encode(notice.folder.as_deref().unwrap_or("")),
        if theme == "light" { "light" } else { "dark" }
    );
    let Ok(parsed) = url::Url::parse(&url) else {
        return;
    };
    let width = 430.0;
    let height = 152.0;
    let (x, y) = popup_corner(app, width, height);
    let label = format!("complete-{}", notice.id);
    let background = if theme == "light" {
        tauri::window::Color(251, 251, 249, 255)
    } else {
        tauri::window::Color(20, 22, 26, 255)
    };
    let builder = WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::External(parsed))
        .title("Arus")
        .inner_size(width, height)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .shadow(true)
        .visible(false)
        .background_color(background)
        .position(x, y)
        .initialization_script(POPUP_BRIDGE);
    let built = tune_builder(builder).build();
    if built.is_err() {
        return;
    }
    let unready_handle = app.clone();
    let unready_label = label.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(15000));
        let dispatcher = unready_handle.clone();
        let _ = unready_handle.run_on_main_thread(move || {
            if let Some(window) = dispatcher.get_webview_window(&unready_label) {
                if !window.is_visible().unwrap_or(false) {
                    let _ = window.destroy();
                }
            }
        });
    });
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(8000));
        let dispatcher = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if let Some(window) = dispatcher.get_webview_window(&label) {
                let _ = window.destroy();
            }
        });
    });
}

fn show_progress_popup(app: &tauri::AppHandle, notice: engine::StartedNotice) {
    let Some(backend) = app.try_state::<Backend>() else {
        return;
    };
    let label = format!("progress-{}", notice.id);
    if let Some(window) = app.get_webview_window(&label) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.show();
        }
        return;
    }
    let base = backend.url.clone();
    let theme = backend.state.core.lock().settings.theme.clone();
    let index = app
        .webview_windows()
        .keys()
        .filter(|name| name.starts_with("progress-"))
        .count()
        .min(3);
    let encode = |value: &str| {
        percent_encoding::utf8_percent_encode(value, percent_encoding::NON_ALPHANUMERIC).to_string()
    };
    let url = format!(
        "{base}/progress.html?id={}&name={}&theme={}",
        encode(&notice.id),
        encode(&notice.name),
        if theme == "light" { "light" } else { "dark" }
    );
    let Ok(parsed) = url::Url::parse(&url) else {
        return;
    };
    let width = 430.0;
    let height = 136.0;
    let (x, y) = popup_corner(app, width, height);
    let y = (y - (height + 8.0) * index as f64).max(0.0);
    let background = if theme == "light" {
        tauri::window::Color(251, 251, 249, 255)
    } else {
        tauri::window::Color(20, 22, 26, 255)
    };
    let builder = WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::External(parsed))
        .title("Arus")
        .inner_size(width, height)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .shadow(true)
        .visible(false)
        .background_color(background)
        .position(x, y)
        .initialization_script(POPUP_BRIDGE);
    let built = tune_builder(builder).build();
    if built.is_err() {
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(15000));
        let dispatcher = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if let Some(window) = dispatcher.get_webview_window(&label) {
                if !window.is_visible().unwrap_or(false) {
                    let _ = window.destroy();
                }
            }
        });
    });
}

fn local_request(port: u16, method: &str, path: &str, timeout_ms: u64) -> Option<String> {
    use std::io::{Read, Write};
    let address = format!("127.0.0.1:{port}").parse().ok()?;
    let timeout = std::time::Duration::from_millis(timeout_ms);
    let mut stream = std::net::TcpStream::connect_timeout(&address, timeout).ok()?;
    stream.set_read_timeout(Some(timeout)).ok()?;
    stream.set_write_timeout(Some(timeout)).ok()?;
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).ok()?;
    let mut buffer = Vec::new();
    stream.take(64 * 1024).read_to_end(&mut buffer).ok()?;
    Some(String::from_utf8_lossy(&buffer).to_string())
}

fn find_running_instance() -> Option<String> {
    for port in 4477u16..=4486 {
        if let Some(response) = local_request(port, "GET", "/api/meta", 250) {
            if response.contains("\"name\":\"Arus\"") {
                return Some(format!("http://127.0.0.1:{port}"));
            }
        }
    }
    None
}

fn show_running_instance(base: &str) -> bool {
    let Ok(parsed) = url::Url::parse(base) else {
        return false;
    };
    let Some(port) = parsed.port() else {
        return false;
    };
    local_request(port, "POST", "/api/show", 800)
        .map(|response| response.starts_with("HTTP/1.1 204") || response.starts_with("HTTP/1.0 204"))
        .unwrap_or(false)
}

#[cfg(windows)]
fn set_launch_at_login(enabled: bool) {
    if cfg!(debug_assertions) {
        return;
    }
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let key = r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run";
    let status = if enabled {
        let value = format!("\"{}\" --background", exe.display());
        std::process::Command::new("reg")
            .args(["add", key, "/v", "Arus", "/t", "REG_SZ", "/d", &value, "/f"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
    } else {
        std::process::Command::new("reg")
            .args(["delete", key, "/v", "Arus", "/f"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
    };
    if status.map(|s| !s.success()).unwrap_or(true) {
        eprintln!("[arus] could not update the launch-at-login entry");
    }
}

#[cfg(not(windows))]
fn set_launch_at_login(_enabled: bool) {}

fn watch_launch_setting(state: Arc<AppState>) {
    set_launch_at_login(state.core.lock().settings.launch_at_login);
    std::thread::spawn(move || {
        let mut last = state.core.lock().settings.launch_at_login;
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3));
            let current = state.core.lock().settings.launch_at_login;
            if current != last {
                set_launch_at_login(current);
                last = current;
            }
        }
    });
}

fn main() {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));

    let data_dir = std::env::var_os("ARUS_DATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| exe_dir.join("data"));
    let ui_dir = resolve_dir(&exe_dir, "public");
    let assets_dir = resolve_dir(&exe_dir, "assets");
    let extension_dir = std::env::var_os("ARUS_EXTENSION_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| resolve_dir(&exe_dir, "extension"));

    let headless = std::env::var("ARUS_HEADLESS").as_deref() == Ok("1");
    let background = std::env::args().any(|arg| {
        matches!(
            arg.as_str(),
            "--background" | "--hidden" | "--silent" | "/onboot"
        )
    });

    if !headless && std::env::var_os("PORT").is_none() {
        if let Some(base) = find_running_instance() {
            eprintln!("[arus] another instance is already running at {base}");
            show_running_instance(&base);
            return;
        }
    }

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(4)
        .enable_all()
        .build()
        .expect("failed to create the tokio runtime");

    let state = AppState::new(data_dir, ui_dir, assets_dir, extension_dir);
    let server = runtime
        .block_on(server::start(state.clone()))
        .expect("failed to start the Arus server");
    let url = server.url.clone();
    eprintln!("[arus] listening on {url}");

    if headless {
        eprintln!("[arus] headless mode");
        runtime.block_on(std::future::pending::<()>());
        return;
    }

    watch_launch_setting(state.clone());
    watch_clipboard(state.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            window_action,
            pick_folder,
            notify,
            launch_at_login,
            window_theme,
            sync_settings
        ])
        .manage(Backend {
            state,
            url,
            startup_item: std::sync::Mutex::new(None),
            _runtime: runtime,
        })
        .setup(move |app| {
            {
                let backend = app.state::<Backend>();
                let handle = app.handle().clone();
                backend.state.set_window_opener(Arc::new(move || {
                    let dispatcher = handle.clone();
                    let inner = handle.clone();
                    let _ = dispatcher.run_on_main_thread(move || open_main(&inner));
                }));
                let hook_state = backend.state.clone();
                let hook_handle = app.handle().clone();
                let started_state = backend.state.clone();
                let started_handle = app.handle().clone();
                backend.state.set_started_hook(Arc::new(move |notice| {
                    if !started_state.core.lock().settings.notifications {
                        return;
                    }
                    let dispatcher = started_handle.clone();
                    let inner = started_handle.clone();
                    let _ = dispatcher
                        .run_on_main_thread(move || show_progress_popup(&inner, notice));
                }));
                let canceled_handle = app.handle().clone();
                backend.state.set_canceled_hook(Arc::new(move |id| {
                    let dispatcher = canceled_handle.clone();
                    let inner = canceled_handle.clone();
                    let _ = dispatcher.run_on_main_thread(move || {
                        if let Some(window) =
                            inner.get_webview_window(&format!("progress-{id}"))
                        {
                            let _ = window.destroy();
                        }
                    });
                }));
                backend.state.set_completed_hook(Arc::new(move |notice| {
                    if !hook_state.core.lock().settings.notifications {
                        return;
                    }
                    let dispatcher = hook_handle.clone();
                    let inner = hook_handle.clone();
                    let _ = dispatcher.run_on_main_thread(move || {
                        if let Some(error) = notice.error.as_deref() {
                            if let Some(window) = inner
                                .get_webview_window(&format!("progress-{}", notice.id))
                            {
                                let _ = window.destroy();
                            }
                            use tauri_plugin_notification::NotificationExt;
                            let _ = inner
                                .notification()
                                .builder()
                                .title("Arus: download failed")
                                .body(format!("{}\n{}", notice.name, error))
                                .show();
                            return;
                        }
                        show_complete_popup(&inner, notice);
                    });
                }));
            }
            if !background {
                open_main(app.handle());
            }

            if let Some(icon) = app.default_window_icon().cloned() {
                let start_with_windows = app
                    .try_state::<Backend>()
                    .map(|backend| backend.state.core.lock().settings.launch_at_login)
                    .unwrap_or(true);
                let open = MenuItem::with_id(app, "open", "Buka Arus", true, None::<&str>)?;
                let pause = MenuItem::with_id(app, "pause-all", "Jeda semua", true, None::<&str>)?;
                let resume =
                    MenuItem::with_id(app, "resume-all", "Lanjutkan semua", true, None::<&str>)?;
                let folder =
                    MenuItem::with_id(app, "folder", "Buka folder unduhan", true, None::<&str>)?;
                let startup = CheckMenuItem::with_id(
                    app,
                    "startup",
                    "Mulai dengan Windows",
                    true,
                    start_with_windows,
                    None::<&str>,
                )?;
                let sep1 = PredefinedMenuItem::separator(app)?;
                let sep2 = PredefinedMenuItem::separator(app)?;
                let sep3 = PredefinedMenuItem::separator(app)?;
                let sep4 = PredefinedMenuItem::separator(app)?;
                let quit = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;
                let menu = Menu::with_items(
                    app,
                    &[
                        &open, &sep1, &pause, &resume, &sep2, &folder, &sep3, &startup, &sep4,
                        &quit,
                    ],
                )?;
                if let Some(backend) = app.try_state::<Backend>() {
                    if let Ok(mut slot) = backend.startup_item.lock() {
                        *slot = Some(startup.clone());
                    }
                }
                let startup_item = startup.clone();
                TrayIconBuilder::with_id("main")
                    .icon(icon)
                    .tooltip("Arus")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(move |app, event| match event.id.as_ref() {
                        "open" => open_main(app),
                        "pause-all" => {
                            if let Some(backend) = app.try_state::<Backend>() {
                                backend.state.pause_all();
                            }
                        }
                        "resume-all" => {
                            if let Some(backend) = app.try_state::<Backend>() {
                                backend.state.resume_all();
                            }
                        }
                        "folder" => {
                            if let Some(backend) = app.try_state::<Backend>() {
                                let dir = backend.state.core.lock().settings.download_dir.clone();
                                open_download_folder(&dir);
                            }
                        }
                        "startup" => {
                            let enabled = startup_item.is_checked().unwrap_or(false);
                            if let Some(backend) = app.try_state::<Backend>() {
                                backend.state.update_settings(&serde_json::json!({
                                    "launchAtLogin": enabled
                                }));
                            }
                            set_launch_at_login(enabled);
                        }
                        "quit" => {
                            if let Some(backend) = app.try_state::<Backend>() {
                                backend.state.persist();
                            }
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            open_main(tray.app_handle());
                        }
                    })
                    .build(app)?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() != "main" {
                    return;
                }
                let app = window.app_handle();
                if let Some(backend) = app.try_state::<Backend>() {
                    let minimize = backend.state.core.lock().settings.minimize_to_tray;
                    if minimize {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        backend.state.persist();
                        app.exit(0);
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Arus")
        .run(|_app, event| {
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
