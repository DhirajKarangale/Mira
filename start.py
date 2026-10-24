from __future__ import annotations

import argparse
import json
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT_DIR = Path(__file__).resolve().parent
SERVICES_JSON_PATH = ROOT_DIR / "services.json"

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
MAGENTA = "\033[95m"
RED = "\033[91m"
WHITE = "\033[97m"
TEAL = "\033[36m"
PURPLE = "\033[35m"

MODULE_COLORS = {
    "vault": BLUE,
    "message_broker": MAGENTA,
    "operator": GREEN,
    "client": TEAL,
    "memory": CYAN,
    "engine": PURPLE,
    "system": BOLD + WHITE,
}

MODULE_REGISTRY: List[Dict[str, Any]] = [
    {
        "id": "vault",
        "name": "Vault",
        "description": "Encrypted configuration, audit logs, and secrets storage",
        "dir": ROOT_DIR / "Vault",
        "default_port": 9001,
        "default_host": "127.0.0.1",
        "order": 1,
        "health_path": "/health",
        "type": "fastapi",
        "is_optional": False,
        "env_port_key": "VAULT_PORT",
        "env_host_key": "VAULT_HOST",
    },
    {
        "id": "message_broker",
        "name": "Message Broker",
        "description": "Redis Streams message broker and job queue hub",
        "dir": ROOT_DIR / "Message_Broker",
        "default_port": 9002,
        "default_host": "127.0.0.1",
        "order": 2,
        "health_path": "/health",
        "type": "fastapi",
        "is_optional": False,
        "env_port_key": "PORT",
        "env_host_key": "SERVER_HOST",
    },
    {
        "id": "operator",
        "name": "Operator",
        "description": "Rust OS automation, active app tracking, and silent capture",
        "dir": ROOT_DIR / "Operator",
        "default_port": 9003,
        "default_host": "127.0.0.1",
        "order": 3,
        "health_path": "/health",
        "type": "rust",
        "is_optional": False,
        "env_port_key": "OPERATOR_PORT",
        "env_host_key": "OPERATOR_HOST",
    },
    {
        "id": "client",
        "name": "Client",
        "description": "Tauri v2 + React 19 desktop user interface",
        "dir": ROOT_DIR / "Client",
        "default_port": 9004,
        "default_host": "127.0.0.1",
        "order": 4,
        "health_path": "/",
        "type": "node",
        "is_optional": False,
        "env_port_key": "PORT",
        "env_host_key": "HOST",
    },
    {
        "id": "memory",
        "name": "Memory",
        "description": "Image processing, OCR extraction, and Qdrant vector retrieval",
        "dir": ROOT_DIR / "Memory",
        "default_port": 9006,
        "default_host": "127.0.0.1",
        "order": 5,
        "health_path": "/health",
        "type": "fastapi",
        "is_optional": True,
        "env_port_key": "PORT",
        "env_host_key": "HOST",
    },
    {
        "id": "engine",
        "name": "Engine",
        "description": "LLM orchestration, LangChain/LangGraph workflow coordinator",
        "dir": ROOT_DIR / "Engine",
        "default_port": 9007,
        "default_host": "127.0.0.1",
        "order": 6,
        "health_path": "/health",
        "type": "fastapi",
        "is_optional": True,
        "env_port_key": "PORT",
        "env_host_key": "HOST",
    },
]

def print_banner() -> None:
    lines = [
        color(" __  __ ___ ____      _     ", CYAN),
        color("|  \\/  |_ _|  _ \\    / \\    ", CYAN),
        color("| |\\/| || || |_) |  / _ \\   ", CYAN),
        color("| |  | || ||  _ <  / ___ \\  ", CYAN),
        color("|_|  |_|___|_| \\_\\/_/   \\_\\ ", CYAN),
        color("Memory · Intelligence · Recall · Assistant", BOLD + WHITE),
        color("Unified Multi-Module Starter & Lifecycle Manager", DIM),
    ]
    print("\n" + "\n".join(lines) + "\n")

def log_sys(msg: str) -> None:
    tag = color("[MIRA SYSTEM]", MODULE_COLORS["system"])
    print(f"{tag} {msg}")

def log_mod(mod_id: str, msg: str) -> None:
    color_code = MODULE_COLORS.get(mod_id, WHITE)
    raw_tag = f"[{mod_id.upper()}]"
    padded = f"{raw_tag:<16}"
    tag = color(padded, color_code)
    print(f"{tag} {msg}")

def is_port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
        except OSError:
            return True

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.15)
        if s.connect_ex((host, port)) == 0:
            return True

    return False

def resolve_module_port(module: Dict[str, Any], allocated_ports: Set[int]) -> Tuple[int, bool]:
    host = module["default_host"]
    port = module["default_port"]
    was_incremented = False

    while port in allocated_ports or is_port_in_use(host, port):
        was_incremented = True
        port += 1

    allocated_ports.add(port)
    if module.get("id") == "client":

        allocated_ports.add(port + 1)
    return port, was_incremented

def allocate_all_ports(modules: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    allocated_ports: Set[int] = set()
    results: Dict[str, Dict[str, Any]] = {}

    for mod in sorted(modules, key=lambda m: m["order"]):
        port, incremented = resolve_module_port(mod, allocated_ports)
        results[mod["id"]] = {
            "module": mod,
            "port": port,
            "default_port": mod["default_port"],
            "host": mod["default_host"],
            "url": f"http://{mod['default_host']}:{port}",
            "incremented": incremented,
        }

    return results

def load_services_json() -> Dict[str, str]:
    if SERVICES_JSON_PATH.exists():
        try:
            with open(SERVICES_JSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def update_services_json(url_map: Dict[str, str]) -> None:
    with open(SERVICES_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(url_map, f, indent=2)
    log_sys(f"Updated global service discovery registry -> {color(str(SERVICES_JSON_PATH), CYAN)}")

def update_client_configs(url_map: Dict[str, str], client_port: int) -> None:
    client_dir = ROOT_DIR / "Client"
    if not client_dir.exists():
        return

    env_local_path = client_dir / ".env.local"
    env_lines = [
        f"PORT={client_port}",
        f"VITE_PORT={client_port}",
        f"VITE_VAULT_URL={url_map.get('vault', '')}",
        f"VITE_MESSAGE_BROKER_URL={url_map.get('message_broker', '')}",
        f"VITE_OPERATOR_URL={url_map.get('operator', '')}",
        f"VITE_CLIENT_URL={url_map.get('client', '')}",
    ]
    if "memory" in url_map:
        env_lines.append(f"VITE_MEMORY_URL={url_map['memory']}")
    if "engine" in url_map:
        env_lines.append(f"VITE_ENGINE_URL={url_map['engine']}")

    with open(env_local_path, "w", encoding="utf-8") as f:
        f.write("\n".join(env_lines) + "\n")
    log_sys(f"Synchronized Client environment -> {color(str(env_local_path), CYAN)}")

    tauri_conf_path = client_dir / "src-tauri" / "tauri.conf.json"
    if tauri_conf_path.exists():
        try:
            with open(tauri_conf_path, "r", encoding="utf-8") as f:
                tauri_conf = json.load(f)

            target_dev_url = f"http://localhost:{client_port}"
            if tauri_conf.get("build", {}).get("devUrl") != target_dev_url:
                if "build" not in tauri_conf:
                    tauri_conf["build"] = {}
                tauri_conf["build"]["devUrl"] = target_dev_url
                with open(tauri_conf_path, "w", encoding="utf-8") as f:
                    json.dump(tauri_conf, f, indent=2)
                log_sys(f"Updated Tauri devUrl: {color(target_dev_url, CYAN)}")
        except Exception as e:
            log_sys(f"Notice: Failed to update tauri.conf.json devUrl ({e})")

def check_service_health(url: str, timeout_sec: float = 1.0) -> bool:
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "MIRA-Starter/1.0",
                "Accept": "application/json",
                "Connection": "close"
            }
        )
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            resp.read()
            return resp.status in (200, 204, 301, 302, 304, 307, 308)
    except urllib.error.HTTPError as e:
        return e.code in (200, 204, 301, 302, 304, 404, 405)
    except Exception:
        return False

def wait_for_service_ready(
    name: str,
    mod_id: str,
    base_url: str,
    health_path: str,
    max_wait_seconds: float = 30.0,
    check_interval: float = 0.5
) -> bool:
    health_url = f"{base_url.rstrip('/')}{health_path}"
    start_time = time.time()
    last_print = 0

    while time.time() - start_time < max_wait_seconds:
        if check_service_health(health_url):
            return True

        elapsed = int(time.time() - start_time)
        if elapsed > 0 and elapsed % 5 == 0 and elapsed != last_print:
            log_mod(mod_id, f"Waiting for {name} to be ready on {base_url}... ({elapsed}s)")
            last_print = elapsed

        time.sleep(check_interval)

    return False

class LogFilterManager:
    def __init__(self, vault_url: str):
        self.vault_url = vault_url.rstrip("/")
        self._config: Dict[str, Any] = {}
        self._last_fetch: float = 0.0
        self._lock = threading.Lock()

    def should_show_module(self, mod_id: str, line: str) -> bool:
        lower_line = line.lower()
        if any(err in lower_line for err in ("error", "fatal", "panic", "traceback", "exception", "failed to start", "failed to launch")):
            return True

        now = time.time()
        if now - self._last_fetch > 2.0:
            self._fetch_config()

        with self._lock:
            mod_key = mod_id.lower().replace("-", "_")
            config_key = f"show_logs_{mod_key}"

            if config_key in self._config:
                return bool(self._config[config_key])

            if mod_key == "vault":
                show_values = [v for k, v in self._config.items() if k.startswith("show_logs_")]
                if show_values and not any(show_values):
                    if "http/1.1" in lower_line and ("200 ok" in lower_line or "201 created" in lower_line or "304 not modified" in lower_line):
                        return False

            return True

    def _fetch_config(self) -> None:
        if not self.vault_url:
            return
        try:
            req = urllib.request.Request(
                f"{self.vault_url}/config/logs",
                headers={
                    "User-Agent": "MIRA-Starter/1.0",
                    "Accept": "application/json",
                    "Connection": "close"
                }
            )
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    raw = resp.read()
                    data = json.loads(raw.decode("utf-8"))
                    with self._lock:
                        self._config = data
                        self._last_fetch = time.time()
        except Exception:
            pass

class ProcessRunner:
    def __init__(self, vault_url: str = ""):
        self.processes: Dict[str, subprocess.Popen] = {}
        self.threads: List[threading.Thread] = []
        self._shutdown_event = threading.Event()
        self.log_filter = LogFilterManager(vault_url) if vault_url else None

    def build_command(self, module: Dict[str, Any], port: int, host: str) -> List[str]:
        mod_type = module["type"]

        if mod_type == "fastapi":
            return [sys.executable, "-m", "uvicorn", "app:app", "--host", host, "--port", str(port), "--reload"]
        elif mod_type == "rust":
            return ["cargo", "run", "--", "--host", host, "--port", str(port)]
        elif mod_type == "node":
            npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
            return [npm_cmd, "run", "dev", "--", "--port", str(port), "--host", host]
        else:
            raise ValueError(f"Unknown module type: {mod_type}")

    def prepare_environment(
        self,
        module: Dict[str, Any],
        port: int,
        host: str,
        url_map: Dict[str, str]
    ) -> Dict[str, str]:
        env = os.environ.copy()
        env["SERVICES_JSON_PATH"] = str(SERVICES_JSON_PATH.resolve())
        env["HOST"] = host
        env["PORT"] = str(port)
        env["PYTHONUNBUFFERED"] = "1"
        env["FORCE_COLOR"] = "1"

        for key, url in url_map.items():
            env[f"{key.upper()}_URL"] = url

        env_port_key = module.get("env_port_key")
        if env_port_key:
            env[env_port_key] = str(port)

        env_host_key = module.get("env_host_key")
        if env_host_key:
            env[env_host_key] = host

        if module["id"] == "client":
            env["VITE_PORT"] = str(port)
            env["VITE_VAULT_URL"] = url_map.get("vault", "")
            env["VITE_MESSAGE_BROKER_URL"] = url_map.get("message_broker", "")
            env["VITE_OPERATOR_URL"] = url_map.get("operator", "")
            env["VITE_MEMORY_URL"] = url_map.get("memory", "")
            env["VITE_ENGINE_URL"] = url_map.get("engine", "")

        return env

    def stream_output(self, mod_id: str, proc: subprocess.Popen) -> None:
        try:
            if proc.stdout:
                for raw_line in iter(proc.stdout.readline, ""):
                    if self._shutdown_event.is_set():
                        break
                    line = raw_line.rstrip("\r\n")
                    if line:
                        if self.log_filter is None or self.log_filter.should_show_module(mod_id, line):
                            log_mod(mod_id, line)
        except Exception:
            pass

    def start_module(self, alloc: Dict[str, Any], url_map: Dict[str, str]) -> bool:
        mod = alloc["module"]
        mod_id = mod["id"]
        mod_name = mod["name"]
        mod_dir = mod["dir"]
        port = alloc["port"]
        host = alloc["host"]
        url = alloc["url"]

        if not mod_dir.exists():
            if mod.get("is_optional", False):
                log_sys(f"{color('WARNING:', YELLOW)} Skipping optional module {color(mod_name, BOLD + WHITE)} (directory '{mod_dir.name}' not found).")
                return True
            else:
                log_sys(f"{color('ERROR:', RED)} Required module directory '{mod_dir}' does not exist.")
                return False

        cmd = self.build_command(mod, port, host)
        env = self.prepare_environment(mod, port, host, url_map)

        log_sys(f"Launching {color(mod_name, BOLD + WHITE)} on {color(url, CYAN)} ({color(' '.join(cmd), DIM)})...")

        try:
            use_shell = os.name == "nt" and mod["type"] == "node"
            proc = subprocess.Popen(
                cmd,
                cwd=str(mod_dir),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                shell=use_shell,
            )
            self.processes[mod_id] = proc

            t = threading.Thread(
                target=self.stream_output,
                args=(mod_id, proc),
                daemon=True,
                name=f"stream-{mod_id}"
            )
            t.start()
            self.threads.append(t)

            max_wait = 60.0 if mod["type"] == "rust" else 30.0
            log_mod(mod_id, f"Initializing {mod_name} (Port {port})...")
            is_ready = wait_for_service_ready(
                name=mod_name,
                mod_id=mod_id,
                base_url=url,
                health_path=mod["health_path"],
                max_wait_seconds=max_wait
            )

            if is_ready:
                log_mod(mod_id, f"{color('ONLINE & HEALTHY', GREEN)} at {color(url, CYAN)}")
                return True
            else:
                if proc.poll() is not None:
                    log_mod(mod_id, f"{color('FAILED:', RED)} Process exited prematurely with code {proc.returncode}.")
                    return False
                log_mod(mod_id, f"{color('WARNING:', YELLOW)} Health check timed out, but process is running. Continuing...")
                return True

        except Exception as e:
            log_sys(f"{color('FAILED to launch', RED)} {mod_name}: {e}")
            return False

    def shutdown(self) -> None:
        self._shutdown_event.set()
        log_sys(f"{color('Initiating graceful shutdown of all MIRA modules...', CYAN)}")

        for mod_id, proc in list(self.processes.items()):
            if proc.poll() is None:
                log_mod(mod_id, f"Stopping process (PID {proc.pid})...")
                try:
                    if os.name == "nt":
                        subprocess.run(
                            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL,
                            check=False
                        )
                    else:
                        proc.terminate()
                except Exception:
                    try:
                        proc.kill()
                    except Exception:
                        pass

        time.sleep(1.0)
        log_sys(f"{color('All MIRA services stopped cleanly. Goodbye!', GREEN)}")

def kill_processes_on_ports(ports: List[int]) -> None:
    log_sys(f"Checking for lingering processes on ports: {ports}...")
    killed_count = 0

    if os.name == "nt":
        for port in ports:
            try:
                out = subprocess.check_output(
                    f"netstat -ano | findstr :{port}",
                    shell=True,
                    text=True,
                    stderr=subprocess.DEVNULL
                )
                pids = set()
                for line in out.strip().splitlines():
                    parts = line.strip().split()
                    if len(parts) >= 5 and "LISTENING" in line:
                        pid = parts[-1]
                        if pid.isdigit() and pid != "0":
                            pids.add(pid)

                for pid in pids:
                    log_sys(f"Terminating PID {pid} holding port {port}...")
                    subprocess.run(
                        ["taskkill", "/F", "/PID", pid],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        check=False
                    )
                    killed_count += 1
            except Exception:
                pass
    else:
        for port in ports:
            try:
                out = subprocess.check_output(f"lsof -ti:{port}", shell=True, text=True).strip()
                if out:
                    for pid in out.split():
                        log_sys(f"Terminating PID {pid} holding port {port}...")
                        subprocess.run(["kill", "-9", pid], check=False)
                        killed_count += 1
            except Exception:
                pass

    if killed_count > 0:
        log_sys(f"{color('Successfully terminated', GREEN)} {killed_count} process(es) holding default ports.")
    else:
        log_sys(f"{color('No lingering processes found on target ports.', GREEN)}")

def check_system_status() -> None:
    print_banner()
    log_sys("Checking live status of all MIRA services...")
    services = load_services_json()

    print("\n" + "=" * 78)
    print(f"{'Module':<18} {'Configured URL':<30} {'Port':<8} {'Status':<15}")
    print("=" * 78)

    for mod in MODULE_REGISTRY:
        mod_id = mod["id"]
        default_url = f"http://{mod['default_host']}:{mod['default_port']}"
        configured_url = services.get(mod_id, default_url)
        clean = configured_url.replace("http://", "").replace("https://", "").rstrip("/")
        port = clean.split(":")[1] if ":" in clean else str(mod["default_port"])

        health_url = f"{configured_url.rstrip('/')}{mod['health_path']}"
        is_healthy = check_service_health(health_url)

        if is_healthy:
            status_text = color("● ONLINE", GREEN)
        else:
            in_use = is_port_in_use(mod["default_host"], int(port))
            if in_use:
                status_text = color("▲ OCCUPIED", YELLOW)
            else:
                status_text = color("○ OFFLINE", RED)

        print(f"{mod['name']:<18} {configured_url:<30} {port:<8} {status_text:<15}")

    print("=" * 78 + "\n")

def main() -> None:
    parser = argparse.ArgumentParser(
        description="MIRA Unified Multi-Service Starter",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--modules",
        type=str,
        default="",
        help="Comma-separated list of module IDs to start (e.g. 'vault,message_broker,operator,client')"
    )
    parser.add_argument(
        "--no-client",
        action="store_true",
        help="Skip starting the frontend Client module"
    )
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="Do not automatically open the Client UI in the default browser"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check port availability and print allocation plan without launching"
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Check health and connectivity status of currently running modules"
    )
    parser.add_argument(
        "--kill-ports",
        action="store_true",
        help="Forcefully terminate any existing processes holding the default ports"
    )

    args = parser.parse_args()

    if args.status:
        check_system_status()
        return

    if args.kill_ports:
        print_banner()
        default_ports = [m["default_port"] for m in MODULE_REGISTRY]
        kill_processes_on_ports(default_ports)
        return

    print_banner()

    target_modules = list(MODULE_REGISTRY)
    if args.modules:
        requested = [m.strip().lower() for m in args.modules.split(",") if m.strip()]
        target_modules = [m for m in target_modules if m["id"] in requested]
        if not target_modules:
            log_sys(f"{color('ERROR:', RED)} No matching modules found for: '{args.modules}'")
            sys.exit(1)

    if args.no_client:
        target_modules = [m for m in target_modules if m["id"] != "client"]

    active_modules = []
    for mod in target_modules:
        if not mod["dir"].exists() and mod.get("is_optional", False):
            continue
        active_modules.append(mod)

    log_sys("Calculating port allocations and resolving port conflicts...")

    allocations = allocate_all_ports(active_modules)

    url_map: Dict[str, str] = {}
    for mod_id, alloc in allocations.items():
        url_map[mod_id] = alloc["url"]
    for mod in MODULE_REGISTRY:
        if mod["id"] not in url_map:
            url_map[mod["id"]] = f"http://{mod['default_host']}:{mod['default_port']}"

    print("\n" + "=" * 82)
    print(f"{'Module':<18} {'Default Port':<14} {'Assigned Port':<15} {'Assigned Base URL':<28} {'Status':<10}")
    print("=" * 82)

    for mod_id, alloc in allocations.items():
        name = alloc["module"]["name"]
        def_port = str(alloc["default_port"])
        asgn_port = str(alloc["port"])
        url = alloc["url"]
        if alloc["incremented"]:
            status_desc = color("INCREMENTED", YELLOW)
        else:
            status_desc = color("OK (DEFAULT)", GREEN)

        print(f"{name:<18} {def_port:<14} {asgn_port:<15} {url:<28} {status_desc:<10}")

    print("=" * 82 + "\n")

    if args.check:
        log_sys(f"{color('Port availability inspection complete.', GREEN)} Exiting (--check mode).")
        return

    log_sys("Updating services.json with resolved module base URLs...")
    update_services_json(url_map)

    client_port = allocations.get("client", {}).get("port", 9004)
    update_client_configs(url_map, client_port)

    vault_url = url_map.get("vault", "")
    runner = ProcessRunner(vault_url)

    def signal_handler(signum, frame):
        print()
        runner.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    log_sys("Starting modules in coordinated dependency order...")
    sorted_allocs = sorted(allocations.values(), key=lambda a: a["module"]["order"])

    for alloc in sorted_allocs:
        success = runner.start_module(alloc, url_map)
        if not success:
            log_sys(f"{color('ERROR: Failed to start', RED)} {alloc['module']['name']}. Aborting startup.")
            runner.shutdown()
            sys.exit(1)

    print("\n" + "=" * 82)
    log_sys(f"{color('ALL MIRA MODULES ARE ONLINE AND SYNCHRONIZED!', GREEN + BOLD)}")
    log_sys(f"Client UI:        {color(url_map.get('client', ''), CYAN)}")
    log_sys(f"Vault Engine:     {color(url_map.get('vault', ''), CYAN)}")
    log_sys(f"Message Broker:   {color(url_map.get('message_broker', ''), CYAN)}")
    log_sys(f"Operator Engine:  {color(url_map.get('operator', ''), CYAN)}")
    log_sys(f"Press {color('Ctrl+C', CYAN + BOLD)} at any time to gracefully shut down all modules.")
    print("=" * 82 + "\n")

    client_url = url_map.get("client")
    if client_url and not args.no_client and not args.no_open:
        log_sys(f"Auto-launching Client UI in default browser -> {color(client_url, CYAN)}")
        try:
            webbrowser.open(client_url)
        except Exception as e:
            log_sys(f"Notice: Could not auto-open browser ({e})")

    try:
        while True:
            for mod_id, proc in list(runner.processes.items()):
                code = proc.poll()
                if code is not None:
                    mod_name = allocations[mod_id]["module"]["name"]
                    log_sys(f"{color('WARNING:', YELLOW)} {mod_name} terminated with exit code {code}.")
            time.sleep(1.0)
    except KeyboardInterrupt:
        runner.shutdown()

if __name__ == "__main__":
    main()
