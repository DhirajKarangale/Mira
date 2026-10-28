use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct BackendProcess(Mutex<Option<u32>>);

fn is_backend_running() -> bool {
    std::net::TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], 9002)),
        std::time::Duration::from_millis(250),
    ).is_ok()
}

fn spawn_backend(app: &tauri::App) -> Option<u32> {
    if is_backend_running() {
        println!("[MIRA] Active backend detected on port 9002. Reusing existing instance.");
        return None;
    }

    let resource_dir = app.path().resource_dir().unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf()));
    
    let mut candidate_start_py = vec![
        resource_dir.join("resources").join("backend").join("start.py"),
        resource_dir.join("backend").join("start.py"),
        resource_dir.join("start.py"),
    ];

    if let Some(ref dir) = exe_dir {
        candidate_start_py.push(dir.join("resources").join("backend").join("start.py"));
        candidate_start_py.push(dir.join("backend").join("start.py"));
        candidate_start_py.push(dir.join("start.py"));
    }

    candidate_start_py.push(std::path::PathBuf::from("../../scripts/start.py"));
    candidate_start_py.push(std::path::PathBuf::from("../scripts/start.py"));
    candidate_start_py.push(std::path::PathBuf::from("../../start.py"));
    candidate_start_py.push(std::path::PathBuf::from("../start.py"));

    let start_py = candidate_start_py.into_iter().find(|p| p.exists())?;

    let mut candidate_python = vec![
        resource_dir.join("resources").join("python_runtime").join("python.exe"),
        resource_dir.join("python_runtime").join("python.exe"),
    ];

    if let Some(ref dir) = exe_dir {
        candidate_python.push(dir.join("resources").join("python_runtime").join("python.exe"));
        candidate_python.push(dir.join("python_runtime").join("python.exe"));
    }

    #[cfg(target_os = "windows")]
    {
        candidate_python.extend([
            std::path::PathBuf::from(r"F:\Software\Python\Python311\python.exe"),
            std::path::PathBuf::from(r"C:\Python311\python.exe"),
            std::path::PathBuf::from(r"C:\Python312\python.exe"),
            std::path::PathBuf::from(r"C:\Python310\python.exe"),
            std::path::PathBuf::from(r"C:\Program Files\Python311\python.exe"),
            std::path::PathBuf::from(r"C:\Program Files\Python312\python.exe"),
            std::path::PathBuf::from(r"C:\Program Files\Python310\python.exe"),
        ]);

        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let base = std::path::PathBuf::from(local_app_data).join("Programs").join("Python");
            candidate_python.push(base.join("Python311").join("python.exe"));
            candidate_python.push(base.join("Python312").join("python.exe"));
            candidate_python.push(base.join("Python310").join("python.exe"));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        candidate_python.extend([
            resource_dir.join("resources").join("python_runtime").join("bin").join("python3"),
            resource_dir.join("python_runtime").join("bin").join("python3"),
            std::path::PathBuf::from("/opt/homebrew/bin/python3"),
            std::path::PathBuf::from("/usr/local/bin/python3"),
            std::path::PathBuf::from("/usr/bin/python3"),
            std::path::PathBuf::from("/usr/bin/python"),
        ]);

        if let Some(ref dir) = exe_dir {
            candidate_python.push(dir.join("resources").join("python_runtime").join("bin").join("python3"));
            candidate_python.push(dir.join("python_runtime").join("bin").join("python3"));
        }
    }

    let python_exe = candidate_python
        .into_iter()
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            // Check if 'python3', 'python', or 'py' launcher is valid
            for cmd_name in &["python3", "python", "py"] {
                if let Ok(output) = Command::new(cmd_name).arg("-V").output() {
                    if output.status.success() {
                        return cmd_name.to_string();
                    }
                }
            }
            if cfg!(target_os = "windows") { "python".to_string() } else { "python3".to_string() }
        });

    let mut cmd = Command::new(&python_exe);
    if let Some(parent) = start_py.parent() {
        cmd.current_dir(parent);
    }
    cmd.arg(&start_py);
    cmd.arg("--no-client");
    cmd.arg("--prod");
    cmd.arg("--headless");
    cmd.env("PYTHONUNBUFFERED", "1");

    // Redirect stdout and stderr to mira_backend.log to prevent NoneType streams in headless mode
    let log_file = start_py.parent().and_then(|p| {
        std::fs::OpenOptions::new().create(true).append(true).open(p.join("mira_backend.log")).ok()
    });

    if let Some(file) = log_file {
        if let Ok(err_file) = file.try_clone() {
            cmd.stdout(file);
            cmd.stderr(err_file);
        } else {
            cmd.stdout(file);
            cmd.stderr(std::process::Stdio::null());
        }
    } else {
        cmd.stdout(std::process::Stdio::null());
        cmd.stderr(std::process::Stdio::null());
    }

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.spawn() {
        Ok(child) => {
            let pid = child.id();
            println!("[MIRA] Successfully spawned background backend with PID {}", pid);
            Some(pid)
        }
        Err(e) => {
            eprintln!("[MIRA] Notice: Could not spawn background backend: {}", e);
            None
        }
    }
}

fn kill_backend(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(&["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Try killing the process group (-PID) first to terminate all child processes cleanly
        let _ = Command::new("kill")
            .args(&["-TERM", &format!("-{}", pid)])
            .status();
        let _ = Command::new("kill")
            .args(&["-9", &pid.to_string()])
            .status();
    }
}

#[cfg(target_os = "windows")]
fn is_autostart_registered() -> bool {
    let output = Command::new("reg")
        .args(&[
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
            "/v",
            "MIRA",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    match output {
        Ok(out) => out.status.success(),
        Err(_) => false,
    }
}

#[cfg(target_os = "windows")]
fn set_autostart_registered(enable: bool) -> Result<(), String> {
    if enable {
        let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let cmd_val = format!("\"{}\" --autostart", exe_path.to_string_lossy());
        let status = Command::new("reg")
            .args(&[
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "MIRA",
                "/t",
                "REG_SZ",
                "/d",
                &cmd_val,
                "/f",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map_err(|e| e.to_string())?;

        if !status.success() {
            return Err("Failed to register MIRA in Windows startup registry".to_string());
        }
    } else {
        let _ = Command::new("reg")
            .args(&[
                "delete",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "MIRA",
                "/f",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    Ok(())
}

#[tauri::command]
fn minimize_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.minimize().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn toggle_maximize_window(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        let is_max = window.is_maximized().map_err(|e| e.to_string())?;
        if is_max {
            window.unmaximize().map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            window.maximize().map_err(|e| e.to_string())?;
            Ok(true)
        }
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn close_window(app: tauri::AppHandle) -> Result<(), String> {
    // Hide to system tray instead of destroying the window so background operations continue
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<BackendProcess>();
    if let Some(pid) = state.0.lock().unwrap().take() {
        kill_backend(pid);
    }
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn is_window_maximized(app: tauri::AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("main") {
        window.is_maximized().map_err(|e| e.to_string())
    } else {
        Ok(false)
    }
}

#[tauri::command]
fn is_autostart_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(is_autostart_registered())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

#[tauri::command]
fn set_autostart_enabled(enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        set_autostart_registered(enabled)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enabled;
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    {
        // Prevent WebView2 from throttling timers or suspending audio/mic when running hidden in tray
        if std::env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS").is_err() {
            unsafe {
                std::env::set_var(
                    "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
                    "--disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding",
                );
            }
        }
    }

    tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(None)))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            let pid = spawn_backend(app);
            *app.state::<BackendProcess>().0.lock().unwrap() = pid;

            // Determine if launched with autostart/hidden/background flag
            let is_autostart = std::env::args().any(|arg| {
                arg == "--autostart" || arg == "--hidden" || arg == "--background"
            });

            // If running on Windows, make sure startup registration is maintained
            #[cfg(target_os = "windows")]
            {
                // If not already registered, auto-register for seamless experience
                if !is_autostart_registered() {
                    let _ = set_autostart_registered(true);
                }
            }

            // Build system tray icon and menu
            let show_item = MenuItem::with_id(app, "show", "Open MIRA", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit MIRA", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::with_id("mira_tray")
                .tooltip("MIRA - Personal Digital Assistant")
                .menu(&tray_menu)
                .show_menu_on_left_click(false);

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        let state = app.state::<BackendProcess>();
                        if let Some(pid) = state.0.lock().unwrap().take() {
                            kill_backend(pid);
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Show window if launched normally by user (not started via Windows autostart)
            if !is_autostart {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // When user clicks 'X' or window close is requested, hide to tray instead of closing
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            tauri::WindowEvent::Destroyed => {
                let state = window.state::<BackendProcess>();
                if let Some(pid) = state.0.lock().unwrap().take() {
                    kill_backend(pid);
                }
            }
            _ => {}
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            minimize_window,
            toggle_maximize_window,
            close_window,
            show_window,
            exit_app,
            is_window_maximized,
            is_autostart_enabled,
            set_autostart_enabled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
