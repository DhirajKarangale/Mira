use chrono::Local;
use std::path::PathBuf;
use tracing::{debug, warn};
use uuid::Uuid;

use crate::broker_client::{ScreenshotJob, SCREENSHOT_CONSUMER_KEY};

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CapturedScreenshot {
    pub job: ScreenshotJob,
    pub width: u32,
    pub height: u32,
}

#[cfg(windows)]
extern "system" {
    fn OpenWindowStationW(lpszWinSta: *const u16, fInherit: i32, dwDesiredAccess: u32) -> isize;
    fn SetProcessWindowStation(hWinSta: isize) -> i32;
    fn OpenDesktopW(lpszDesktop: *const u16, dwFlags: u32, fInherit: i32, dwDesiredAccess: u32) -> isize;
    fn SetThreadDesktop(hDesktop: isize) -> i32;
}

#[cfg(windows)]
pub fn attach_to_active_desktop() {
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

        // Fallback: window title text
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

#[cfg(not(windows))]
pub fn get_active_app_name() -> String {
    "Unknown".to_string()
}

#[cfg(windows)]
fn capture_screen_native() -> Result<image::RgbaImage, Box<dyn std::error::Error + Send + Sync>> {
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
        GetDIBits, GetDC, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, DIB_RGB_COLORS, SRCCOPY,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN,
    };

    unsafe {
        attach_to_active_desktop();

        let width = GetSystemMetrics(SM_CXSCREEN);
        let height = GetSystemMetrics(SM_CYSCREEN);
        if width <= 0 || height <= 0 {
            return Err("Invalid screen dimensions returned by GetSystemMetrics".into());
        }

        let hdc_screen = GetDC(0);
        if hdc_screen == 0 {
            return Err("Failed to obtain primary screen device context (DC)".into());
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

        let blt_ok = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, 0, 0, SRCCOPY);
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
        bmi.bmiHeader.biHeight = -height; // Negative height specifies top-down DIB
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

        // Cleanup GDI objects immediately
        SelectObject(hdc_mem, old_bitmap);
        DeleteObject(hbitmap);
        DeleteDC(hdc_mem);
        ReleaseDC(0, hdc_screen);

        if scanlines == 0 {
            return Err("GetDIBits failed to extract image buffer".into());
        }

        // Fast conversion from Windows BGRA to RGBA in-place
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

/// Capture screen using xcap
fn capture_screen_xcap() -> Result<image::RgbaImage, Box<dyn std::error::Error + Send + Sync>> {
    attach_to_active_desktop();

    let monitors = xcap::Monitor::all()?;
    if monitors.is_empty() {
        return Err("No active displays/monitors found via xcap".into());
    }

    let monitor = monitors
        .iter()
        .find(|m| m.is_primary())
        .unwrap_or(&monitors[0]);

    let image = monitor.capture_image()?;
    Ok(image)
}

/// Capture image using primary native engine with xcap fallback
fn capture_raw_image() -> Result<image::RgbaImage, Box<dyn std::error::Error + Send + Sync>> {
    #[cfg(windows)]
    {
        match capture_screen_native() {
            Ok(img) => return Ok(img),
            Err(e) => {
                warn!("Native GDI capture encountered issue ({}), attempting xcap fallback...", e);
            }
        }
    }

    capture_screen_xcap()
}

/// Silently capture the primary monitor without user notification or noise.
/// Saves image to screenshots directory and generates the job object.
pub fn capture_silent_screenshot() -> Result<CapturedScreenshot, Box<dyn std::error::Error + Send + Sync>> {
    let rgba_image = capture_raw_image()?;
    let width = rgba_image.width();
    let height = rgba_image.height();

    let job_id = Uuid::new_v4().to_string();
    let timestamp = Local::now().format("%d/%m/%YT%H:%M:%S").to_string();
    let app_name = get_active_app_name();

    let config = crate::config::get_config();
    let file_name = format!("{}.png", job_id);
    let output_path: PathBuf = config.screenshots_dir.join(&file_name);

    // Save image to disk silently
    rgba_image.save(&output_path)?;
    debug!(
        "Silent screenshot captured: {} ({}x{}) for app '{}' saved at {:?}",
        job_id, width, height, app_name, output_path
    );

    let abs_path = match std::fs::canonicalize(&output_path) {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(_) => output_path.to_string_lossy().to_string(),
    };

    let job = ScreenshotJob {
        job_id,
        consumer_key: SCREENSHOT_CONSUMER_KEY.to_string(),
        app_name,
        timestamp,
        image_path: abs_path,
        width: Some(width),
        height: Some(height),
    };

    Ok(CapturedScreenshot {
        job,
        width,
        height,
    })
}
