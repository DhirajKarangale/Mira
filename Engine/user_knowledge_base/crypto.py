from __future__ import annotations

import base64
import ctypes
import hashlib
import logging
import os
import secrets
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import keyring
import nacl.bindings as nb

logger = logging.getLogger("mira.engine.user_knowledge_base.crypto")

KEYRING_SERVICE_NAME = "MIRA_VAULT"
KEYRING_KEY_NAME = "master_encryption_key"
KEY_PREFIX = "MIRA_VAULT_PREFIX_SEC_"
KEY_SUFFIX = "_MIRA_VAULT_SUFFIX_KEY"

_DERIVED_KEY: Optional[bytes] = None
_FILE_LOCK_HANDLES: Dict[str, Any] = {}

IS_WINDOWS = sys.platform == "win32"
_msvcrt = None
if IS_WINDOWS:
    try:
        import msvcrt
        _msvcrt = msvcrt
    except ImportError:
        pass


class IntegrityVerificationError(ValueError):
    """Raised when authenticated encryption MAC verification fails (tampering or corruption)."""
    pass


def derive_key_from_credential(credential_key: str) -> bytes:
    material = f"{KEY_PREFIX}{credential_key}{KEY_SUFFIX}"
    return hashlib.sha256(material.encode("utf-8")).digest()


def get_encryption_key() -> bytes:
    """
    Retrieve or initialize the 256-bit master encryption key from the OS Credential Store
    (Windows Credential Manager). Key is kept strictly internal in memory.
    """
    global _DERIVED_KEY
    if _DERIVED_KEY is not None:
        return _DERIVED_KEY

    # 1. Try importing from Vault's internal crypto if available
    try:
        from Vault import crypto as vault_crypto
        _DERIVED_KEY = vault_crypto._get_internal_key()
        return _DERIVED_KEY
    except Exception:
        pass

    # 2. Directly access OS Credential Store
    try:
        cred = keyring.get_password(KEYRING_SERVICE_NAME, KEYRING_KEY_NAME)
    except Exception as e:
        logger.warning(f"Error reading OS credential store: {e}")
        cred = None

    if not cred:
        cred = secrets.token_hex(32)
        try:
            keyring.set_password(KEYRING_SERVICE_NAME, KEYRING_KEY_NAME, cred)
            logger.info("Saved new master encryption key to OS Credential Store.")
        except Exception as e:
            logger.error(f"Failed to persist key to OS Credential Store: {e}")

    _DERIVED_KEY = derive_key_from_credential(cred)
    return _DERIVED_KEY


MAGIC_HEADER: bytes = b"MIRAKB01"


def encrypt_kb_data(data: bytes, key: Optional[bytes] = None) -> bytes:
    """
    Encrypt raw bytes using authenticated XChaCha20-Poly1305 with random 24-byte nonce.
    Returns: MAGIC_HEADER (8 bytes) + nonce (24 bytes) + ciphertext + Poly1305 MAC tag (16 bytes).
    """
    if key is None:
        key = get_encryption_key()
    nonce_len = nb.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    nonce = os.urandom(nonce_len)
    ciphertext = nb.crypto_aead_xchacha20poly1305_ietf_encrypt(data, None, nonce, key)
    return MAGIC_HEADER + nonce + ciphertext


def decrypt_kb_data(encrypted_data: bytes, key: Optional[bytes] = None) -> bytes:
    """
    Verify MAGIC_HEADER, Poly1305 MAC, and decrypt XChaCha20-Poly1305 ciphertext.
    Raises IntegrityVerificationError if tampered with or corrupted.
    """
    if key is None:
        key = get_encryption_key()
    header_len = len(MAGIC_HEADER)
    nonce_len = nb.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    mac_len = nb.crypto_aead_xchacha20poly1305_ietf_ABYTES
    min_len = header_len + nonce_len + mac_len

    if len(encrypted_data) < min_len:
        raise IntegrityVerificationError(
            f"Encrypted data is too short ({len(encrypted_data)} bytes). Minimum required is {min_len} bytes."
        )

    if encrypted_data[:header_len] != MAGIC_HEADER:
        raise IntegrityVerificationError("Invalid file header: not a valid MIRA encrypted knowledge base.")

    nonce = encrypted_data[header_len : header_len + nonce_len]
    ciphertext = encrypted_data[header_len + nonce_len :]
    try:
        return nb.crypto_aead_xchacha20poly1305_ietf_decrypt(ciphertext, None, nonce, key)
    except Exception as e:
        raise IntegrityVerificationError(f"Cryptographic integrity verification failed for Knowledge Base: {e}")


def lock_kb_file(file_path: Path) -> bool:
    """
    Acquire an exclusive OS file lock on the encrypted Knowledge Base file to prevent
    external processes or unauthorized users from reading or updating it.
    """
    if not IS_WINDOWS or _msvcrt is None:
        return False
    lock_key = str(file_path.resolve())
    if lock_key in _FILE_LOCK_HANDLES:
        return True

    try:
        if not file_path.exists():
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.touch()

        # Open file in read/write binary mode for exclusive locking
        f = open(file_path, "r+b")
        f.seek(0)
        _msvcrt.locking(f.fileno(), _msvcrt.LK_NBLCK, 1)
        _FILE_LOCK_HANDLES[lock_key] = f

        # Apply restrictive NTFS ACL so only current user can access
        username = os.environ.get("USERNAME") or os.environ.get("USER")
        if username:
            try:
                cmd = f'icacls "{file_path}" /inheritance:r /grant:r "{username}":(F)'
                subprocess.run(cmd, shell=True, capture_output=True, check=False)
            except Exception:
                pass

        logger.debug(f"Acquired exclusive file lock on {file_path.name}")
        return True
    except Exception as e:
        logger.debug(f"Could not acquire exclusive file lock on {file_path}: {e}")
        return False


def unlock_kb_file(file_path_or_handle: Any, file_path: Optional[Path] = None) -> None:
    """
    Release the exclusive OS file lock on the Knowledge Base file.
    Accepts either (file_path) or (handle, file_path).
    """
    if not IS_WINDOWS or _msvcrt is None:
        return

    path_obj = file_path if isinstance(file_path, Path) else (
        file_path_or_handle if isinstance(file_path_or_handle, Path) else None
    )

    if path_obj is not None:
        lock_key = str(path_obj.resolve())
        f = _FILE_LOCK_HANDLES.pop(lock_key, None)
    else:
        # Find handle
        f = file_path_or_handle if hasattr(file_path_or_handle, "fileno") else None
        if f:
            for k, v in list(_FILE_LOCK_HANDLES.items()):
                if v is f:
                    _FILE_LOCK_HANDLES.pop(k, None)
                    break

    if f is not None:
        try:
            f.seek(0)
            _msvcrt.locking(f.fileno(), _msvcrt.LK_UNLCK, 1)
        except Exception:
            pass
        try:
            f.close()
        except Exception:
            pass
        logger.debug("Released exclusive file lock.")

