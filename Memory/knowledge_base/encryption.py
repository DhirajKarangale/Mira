from __future__ import annotations

import base64
import logging
from pathlib import Path
import sys
from typing import List, Optional
import requests

from .config import get_vault_base_url

logger = logging.getLogger("mira.memory.knowledge_base.encryption")

# Vault local import fallback for resilient internal execution
_vault_dir = Path(__file__).resolve().parent.parent.parent / "Vault"
if str(_vault_dir) not in sys.path:
    sys.path.insert(0, str(_vault_dir))

class VaultCryptoClient:
    """Handles data encryption and decryption using Vault's internal mechanism.
    
    The cryptographic keys remain strictly internal to Vault and are never exposed.
    Primary channel: Vault HTTP API (/crypto/encrypt, /crypto/decrypt).
    Fallback channel: Vault internal crypto module invocation (offline/standalone).
    """

    def __init__(self, vault_base_url: Optional[str] = None):
        self._vault_base_url = vault_base_url

    def _resolve_vault_url(self) -> Optional[str]:
        return self._vault_base_url or get_vault_base_url()

    def encrypt(self, text: str) -> str:
        """Encrypts plaintext string into base64 ciphertext using Vault encryption."""
        if not text:
            return ""

        vault_url = self._resolve_vault_url()
        if vault_url:
            endpoint = f"{vault_url.rstrip('/')}/crypto/encrypt"
            try:
                resp = requests.post(endpoint, json={"data": text}, timeout=4.0)
                if resp.status_code == 200:
                    data = resp.json()
                    if "ciphertext" in data:
                        return data["ciphertext"]
            except Exception as e:
                logger.debug(f"Vault HTTP encrypt failed ({e}), attempting local Vault crypto fallback.")

        # Resilient local fallback using Vault's crypto module without exposing keys
        try:
            import crypto as vault_crypto
            return vault_crypto.encrypt_text(text)
        except Exception as e:
            logger.error(f"Local Vault encryption fallback failed: {e}")
            raise RuntimeError(f"Vault encryption unavailable: {e}")

    def decrypt(self, ciphertext: str) -> str:
        """Decrypts base64 ciphertext string back to plaintext using Vault encryption."""
        if not ciphertext:
            return ""

        vault_url = self._resolve_vault_url()
        if vault_url:
            endpoint = f"{vault_url.rstrip('/')}/crypto/decrypt"
            try:
                resp = requests.post(endpoint, json={"ciphertext": ciphertext}, timeout=4.0)
                if resp.status_code == 200:
                    data = resp.json()
                    if "data" in data:
                        return data["data"]
            except Exception as e:
                logger.debug(f"Vault HTTP decrypt failed ({e}), attempting local Vault crypto fallback.")

        # Resilient local fallback using Vault's crypto module
        try:
            import crypto as vault_crypto
            return vault_crypto.decrypt_text(ciphertext)
        except Exception as e:
            logger.error(f"Local Vault decryption fallback failed: {e}")
            raise RuntimeError(f"Vault decryption unavailable: {e}")

    def encrypt_batch(self, texts: List[str]) -> List[str]:
        """Encrypts a batch of plaintext strings into base64 ciphertexts."""
        if not texts:
            return []

        vault_url = self._resolve_vault_url()
        if vault_url:
            endpoint = f"{vault_url.rstrip('/')}/crypto/encrypt-batch"
            try:
                resp = requests.post(endpoint, json={"items": texts}, timeout=8.0)
                if resp.status_code == 200:
                    data = resp.json()
                    if "ciphertexts" in data and len(data["ciphertexts"]) == len(texts):
                        return data["ciphertexts"]
            except Exception as e:
                logger.debug(f"Vault batch encrypt API failed ({e}), processing individually.")

        return [self.encrypt(t) for t in texts]

    def decrypt_batch(self, ciphertexts: List[str]) -> List[str]:
        """Decrypts a batch of base64 ciphertexts back to plaintexts."""
        if not ciphertexts:
            return []

        vault_url = self._resolve_vault_url()
        if vault_url:
            endpoint = f"{vault_url.rstrip('/')}/crypto/decrypt-batch"
            try:
                resp = requests.post(endpoint, json={"ciphertexts": ciphertexts}, timeout=8.0)
                if resp.status_code == 200:
                    data = resp.json()
                    if "items" in data and len(data["items"]) == len(ciphertexts):
                        return data["items"]
            except Exception as e:
                logger.debug(f"Vault batch decrypt API failed ({e}), processing individually.")

        return [self.decrypt(c) for c in ciphertexts]

# Singleton instance for general use
vault_crypto = VaultCryptoClient()

def encrypt_text(text: str) -> str:
    return vault_crypto.encrypt(text)

def decrypt_text(ciphertext: str) -> str:
    return vault_crypto.decrypt(ciphertext)
