from __future__ import annotations

"""Encryption stubs for Knowledge Base.

As specified in the system requirements:
'Use Qdrant local storage. Do not implement encryption.'

This module provides no-op pass-through functions to maintain backwards
compatibility with any legacy imports expecting encrypt/decrypt utilities.
"""

from typing import List, Optional, Union

def encrypt_text(data: str, key: Optional[bytes] = None) -> str:
    """Pass-through plaintext string without encryption."""
    return str(data or "")

def decrypt_text(data: str, key: Optional[bytes] = None) -> str:
    """Pass-through plaintext string without decryption."""
    return str(data or "")

class VaultCryptoClient:
    """Pass-through crypto client stub for unencrypted local storage."""

    def __init__(self, key: Optional[bytes] = None) -> None:
        self.key = key

    def encrypt(self, data: str) -> str:
        return encrypt_text(data, self.key)

    def decrypt(self, data: str) -> str:
        return decrypt_text(data, self.key)

vault_crypto = VaultCryptoClient()
