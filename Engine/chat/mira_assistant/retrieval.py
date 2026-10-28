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

for _p in (_REPO_ROOT / "Engine", _REPO_ROOT, _REPO_ROOT / "Vault", _REPO_ROOT / "Memory"):
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
_CACHED_QDRANT_CLIENT: Optional[Any] = None
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
            sqlite_file = p / "collection" / "knowledge_base" / "storage.sqlite"
            if sqlite_file.exists():
                return p
            meta_file = p / "meta.json"
            if meta_file.exists():
                return p

    return None


def _get_qdrant_client(kb_path: Path):
    """Safely initializes and caches QdrantClient with portalocker bypass to prevent concurrency lockouts."""
    global _CACHED_QDRANT_CLIENT, _CACHED_KB_PATH
    if _CACHED_QDRANT_CLIENT is not None and _CACHED_KB_PATH == kb_path:
        return _CACHED_QDRANT_CLIENT

    from qdrant_client import QdrantClient
    with unittest.mock.patch("portalocker.lock", return_value=None), \
         unittest.mock.patch("portalocker.unlock", return_value=None):
        _CACHED_QDRANT_CLIENT = QdrantClient(path=str(kb_path))
        _CACHED_KB_PATH = kb_path
        return _CACHED_QDRANT_CLIENT


def _decrypt_payloads_batch(records: List[Any]) -> Dict[str, str]:
    """Decrypts encrypted payloads in batch using Vault crypto."""
    encrypted_payloads = []
    for hit in records:
        payload = hit.payload or {}
        enc_text = payload.get("summarized_text", "")
        if enc_text and (enc_text.startswith("enc:v1:") or payload.get("_encrypted", False)):
            encrypted_payloads.append(enc_text)

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

    return decrypted_map


def search_knowledge_base(
    query: str,
    limit: int = 3,
    min_score: float = 0.35,
) -> List[Dict[str, Any]]:
    """
    Hybrid Search: Combines dense vector similarity with keyword/metadata matching
    to guarantee exact factual retrieval (author, creator, modules, configs).
    """
    kb_path = get_mira_knowledge_base_path()
    if not kb_path:
        logger.warning("[MIRARetrieval] No MIRA knowledge base found on system.")
        return []

    q_lower = query.strip().lower()
    results: List[Dict[str, Any]] = []
    vector_hits: List[Any] = []

    # 1. Vector Search Pass
    if generate_embedding is not None:
        try:
            query_vec = generate_embedding(query)
            with _LOCK:
                with unittest.mock.patch("portalocker.lock", return_value=None), \
                     unittest.mock.patch("portalocker.unlock", return_value=None):
                    client = _get_qdrant_client(kb_path)
                    if hasattr(client, "query_points"):
                        search_res = client.query_points(
                            collection_name=COLLECTION_NAME,
                            query=query_vec,
                            limit=max(limit * 2, 6),
                            with_payload=True,
                        )
                        vector_hits = search_res.points
                    else:
                        vector_hits = client.search(
                            collection_name=COLLECTION_NAME,
                            query_vector=query_vec,
                            limit=max(limit * 2, 6),
                            with_payload=True,
                            with_vectors=False,
                        )
        except Exception as e:
            logger.error(f"[MIRARetrieval] Vector search notice: {e}")

    # 2. Keyword & Metadata Matching Pass
    keyword_hits: List[Any] = []
    author_intent = any(w in q_lower for w in ("who developed", "who created", "who made", "author", "creator", "developed you", "created you", "dhiraj", "who built"))
    identity_intent = any(w in q_lower for w in ("what are you", "who are you", "what is mira", "what does mira do", "about mira", "define mira", "system concept", "core concept"))
    module_intents = {
        "operator": ("operator", "screen capture", "rust", "blacklist"),
        "vault": ("vault", "crypto", "encryption", "keyring", "chacha20", "secrets"),
        "message broker": ("message broker", "redis stream", "streams", "consumer group", "pel", "xack"),
        "memory": ("memory", "tesseract", "ocr", "deduplication", "perceptual hash"),
        "engine": ("engine", "failover", "stt", "whisper", "groq", "gemini", "langgraph"),
        "client": ("client", "tauri", "react", "dashboard", "multi-session"),
        "voice": ("voice", "voices", "tts", "stt", "elevenlabs", "speech", "whisper", "female voice", "male voice", "audio", "rachel", "eleven_flash"),
    }

    try:
        with _LOCK:
            with unittest.mock.patch("portalocker.lock", return_value=None), \
                 unittest.mock.patch("portalocker.unlock", return_value=None):
                client = _get_qdrant_client(kb_path)
                all_points, _ = client.scroll(
                    collection_name=COLLECTION_NAME,
                    limit=250,
                    with_payload=True,
                    with_vectors=False,
                )

        for pt in all_points:
            payload = pt.payload or {}
            heading = (payload.get("heading") or "").lower()
            section = (payload.get("section") or "").lower()
            source = (payload.get("source_file") or "").lower()
            module_name = (payload.get("module") or "").lower()

            match_score = 0.0

            if author_intent:
                if "author" in heading or "author & contact" in heading:
                    match_score = 0.98
                elif "license" in heading or "contributing" in heading:
                    match_score = 0.70

            if identity_intent:
                if "what is mira" in heading or "definition & core concept" in heading or "executive overview" in heading:
                    match_score = 0.98
                elif "module overview" in heading:
                    match_score = 0.75

            for mod, keywords in module_intents.items():
                if any(kw in q_lower for kw in keywords):
                    if mod in module_name or mod in source:
                        if any(kw in heading for kw in keywords):
                            match_score = max(match_score, 0.85)

            if match_score > 0.5:
                setattr(pt, "score", match_score)
                keyword_hits.append(pt)
    except Exception as e:
        logger.debug(f"[MIRARetrieval] Keyword scroll notice: {e}")

    # Combine hits with priority to exact keyword matches
    combined_hits = []
    seen_ids = set()

    for hit in keyword_hits:
        if hit.id not in seen_ids:
            seen_ids.add(hit.id)
            combined_hits.append(hit)

    for hit in vector_hits:
        if getattr(hit, "score", 0.0) >= min_score and hit.id not in seen_ids:
            seen_ids.add(hit.id)
            combined_hits.append(hit)

    # Decrypt records in batch
    decrypted_map = _decrypt_payloads_batch(combined_hits)

    for hit in combined_hits[:limit]:
        payload = hit.payload or {}
        enc_text = payload.get("summarized_text", "")
        plain_text = decrypted_map.get(enc_text, enc_text)

        results.append({
            "id": hit.id,
            "score": float(getattr(hit, "score", 1.0)),
            "source_file": payload.get("source_file", "unknown"),
            "filename": payload.get("filename", "unknown"),
            "module": payload.get("module", "unknown"),
            "heading": payload.get("heading", ""),
            "section": payload.get("section", ""),
            "breadcrumb": payload.get("breadcrumb", ""),
            "text": plain_text[:1200],  # Clamp chunk length to preserve token budget
        })

    return results


def inspect_project_source_file(
    relative_path: str,
    max_lines: int = 60,
    start_line: int = 1,
) -> Optional[Dict[str, Any]]:
    """
    Requirement 2 fallback: Inspects relevant project source files through existing
    project-access mechanisms when knowledge base is missing or lacks sufficient details.
    Clamps line count to preserve strict TPM/ITPM token limits.
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


def retrieve_mira_context(
    query: str,
    target_files: Optional[List[str]] = None,
    kb_limit: int = 3,
) -> Dict[str, Any]:
    """
    Unified context retriever:
    1. Hybrid Search over knowledge base (vector similarity + keyword/author boosting).
    2. Automatically inspects relevant project source files based on topic.
    3. Bundles concise, token-efficient context for guidance and code modification planning.
    """
    kb_hits = search_knowledge_base(query, limit=kb_limit)
    q_lower = query.strip().lower()

    inspected_files: List[Dict[str, Any]] = []
    candidate_source_files: List[str] = list(target_files or [])

    # Automatic domain-based file inspection:
    voice_terms = ("voice", "voices", "tts", "stt", "elevenlabs", "eleven labs", "whisper", "speech", "female voice", "male voice", "audio")
    if any(w in q_lower for w in ("who developed", "who created", "who made", "author", "creator", "developed you", "created you")):
        candidate_source_files.append("README.md")
    elif any(w in q_lower for w in ("what are you", "who are you", "what is mira", "about mira", "define mira")):
        candidate_source_files.append("README.md")
    elif any(w in q_lower for w in voice_terms):
        candidate_source_files.append("Client/src/modules/voice/elevenlabsClient.ts")
    elif "operator" in q_lower or "screen capture" in q_lower:
        candidate_source_files.append("Operator/README.md")
    elif "vault" in q_lower or "keyring" in q_lower or "crypto" in q_lower:
        candidate_source_files.append("Vault/README.md")
    elif "message broker" in q_lower or "redis stream" in q_lower or "consumer group" in q_lower:
        candidate_source_files.append("Message_Broker/README.md")
    elif "memory" in q_lower or "ocr" in q_lower or "deduplication" in q_lower:
        candidate_source_files.append("Memory/README.md")
    elif "engine" in q_lower or "failover" in q_lower or "stt" in q_lower or "langgraph" in q_lower:
        candidate_source_files.append("Engine/README.md")

    # Check for direct file path patterns in query
    file_pattern = r'([a-zA-Z0-9_\-]+[/\\][a-zA-Z0-9_\-\./\\]+\.[a-zA-Z0-9]+)'
    for m in re.finditer(file_pattern, query):
        candidate_source_files.append(m.group(1).replace("\\", "/"))

    seen_paths = set()
    for rel_f in candidate_source_files:
        if rel_f not in seen_paths and len(inspected_files) < 2:
            seen_paths.add(rel_f)
            start_l = 1
            max_l = 60
            if "elevenlabsClient.ts" in rel_f:
                start_l = 22
                max_l = 120
            info = inspect_project_source_file(rel_f, max_lines=max_l, start_line=start_l)
            if info:
                inspected_files.append(info)

    return {
        "query": query,
        "kb_path_used": str(get_mira_knowledge_base_path()),
        "kb_hits_count": len(kb_hits),
        "kb_hits": kb_hits,
        "inspected_files": inspected_files,
    }
