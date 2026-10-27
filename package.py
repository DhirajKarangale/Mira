#!/usr/bin/env python3
"""
MIRA - Unified Cross-Platform Application Packaging Pipeline
=============================================================
Single master builder that compiles, stages, and bundles MIRA for:
  • Windows (NSIS .exe installer)
  • macOS (.dmg disk image & .app bundle)
  • Linux (.deb package & .AppImage)

Usage:
    python package.py                 # Auto-detects OS and builds full package
    python package.py --skip-operator # Reuse existing Operator binary
    python package.py --skip-client   # Reuse existing Client/dist frontend
    python package.py --stage-only    # Prepare bundle resources without Tauri build
    python package.py --bundle nsis   # Force specific bundle target
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = Path(__file__).resolve().parent
CLIENT_DIR = ROOT_DIR / "Client"
OPERATOR_DIR = ROOT_DIR / "Operator"
TAURI_DIR = CLIENT_DIR / "src-tauri"
RESOURCES_DIR = TAURI_DIR / "resources"
RESOURCES_BIN_DIR = RESOURCES_DIR / "bin"
RESOURCES_BACKEND_DIR = RESOURCES_DIR / "backend"

USE_COLOR = os.name != "nt" or "WT_SESSION" in os.environ or "TERM" in os.environ or sys.stdout.isatty()

def color(text: str, code: str) -> str:
    if not USE_COLOR:
        return text
    return f"{code}{text}\033[0m"

BOLD = "\033[1m"
DIM = "\033[2m"
CYAN = "\033[96m"
BLUE = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
WHITE = "\033[97m"

def log_step(step_num: int, total_steps: int, title: str) -> None:
    print(f"\n{BOLD}{CYAN}[{step_num}/{total_steps}]{WHITE} {title}{color('...', DIM)}")

def log_info(msg: str) -> None:
    print(f"  {color('•', BLUE)} {msg}")

def log_ok(msg: str) -> None:
    print(f"  {color('✔', GREEN)} {color(msg, GREEN)}")

def log_warn(msg: str) -> None:
    print(f"  {color('▲', YELLOW)} {color(msg, YELLOW)}")

def log_err(msg: str) -> None:
    print(f"  {color('✖', RED)} {color(msg, RED)}")

def run_command(cmd: List[str], cwd: Path, desc: str) -> None:
    log_info(f"Running: {color(' '.join(cmd), DIM)} in {cwd.name}/")
    start = time.time()
    shell_required = os.name == "nt" and cmd[0].endswith(".cmd")
    res = subprocess.run(cmd, cwd=str(cwd), shell=shell_required)
    if res.returncode != 0:
        log_err(f"Failed during {desc} (Exit code: {res.returncode})")
        sys.exit(res.returncode)
    elapsed = time.time() - start
    log_ok(f"Completed {desc} in {elapsed:.1f}s")

def get_file_size_mb(path: Path) -> float:
    return path.stat().st_size / (1024 * 1024)

def calculate_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

def find_redis_server() -> Optional[Path]:
    if sys.platform == "win32":
        candidates = [
            Path(r"F:\Software\Redis-5.0.14.1\redis-server.exe"),
            ROOT_DIR / "bin" / "redis-server.exe",
            RESOURCES_BIN_DIR / "redis-server.exe",
        ]
        for c in candidates:
            if c.exists():
                return c
    elif sys.platform == "darwin":
        candidates = [
            Path("/opt/homebrew/bin/redis-server"),
            Path("/usr/local/bin/redis-server"),
            ROOT_DIR / "bin" / "redis-server",
            RESOURCES_BIN_DIR / "redis-server",
        ]
        for c in candidates:
            if c.exists():
                return c
    else:  # Linux
        candidates = [
            Path("/usr/bin/redis-server"),
            Path("/usr/local/bin/redis-server"),
            ROOT_DIR / "bin" / "redis-server",
            RESOURCES_BIN_DIR / "redis-server",
        ]
        for c in candidates:
            if c.exists():
                return c

    which = shutil.which("redis-server.exe" if os.name == "nt" else "redis-server")
    if which:
        return Path(which)
    return None

class UnifiedPackager:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.is_windows = sys.platform == "win32"
        self.is_macos = sys.platform == "darwin"
        self.is_linux = sys.platform.startswith("linux")

        if self.is_windows:
            self.os_name = "Windows"
            self.op_bin_name = "operator.exe"
            self.npm_cmd = "npm.cmd"
            self.default_bundle = "nsis"
        elif self.is_macos:
            self.os_name = "macOS"
            self.op_bin_name = "operator"
            self.npm_cmd = "npm"
            self.default_bundle = "dmg"
        else:
            self.os_name = "Linux"
            self.op_bin_name = "operator"
            self.npm_cmd = "npm"
            self.default_bundle = "all"

        self.bundle_target = args.bundle or self.default_bundle
        self.total_steps = 5 if args.stage_only else 6

    def check_prerequisites(self) -> None:
        log_step(1, self.total_steps, f"Verifying Tools & Prerequisites ({self.os_name})")

        # 1. Python interpreter
        log_info(f"Python interpreter: {sys.executable} ({sys.version.split()[0]})")

        # 2. Rust & Cargo
        cargo_bin = shutil.which("cargo")
        if not cargo_bin:
            log_err("Rust compiler 'cargo' not found in PATH. Install Rust from https://rustup.rs")
            sys.exit(1)
        cargo_ver = subprocess.check_output([cargo_bin, "--version"], text=True).strip()
        log_ok(f"Rust Cargo: {cargo_ver}")

        # 3. Node & NPM
        if not shutil.which(self.npm_cmd):
            log_err(f"'{self.npm_cmd}' not found in PATH. Install Node.js from https://nodejs.org")
            sys.exit(1)
        node_ver = subprocess.check_output(["node", "--version"], text=True).strip()
        log_ok(f"Node.js: {node_ver}")

        # 4. Redis server
        redis_path = find_redis_server()
        if redis_path:
            log_ok(f"Found Redis server: {redis_path}")
        else:
            log_warn(f"redis-server not found. Target machine will need redis installed and running.")

    def build_operator(self) -> None:
        log_step(2, self.total_steps, f"Compiling Rust Operator Service ({self.op_bin_name})")
        operator_bin = OPERATOR_DIR / "target" / "release" / self.op_bin_name

        if self.args.skip_operator and operator_bin.exists():
            log_ok(f"Using pre-built Operator binary: {operator_bin} ({get_file_size_mb(operator_bin):.1f} MB)")
            return

        run_command(["cargo", "build", "--release"], OPERATOR_DIR, "Operator release compilation")
        if not operator_bin.exists():
            log_err(f"Expected binary not found at {operator_bin}")
            sys.exit(1)
        log_ok(f"Generated Operator binary: {operator_bin} ({get_file_size_mb(operator_bin):.1f} MB)")

    def build_client(self) -> None:
        log_step(3, self.total_steps, "Building Client Web Assets (Vite + React)")
        client_dist_index = CLIENT_DIR / "dist" / "index.html"

        if self.args.skip_client and client_dist_index.exists():
            log_ok(f"Using pre-built Client web assets: {CLIENT_DIR / 'dist'}")
            return

        run_command([self.npm_cmd, "run", "build"], CLIENT_DIR, "Client web build (tsc & vite)")
        if not client_dist_index.exists():
            log_err(f"Client build failed to produce {client_dist_index}")
            sys.exit(1)
        log_ok("Client production web bundle created successfully in Client/dist/")

    def stage_resources(self) -> None:
        log_step(4, self.total_steps, "Staging Microservices & Binaries into Tauri Resources")

        RESOURCES_BIN_DIR.mkdir(parents=True, exist_ok=True)
        RESOURCES_BACKEND_DIR.mkdir(parents=True, exist_ok=True)

        # 1. Copy Operator binary
        operator_src = OPERATOR_DIR / "target" / "release" / self.op_bin_name
        operator_dst = RESOURCES_BIN_DIR / self.op_bin_name
        if operator_src.exists():
            shutil.copy2(operator_src, operator_dst)
            if not self.is_windows:
                operator_dst.chmod(0o755)
            log_ok(f"Staged Operator binary -> {operator_dst.name} ({get_file_size_mb(operator_dst):.1f} MB)")

        # 2. Copy Redis executable if found on Windows
        if self.is_windows:
            redis_src = find_redis_server()
            if redis_src and redis_src.exists():
                redis_dst = RESOURCES_BIN_DIR / "redis-server.exe"
                try:
                    shutil.copy2(redis_src, redis_dst)
                    log_ok(f"Staged Redis server -> {redis_dst.name} ({get_file_size_mb(redis_dst):.1f} MB)")
                except Exception as e:
                    log_warn(f"Could not copy Redis binary: {e}")

        # 3. Copy Backend services
        modules_to_copy = ["Vault", "Message_Broker", "Memory", "Engine"]

        def backend_ignore(directory: str, files: List[str]) -> Set[str]:
            ignored = set()
            for f in files:
                low = f.lower()
                if (
                    low.endswith((".lock", ".db", ".db-journal", ".db-wal", ".db-shm", ".pyc", ".log", ".tmp"))
                    or low in (".git", "__pycache__", ".pytest_cache", "tests", "target", "screenshots", "cache")
                    or low.startswith("kb-")
                    or "lock" in low
                ):
                    ignored.add(f)
            return ignored

        for mod_name in modules_to_copy:
            src_dir = ROOT_DIR / mod_name
            dst_dir = RESOURCES_BACKEND_DIR / mod_name
            if src_dir.exists():
                if dst_dir.exists():
                    shutil.rmtree(dst_dir, ignore_errors=True)
                shutil.copytree(src_dir, dst_dir, ignore=backend_ignore)
                log_info(f"Staged {mod_name} service module")

        # 4. Copy start.py & services.json
        shutil.copy2(ROOT_DIR / "start.py", RESOURCES_BACKEND_DIR / "start.py")
        shutil.copy2(ROOT_DIR / "services.json", RESOURCES_BACKEND_DIR / "services.json")
        log_ok("Staged start.py orchestrator & services.json")

        # 5. Windows: Stage WebView2Loader.dll for NSIS bundle
        if self.is_windows:
            windows_hooks_dir = TAURI_DIR / "windows"
            windows_hooks_dir.mkdir(parents=True, exist_ok=True)
            webview2_candidates = [
                TAURI_DIR / "target" / "release" / "WebView2Loader.dll",
                TAURI_DIR / "target" / "debug" / "WebView2Loader.dll",
            ]
            webview2_src = next((p for p in webview2_candidates if p.exists()), None)
            if webview2_src:
                shutil.copy2(webview2_src, windows_hooks_dir / "WebView2Loader.dll")
                log_ok(f"Staged WebView2Loader.dll for NSIS installer ({get_file_size_mb(webview2_src):.2f} MB)")

    def verify_tauri_config(self) -> None:
        log_step(5, self.total_steps, "Validating Tauri Bundle Configuration")
        tauri_conf_path = TAURI_DIR / "tauri.conf.json"

        with open(tauri_conf_path, "r", encoding="utf-8") as f:
            conf = json.load(f)

        bundle = conf.setdefault("bundle", {})
        dirty = False

        # Set bundle targets
        desired_targets = self.bundle_target
        if desired_targets != "all" and bundle.get("targets") != desired_targets:
            bundle["targets"] = desired_targets
            dirty = True
            log_info(f"Configured bundle.targets -> '{desired_targets}'")

        # Ensure resources bundle pattern
        resources = bundle.setdefault("resources", [])
        if "resources/**/*" not in resources:
            resources.append("resources/**/*")
            dirty = True
            log_info("Added 'resources/**/*' to bundle.resources")

        # Platform specific checks
        if self.is_windows:
            windows_conf = bundle.setdefault("windows", {})
            nsis_conf = windows_conf.setdefault("nsis", {})
            if nsis_conf.get("installerHooks") != "./windows/hooks.nsh":
                nsis_conf["installerHooks"] = "./windows/hooks.nsh"
                dirty = True
            if nsis_conf.get("installerIcon") != "icons/icon.ico":
                nsis_conf["installerIcon"] = "icons/icon.ico"
                dirty = True
            if nsis_conf.get("uninstallerIcon") != "icons/icon.ico":
                nsis_conf["uninstallerIcon"] = "icons/icon.ico"
                dirty = True
            if nsis_conf.get("sidebarImage") != "icons/installer-sidebar.bmp":
                nsis_conf["sidebarImage"] = "icons/installer-sidebar.bmp"
                dirty = True
            if nsis_conf.get("headerImage") != "icons/installer-header.bmp":
                nsis_conf["headerImage"] = "icons/installer-header.bmp"
                dirty = True

            # Generate NSIS bitmaps if missing
            icon_png = TAURI_DIR / "icons" / "icon.png"
            sidebar_bmp = TAURI_DIR / "icons" / "installer-sidebar.bmp"
            header_bmp = TAURI_DIR / "icons" / "installer-header.bmp"
            if icon_png.exists() and (not sidebar_bmp.exists() or not header_bmp.exists()):
                try:
                    from PIL import Image, ImageDraw
                    img = Image.open(icon_png).convert("RGBA")
                    if not sidebar_bmp.exists():
                        w_side, h_side = 164, 314
                        sidebar = Image.new("RGB", (w_side, h_side), (7, 11, 20))
                        draw = ImageDraw.Draw(sidebar)
                        for y in range(h_side):
                            ratio = y / h_side
                            draw.line([(0, y), (w_side, y)], fill=(int(7 + 10 * ratio), int(11 + 25 * ratio), int(20 + 45 * ratio)))
                        icon_side = img.resize((96, 96), Image.Resampling.LANCZOS)
                        sidebar.paste(icon_side, ((w_side - 96) // 2, 48), icon_side)
                        sidebar.save(sidebar_bmp, format="BMP")
                        log_ok("Generated NSIS installer sidebar bitmap (installer-sidebar.bmp)")
                    if not header_bmp.exists():
                        w_head, h_head = 150, 57
                        head_rgba = Image.new("RGBA", (w_head, h_head), (255, 255, 255, 255))
                        icon_head = img.resize((48, 48), Image.Resampling.LANCZOS)
                        head_rgba.paste(icon_head, (w_head - 52, (h_head - 48) // 2), icon_head)
                        head_rgba.convert("RGB").save(header_bmp, format="BMP")
                        log_ok("Generated NSIS installer header bitmap (installer-header.bmp)")
                except Exception as e:
                    log_warn(f"Notice: Icon/Bitmap generation skipped ({e})")

        elif self.is_macos:
            macos_conf = bundle.setdefault("macOS", {})
            if macos_conf.get("infoPlist") != "./Info.plist":
                macos_conf["infoPlist"] = "./Info.plist"
                dirty = True
            info_plist = TAURI_DIR / "Info.plist"
            if not info_plist.exists():
                info_plist.write_text(
                    '<?xml version="1.0" encoding="UTF-8"?>\n'
                    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
                    '<plist version="1.0">\n'
                    '<dict>\n'
                    '    <key>NSScreenCaptureUsageDescription</key>\n'
                    '    <string>MIRA requires screen recording permissions to capture screen memory and context for AI assistance.</string>\n'
                    '    <key>NSMicrophoneUsageDescription</key>\n'
                    '    <string>MIRA requires microphone access for voice transcription and commands.</string>\n'
                    '</dict>\n'
                    '</plist>\n',
                    encoding="utf-8"
                )
                log_ok("Created macOS Info.plist permissions")

        elif self.is_linux:
            linux_conf = bundle.setdefault("linux", {})
            deb_conf = linux_conf.setdefault("deb", {})
            if "depends" not in deb_conf:
                deb_conf["depends"] = [
                    "libwebkit2gtk-4.1-0 | libwebkit2gtk-4.0-37",
                    "libappindicator3-1 | libayatana-appindicator3-1",
                    "librsvg2-2"
                ]
                dirty = True

        if dirty:
            with open(tauri_conf_path, "w", encoding="utf-8") as f:
                json.dump(conf, f, indent=2)
            log_ok("Updated Client/src-tauri/tauri.conf.json")
        else:
            log_ok("Tauri bundle configuration is verified and ready")

    def build_installer(self) -> None:
        if self.args.stage_only:
            log_info("Stage-only mode specified. Skipping installer build.")
            return

        log_step(6, self.total_steps, f"Building {self.os_name} Application Package ({self.bundle_target})")
        tauri_cmd = [self.npm_cmd, "run", "tauri", "build"]
        if self.bundle_target != "all":
            tauri_cmd.extend(["--", "--bundles", self.bundle_target])

        run_command(tauri_cmd, CLIENT_DIR, f"Tauri {self.os_name} application packaging")

        bundle_base = TAURI_DIR / "target" / "release" / "bundle"
        packages: List[Path] = []

        if self.is_windows:
            packages.extend((bundle_base / "nsis").glob("*.exe"))
            if os.name == "nt":
                try:
                    import ctypes
                    ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)
                    log_ok("Notified Windows Explorer shell to refresh icon cache")
                except Exception:
                    pass
        elif self.is_macos:
            packages.extend((bundle_base / "dmg").glob("*.dmg"))
            packages.extend((bundle_base / "macos").glob("*.app"))
        elif self.is_linux:
            packages.extend((bundle_base / "deb").glob("*.deb"))
            packages.extend((bundle_base / "appimage").glob("*.AppImage"))

        if not packages:
            log_err(f"Build completed but no release packages found in {bundle_base}")
            sys.exit(1)

        print("\n" + "=" * 80)
        print(f" {BOLD}{GREEN}★ MIRA {self.os_name.upper()} APPLICATION PACKAGED SUCCESSFULLY! ★{WHITE}")
        print("=" * 80)
        for pkg in packages:
            size_mb = get_file_size_mb(pkg)
            checksum = calculate_sha256(pkg)
            print(f"  {BOLD}Package File:{WHITE}  {color(str(pkg), CYAN)}")
            print(f"  {BOLD}Size:{WHITE}          {size_mb:.2f} MB")
            print(f"  {BOLD}SHA256:{WHITE}        {checksum}")
            print("-" * 80)

        print(f"  {BOLD}Ready for distribution on {self.os_name}.{WHITE}")
        print("=" * 80 + "\n")

    def run(self) -> None:
        print(f"\n{BOLD}{GREEN}======================================================{WHITE}")
        print(f"{BOLD}{GREEN} MIRA Master Packaging Pipeline ({self.os_name}) {WHITE}")
        print(f"{BOLD}{GREEN}======================================================{WHITE}")

        self.check_prerequisites()
        self.build_operator()
        self.build_client()
        self.stage_resources()
        self.verify_tauri_config()
        self.build_installer()

def main() -> None:
    parser = argparse.ArgumentParser(
        description="MIRA Unified Cross-Platform Builder (Windows, macOS, Linux)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python package.py                     # Full build for current OS
  python package.py --stage-only        # Stage resources without packaging
  python package.py --skip-operator     # Reuse existing operator binary
  python package.py --bundle dmg        # Target specific bundle on macOS
"""
    )
    parser.add_argument("--skip-operator", action="store_true", help="Skip Operator cargo compilation")
    parser.add_argument("--skip-client", action="store_true", help="Skip Frontend Vite build")
    parser.add_argument("--stage-only", action="store_true", help="Stage all resources without running tauri build")
    parser.add_argument("--bundle", type=str, default="", help="Specific Tauri bundle target (e.g. nsis, dmg, app, deb, appimage, all)")

    args = parser.parse_args()
    packager = UnifiedPackager(args)
    packager.run()

if __name__ == "__main__":
    main()
