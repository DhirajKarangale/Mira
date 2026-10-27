from __future__ import annotations
import base64
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import requests
_memory_dir = Path(__file__).resolve().parent.parent
if str(_memory_dir) not in sys.path:
    sys.path.insert(0, str(_memory_dir))
_root_dir = _memory_dir.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))
from vault_logger import log, log_error
import config as memory_config
logger = logging.getLogger('mira.memory.knowledge_base.crypto')
ENCRYPTION_PREFIX = 'enc:v1:'

class IntegrityVerificationError(ValueError):
    pass

class VaultCryptoClient:

    def __init__(self, vault_url: Optional[str]=None) -> None:
        self._vault_url = vault_url
        self._direct_crypto = None
        self._vault_http_cooldown_until: float = 0.0
        self._init_direct_crypto()


    def _init_direct_crypto(self) -> None:
        try:
            from Vault import crypto as vault_crypto_module
            self._direct_crypto = vault_crypto_module
        except Exception as e:
            logger.debug(f'Direct Vault crypto module import notice: {e}')
            self._direct_crypto = None

    def get_vault_url(self) -> str:
        if self._vault_url:
            return self._vault_url.rstrip('/')
        url = memory_config.get_service_url('vault') or memory_config.VAULT_URL or 'http://127.0.0.1:9001'
        return url.rstrip('/')

    def is_encrypted(self, data: str) -> bool:
        if not data or not isinstance(data, str):
            return False
        if data.startswith(ENCRYPTION_PREFIX):
            return True
        return False

    def encrypt(self, data: str) -> str:
        if data is None:
            data = ''
        data_str = str(data)
        if time.time() >= self._vault_http_cooldown_until:
            vault_url = self.get_vault_url()
            try:
                resp = requests.post(f'{vault_url}/crypto/encrypt', json={'data': data_str}, timeout=1.0)
                if resp.status_code == 200:
                    ct = resp.json().get('ciphertext', '')
                    return f'{ENCRYPTION_PREFIX}{ct}'
            except Exception:
                self._vault_http_cooldown_until = time.time() + 60.0
        if self._direct_crypto is None:
            self._init_direct_crypto()
        if self._direct_crypto:
            try:
                ct = self._direct_crypto.encrypt_text(data_str)
                return f'{ENCRYPTION_PREFIX}{ct}'
            except Exception as e:
                log_error(f'[VaultCryptoClient] Direct encryption failed: {e}')
                raise RuntimeError(f'Vault encryption failed: {e}')
        raise RuntimeError('No encryption provider available: Vault service unreachable and Vault.crypto unavailable.')

    def is_likely_ciphertext(self, data: str) -> bool:
        if not data or not isinstance(data, str):
            return False
        s = data.strip()
        if s.startswith(ENCRYPTION_PREFIX):
            return True
        if len(s) < 40 or ' ' in s or '\n' in s or ('\t' in s):
            return False
        try:
            raw = base64.b64decode(s, validate=True)
            return len(raw) >= 40
        except Exception:
            return False

    def decrypt(self, ciphertext: str) -> str:
        if ciphertext is None or ciphertext == '':
            return ''
        ct_str = str(ciphertext).strip()
        is_prefixed = ct_str.startswith(ENCRYPTION_PREFIX)
        raw_ct = ct_str[len(ENCRYPTION_PREFIX):] if is_prefixed else ct_str
        if not is_prefixed and (not self.is_likely_ciphertext(ct_str)):
            return ct_str
        if time.time() >= self._vault_http_cooldown_until:
            vault_url = self.get_vault_url()
            try:
                resp = requests.post(f'{vault_url}/crypto/decrypt', json={'ciphertext': raw_ct}, timeout=1.0)
                if resp.status_code == 200:
                    return resp.json().get('data', '')
                elif resp.status_code == 500:
                    detail = resp.text
                    if is_prefixed and any((w in detail.lower() for w in ('decrypt', 'cipher', 'fail', 'mac', 'crypto', 'padding'))):
                        raise IntegrityVerificationError(f'Data integrity verification failed: {detail}')
                    if not is_prefixed:
                        return ct_str
            except IntegrityVerificationError:
                raise
            except Exception:
                self._vault_http_cooldown_until = time.time() + 60.0

        if self._direct_crypto is None:
            self._init_direct_crypto()
        if self._direct_crypto:
            try:
                return self._direct_crypto.decrypt_text(raw_ct)
            except Exception as e:
                if is_prefixed:
                    raise IntegrityVerificationError(f'Cryptographic integrity verification failed for Knowledge Base data: {e}')
                return ct_str
        if not is_prefixed:
            return ct_str
        raise RuntimeError('No decryption provider available: Vault service unreachable and Vault.crypto unavailable.')

    def encrypt_batch(self, items: List[str]) -> List[str]:
        if not items:
            return []
        clean_items = [str(x) if x is not None else '' for x in items]
        to_encrypt_indices: List[int] = []
        to_encrypt_texts: List[str] = []
        result: List[str] = ['' for _ in range(len(clean_items))]
        for i, item in enumerate(clean_items):
            if self.is_encrypted(item):
                result[i] = item
            else:
                to_encrypt_indices.append(i)
                to_encrypt_texts.append(item)
        if not to_encrypt_texts:
            return result
        encrypted_subset: Optional[List[str]] = None
        vault_url = self.get_vault_url()
        try:
            resp = requests.post(f'{vault_url}/crypto/encrypt-batch', json={'items': to_encrypt_texts}, timeout=5.0)
            if resp.status_code == 200:
                cts = resp.json().get('ciphertexts', [])
                if len(cts) == len(to_encrypt_texts):
                    encrypted_subset = [f'{ENCRYPTION_PREFIX}{c}' for c in cts]
        except Exception:
            pass
        if encrypted_subset is None:
            if self._direct_crypto is None:
                self._init_direct_crypto()
            if self._direct_crypto:
                try:
                    cts = self._direct_crypto.encrypt_batch(to_encrypt_texts)
                    encrypted_subset = [f'{ENCRYPTION_PREFIX}{c}' for c in cts]
                except Exception:
                    pass
        if encrypted_subset is None:
            encrypted_subset = [self.encrypt(x) for x in to_encrypt_texts]
        for idx, enc_val in zip(to_encrypt_indices, encrypted_subset):
            result[idx] = enc_val
        return result

    def decrypt_batch(self, ciphertexts: List[str]) -> List[str]:
        if not ciphertexts:
            return []
        return [self.decrypt(c) for c in ciphertexts]
vault_crypto = VaultCryptoClient()

def encrypt_text(data: str) -> str:
    return vault_crypto.encrypt(data)

def decrypt_text(ciphertext: str) -> str:
    return vault_crypto.decrypt(ciphertext)
