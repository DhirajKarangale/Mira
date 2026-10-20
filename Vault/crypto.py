from __future__ import annotations

import hashlib
import logging
import os
import secrets
from typing import Optional

import keyring
import nacl.bindings as nb

import config

logger = logging.getLogger("mira.vault.crypto")

_CREDENTIAL_KEY: Optional[str] = None
_DERIVED_KEY: Optional[bytes] = None


def derive_key_from_credential(
    credential_key: str,
    prefix: Optional[str] = None,
    suffix: Optional[str] = None
) -> bytes:
    if prefix is None:
        prefix = config.KEY_PREFIX
    if suffix is None:
        suffix = config.KEY_SUFFIX

    combined_material = f"{prefix}{credential_key}{suffix}"
    return hashlib.sha256(combined_material.encode("utf-8")).digest()


def init_encryption_key() -> None:
    global _CREDENTIAL_KEY, _DERIVED_KEY

    service_name = config.KEYRING_SERVICE_NAME
    key_name = config.KEYRING_KEY_NAME

    logger.info(
        f"Checking OS credential store (service='{service_name}', key='{key_name}')..."
    )

    try:
        cred = keyring.get_password(service_name, key_name)
    except Exception as e:
        logger.warning(f"Error querying OS credential store: {e}. Falling back to generation.")
        cred = None

    if not cred:
        logger.info("No encryption key found in OS credential store. Generating a new cryptographically secure key...")
        cred = secrets.token_hex(32)
        try:
            keyring.set_password(service_name, key_name, cred)
            logger.info("Successfully saved encryption key to OS credential store.")
        except Exception as e:
            logger.error(f"Failed to persist key to OS credential store: {e}")
    else:
        logger.info("Existing encryption key retrieved from OS credential store.")

    _CREDENTIAL_KEY = cred
    _DERIVED_KEY = derive_key_from_credential(cred)

    logger.info(
        f"Derived final 256-bit encryption key successfully ({len(_DERIVED_KEY)} bytes in memory, kept strictly internal)."
    )


def _get_internal_key() -> bytes:
    global _DERIVED_KEY
    if _DERIVED_KEY is None:
        init_encryption_key()
    if _DERIVED_KEY is None:
        raise RuntimeError("Failed to initialize internal encryption key in Vault.")
    return _DERIVED_KEY


def encrypt_log_data(data: bytes, key: Optional[bytes] = None) -> bytes:
    if key is None:
        key = _get_internal_key()

    nonce_len = nb.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    nonce = os.urandom(nonce_len)
    ciphertext = nb.crypto_aead_xchacha20poly1305_ietf_encrypt(data, None, nonce, key)
    return nonce + ciphertext


def decrypt_log_data(encrypted_data: bytes, key: Optional[bytes] = None) -> bytes:
    if key is None:
        key = _get_internal_key()

    nonce_len = nb.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    mac_len = nb.crypto_aead_xchacha20poly1305_ietf_ABYTES
    min_len = nonce_len + mac_len

    if len(encrypted_data) < min_len:
        raise ValueError(
            f"Encrypted data is too short ({len(encrypted_data)} bytes). Minimum required is {min_len} bytes."
        )

    nonce = encrypted_data[:nonce_len]
    ciphertext = encrypted_data[nonce_len:]
    return nb.crypto_aead_xchacha20poly1305_ietf_decrypt(ciphertext, None, nonce, key)
