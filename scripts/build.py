from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Optional, Set

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent if (SCRIPT_DIR.parent / "Client").exists() else SCRIPT_DIR
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
    else:
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
    def __init__(self) -> None:
        self.is_windows = sys.platform == "win32"
        self.is_macos = sys.platform == "darwin"
        self.is_linux = sys.platform.startswith("linux")

        if self.is_windows:
            self.os_name = "Windows"
            self.op_bin_name = "operator.exe"
            self.npm_cmd = "npm.cmd"
            self.bundle_target = "nsis"
        elif self.is_macos:
            self.os_name = "macOS"
            self.op_bin_name = "operator"
            self.npm_cmd = "npm"
            self.bundle_target = "dmg"
        else:
            self.os_name = "Linux"
            self.op_bin_name = "operator"
            self.npm_cmd = "npm"
            self.bundle_target = "deb,appimage"

        self.total_steps = 6

    def check_prerequisites(self) -> None:
        log_step(1, self.total_steps, f"Verifying Tools & Prerequisites ({self.os_name})")

        log_info(f"Python interpreter: {sys.executable} ({sys.version.split()[0]})")

        cargo_bin = shutil.which("cargo")
        if not cargo_bin:
            log_err("Rust compiler 'cargo' not found in PATH. Install Rust from https://rustup.rs")
            sys.exit(1)
        cargo_ver = subprocess.check_output([cargo_bin, "--version"], text=True).strip()
        log_ok(f"Rust Cargo: {cargo_ver}")

        if not shutil.which(self.npm_cmd):
            log_err(f"'{self.npm_cmd}' not found in PATH. Install Node.js from https://nodejs.org")
            sys.exit(1)
        node_ver = subprocess.check_output(["node", "--version"], text=True).strip()
        log_ok(f"Node.js: {node_ver}")

        redis_path = find_redis_server()
        if redis_path:
            log_ok(f"Found Redis server: {redis_path}")
        else:
            log_warn("redis-server not found. Target machine will need redis installed and running.")

    def build_operator(self) -> None:
        log_step(2, self.total_steps, f"Compiling Rust Operator Service ({self.op_bin_name})")
        operator_bin = OPERATOR_DIR / "target" / "release" / self.op_bin_name
        run_command(["cargo", "build", "--release"], OPERATOR_DIR, "Operator release compilation")
        if not operator_bin.exists():
            log_err(f"Expected binary not found at {operator_bin}")
            sys.exit(1)
        log_ok(f"Generated Operator binary: {operator_bin} ({get_file_size_mb(operator_bin):.1f} MB)")

    def build_client(self) -> None:
        log_step(3, self.total_steps, "Building Client Web Assets (Vite + React)")
        client_dist_index = CLIENT_DIR / "dist" / "index.html"
        run_command([self.npm_cmd, "run", "build"], CLIENT_DIR, "Client web build (tsc & vite)")
        if not client_dist_index.exists():
            log_err(f"Client build failed to produce {client_dist_index}")
            sys.exit(1)
        log_ok("Client production web bundle created successfully in Client/dist/")

    def stage_resources(self) -> None:
        log_step(4, self.total_steps, "Staging Microservices & Binaries into Tauri Resources")

        RESOURCES_BIN_DIR.mkdir(parents=True, exist_ok=True)
        RESOURCES_BACKEND_DIR.mkdir(parents=True, exist_ok=True)

        operator_src = OPERATOR_DIR / "target" / "release" / self.op_bin_name
        operator_dst = RESOURCES_BIN_DIR / self.op_bin_name
        if operator_src.exists():
            shutil.copy2(operator_src, operator_dst)
            if not self.is_windows:
                operator_dst.chmod(0o755)
            log_ok(f"Staged Operator binary -> {operator_dst.name} ({get_file_size_mb(operator_dst):.1f} MB)")

        if self.is_windows:
            redis_src = find_redis_server()
            if redis_src and redis_src.exists():
                redis_dst = RESOURCES_BIN_DIR / "redis-server.exe"
                try:
                    if redis_src.resolve() != redis_dst.resolve():
                        shutil.copy2(redis_src, redis_dst)
                    log_ok(f"Staged Redis server -> {redis_dst.name} ({get_file_size_mb(redis_dst):.1f} MB)")
                except Exception as e:
                    log_warn(f"Could not copy Redis binary: {e}")

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

        start_src = SCRIPT_DIR / "start.py"
        shutil.copy2(start_src, RESOURCES_BACKEND_DIR / "start.py")

        services_src = SCRIPT_DIR / "services.json"
        services_dst = RESOURCES_BACKEND_DIR / "services.json"
        if services_src.exists():
            shutil.copy2(services_src, services_dst)
        else:
            default_services = {
                "vault": "http://127.0.0.1:9001",
                "message_broker": "http://127.0.0.1:9002",
                "operator": "http://127.0.0.1:9003",
                "client": "http://127.0.0.1:9004",
                "memory": "http://127.0.0.1:9006",
                "engine": "http://127.0.0.1:9007"
            }
            with open(services_dst, "w", encoding="utf-8") as f:
                json.dump(default_services, f, indent=2)
        log_ok("Staged start.py orchestrator & services.json")

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

        if self.is_windows:
            desired_targets = "nsis"
        elif self.is_macos:
            desired_targets = "dmg"
        elif self.is_linux:
            desired_targets = ["deb", "appimage"]
        else:
            desired_targets = "all"

        if bundle.get("targets") != desired_targets:
            bundle["targets"] = desired_targets
            dirty = True
            log_info(f"Configured bundle.targets -> {desired_targets}")

        resources = bundle.setdefault("resources", [])
        if "resources/**/*" not in resources:
            resources.append("resources/**/*")
            dirty = True
            log_info("Added 'resources/**/*' to bundle.resources")

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
        log_step(6, self.total_steps, f"Building {self.os_name} Application Package ({self.bundle_target})")
        if self.is_linux:
            os.environ["APPIMAGE_EXTRACT_AND_RUN"] = "1"
        tauri_cmd = [self.npm_cmd, "run", "tauri", "build"]
        if self.is_linux:
            tauri_cmd.extend(["--", "--bundles", "deb,appimage"])
        elif self.is_macos:
            tauri_cmd.extend(["--", "--bundles", "dmg"])
        elif self.is_windows:
            tauri_cmd.extend(["--", "--bundles", "nsis"])

        run_command(tauri_cmd, CLIENT_DIR, f"Tauri {self.os_name} application packaging")

        bundle_base = TAURI_DIR / "target" / "release" / "bundle"
        packages: List[Path] = []

        if self.is_windows:
            for p in bundle_base.rglob("*.exe"):
                if p not in packages:
                    packages.append(p)
            if os.name == "nt":
                try:
                    import ctypes
                    ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)
                    log_ok("Notified Windows Explorer shell to refresh icon cache")
                except Exception:
                    pass
        elif self.is_macos:
            for p in bundle_base.rglob("*.dmg"):
                if p not in packages:
                    packages.append(p)
            for p in bundle_base.rglob("*.app"):
                if p not in packages:
                    packages.append(p)
        elif self.is_linux:
            for pattern in ("*.deb", "*.AppImage", "*.appimage"):
                for p in bundle_base.rglob(pattern):
                    if p not in packages:
                        packages.append(p)

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
        current_ver = get_project_version()
        print(f"\n{BOLD}{GREEN}======================================================{WHITE}")
        print(f"{BOLD}{GREEN} MIRA Master Packaging Pipeline ({self.os_name}) - v{current_ver} {WHITE}")
        print(f"{BOLD}{GREEN}======================================================{WHITE}")

        self.check_prerequisites()
        self.build_operator()
        self.build_client()
        self.stage_resources()
        self.verify_tauri_config()
        self.build_installer()

def get_project_version() -> str:
    tauri_conf_path = TAURI_DIR / "tauri.conf.json"
    if tauri_conf_path.exists():
        try:
            with open(tauri_conf_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "version" in data and data["version"]:
                    return str(data["version"]).strip()
        except Exception:
            pass

    client_pkg_path = CLIENT_DIR / "package.json"
    if client_pkg_path.exists():
        try:
            with open(client_pkg_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "version" in data and data["version"]:
                    return str(data["version"]).strip()
        except Exception:
            pass

    tauri_cargo_path = TAURI_DIR / "Cargo.toml"
    if tauri_cargo_path.exists():
        try:
            content = tauri_cargo_path.read_text(encoding="utf-8")
            match = re.search(r'(?m)^version\s*=\s*"([^"]+)"', content)
            if match:
                return match.group(1).strip()
        except Exception:
            pass

    return "0.0.0"

def set_project_version(new_version: str) -> None:
    new_version = new_version.lstrip("v").strip()
    print(f"\n{BOLD}{CYAN}Updating MIRA project version to:{WHITE} {new_version}\n")

    tauri_conf_path = TAURI_DIR / "tauri.conf.json"
    if tauri_conf_path.exists():
        with open(tauri_conf_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["version"] = new_version
        with open(tauri_conf_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        log_ok(f"Updated {tauri_conf_path.relative_to(ROOT_DIR)} -> \"{new_version}\"")

    client_pkg_path = CLIENT_DIR / "package.json"
    if client_pkg_path.exists():
        with open(client_pkg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        data["version"] = new_version
        with open(client_pkg_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        log_ok(f"Updated {client_pkg_path.relative_to(ROOT_DIR)} -> \"{new_version}\"")

    tauri_cargo_path = TAURI_DIR / "Cargo.toml"
    if tauri_cargo_path.exists():
        content = tauri_cargo_path.read_text(encoding="utf-8")
        updated = re.sub(r'(?m)^version\s*=\s*"[^"]+"', f'version = "{new_version}"', content, count=1)
        tauri_cargo_path.write_text(updated, encoding="utf-8")
        log_ok(f"Updated {tauri_cargo_path.relative_to(ROOT_DIR)} -> \"{new_version}\"")

    op_cargo_path = OPERATOR_DIR / "Cargo.toml"
    if op_cargo_path.exists():
        content = op_cargo_path.read_text(encoding="utf-8")
        updated = re.sub(r'(?m)^version\s*=\s*"[^"]+"', f'version = "{new_version}"', content, count=1)
        op_cargo_path.write_text(updated, encoding="utf-8")
        log_ok(f"Updated {op_cargo_path.relative_to(ROOT_DIR)} -> \"{new_version}\"")

    print(f"\n{BOLD}{GREEN}★ Version updated to {new_version} across all build configurations! ★{WHITE}\n")

def main() -> None:
    if len(sys.argv) == 2 and sys.argv[1].lower() in ("-v", "--version", "--get-version", "get-version", "version"):
        print(get_project_version())
        return

    if len(sys.argv) >= 2 and sys.argv[1] in ("set-version", "--set-version"):
        if len(sys.argv) > 2:
            set_project_version(sys.argv[2])
        return

    parser = argparse.ArgumentParser()
    parser.add_argument("-v", "--version", "--get-version", action="store_true", dest="get_version")
    parser.add_argument("--set-version", type=str, default="")
    args, _ = parser.parse_known_args()

    if args.get_version:
        print(get_project_version())
        return

    if args.set_version:
        set_project_version(args.set_version)
        return

    packager = UnifiedPackager()
    packager.run()

if __name__ == "__main__":
    main()
