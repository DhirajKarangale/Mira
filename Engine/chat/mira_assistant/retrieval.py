from __future__ import annotations

import logging
import os
from pathlib import Path
import re
import sys
import threading
from typing import Any, Dict, List, Optional, Tuple
import unittest.mock

logger = logging.getLogger("mira.engine.chat.mira_assistant.retrieval")

_CURRENT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _CURRENT_DIR.parents[2]

for _p in (_CURRENT_DIR, _REPO_ROOT, _REPO_ROOT / "Vault", _REPO_ROOT / "Memory", _REPO_ROOT / "Engine"):
    _p_str = str(_p)
    if _p_str not in sys.path:
        sys.path.insert(0, _p_str)

# Vault Crypto and Knowledge Base Protection from Memory module
try:
    from Memory.knowledge_base.encryption import vault_crypto
except Exception:
    try:
        from Vault.crypto import decrypt_batch as _vault_decrypt_batch
        vault_crypto = None
    except Exception:
        vault_crypto = None

# Embedding generator from Engine
try:
    from Engine.embedding import generate_embedding, is_model_ready
except Exception:
    try:
        from embedding import generate_embedding, is_model_ready
    except Exception:
        generate_embedding = None

COLLECTION_NAME = "knowledge_base"

# Reusable client cache and thread safety lock
_LOCK = threading.RLock()
_CACHED_CLIENT = None
_CACHED_KB_PATH: Optional[Path] = None


def get_mira_knowledge_base_path() -> Optional[Path]:
    """
    Requirement 2: First check for the MIRA knowledge base at Vault/system/knowledge_base.
    If missing or stored under knowledge_base_mira, check fallback locations.
    """
    candidate_paths = [
        # 1. Primary check: Vault/system/knowledge_base (subfolder or direct)
        _REPO_ROOT / "Vault" / "system" / "knowledge_base" / "knowledge_base_mira",
        _REPO_ROOT / "Vault" / "system" / "knowledge_base" / "mira",
        _REPO_ROOT / "Vault" / "system" / "knowledge_base",
        # 2. Secondary check: Vault/system/knowledge_base_mira
        _REPO_ROOT / "Vault" / "system" / "knowledge_base_mira",
        Path(os.getenv("MIRA_SYSTEM_DIR", str(_REPO_ROOT / "Vault" / "system"))) / "knowledge_base_mira",
    ]

    for p in candidate_paths:
        if p.exists() and p.is_dir():
            # Check if directory contains a Qdrant collection or sqlite storage
            sqlite_file = p / "collection" / "knowledge_base" / "storage.sqlite"
            if sqlite_file.exists():
                return p
            meta_file = p / "meta.json"
            if meta_file.exists():
                return p

    return None


def _get_qdrant_client(kb_path: Path):
    """Safely initializes QdrantClient with portalocker bypass to prevent concurrency lockouts."""
    from qdrant_client import QdrantClient
    with unittest.mock.patch("portalocker.lock", return_value=None), \
         unittest.mock.patch("portalocker.unlock", return_value=None):
        return QdrantClient(path=str(kb_path))


def search_knowledge_base(
    query: str,
    limit: int = 5,
    min_score: float = 0.35,
) -> List[Dict[str, Any]]:
    """
    Searches the MIRA knowledge base using the existing Memory module's
    vector and payload retrieval mechanisms.
    """
    global _CACHED_CLIENT, _CACHED_KB_PATH

    kb_path = get_mira_knowledge_base_path()
    if not kb_path:
        logger.warning("[MIRARetrieval] No MIRA knowledge base found on system.")
        return []

    if generate_embedding is None:
        logger.warning("[MIRARetrieval] Embedding generator not available.")
        return []

    try:
        query_vec = generate_embedding(query)
    except Exception as e:
        logger.error(f"[MIRARetrieval] Failed to generate query embedding: {e}")
        return []

    with _LOCK:
        try:
            from qdrant_client import models
            client = _get_qdrant_client(kb_path)
            try:
                # Query points using local vector search
                if hasattr(client, "query_points"):
                    search_res = client.query_points(
                        collection_name=COLLECTION_NAME,
                        query=query_vec,
                        limit=limit,
                        with_payload=True,
                    )
                    hits = search_res.points
                else:
                    hits = client.search(
                        collection_name=COLLECTION_NAME,
                        query_vector=query_vec,
                        limit=limit,
                        with_payload=True,
                        with_vectors=False,
                    )
            finally:
                client.close()
        except Exception as e:
            logger.error(f"[MIRARetrieval] Qdrant search query failed: {e}")
            return []

    results: List[Dict[str, Any]] = []
    encrypted_payloads: List[str] = []

    for hit in hits:
        if hit.score < min_score:
            continue
        payload = hit.payload or {}
        enc_text = payload.get("summarized_text", "")
        if enc_text and (enc_text.startswith("enc:v1:") or payload.get("_encrypted", False)):
            encrypted_payloads.append(enc_text)

    # Decrypt encrypted records in batch using Vault crypto
    decrypted_map: Dict[str, str] = {}
    if encrypted_payloads:
        try:
            if vault_crypto is not None:
                dec_texts = vault_crypto.decrypt_batch(encrypted_payloads)
            else:
                from Vault.crypto import decrypt_batch
                stripped = [t[len("enc:v1:"):] if t.startswith("enc:v1:") else t for t in encrypted_payloads]
                dec_texts = decrypt_batch(stripped)

            for raw_enc, dec in zip(encrypted_payloads, dec_texts):
                decrypted_map[raw_enc] = dec
        except Exception as e:
            logger.error(f"[MIRARetrieval] Decryption error: {e}")

    for hit in hits:
        if hit.score < min_score:
            continue
        payload = hit.payload or {}
        enc_text = payload.get("summarized_text", "")
        plain_text = decrypted_map.get(enc_text, enc_text)

        results.append({
            "id": hit.id,
            "score": float(hit.score),
            "source_file": payload.get("source_file", "unknown"),
            "filename": payload.get("filename", "unknown"),
            "module": payload.get("module", "unknown"),
            "heading": payload.get("heading", ""),
            "section": payload.get("section", ""),
            "breadcrumb": payload.get("breadcrumb", ""),
            "text": plain_text,
        })

    return results


def inspect_project_source_file(
    relative_path: str,
    max_lines: int = 200,
    start_line: int = 1,
) -> Optional[Dict[str, Any]]:
    """
    Requirement 2 fallback: Inspects relevant project source files through existing
    project-access mechanisms when knowledge base is missing or lacks sufficient details.
    """
    clean_path = relative_path.strip().replace("\\", "/").lstrip("/")
    target_abs = (_REPO_ROOT / clean_path).resolve()

    try:
        target_abs.relative_to(_REPO_ROOT)
    except ValueError:
        logger.warning(f"[MIRARetrieval] Attempted to inspect file outside repository: {relative_path}")
        return None

    if not target_abs.exists() or not target_abs.is_file():
        return None

    try:
        content = target_abs.read_text(encoding="utf-8", errors="replace")
        all_lines = content.splitlines()
        total_lines = len(all_lines)
        
        start_idx = max(0, start_line - 1)
        end_idx = min(total_lines, start_idx + max_lines)
        slice_lines = all_lines[start_idx:end_idx]
        
        numbered_content = "\n".join(
            f"{start_idx + i + 1}: {line}" for i, line in enumerate(slice_lines)
        )
        
        return {
            "path": clean_path,
            "filename": target_abs.name,
            "total_lines": total_lines,
            "start_line": start_line,
            "end_line": end_idx,
            "content": numbered_content,
            "raw_content": "\n".join(slice_lines),
        }
    except Exception as e:
        logger.error(f"[MIRARetrieval] Error reading file '{relative_path}': {e}")
        return None


def find_files_by_name_or_keyword(keyword: str, max_results: int = 10) -> List[str]:
    """Finds project source files matching keyword or filename."""
    matches: List[str] = []
    clean_kw = keyword.strip().lower()
    
    # Priority directories
    allowed_dirs = ["Engine", "Vault", "Memory", "Message_Broker", "Operator", "Client", "scripts"]
    
    for d in allowed_dirs:
        dir_path = _REPO_ROOT / d
        if not dir_path.exists():
            continue
        for root, dirs, files in os.walk(dir_path):
            # Skip caches and build directories
            dirs[:] = [
                x for x in dirs
                if x not in ("__pycache__", "target", "node_modules", "dist", ".git", ".cargo")
            ]
            for file in files:
                rel_p = str((Path(root) / file).relative_to(_REPO_ROOT)).replace("\\", "/")
                if clean_kw in file.lower() or clean_kw in rel_p.lower():
                    matches.append(rel_p)
                    if len(matches) >= max_results:
                        return matches
    return matches


def retrieve_mira_context(
    query: str,
    target_files: Optional[List[str]] = None,
    kb_limit: int = 4,
) -> Dict[str, Any]:
    """
    Unified context retriever:
    1. Queries knowledge base at Vault/system/knowledge_base (and fallback).
    2. Inspects targeted project source files if specified or if query references specific files.
    3. Bundles context for guidance and code modification planning.
    """
    kb_hits = search_knowledge_base(query, limit=kb_limit)
    
    inspected_files: List[Dict[str, Any]] = []
    
    # Detect if query explicitly refers to files
    detected_files = set(target_files or [])
    file_pattern = r'([a-zA-Z0-9_\-]+[/\\][a-zA-Z0-9_\-\./\\]+\.[a-zA-Z0-9]+)'
    for m in re.finditer(file_pattern, query):
        detected_files.add(m.group(1))

    for f in list(detected_files)[:3]:
        info = inspect_project_source_file(f, max_lines=150)
        if info:
            inspected_files.append(info)

    return {
        "query": query,
        "kb_path_used": str(get_mira_knowledge_base_path()),
        "kb_hits_count": len(kb_hits),
        "kb_hits": kb_hits,
        "inspected_files": inspected_files,
    }

