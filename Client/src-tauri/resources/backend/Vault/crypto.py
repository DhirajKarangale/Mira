from __future__ import annotations
import hashlib
import logging
import os
import secrets
from typing import Optional
import keyring
import nacl.bindings as nb
from pathlib import Path
try:
    from Vault import config
    if not hasattr(config, 'KEYRING_SERVICE_NAME'):
        raise AttributeError('Loaded wrong config module')
except (ImportError, AttributeError):
    import importlib.util
    _vault_config_path = Path(__file__).resolve().parent / 'config.py'
    _spec = importlib.util.spec_from_file_location('vault_config', _vault_config_path)
    config = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(config)
logger = logging.getLogger('mira.vault.crypto')
_CREDENTIAL_KEY: Optional[str] = None
_DERIVED_KEY: Optional[bytes] = None

def derive_key_from_credential(credential_key: str, prefix: Optional[str]=None, suffix: Optional[str]=None) -> bytes:
    if prefix is None:
        prefix = config.KEY_PREFIX
    if suffix is None:
        suffix = config.KEY_SUFFIX
    combined_material = f'{prefix}{credential_key}{suffix}'
    return hashlib.sha256(combined_material.encode('utf-8')).digest()

def _read_file_key() -> Optional[str]:
    key_file = config.SYSTEM_DIR / '.vault.key'
    if key_file.exists():
        try:
            with open(key_file, 'r', encoding='utf-8') as f:
                val = f.read().strip()
                if len(val) >= 32:
                    return val
        except Exception as e:
            logger.warning(f'Failed to read fallback key file: {e}')
    return None

def _write_file_key(cred: str) -> bool:
    try:
        config.SYSTEM_DIR.mkdir(parents=True, exist_ok=True)
        key_file = config.SYSTEM_DIR / '.vault.key'
        flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
        mode = 0o600
        fd = os.open(str(key_file), flags, mode)
        with open(fd, 'w', encoding='utf-8') as f:
            f.write(cred)
        return True
    except Exception as e:
        logger.warning(f'Could not persist fallback key file: {e}')
        return False

def init_encryption_key() -> None:
    global _CREDENTIAL_KEY, _DERIVED_KEY

    # 1. Check environment variable override
    env_key = os.getenv('MIRA_MASTER_KEY')
    if env_key and len(env_key.strip()) >= 32:
        logger.info('Using master encryption key from MIRA_MASTER_KEY environment variable.')
        _CREDENTIAL_KEY = env_key.strip()
        _DERIVED_KEY = derive_key_from_credential(_CREDENTIAL_KEY)
        return

    # 2. Check OS credential store (Keyring / Keychain / SecretService)
    service_name = config.KEYRING_SERVICE_NAME
    key_name = config.KEYRING_KEY_NAME
    logger.info(f"Checking OS credential store (service='{service_name}', key='{key_name}')...")
    cred = None
    try:
        cred = keyring.get_password(service_name, key_name)
    except Exception as e:
        logger.warning(f'Error querying OS credential store: {e}. Checking local key file fallback...')

    # 3. Check local key file fallback
    if not cred:
        cred = _read_file_key()
        if cred:
            logger.info('Retrieved encryption key from secure local key file.')

    # 4. Generate new key if not found in any store
    if not cred:
        logger.info('No encryption key found. Generating a new cryptographically secure key...')
        cred = secrets.token_hex(32)
        try:
            keyring.set_password(service_name, key_name, cred)
            logger.info('Successfully saved encryption key to OS credential store.')
        except Exception as e:
            logger.warning(f'Could not persist key to OS credential store ({e}). Writing secure fallback file...')
        _write_file_key(cred)
    else:
        logger.info('Existing encryption key successfully initialized.')

    _CREDENTIAL_KEY = cred
    _DERIVED_KEY = derive_key_from_credential(cred)
    logger.info(f'Derived final 256-bit encryption key successfully ({len(_DERIVED_KEY)} bytes in memory, kept strictly internal).')

def _get_internal_key() -> bytes:
    global _DERIVED_KEY
    if _DERIVED_KEY is None:
        init_encryption_key()
    if _DERIVED_KEY is None:
        raise RuntimeError('Failed to initialize internal encryption key in Vault.')
    return _DERIVED_KEY

def encrypt_log_data(data: bytes, key: Optional[bytes]=None) -> bytes:
    if key is None:
        key = _get_internal_key()
    nonce_len = nb.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    nonce = os.urandom(nonce_len)
    ciphertext = nb.crypto_aead_xchacha20poly1305_ietf_encrypt(data, None, nonce, key)
    return nonce + ciphertext

def decrypt_log_data(encrypted_data: bytes, key: Optional[bytes]=None) -> bytes:
    if key is None:
        key = _get_internal_key()
    nonce_len = nb.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    mac_len = nb.crypto_aead_xchacha20poly1305_ietf_ABYTES
    min_len = nonce_len + mac_len
    if len(encrypted_data) < min_len:
        raise ValueError(f'Encrypted data is too short ({len(encrypted_data)} bytes). Minimum required is {min_len} bytes.')
    nonce = encrypted_data[:nonce_len]
    ciphertext = encrypted_data[nonce_len:]
    return nb.crypto_aead_xchacha20poly1305_ietf_decrypt(ciphertext, None, nonce, key)

def encrypt_text(data: str, key: Optional[bytes]=None) -> str:
    import base64
    raw_bytes = data.encode('utf-8')
    enc_bytes = encrypt_log_data(raw_bytes, key=key)
    return base64.b64encode(enc_bytes).decode('ascii')

def decrypt_text(ciphertext_b64: str, key: Optional[bytes]=None) -> str:
    import base64
    enc_bytes = base64.b64decode(ciphertext_b64.encode('ascii'))
    dec_bytes = decrypt_log_data(enc_bytes, key=key)
    return dec_bytes.decode('utf-8')

def encrypt_batch(items: list[str], key: Optional[bytes]=None) -> list[str]:
    return [encrypt_text(item, key=key) for item in items]

def decrypt_batch(ciphertexts: list[str], key: Optional[bytes]=None) -> list[str]:
    return [decrypt_text(ct, key=key) for ct in ciphertexts]
