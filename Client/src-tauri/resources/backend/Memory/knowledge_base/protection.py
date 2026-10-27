from __future__ import annotations
import ctypes
from ctypes import wintypes
import json
import logging
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))
from vault_logger import log, log_error
from .encryption import vault_crypto, IntegrityVerificationError, ENCRYPTION_PREFIX
KB_NAME_PATTERN = re.compile('^kb-(\\d{2})_(\\d{2})_(\\d{4})-(\\d{2})_(\\d{2})_(\\d{4})$')
MANIFEST_FILENAME = '.kb_manifest.enc'
LOCK_FILENAME = '.protect.lock'
VAULT_SNAPSHOT_FILENAME = 'vault_storage.enc'
logger = logging.getLogger('mira.memory.knowledge_base.protection')
IS_WINDOWS = sys.platform == 'win32'
IS_MACOS = sys.platform == 'darwin'
IS_LINUX = sys.platform.startswith('linux')
_CreateFileW = None
_CloseHandle = None
_msvcrt = None
if IS_WINDOWS:
    try:
        import msvcrt
        _msvcrt = msvcrt
    except ImportError:
        pass
    try:
        GENERIC_READ = 2147483648
        FILE_SHARE_READ = 1
        FILE_SHARE_WRITE = 2
        OPEN_EXISTING = 3
        FILE_FLAG_BACKUP_SEMANTICS = 33554432
        _kernel32 = ctypes.windll.kernel32
        _CreateFileW = _kernel32.CreateFileW
        _CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
        _CreateFileW.restype = wintypes.HANDLE
        _CloseHandle = _kernel32.CloseHandle
        _CloseHandle.argtypes = [wintypes.HANDLE]
        _CloseHandle.restype = wintypes.BOOL
    except Exception as e:
        logger.warning(f'Failed to bind Win32 directory handle APIs: {e}')

class FolderProtectionManager:

    def __init__(self) -> None:
        self._active_dir_handles: Dict[str, Any] = {}
        self._active_file_locks: Dict[str, Any] = {}

    def _get_current_windows_user(self) -> str:
        return os.environ.get('USERNAME') or os.environ.get('USER') or ''

    def _lock_windows(self, folder_path: Path) -> bool:
        lock_key = str(folder_path)
        success = True
        if _CreateFileW is not None and lock_key not in self._active_dir_handles:
            try:
                handle = _CreateFileW(str(folder_path), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, None, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS, None)
                if handle != wintypes.HANDLE(-1).value and handle != 0:
                    self._active_dir_handles[lock_key] = handle
                else:
                    logger.debug(f'Win32 CreateFileW returned handle {handle} for {folder_path.name}')
            except Exception as e:
                logger.debug(f"Failed to acquire Win32 directory handle for '{folder_path.name}': {e}")
        if lock_key not in self._active_file_locks:
            try:
                lock_file = folder_path / LOCK_FILENAME
                f = open(lock_file, 'a+b')
                if _msvcrt is not None:
                    try:
                        f.seek(0)
                        _msvcrt.locking(f.fileno(), _msvcrt.LK_NBLCK, 1)
                    except Exception:
                        pass
                self._active_file_locks[lock_key] = f
            except Exception as e:
                logger.debug(f"Failed to acquire inner file lock for '{folder_path.name}': {e}")
        username = self._get_current_windows_user()
        if username:
            try:
                cmd = f'icacls "{folder_path}" /deny "{username}":(DE)'
                subprocess.run(cmd, shell=True, capture_output=True, check=False)
            except Exception as e:
                logger.debug(f"Failed to set NTFS ACL deny on '{folder_path.name}': {e}")
        return success

    def _unlock_windows(self, folder_path: Path, remove_acl: bool=True) -> None:
        lock_key = str(folder_path)
        handle = self._active_dir_handles.pop(lock_key, None)
        if handle is not None and _CloseHandle is not None:
            try:
                _CloseHandle(handle)
            except Exception:
                pass
        f = self._active_file_locks.pop(lock_key, None)
        if f is not None:
            if _msvcrt is not None:
                try:
                    f.seek(0)
                    _msvcrt.locking(f.fileno(), _msvcrt.LK_UNLCK, 1)
                except Exception:
                    pass
            try:
                f.close()
            except Exception:
                pass
        if remove_acl:
            username = self._get_current_windows_user()
            if username:
                try:
                    cmd = f'icacls "{folder_path}" /remove:d "{username}"'
                    subprocess.run(cmd, shell=True, capture_output=True, check=False)
                except Exception as e:
                    logger.debug(f"Failed to remove NTFS ACL on '{folder_path.name}': {e}")

    def _lock_macos(self, folder_path: Path) -> bool:
        lock_key = str(folder_path)
        try:
            import stat
            if hasattr(os, 'chflags') and hasattr(stat, 'UF_IMMUTABLE'):
                os.chflags(str(folder_path), stat.UF_IMMUTABLE)
            else:
                subprocess.run(['chflags', 'uchg', str(folder_path)], check=False, capture_output=True)
        except Exception as e:
            try:
                subprocess.run(['chflags', 'uchg', str(folder_path)], check=False, capture_output=True)
            except Exception:
                logger.debug(f"Failed to set chflags uchg on '{folder_path.name}': {e}")
        try:
            subprocess.run(['chmod', '+a', 'everyone deny delete', str(folder_path)], check=False, capture_output=True)
        except Exception as e:
            logger.debug(f"Failed to set Darwin ACL on '{folder_path.name}': {e}")
        if lock_key not in self._active_file_locks:
            try:
                lock_file = folder_path / LOCK_FILENAME
                f = open(lock_file, 'a+b')
                self._active_file_locks[lock_key] = f
            except Exception:
                pass
        return True

    def _unlock_macos(self, folder_path: Path, remove_acl: bool=True) -> None:
        lock_key = str(folder_path)
        f = self._active_file_locks.pop(lock_key, None)
        if f is not None:
            try:
                f.close()
            except Exception:
                pass
        if remove_acl:
            try:
                if hasattr(os, 'chflags'):
                    os.chflags(str(folder_path), 0)
                else:
                    subprocess.run(['chflags', 'nouchg', str(folder_path)], check=False, capture_output=True)
            except Exception:
                try:
                    subprocess.run(['chflags', 'nouchg', str(folder_path)], check=False, capture_output=True)
                except Exception:
                    pass
            try:
                subprocess.run(['chmod', '-a', 'everyone deny delete', str(folder_path)], check=False, capture_output=True)
            except Exception:
                pass

    def _lock_linux(self, folder_path: Path) -> bool:
        lock_key = str(folder_path)
        if lock_key not in self._active_file_locks:
            try:
                import fcntl
                lock_file = folder_path / LOCK_FILENAME
                f = open(lock_file, 'a+b')
                try:
                    fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                except Exception:
                    pass
                self._active_file_locks[lock_key] = f
            except Exception:
                pass
        return True

    def _unlock_linux(self, folder_path: Path) -> None:
        lock_key = str(folder_path)
        f = self._active_file_locks.pop(lock_key, None)
        if f is not None:
            try:
                import fcntl
                try:
                    fcntl.flock(f.fileno(), fcntl.LOCK_UN)
                except Exception:
                    pass
                f.close()
            except Exception:
                pass

    def lock_folder(self, folder_path: Path) -> bool:
        try:
            folder_path = folder_path.resolve()
            if not folder_path.exists() or not folder_path.is_dir():
                return False
            if IS_WINDOWS:
                self._lock_windows(folder_path)
            elif IS_MACOS:
                self._lock_macos(folder_path)
            elif IS_LINUX:
                self._lock_linux(folder_path)
            log(f'[Protection] Protected Knowledge Base folder against renaming/deletion: {folder_path.name}')
            return True
        except Exception as e:
            log_error(f"[Protection] Failed to lock Knowledge Base folder '{folder_path}': {e}")
            return False

    def unlock_folder(self, folder_path: Path) -> None:
        try:
            folder_path = folder_path.resolve()
            if IS_WINDOWS:
                self._unlock_windows(folder_path, remove_acl=True)
            elif IS_MACOS:
                self._unlock_macos(folder_path, remove_acl=True)
            elif IS_LINUX:
                self._unlock_linux(folder_path)
            log(f'[Protection] Unlocked Knowledge Base folder for authorized lifecycle operation: {folder_path.name}')
        except Exception as e:
            log_error(f"[Protection] Error unlocking folder '{folder_path}': {e}")

    def unlock_all_folders(self) -> None:
        keys = set(list(self._active_dir_handles.keys()) + list(self._active_file_locks.keys()))
        for k in keys:
            folder_path = Path(k)
            if IS_WINDOWS:
                self._unlock_windows(folder_path, remove_acl=False)
            elif IS_MACOS:
                self._unlock_macos(folder_path, remove_acl=False)
            elif IS_LINUX:
                self._unlock_linux(folder_path)

    def create_or_update_manifest(self, folder_path: Path, canonical_name: str) -> bool:
        try:
            folder_path = folder_path.resolve()
            if not folder_path.exists():
                return False
            manifest_data = {'canonical_name': canonical_name, 'created_at': datetime.now().isoformat(), 'protected': True, 'version': '1.0'}
            serialized = json.dumps(manifest_data)
            encrypted_payload = vault_crypto.encrypt(serialized)
            manifest_path = folder_path / MANIFEST_FILENAME
            temp_path = manifest_path.with_suffix('.tmp')
            temp_path.write_text(encrypted_payload, encoding='utf-8')
            temp_path.replace(manifest_path)
            return True
        except Exception as e:
            log_error(f"[Protection] Failed to create encrypted manifest for '{folder_path.name}': {e}")
            return False

    def verify_and_restore_canonical_name(self, folder_path: Path) -> Path:
        try:
            folder_path = folder_path.resolve()
            manifest_path = folder_path / MANIFEST_FILENAME
            if not manifest_path.exists():
                if KB_NAME_PATTERN.match(folder_path.name):
                    self.create_or_update_manifest(folder_path, folder_path.name)
                return folder_path
            encrypted_payload = manifest_path.read_text(encoding='utf-8').strip()
            decrypted_str = vault_crypto.decrypt(encrypted_payload)
            manifest = json.loads(decrypted_str)
            canonical_name = str(manifest.get('canonical_name') or '').strip()
            if canonical_name and KB_NAME_PATTERN.match(canonical_name):
                if folder_path.name != canonical_name:
                    target_path = folder_path.parent / canonical_name
                    if not target_path.exists():
                        log(f"[Protection] Tamper detected! Manual rename of '{folder_path.name}' detected. Restoring canonical name '{canonical_name}'.")
                        self.unlock_folder(folder_path)
                        folder_path.rename(target_path)
                        self.lock_folder(target_path)
                        return target_path
                    else:
                        log_error(f"[Protection] Canonical target '{canonical_name}' already exists. Preserving '{folder_path.name}'.")
            return folder_path
        except IntegrityVerificationError as e:
            log_error(f"[Protection] Cryptographic integrity verification failed for manifest in '{folder_path.name}': {e}")
            return folder_path
        except Exception as e:
            log_error(f"[Protection] Error verifying manifest in '{folder_path.name}': {e}")
            return folder_path

    def encrypt_folder_snapshot(self, folder_path: Path) -> bool:
        try:
            folder_path = folder_path.resolve()
            sqlite_path = folder_path / 'collection' / 'knowledge_base' / 'storage.sqlite'
            if not sqlite_path.exists():
                return False
            snapshot_path = folder_path / VAULT_SNAPSHOT_FILENAME
            if snapshot_path.exists():
                try:
                    if sqlite_path.stat().st_mtime <= snapshot_path.stat().st_mtime:
                        return True
                except Exception:
                    pass
            raw_bytes = sqlite_path.read_bytes()
            if not raw_bytes:
                return False
            import base64
            from .encryption import vault_crypto
            enc_text = vault_crypto.encrypt(base64.b64encode(raw_bytes).decode('ascii'))
            temp_path = snapshot_path.with_suffix('.tmp')
            temp_path.write_text(enc_text, encoding='utf-8')
            temp_path.replace(snapshot_path)
            log(f"[Protection] Encrypted full database snapshot for '{folder_path.name}' into {VAULT_SNAPSHOT_FILENAME}")
            return True
        except Exception as e:
            log_error(f"[Protection] Failed to create encrypted database snapshot for '{folder_path.name}': {e}")
            return False

    def sync_and_protect_all(self, base_dir: Path) -> List[Path]:
        protected_paths: List[Path] = []
        try:
            base_dir = base_dir.resolve()
            if not base_dir.exists():
                return []
            for entry in list(base_dir.iterdir()):
                if not entry.is_dir():
                    continue
                healed_path = self.verify_and_restore_canonical_name(entry)
                if KB_NAME_PATTERN.match(healed_path.name):
                    manifest_path = healed_path / MANIFEST_FILENAME
                    if not manifest_path.exists():
                        self.create_or_update_manifest(healed_path, healed_path.name)
                    self.encrypt_folder_snapshot(healed_path)
                    self.lock_folder(healed_path)
                    protected_paths.append(healed_path)
            return protected_paths
        except Exception as e:
            log_error(f'[Protection] Error syncing and protecting all Knowledge Base folders: {e}')
            return protected_paths
kb_protector = FolderProtectionManager()
