from __future__ import annotations
import ctypes
import os
from pathlib import Path
import re
import sys
from typing import Any, Dict, List, Optional, Tuple
import win32gui
import win32process
import psutil
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))
try:
    from vault_logger import log
except ImportError:
    from Memory.vault_logger import log
_DESKTOP_ATTACHED = False

def attach_to_active_desktop() -> bool:
    global _DESKTOP_ATTACHED
    if os.name != 'nt':
        return False
    if _DESKTOP_ATTACHED:
        return True
    try:
        user32 = ctypes.windll.user32
        generic_all = 268435456
        hwinsta = user32.OpenWindowStationW('WinSta0', False, generic_all)
        if hwinsta:
            user32.SetProcessWindowStation(hwinsta)
        hdesktop = user32.OpenDesktopW('default', 0, False, generic_all)
        if hdesktop:
            user32.SetThreadDesktop(hdesktop)
        _DESKTOP_ATTACHED = True
        return True
    except Exception as e:
        log(f'attach_to_active_desktop failed: {e}')
        return False

def get_application_window_title(app_name: str='') -> str:
    attach_to_active_desktop()
    target = app_name.lower().replace('.exe', '').strip()
    try:
        fg = win32gui.GetForegroundWindow()
        if fg and win32gui.IsWindowVisible(fg):
            _, pid = win32process.GetWindowThreadProcessId(fg)
            p = psutil.Process(pid)
            pname = p.name().lower().replace('.exe', '')
            if not target or target in pname or pname in target:
                t = (win32gui.GetWindowText(fg) or '').replace('\u200b', '').replace('\ufeff', '').strip()
                if t:
                    return t
    except Exception:
        pass
    matches: List[str] = []

    def enum_cb(hwnd: int, _: Any) -> bool:
        if not win32gui.IsWindowVisible(hwnd):
            return True
        try:
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            p = psutil.Process(pid)
            pname = p.name().lower().replace('.exe', '')
            if target in pname or pname in target:
                title = (win32gui.GetWindowText(hwnd) or '').replace('\u200b', '').replace('\ufeff', '').strip()
                rect = win32gui.GetWindowRect(hwnd)
                w, h = (rect[2] - rect[0], rect[3] - rect[1])
                if w > 200 and h > 200 and title:
                    matches.append(title)
        except Exception:
            pass
        return True
    try:
        win32gui.EnumWindows(enum_cb, None)
    except Exception:
        pass
    res = matches[0] if matches else app_name
    return res.replace('\u200b', '').replace('\ufeff', '').strip()

def find_target_window(app_name: str='') -> Optional[int]:
    attach_to_active_desktop()
    target = app_name.lower().replace('.exe', '').strip()
    try:
        fg_hwnd = win32gui.GetForegroundWindow()
        if fg_hwnd and win32gui.IsWindowVisible(fg_hwnd):
            if not target:
                return fg_hwnd
            _, pid = win32process.GetWindowThreadProcessId(fg_hwnd)
            p = psutil.Process(pid)
            pname = p.name().lower().replace('.exe', '')
            if target in pname or pname in target:
                return fg_hwnd
    except Exception:
        pass
    matched_hwnds: List[Tuple[int, str]] = []

    def enum_cb(hwnd: int, extra: Any) -> bool:
        if not win32gui.IsWindowVisible(hwnd):
            return True
        try:
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            p = psutil.Process(pid)
            pname = p.name().lower().replace('.exe', '')
            if target in pname or pname in target:
                title = win32gui.GetWindowText(hwnd) or ''
                rect = win32gui.GetWindowRect(hwnd)
                w, h = (rect[2] - rect[0], rect[3] - rect[1])
                if w > 200 and h > 200:
                    matched_hwnds.append((hwnd, title))
        except Exception:
            pass
        return True
    try:
        win32gui.EnumWindows(enum_cb, None)
    except Exception:
        pass
    if matched_hwnds:
        return matched_hwnds[0][0]
    return fg_hwnd if fg_hwnd else None

def extract_uia_tree_from_hwnd(hwnd: int, max_elements: int=120) -> List[Dict[str, Any]]:
    try:
        import uiautomation as auto
    except ImportError:
        log('uiautomation package not installed')
        return []
    try:
        control = auto.ControlFromHandle(hwnd)
        if not control or not control.Exists(maxSearchSeconds=0.5):
            return []
    except Exception as e:
        log(f'Failed to create UIA ControlFromHandle({hwnd}): {e}')
        return []
    elements: List[Dict[str, Any]] = []

    def walk(ctrl: Any, depth: int=0) -> None:
        if depth > 7 or len(elements) >= max_elements:
            return
        try:
            name = (ctrl.Name or '').strip()
            ctype = ctrl.ControlTypeName or ''
            rect = ctrl.BoundingRectangle
            bbox = [rect.left, rect.top, rect.width(), rect.height()] if rect else [0, 0, 0, 0]
            val = ''
            try:
                val_pat = ctrl.GetValuePattern()
                if val_pat:
                    val = str(val_pat.Value or '').strip()
            except Exception:
                pass
            has_focus = False
            try:
                has_focus = bool(ctrl.HasKeyboardFocus)
            except Exception:
                pass
            meaningful_text = name or val
            if meaningful_text and len(meaningful_text) > 1 and (bbox[2] > 0) and (bbox[3] > 0):
                elements.append({'name': name, 'value': val, 'type': ctype, 'bbox': bbox, 'has_focus': has_focus, 'depth': depth})
            for child in ctrl.GetChildren():
                walk(child, depth + 1)
        except Exception:
            return
    walk(control)
    return elements

def format_uia_to_markdown(app_name: str, window_title: str, elements: List[Dict[str, Any]]) -> str:
    lines = [f'Window: "{window_title}"', '']
    nav_items: List[str] = []
    actions: List[str] = []
    inputs: List[str] = []
    content_items: List[str] = []
    focused_item: Optional[str] = None
    for el in elements:
        name = el['name']
        val = el['value']
        ctype = el['type']
        is_focus = el['has_focus']
        label = name
        if val and val != name:
            label = f'{name}: {val}' if name else val
        if is_focus:
            focused_item = f'[{ctype}: {label}]'
        if ctype in ('TabItemControl', 'MenuItemControl', 'HyperlinkControl'):
            nav_items.append(label)
        elif ctype in ('ButtonControl', 'CheckBoxControl', 'RadioButtonControl'):
            actions.append(f"[{ctype.replace('Control', '')}: {label}]")
        elif ctype in ('EditControl', 'ComboBoxControl', 'SpinnerControl'):
            inputs.append(f"- **{name or 'Field'}:** {(val if val else '[Empty]')}")
        elif ctype in ('TextControl', 'HeaderItemControl', 'ListItemControl', 'TreeItemControl'):
            content_items.append(label)
        else:
            content_items.append(label)
    if nav_items:
        lines.append('## Navigation & Tabs:')
        lines.append(' | '.join(nav_items))
        lines.append('')
    if inputs:
        lines.append('## Inputs & Form Fields:')
        lines.extend(inputs)
        lines.append('')
    if content_items:
        lines.append('## Main Content:')
        last = None
        for c in content_items:
            if c != last:
                lines.append(f'- {c}')
                last = c
        lines.append('')
    if actions:
        lines.append('## Action Controls:')
        lines.append('  '.join(actions))
        lines.append('')
    if focused_item:
        lines.append('## Active Focus:')
        lines.append(f'- Focused Element: {focused_item}')
        lines.append('')
    return '\n'.join(lines).strip()

def extract_native_uia(app_name: str='') -> Dict[str, Any]:
    attach_to_active_desktop()
    hwnd = find_target_window(app_name)
    if not hwnd:
        return {'success': False, 'source': 'uia', 'reason': f"No active window found matching '{app_name}'"}
    try:
        window_title = win32gui.GetWindowText(hwnd) or app_name
    except Exception:
        window_title = app_name
    elements = extract_uia_tree_from_hwnd(hwnd)
    if len(elements) < 5:
        return {'success': False, 'source': 'uia', 'window_title': window_title, 'element_count': len(elements), 'reason': f'Insufficient UIA elements ({len(elements)} < 5)'}
    markdown = format_uia_to_markdown(app_name, window_title, elements)
    return {'success': True, 'source': 'uia', 'window_title': window_title, 'element_count': len(elements), 'elements': elements, 'extracted_text': markdown, 'markdown': markdown}
