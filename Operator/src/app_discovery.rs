use serde::{Deserialize, Serialize};
use std::collections::HashMap;
#[allow(unused_imports)]
use std::path::{Path, PathBuf};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredApp {
    pub app_name: String,
    pub app_id: String,
}

pub fn discover_system_apps() -> Vec<DiscoveredApp> {
    let mut apps_map: HashMap<String, DiscoveredApp> = HashMap::new();

    #[cfg(windows)]
    {
        discover_windows_apps(&mut apps_map);
    }

    #[cfg(not(windows))]
    {
        discover_unix_apps(&mut apps_map);
    }

    let mut result: Vec<DiscoveredApp> = apps_map.into_values().collect();
    result.sort_by(|a, b| a.app_name.to_lowercase().cmp(&b.app_name.to_lowercase()));

    info!("Discovered {} unique system applications", result.len());
    result
}

#[cfg(windows)]
fn discover_windows_apps(apps: &mut HashMap<String, DiscoveredApp>) {
    if let Ok(progdata) = std::env::var("ProgramData") {
        let start_menu = PathBuf::from(progdata)
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs");
        scan_shortcut_directory(&start_menu, apps);
    }

    if let Ok(appdata) = std::env::var("APPDATA") {
        let user_start_menu = PathBuf::from(appdata)
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs");
        scan_shortcut_directory(&user_start_menu, apps);
    }

    scan_running_window_processes(apps);
}

#[cfg(windows)]
fn scan_shortcut_directory(dir: &Path, apps: &mut HashMap<String, DiscoveredApp>) {
    if !dir.is_dir() {
        return;
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                scan_shortcut_directory(&path, apps);
            } else if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().eq_ignore_ascii_case("lnk") {
                        if let Some(stem) = path.file_stem() {
                            let display_name = stem.to_string_lossy().to_string();
                            let lower_name = display_name.to_lowercase();

                            if lower_name.contains("uninstall")
                                || lower_name.contains("help")
                                || lower_name.contains("readme")
                                || lower_name.contains("documentation")
                                || lower_name.contains("license")
                            {
                                continue;
                            }

                            let app_id = extract_exe_from_lnk(&path)
                                .unwrap_or_else(|| format!("{}.exe", lower_name.replace(' ', "_")));

                            apps.entry(app_id.clone()).or_insert_with(|| DiscoveredApp {
                                app_name: display_name,
                                app_id,
                            });
                        }
                    }
                }
            }
        }
    }
}

#[cfg(windows)]
fn extract_exe_from_lnk(path: &Path) -> Option<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path).ok()?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).ok()?;

    let mut last_exe: Option<String> = None;
    let mut i = 0;
    while i + 4 <= buffer.len() {
        if buffer[i..i + 4].eq_ignore_ascii_case(b".exe") {
            let mut start = i;
            while start > 0 {
                let byte = buffer[start - 1];
                if byte == b'\\' || byte == b'/' || byte == 0 || byte == b':' || byte < 32 || byte > 126 {
                    break;
                }
                start -= 1;
            }

            if start < i {
                if let Ok(exe_str) = std::str::from_utf8(&buffer[start..i + 4]) {
                    let trimmed = exe_str.trim();
                    if trimmed.len() > 4 && trimmed.ends_with(".exe") && !trimmed.contains('/') && !trimmed.contains('\\') {
                        last_exe = Some(trimmed.to_lowercase());
                    }
                }
            }
            i += 4;
        } else {
            i += 1;
        }
    }

    last_exe
}

#[cfg(windows)]
fn scan_running_window_processes(apps: &mut HashMap<String, DiscoveredApp>) {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::System::ProcessStatus::GetProcessImageFileNameW;
    use windows_sys::Win32::Foundation::CloseHandle;

    unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }

        let mut title_buf = [0u16; 256];
        let title_len = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), title_buf.len() as i32);
        if title_len <= 0 {
            return 1;
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return 1;
        }

        let process_handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process_handle != 0 {
            let mut buffer = [0u16; 1024];
            let len = GetProcessImageFileNameW(
                process_handle,
                buffer.as_mut_ptr(),
                buffer.len() as u32,
            );
            CloseHandle(process_handle);

            if len > 0 {
                let full_path = String::from_utf16_lossy(&buffer[..len as usize]);
                if let Some(file_name) = full_path.rsplit('\\').next() {
                    let exe_name = file_name.to_string();
                    let lower_exe = exe_name.to_lowercase();

                    let ignored = [
                        "shellexperiencehost.exe", "searchhost.exe",
                        "startmenuexperiencehost.exe", "textinputhost.exe",
                        "applicationframehost.exe", "systemsettings.exe"
                    ];

                    if !ignored.contains(&lower_exe.as_str()) {
                        let apps_ptr = lparam as *mut HashMap<String, DiscoveredApp>;
                        if !apps_ptr.is_null() {
                            let map = &mut *apps_ptr;
                            let app_name = exe_name.strip_suffix(".exe").unwrap_or(&exe_name).to_string();
                            map.entry(lower_exe.clone()).or_insert_with(|| DiscoveredApp {
                                app_id: lower_exe,
                                app_name,
                            });
                        }
                    }
                }
            }
        }

        1
    }

    unsafe {
        let ptr = apps as *mut HashMap<String, DiscoveredApp> as LPARAM;
        EnumWindows(Some(enum_window_callback), ptr);
    }
}

#[cfg(not(windows))]
fn discover_unix_apps(apps: &mut HashMap<String, DiscoveredApp>) {
    let mut desktop_dirs = vec![
        PathBuf::from("/usr/share/applications"),
        PathBuf::from("/usr/local/share/applications"),
    ];

    if let Ok(home) = std::env::var("HOME") {
        desktop_dirs.push(PathBuf::from(home).join(".local").join("share").join("applications"));
    }

    for dir in desktop_dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "desktop") {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        let mut name = None;
                        let mut exec = None;
                        for line in content.lines() {
                            if line.starts_with("Name=") && name.is_none() {
                                name = Some(line.trim_start_matches("Name=").to_string());
                            } else if line.starts_with("Exec=") && exec.is_none() {
                                let raw_exec = line.trim_start_matches("Exec=");
                                let bin = raw_exec.split_whitespace().next().unwrap_or(raw_exec);
                                exec = Some(bin.rsplit('/').next().unwrap_or(bin).to_string());
                            }
                        }

                        if let (Some(n), Some(e)) = (name, exec) {
                            let key = e.to_lowercase();
                            apps.entry(key.clone()).or_insert_with(|| DiscoveredApp {
                                app_id: key,
                                app_name: n,
                            });
                        }
                    }
                }
            }
        }
    }
}
