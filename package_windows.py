#!/usr/bin/env python3
"""
MIRA - Master Windows Packaging & Release Builder
==================================================
Combines all MIRA modules (Client, Operator, Vault, Message Broker, Memory, Engine, Redis)
into a single, fully installable Windows (.exe) desktop application.

Usage:
    python package_windows.py               # Complete build & bundle
    python package_windows.py --skip-operator  # Reuse existing operator.exe
    python package_windows.py --skip-client    # Reuse existing Client/dist
    python package_windows.py --stage-only     # Prepare bundle resources without running Tauri build
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
from typing import Dict, List, Optional, Set

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
    res = subprocess.run(cmd, cwd=str(cwd), shell=(os.name == "nt" and cmd[0].endswith(".cmd")))
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
    candidates = [
        Path(r"F:\Software\Redis-5.0.14.1\redis-server.exe"),
        ROOT_DIR / "bin" / "redis-server.exe",
        RESOURCES_BIN_DIR / "redis-server.exe",
    ]
    for c in candidates:
        if c.exists():
            return c

    which = shutil.which("redis-server")
    if which:
        return Path(which)
    return None

class WindowsPackager:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.total_steps = 6 if not args.stage_only else 5

    def check_prerequisites(self) -> None:
        log_step(1, self.total_steps, "Verifying Tools & Prerequisites")

        # 1. Check Python
        log_info(f"Python interpreter: {sys.executable} ({sys.version.split()[0]})")

        # 2. Check Rust & Cargo
        cargo_ver = shutil.which("cargo")
        if not cargo_ver:
            log_err("Rust compiler 'cargo' not found in PATH.")
            sys.exit(1)
        cargo_out = subprocess.check_output(["cargo", "--version"], text=True).strip()
        log_ok(f"Rust Cargo: {cargo_out}")

        # 3. Check Node & NPM
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
        if not shutil.which(npm_cmd):
            log_err("Node/NPM not found in PATH.")
            sys.exit(1)
        node_out = subprocess.check_output(["node", "--version"], text=True).strip()
        log_ok(f"Node.js: {node_out}")

        # 4. Check Redis binary
        redis_path = find_redis_server()
        if redis_path:
            log_ok(f"Found Redis server: {redis_path}")
        else:
            log_warn("redis-server.exe not found. Packaged app will require Redis running on target machine.")

    def build_operator(self) -> None:
        log_step(2, self.total_steps, "Compiling Rust Operator Service")
        operator_release_exe = OPERATOR_DIR / "target" / "release" / "operator.exe"

        if self.args.skip_operator and operator_release_exe.exists():
            log_ok(f"Using pre-built Operator binary: {operator_release_exe} ({get_file_size_mb(operator_release_exe):.1f} MB)")
            return

        run_command(["cargo", "build", "--release"], OPERATOR_DIR, "Operator release compilation")
        if not operator_release_exe.exists():
            log_err(f"Expected binary not found at {operator_release_exe}")
            sys.exit(1)
        log_ok(f"Generated Operator binary: {operator_release_exe} ({get_file_size_mb(operator_release_exe):.1f} MB)")

    def build_client(self) -> None:
        log_step(3, self.total_steps, "Building Client Web Assets")
        client_dist_index = CLIENT_DIR / "dist" / "index.html"

        if self.args.skip_client and client_dist_index.exists():
            log_ok(f"Using pre-built Client web assets: {CLIENT_DIR / 'dist'}")
            return

        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
        run_command([npm_cmd, "run", "build"], CLIENT_DIR, "Client web build (tsc & vite)")
        if not client_dist_index.exists():
            log_err(f"Client build failed to produce {client_dist_index}")
            sys.exit(1)
        log_ok("Client production web bundle created successfully in Client/dist/")

    def stage_resources(self) -> None:
        log_step(4, self.total_steps, "Staging Microservices & Binaries into Tauri Resources")

        RESOURCES_BIN_DIR.mkdir(parents=True, exist_ok=True)
        RESOURCES_BACKEND_DIR.mkdir(parents=True, exist_ok=True)

        # 1. Copy Operator executable
        operator_src = OPERATOR_DIR / "target" / "release" / "operator.exe"
        operator_dst = RESOURCES_BIN_DIR / "operator.exe"
        if operator_src.exists():
            shutil.copy2(operator_src, operator_dst)
            log_ok(f"Staged Operator binary -> {operator_dst.name} ({get_file_size_mb(operator_dst):.1f} MB)")

        # 2. Copy Redis executable if found
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
                    or low in (".git", "__pycache__", ".pytest_cache", "tests", "target", "screenshots", "knowledge_base", "cache")
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

    def verify_tauri_config(self) -> None:
        log_step(5, self.total_steps, "Validating Tauri Bundle Configuration")
        tauri_conf_path = TAURI_DIR / "tauri.conf.json"

        with open(tauri_conf_path, "r", encoding="utf-8") as f:
            conf = json.load(f)

        bundle = conf.get("bundle", {})
        dirty = False

        if bundle.get("targets") != "nsis":
            bundle["targets"] = "nsis"
            dirty = True
            log_info("Updated bundle.targets to 'nsis' (prevents Windows 11 WiX MSI failure)")

        resources = bundle.get("resources", [])
        if "resources/**/*" not in resources:
            resources.append("resources/**/*")
            bundle["resources"] = resources
            dirty = True
            log_info("Added 'resources/**/*' to bundle.resources")

        if dirty:
            conf["bundle"] = bundle
            with open(tauri_conf_path, "w", encoding="utf-8") as f:
                json.dump(conf, f, indent=2)
            log_ok("Updated Client/src-tauri/tauri.conf.json")
        else:
            log_ok("Tauri bundle configuration is verified and ready")

    def build_installer(self) -> None:
        if self.args.stage_only:
            log_info("Stage-only mode specified. Skipping installer build.")
            return

        log_step(6, self.total_steps, "Building Windows NSIS Installer Package")
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

        run_command([npm_cmd, "run", "tauri", "build"], CLIENT_DIR, "Tauri Windows installer generation")

        nsis_bundle_dir = TAURI_DIR / "target" / "release" / "bundle" / "nsis"
        installers = list(nsis_bundle_dir.glob("*.exe")) if nsis_bundle_dir.exists() else []

        if not installers:
            log_err("Build completed but no .exe was found in bundle/nsis/")
            sys.exit(1)

        installer = installers[0]
        size_mb = get_file_size_mb(installer)
        checksum = calculate_sha256(installer)

        print("\n" + "=" * 80)
        print(f" {BOLD}{GREEN}★ MIRA WINDOWS APPLICATION PACKAGED SUCCESSFULLY! ★{WHITE}")
        print("=" * 80)
        print(f"  {BOLD}Installer File:{WHITE}  {color(str(installer), CYAN)}")
        print(f"  {BOLD}Package Size:{WHITE}    {size_mb:.2f} MB")
        print(f"  {BOLD}SHA256 Hash:{WHITE}     {checksum}")
        print("-" * 80)
        print(f"  {BOLD}What happens when a user runs this installer:{WHITE}")
        print(f"  1. A standard Windows installation wizard guides the user.")
        install_dir = "%LOCALAPPDATA%\\Programs\\MIRA"
        print(f"  2. Installs into {color(install_dir, CYAN)}.")
        print(f"  3. Creates a Start Menu entry and Desktop icon with high-res branding.")
        print(f"  4. On launch, MIRA starts the UI and silently coordinates background services.")
        print(f"  5. On app exit, all background processes are cleanly terminated.")
        print(f"  6. Supports clean removal via Windows Settings > Installed Apps.")
        print("=" * 80 + "\n")

def main() -> None:
    parser = argparse.ArgumentParser(description="MIRA Master Windows Packaging Script")
    parser.add_argument("--skip-operator", action="store_true", help="Skip cargo build --release for Operator if binary exists")
    parser.add_argument("--skip-client", action="store_true", help="Skip npm run build for Client if dist exists")
    parser.add_argument("--stage-only", action="store_true", help="Stage all resources into src-tauri without running tauri build")

    args = parser.parse_args()

    packager = WindowsPackager(args)
    packager.check_prerequisites()
    packager.build_operator()
    packager.build_client()
    packager.stage_resources()
    packager.verify_tauri_config()
    packager.build_installer()

if __name__ == "__main__":
    main()
