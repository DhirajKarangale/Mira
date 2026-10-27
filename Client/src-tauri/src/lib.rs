use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;

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

    let python_exe = candidate_python
        .into_iter()
        .find(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            // Check if 'py' launcher or 'python' in PATH is valid
            for cmd_name in &["python", "py"] {
                if let Ok(output) = Command::new(cmd_name).arg("-V").output() {
                    if output.status.success() {
                        return cmd_name.to_string();
                    }
                }
            }
            "python".to_string()
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
        let _ = Command::new("kill")
            .args(&["-9", &pid.to_string()])
            .status();
    }
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
    if let Some(window) = app.get_webview_window("main") {
        window.close().map_err(|e| e.to_string())?;
    }
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(None)))
        .setup(|app| {
            let pid = spawn_backend(app);
            *app.state::<BackendProcess>().0.lock().unwrap() = pid;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<BackendProcess>();
                if let Some(pid) = state.0.lock().unwrap().take() {
                    kill_backend(pid);
                }
            }
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            minimize_window,
            toggle_maximize_window,
            close_window,
            is_window_maximized
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
