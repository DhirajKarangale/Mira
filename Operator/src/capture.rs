use chrono::Local;
use std::path::PathBuf;
use tracing::{debug, warn};
use uuid::Uuid;

use crate::broker_client::{ScreenshotJob, SCREENSHOT_CONSUMER_KEY};

#[derive(Debug, Clone)]
pub struct CapturedScreenshot {
    pub job: ScreenshotJob,
}

#[cfg(windows)]
extern "system" {
    fn OpenWindowStationW(lpszWinSta: *const u16, fInherit: i32, dwDesiredAccess: u32) -> isize;
    fn SetProcessWindowStation(hWinSta: isize) -> i32;
    fn OpenDesktopW(lpszDesktop: *const u16, dwFlags: u32, fInherit: i32, dwDesiredAccess: u32) -> isize;
    fn SetThreadDesktop(hDesktop: isize) -> i32;
}

#[cfg(windows)]
static DPI_INIT: std::sync::Once = std::sync::Once::new();

#[cfg(windows)]
pub fn enable_dpi_awareness() {
    DPI_INIT.call_once(|| {
        unsafe {
            // 1. Try SetProcessDpiAwarenessContext (Windows 10 1607+)
            // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4
            // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE = -3
            type SetProcessDpiAwarenessContextFn = unsafe extern "system" fn(isize) -> i32;
            let user32 = windows_sys::Win32::System::LibraryLoader::LoadLibraryA(b"user32.dll\0".as_ptr());
            if user32 != 0 {
                let set_ctx = windows_sys::Win32::System::LibraryLoader::GetProcAddress(
                    user32,
                    b"SetProcessDpiAwarenessContext\0".as_ptr(),
                );
                if let Some(set_ctx_fn) = set_ctx {
                    let f: SetProcessDpiAwarenessContextFn = std::mem::transmute(set_ctx_fn);
                    if f(-4) != 0 || f(-3) != 0 {
                        debug!("Enabled Per-Monitor DPI awareness via SetProcessDpiAwarenessContext");
                        return;
                    }
                }
            }

            // 2. Try SetProcessDpiAwareness from shcore.dll (Windows 8.1+)
            // PROCESS_PER_MONITOR_DPI_AWARE = 2
            type SetProcessDpiAwarenessFn = unsafe extern "system" fn(i32) -> i32;
            let shcore = windows_sys::Win32::System::LibraryLoader::LoadLibraryA(b"shcore.dll\0".as_ptr());
            if shcore != 0 {
                let set_dpi = windows_sys::Win32::System::LibraryLoader::GetProcAddress(
                    shcore,
                    b"SetProcessDpiAwareness\0".as_ptr(),
                );
                if let Some(set_dpi_fn) = set_dpi {
                    let f: SetProcessDpiAwarenessFn = std::mem::transmute(set_dpi_fn);
                    if f(2) == 0 {
                        debug!("Enabled Per-Monitor DPI awareness via SetProcessDpiAwareness");
                        return;
                    }
                }
            }

            // 3. Fallback to SetProcessDPIAware from user32.dll (Windows Vista+)
            let user32 = windows_sys::Win32::System::LibraryLoader::LoadLibraryA(b"user32.dll\0".as_ptr());
            if user32 != 0 {
                type SetProcessDPIAwareFn = unsafe extern "system" fn() -> i32;
                let set_aware = windows_sys::Win32::System::LibraryLoader::GetProcAddress(
                    user32,
                    b"SetProcessDPIAware\0".as_ptr(),
                );
                if let Some(set_aware_fn) = set_aware {
                    let f: SetProcessDPIAwareFn = std::mem::transmute(set_aware_fn);
                    let _ = f();
                    debug!("Enabled system DPI awareness via SetProcessDPIAware");
                }
            }
        }
    });

    // Also ensure the calling thread is configured for Per-Monitor V2 awareness
    unsafe {
        type SetThreadDpiAwarenessContextFn = unsafe extern "system" fn(isize) -> isize;
        let user32 = windows_sys::Win32::System::LibraryLoader::LoadLibraryA(b"user32.dll\0".as_ptr());
        if user32 != 0 {
            let set_thread_ctx = windows_sys::Win32::System::LibraryLoader::GetProcAddress(
                user32,
                b"SetThreadDpiAwarenessContext\0".as_ptr(),
            );
            if let Some(f) = set_thread_ctx {
                let f: SetThreadDpiAwarenessContextFn = std::mem::transmute(f);
                if f(-4) == 0 {
                    let _ = f(-3);
                }
            }
        }
    }
}


#[cfg(not(windows))]
pub fn enable_dpi_awareness() {}

#[cfg(windows)]
pub fn attach_to_active_desktop() {
    enable_dpi_awareness();
    unsafe {
        let winsta_name: [u16; 8] = [
            'W' as u16, 'i' as u16, 'n' as u16, 'S' as u16, 't' as u16, 'a' as u16, '0' as u16, 0,
        ];
        let hwinsta = OpenWindowStationW(winsta_name.as_ptr(), 0, 0x10000000);
        if hwinsta != 0 {
            SetProcessWindowStation(hwinsta);
        }

        let desktop_name: [u16; 8] = [
            'd' as u16, 'e' as u16, 'f' as u16, 'a' as u16, 'u' as u16, 'l' as u16, 't' as u16, 0,
        ];
        let hdesktop = OpenDesktopW(desktop_name.as_ptr(), 0, 0, 0x10000000);
        if hdesktop != 0 {
            SetThreadDesktop(hdesktop);
        }
    }
}

#[cfg(not(windows))]
pub fn attach_to_active_desktop() {}


#[cfg(windows)]
pub fn get_active_app_name() -> String {
    use windows_sys::Win32::Foundation::{CloseHandle, HWND};
    use windows_sys::Win32::System::ProcessStatus::GetProcessImageFileNameW;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd == 0 {
            return "Desktop".to_string();
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return "Desktop".to_string();
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
                    return file_name.to_string();
                }
            }
        }

        let mut title_buf = [0u16; 512];
        let title_len = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), title_buf.len() as i32);
        if title_len > 0 {
            let title = String::from_utf16_lossy(&title_buf[..title_len as usize]);
            let trimmed = title.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }

        "Unknown".to_string()
    }
}

#[cfg(windows)]
pub fn get_active_app_id() -> String {
    use windows_sys::Win32::Foundation::{CloseHandle, HWND};
    use windows_sys::Win32::System::ProcessStatus::GetProcessImageFileNameW;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd == 0 {
            return "explorer.exe".to_string();
        }

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return "explorer.exe".to_string();
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
                    return file_name.to_lowercase();
                }
            }
        }

        "unknown".to_string()
    }
}

#[cfg(not(windows))]
pub fn get_active_app_id() -> String {
    "unknown".to_string()
}

#[cfg(not(windows))]
pub fn get_active_app_name() -> String {
    "Unknown".to_string()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetDisplay {
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

#[cfg(windows)]
pub fn enumerate_displays() -> Vec<TargetDisplay> {
    enable_dpi_awareness();
    attach_to_active_desktop();

    use windows_sys::Win32::Foundation::{BOOL, LPARAM, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFOEXW,
    };

    unsafe extern "system" fn enum_proc(
        hmonitor: HMONITOR,
        _hdc: HDC,
        _lprc: *mut RECT,
        lparam: LPARAM,
    ) -> BOOL {
        let list = &mut *(lparam as *mut Vec<TargetDisplay>);
        let mut info: MONITORINFOEXW = std::mem::zeroed();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;

        if GetMonitorInfoW(hmonitor, &mut info as *mut _ as _) != 0 {
            let r = info.monitorInfo.rcMonitor;
            let width = (r.right - r.left).max(0) as u32;
            let height = (r.bottom - r.top).max(0) as u32;

            if width > 0 && height > 0 {
                let name = String::from_utf16_lossy(&info.szDevice)
                    .trim_matches(char::from(0))
                    .to_string();
                let is_primary = (info.monitorInfo.dwFlags & 1) != 0;

                list.push(TargetDisplay {
                    name,
                    x: r.left,
                    y: r.top,
                    width,
                    height,
                    is_primary,
                });
            }
        }
        1
    }

    let mut displays = Vec::new();
    unsafe {
        EnumDisplayMonitors(
            0,
            std::ptr::null(),
            Some(enum_proc),
            &mut displays as *mut _ as isize,
        );
    }
    displays
}

#[cfg(windows)]
pub fn get_target_display() -> TargetDisplay {
    enable_dpi_awareness();
    attach_to_active_desktop();

    use windows_sys::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFOEXW, MONITOR_DEFAULTTOPRIMARY,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
    };

    // 1. Try finding the monitor hosting the active/foreground window
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd != 0 {
            let hmonitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTOPRIMARY);
            if hmonitor != 0 {
                let mut info: MONITORINFOEXW = std::mem::zeroed();
                info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
                if GetMonitorInfoW(hmonitor, &mut info as *mut _ as _) != 0 {
                    let r = info.monitorInfo.rcMonitor;
                    let width = (r.right - r.left).max(0) as u32;
                    let height = (r.bottom - r.top).max(0) as u32;
                    if width > 0 && height > 0 {
                        let name = String::from_utf16_lossy(&info.szDevice)
                            .trim_matches(char::from(0))
                            .to_string();
                        let is_primary = (info.monitorInfo.dwFlags & 1) != 0;
                        return TargetDisplay {
                            name,
                            x: r.left,
                            y: r.top,
                            width,
                            height,
                            is_primary,
                        };
                    }
                }
            }
        }
    }

    // 2. Fallback to enumerated displays (prefer primary monitor)
    let displays = enumerate_displays();
    if let Some(primary) = displays.iter().find(|d| d.is_primary).cloned() {
        return primary;
    }
    if let Some(first) = displays.into_iter().next() {
        return first;
    }

    // 3. Fallback to DPI-aware primary screen metrics
    unsafe {
        let width = GetSystemMetrics(SM_CXSCREEN).max(0) as u32;
        let height = GetSystemMetrics(SM_CYSCREEN).max(0) as u32;
        TargetDisplay {
            name: "\\\\.\\DISPLAY1".to_string(),
            x: 0,
            y: 0,
            width: if width > 0 { width } else { 1920 },
            height: if height > 0 { height } else { 1080 },
            is_primary: true,
        }
    }
}

#[cfg(not(windows))]
pub fn get_target_display() -> TargetDisplay {
    if let Ok(monitors) = xcap::Monitor::all() {
        if let Some(m) = monitors.iter().find(|m| m.is_primary()).or_else(|| monitors.first()) {
            return TargetDisplay {
                name: m.name().unwrap_or_else(|_| "Display".to_string()),
                x: m.x(),
                y: m.y(),
                width: m.width(),
                height: m.height(),
                is_primary: m.is_primary(),
            };
        }
    }

    TargetDisplay {
        name: "Default".to_string(),
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        is_primary: true,
    }
}

#[cfg(windows)]
fn capture_screen_native(target: &TargetDisplay) -> Result<image::RgbaImage, Box<dyn std::error::Error + Send + Sync>> {
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
        GetDIBits, GetDC, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, DIB_RGB_COLORS, SRCCOPY,
    };

    unsafe {
        attach_to_active_desktop();
        enable_dpi_awareness();

        let width = target.width as i32;
        let height = target.height as i32;
        let src_x = target.x;
        let src_y = target.y;

        if width <= 0 || height <= 0 {
            return Err("Invalid display dimensions returned for target display".into());
        }

        let hdc_screen = GetDC(0);
        if hdc_screen == 0 {
            return Err("Failed to obtain screen device context (DC)".into());
        }

        let hdc_mem = CreateCompatibleDC(hdc_screen);
        if hdc_mem == 0 {
            ReleaseDC(0, hdc_screen);
            return Err("Failed to create compatible memory DC".into());
        }

        let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        if hbitmap == 0 {
            DeleteDC(hdc_mem);
            ReleaseDC(0, hdc_screen);
            return Err("Failed to allocate compatible GDI bitmap".into());
        }

        let old_bitmap = SelectObject(hdc_mem, hbitmap);

        // First attempt BitBlt with CAPTUREBLT (0x40000000) to include layered/transparent windows;
        // if that fails, fall back to standard SRCCOPY.
        let mut blt_ok = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, src_x, src_y, SRCCOPY | 0x40000000);
        if blt_ok == 0 {
            blt_ok = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, src_x, src_y, SRCCOPY);
        }

        if blt_ok == 0 {
            SelectObject(hdc_mem, old_bitmap);
            DeleteObject(hbitmap);
            DeleteDC(hdc_mem);
            ReleaseDC(0, hdc_screen);
            return Err("GDI BitBlt transfer failed".into());
        }

        let mut bmi: BITMAPINFO = std::mem::zeroed();
        bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bmi.bmiHeader.biWidth = width;
        bmi.bmiHeader.biHeight = -height;
        bmi.bmiHeader.biPlanes = 1;
        bmi.bmiHeader.biBitCount = 32;
        bmi.bmiHeader.biCompression = BI_RGB;

        let mut raw_pixels = vec![0u8; (width * height * 4) as usize];
        let scanlines = GetDIBits(
            hdc_mem,
            hbitmap,
            0,
            height as u32,
            raw_pixels.as_mut_ptr() as _,
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(hdc_mem, old_bitmap);
        DeleteObject(hbitmap);
        DeleteDC(hdc_mem);
        ReleaseDC(0, hdc_screen);

        if scanlines == 0 {
            return Err("GetDIBits failed to extract image buffer".into());
        }

        for pixel in raw_pixels.chunks_exact_mut(4) {
            let b = pixel[0];
            let r = pixel[2];
            pixel[0] = r;
            pixel[2] = b;
            pixel[3] = 255;
        }

        let image = image::RgbaImage::from_raw(width as u32, height as u32, raw_pixels)
            .ok_or("Failed to construct image::RgbaImage from raw pixel buffer")?;

        Ok(image)
    }
}

fn capture_screen_xcap(target: Option<&TargetDisplay>) -> Result<image::RgbaImage, Box<dyn std::error::Error + Send + Sync>> {
    attach_to_active_desktop();

    let monitors = xcap::Monitor::all()?;
    if monitors.is_empty() {
        return Err("No active displays/monitors found via xcap".into());
    }

    let monitor = if let Some(t) = target {
        monitors
            .iter()
            .find(|m| m.name() == t.name)
            .or_else(|| monitors.iter().find(|m| m.x() == t.x && m.y() == t.y))
            .or_else(|| monitors.iter().find(|m| m.is_primary()))
            .unwrap_or(&monitors[0])

    } else {
        monitors
            .iter()
            .find(|m| m.is_primary())
            .unwrap_or(&monitors[0])
    };

    let image = monitor.capture_image()?;
    Ok(image)
}

fn capture_raw_image() -> Result<image::RgbaImage, Box<dyn std::error::Error + Send + Sync>> {
    let target = get_target_display();

    #[cfg(windows)]
    {
        match capture_screen_native(&target) {
            Ok(img) => return Ok(img),
            Err(e) => {
                warn!("Native GDI capture encountered issue ({}), attempting xcap fallback...", e);
            }
        }
    }

    capture_screen_xcap(Some(&target))
}

pub fn capture_silent_screenshot() -> Result<CapturedScreenshot, Box<dyn std::error::Error + Send + Sync>> {
    #[cfg(windows)]
    enable_dpi_awareness();

    let rgba_image = capture_raw_image()?;
    let width = rgba_image.width();
    let height = rgba_image.height();

    let job_id = Uuid::new_v4().to_string();
    let timestamp = Local::now().format("%d/%m/%YT%H:%M:%S").to_string();
    let app_name = get_active_app_name();

    let base_app = app_name.strip_suffix(".exe").unwrap_or(&app_name);
    let safe_app: String = base_app
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | ' ' => '_',
            _ => c,
        })
        .collect();

    let file_timestamp = Local::now().format("%d-%m-%YT%H-%M-%S").to_string();
    let mut file_name = format!("{}_{}.png", safe_app, file_timestamp);

    let config = crate::config::get_config();
    let mut output_path: PathBuf = config.screenshots_dir.join(&file_name);
    if output_path.exists() {
        let short_id = &job_id[..8];
        file_name = format!("{}_{}_{}.png", safe_app, file_timestamp, short_id);
        output_path = config.screenshots_dir.join(&file_name);
    }

    rgba_image.save(&output_path)?;
    debug!(
        "Silent screenshot captured: {} ({}x{}) for app '{}' saved at {:?}",
        job_id, width, height, app_name, output_path
    );

    let raw_abs_path = match std::fs::canonicalize(&output_path) {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(_) => output_path.to_string_lossy().to_string(),
    };
    let abs_path = raw_abs_path
        .strip_prefix(r"\\?\")
        .unwrap_or(&raw_abs_path)
        .to_string();

    let job = ScreenshotJob {
        job_id,
        consumer_key: SCREENSHOT_CONSUMER_KEY.to_string(),
        os: config.os.clone(),
        app_name,
        timestamp,
        image_path: abs_path,
    };

    Ok(CapturedScreenshot { job })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dpi_awareness_init() {
        enable_dpi_awareness();
    }

    #[test]
    fn test_target_display_detection() {
        let target = get_target_display();
        println!("Detected target display: {:?}", target);
        assert!(target.width > 0, "Target display width must be positive");
        assert!(target.height > 0, "Target display height must be positive");
    }

    #[test]
    fn test_capture_matches_display_dimensions() {
        let target = get_target_display();
        let image = capture_raw_image().expect("Raw image capture must succeed");

        println!(
            "Target display: {}x{} at ({}, {}). Captured image: {}x{}",
            target.width, target.height, target.x, target.y, image.width(), image.height()
        );

        assert_eq!(
            image.width(),
            target.width,
            "Captured width must match target display physical width"
        );
        assert_eq!(
            image.height(),
            target.height,
            "Captured height must match target display physical height"
        );

        // Verify that the rightmost pixel boundary is fully populated and accessible
        let right_edge_x = image.width() - 1;
        let mid_y = image.height() / 2;
        let pixel = image.get_pixel(right_edge_x, mid_y);
        // Alpha channel must be 255 (opaque valid pixel)
        assert_eq!(pixel[3], 255, "Rightmost pixel must have full alpha opacity");
    }

    #[cfg(windows)]
    #[test]
    fn test_native_vs_xcap_dimensions() {
        let target = get_target_display();
        let native_img = capture_screen_native(&target).expect("Native capture must succeed");
        let xcap_img = capture_screen_xcap(Some(&target)).expect("xcap capture must succeed");

        assert_eq!(native_img.width(), target.width);
        assert_eq!(native_img.height(), target.height);
        assert_eq!(xcap_img.width(), target.width);
        assert_eq!(xcap_img.height(), target.height);
    }

    #[tokio::test]
    async fn test_capture_silent_screenshot_workflow() {
        let _ = crate::config::init_config().await;
        let result = capture_silent_screenshot().expect("capture_silent_screenshot must succeed");

        assert!(!result.job.job_id.is_empty());
        assert!(!result.job.image_path.is_empty());

        let path = std::path::Path::new(&result.job.image_path);
        assert!(path.exists(), "Captured screenshot file must exist on disk");

        // Verify saved image dimensions match target display
        let target = get_target_display();
        let loaded = image::open(path).expect("Must be able to open captured screenshot");
        assert_eq!(loaded.width(), target.width);
        assert_eq!(loaded.height(), target.height);

        // Cleanup test screenshot
        let _ = std::fs::remove_file(path);
    }
}
