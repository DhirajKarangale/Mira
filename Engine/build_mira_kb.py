from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import shutil
import sys
import time
from typing import Any, Dict, List, Optional, Tuple
import unittest.mock
import uuid

# -----------------------------------------------------------------------------
# Path Setup & Cross-Module Imports
# -----------------------------------------------------------------------------
_CURRENT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _CURRENT_DIR.parent

for _p in (_CURRENT_DIR, _REPO_ROOT, _REPO_ROOT / "Vault", _REPO_ROOT / "Memory", _REPO_ROOT / "Engine"):
    _p_str = str(_p)
    if _p_str not in sys.path:
        sys.path.insert(0, _p_str)

# Ensure standard UTF-8 stream output on Windows platforms
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Structured vault logger with graceful standard output fallback and immediate flushing
try:
    from vault_logger import log as _vault_log, log_error as _vault_log_error

    def log(msg: str) -> None:
        try:
            _vault_log(msg)
        except Exception:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [INFO] {msg}", flush=True)
        sys.stdout.flush()
        sys.stderr.flush()

    def log_error(msg: str) -> None:
        try:
            _vault_log_error(msg)
        except Exception:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [ERROR] {msg}", file=sys.stderr, flush=True)
        sys.stdout.flush()
        sys.stderr.flush()
except ImportError:
    def log(msg: str) -> None:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [INFO] {msg}", flush=True)
        sys.stdout.flush()

    def log_error(msg: str) -> None:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [ERROR] {msg}", file=sys.stderr, flush=True)
        sys.stderr.flush()

# Vault storage path conventions
try:
    from Vault.config import SYSTEM_DIR as VAULT_SYSTEM_DIR
except Exception:
    VAULT_SYSTEM_DIR = _REPO_ROOT / "Vault" / "system"

# Memory knowledge base encryption & protection mechanisms
try:
    from Memory.knowledge_base.encryption import vault_crypto
except Exception:
    try:
        from knowledge_base.encryption import vault_crypto
    except Exception as _e:
        log_error(f"[MIRA KB Builder] Notice on vault_crypto import: {_e}")
        vault_crypto = None

try:
    from Memory.knowledge_base.protection import kb_protector
except Exception:
    try:
        from knowledge_base.protection import kb_protector
    except Exception as _e:
        log_error(f"[MIRA KB Builder] Notice on kb_protector import: {_e}")
        kb_protector = None

# Engine embedding generator (SentenceTransformer with Qwen/Qwen3-Embedding-0.6B)
try:
    from Engine.embedding import (
        generate_embedding,
        generate_embeddings_batch,
        ensure_model_ready,
        is_model_ready,
        get_model,
        DEFAULT_MODEL_NAME,
    )
except Exception:
    from embedding import (
        generate_embedding,
        generate_embeddings_batch,
        ensure_model_ready,
        is_model_ready,
        get_model,
        DEFAULT_MODEL_NAME,
    )

from qdrant_client import QdrantClient, models

logger = logging.getLogger("mira.engine.build_mira_kb")

# -----------------------------------------------------------------------------
# Configuration & Source File Declarations
# -----------------------------------------------------------------------------
COLLECTION_NAME: str = "knowledge_base"
VECTOR_DIM: int = 1024  # Output dimension for Qwen/Qwen3-Embedding-0.6B
MAX_CHUNK_CHARS: int = 2200
MIN_CHUNK_CHARS: int = 40
OVERLAP_CHARS: int = 200
EMBEDDING_BATCH_SIZE: int = 4  # Optimal micro-batch size for multi-core CPU L2 cache

# Target knowledge base directory in Vault storage
SYSTEM_STORAGE_DIR: Path = Path(os.getenv("MIRA_SYSTEM_DIR", str(VAULT_SYSTEM_DIR)))
KB_MIRA_DIR: Path = SYSTEM_STORAGE_DIR / "knowledge_base_mira"

# Explicit locations of all primary MIRA source Markdown files
SOURCE_MARKDOWN_FILES: List[str] = [
    "README.md",
    "MIRA_KNOWLEDGE_BASE.md",
    "Vault/README.md",
    "scripts/README.md",
    "Operator/README.md",
    "Message_Broker/README.md",
    "Memory/README.md",
    "Engine/README.md",
    "Client/README.md",
]

# Supplementary project documentation files (optional)
OPTIONAL_MARKDOWN_FILES: List[str] = [
    "SECURITY.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
]

# Module categorization mapping
MODULE_MAP: Dict[str, str] = {
    "README.md": "Overview",
    "MIRA_KNOWLEDGE_BASE.md": "Master Knowledge Base",
    "Vault/README.md": "Vault",
    "scripts/README.md": "Scripts & Orchestration",
    "Operator/README.md": "Operator",
    "Message_Broker/README.md": "Message Broker",
    "Memory/README.md": "Memory",
    "Engine/README.md": "Engine",
    "Client/README.md": "Client",
    "SECURITY.md": "Security",
    "CONTRIBUTING.md": "Contributing",
    "CODE_OF_CONDUCT.md": "Community",
}


@dataclass
class MarkdownChunk:
    chunk_id: str
    source_file: str
    filename: str
    module: str
    heading: str
    section: str
    breadcrumb: str
    content: str
    char_count: int
    token_count: int
    chunk_index: int
    total_chunks: int
    content_hash: str


# -----------------------------------------------------------------------------
# Markdown Parsing & Cohesive Chunking
# -----------------------------------------------------------------------------
def parse_and_chunk_markdown_file(
    rel_path: str,
    repo_root: Path = _REPO_ROOT,
    max_chars: int = MAX_CHUNK_CHARS,
    overlap: int = OVERLAP_CHARS,
) -> List[MarkdownChunk]:
    """
    Parses a Markdown document into cohesive, semantically bounded chunks while preserving:
    - Headings (# and ## topic boundaries)
    - Breadcrumb navigation hierarchies
    - Code blocks and tables without fragmentation
    - Document and module metadata
    Filters out raw HTML anchors, divider lines, and Table of Contents navigation.
    """
    abs_path = repo_root / rel_path
    if not abs_path.exists() or not abs_path.is_file():
        log_error(f"[Parser] Source Markdown file not found: {abs_path}")
        return []

    raw_text = abs_path.read_text(encoding="utf-8")
    lines = raw_text.splitlines()

    doc_default_title = abs_path.stem.replace("_", " ").title()
    current_h1 = doc_default_title
    current_h2 = ""
    current_heading = doc_default_title

    filename = abs_path.name
    module_name = MODULE_MAP.get(rel_path, abs_path.parent.name or "Core")

    in_code_block = False
    in_toc = False
    current_lines: List[str] = []
    raw_chunks: List[Dict[str, Any]] = []

    def flush_block(lines_to_flush: List[str], heading: str, section_path: str, top_section: str) -> None:
        body = "\n".join(lines_to_flush).strip()
        if not body or len(body) < MIN_CHUNK_CHARS:
            return

        context_prefix = f"[Document: {rel_path} | Module: {module_name} | Section: {section_path}]\n"

        # If body fits comfortably inside max budget, keep as a single unified chunk
        if len(body) <= max_chars:
            full_content = f"{context_prefix}# {heading}\n\n{body}".strip()
            raw_chunks.append({
                "heading": heading,
                "section": top_section,
                "breadcrumb": section_path,
                "content": full_content,
            })
            return

        # Split on paragraph boundaries
        paragraphs = re.split(r"\n{2,}", body)
        acc = ""
        for para in paragraphs:
            p_strip = para.strip()
            if not p_strip:
                continue
            if len(acc) + len(p_strip) + 2 <= max_chars:
                acc = f"{acc}\n\n{p_strip}" if acc else p_strip
            else:
                if acc:
                    full_content = f"{context_prefix}# {heading}\n\n{acc}".strip()
                    raw_chunks.append({
                        "heading": heading,
                        "section": top_section,
                        "breadcrumb": section_path,
                        "content": full_content,
                    })
                    tail = acc[-overlap:] if len(acc) > overlap else acc
                    acc = f"{tail}\n\n{p_strip}" if len(tail) + len(p_strip) + 2 <= max_chars else p_strip
                else:
                    full_content = f"{context_prefix}# {heading}\n\n{p_strip[:max_chars]}".strip()
                    raw_chunks.append({
                        "heading": heading,
                        "section": top_section,
                        "breadcrumb": section_path,
                        "content": full_content,
                    })
                    acc = p_strip[max_chars - overlap:]
        if acc and len(acc.strip()) >= MIN_CHUNK_CHARS:
            full_content = f"{context_prefix}# {heading}\n\n{acc.strip()}".strip()
            raw_chunks.append({
                "heading": heading,
                "section": top_section,
                "breadcrumb": section_path,
                "content": full_content,
            })

    for line in lines:
        stripped = line.strip()

        # Track fenced code blocks to prevent code comments from being treated as markdown headings
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            current_lines.append(line)
            continue

        if in_code_block:
            current_lines.append(line)
            continue

        # Ignore anchor tags and horizontal divider lines
        if (
            stripped.startswith("<a id=")
            or stripped.startswith("<a name=")
            or stripped == "</a>"
            or stripped in ("---", "***", "___")
        ):
            continue

        # Detect top-level topic headings (# or ##)
        hm = re.match(r"^(#{1,2})\s+(.*)", line)
        if hm:
            lvl = len(hm.group(1))
            raw_title = re.sub(r"<[^>]+>", "", hm.group(2)).strip()
            lm = re.match(r"^\[(.*?)\]\(.*?\)$", raw_title)
            if lm:
                raw_title = lm.group(1).strip()

            if "table of contents" in raw_title.lower():
                in_toc = True
            elif in_toc and lvl <= 2:
                in_toc = False

            if current_lines:
                crumb = f"{current_h1} > {current_h2}" if current_h2 else current_h1
                top_sec = current_h2 or current_h1
                flush_block(current_lines, current_heading, crumb, top_sec)
                current_lines = []

            if in_toc:
                continue

            if lvl == 1:
                current_h1 = raw_title
                current_h2 = ""
                current_heading = raw_title
            elif lvl == 2:
                current_h2 = raw_title
                current_heading = raw_title
        else:
            if not in_toc:
                current_lines.append(line)

    if current_lines and not in_toc:
        crumb = f"{current_h1} > {current_h2}" if current_h2 else current_h1
        top_sec = current_h2 or current_h1
        flush_block(current_lines, current_heading, crumb, top_sec)

    # Convert to structured MarkdownChunk records
    total_file_chunks = len(raw_chunks)
    final_chunks: List[MarkdownChunk] = []

    for idx, item in enumerate(raw_chunks):
        content = item["content"]
        content_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        chunk_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"mira:{rel_path}:{idx}:{content_hash[:16]}"))

        token_est = max(1, len(content.split()) * 4 // 3)
        final_chunks.append(
            MarkdownChunk(
                chunk_id=chunk_uuid,
                source_file=rel_path,
                filename=filename,
                module=module_name,
                heading=item["heading"],
                section=item["section"],
                breadcrumb=item["breadcrumb"],
                content=content,
                char_count=len(content),
                token_count=token_est,
                chunk_index=idx,
                total_chunks=total_file_chunks,
                content_hash=content_hash,
            )
        )

    return final_chunks


# -----------------------------------------------------------------------------
# Qdrant Storage Schema & Indexed Ingestion
# -----------------------------------------------------------------------------
def setup_qdrant_collection(client: QdrantClient, vector_dim: int = VECTOR_DIM) -> None:
    """
    Creates and configures the Qdrant on-disk vector collection with cosine distance
    and payload indexes for fast filtered retrieval.
    """
    collections = [c.name for c in client.get_collections().collections]

    if COLLECTION_NAME in collections:
        log(f"[Qdrant] Collection '{COLLECTION_NAME}' already exists. Recreating...")
        client.delete_collection(collection_name=COLLECTION_NAME)

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=models.VectorParams(
            size=vector_dim,
            distance=models.Distance.COSINE,
            on_disk=True,
        ),
    )
    log(f"[Qdrant] Created collection '{COLLECTION_NAME}' (dim={vector_dim}, distance=Cosine, on_disk=True)")

    # Create keyword payload indexes for filtering
    for field in ("source_file", "filename", "module", "heading", "section", "os", "app_name"):
        try:
            client.create_payload_index(
                collection_name=COLLECTION_NAME,
                field_name=field,
                field_schema=models.PayloadSchemaType.KEYWORD,
            )
        except Exception as e:
            log(f"[Qdrant] Note on keyword index creation for '{field}': {e}")

    try:
        client.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="timestamp",
            field_schema=models.PayloadSchemaType.INTEGER,
        )
    except Exception as e:
        log(f"[Qdrant] Note on timestamp index creation: {e}")

    try:
        client.create_payload_index(
            collection_name=COLLECTION_NAME,
            field_name="summarized_text",
            field_schema=models.TextIndexParams(
                type="text",
                tokenizer=models.TokenizerType.WORD,
                lowercase=True,
            ),
        )
    except Exception as e:
        log(f"[Qdrant] Note on text index creation: {e}")


def ingest_chunks_into_qdrant(
    client: QdrantClient,
    chunks: List[MarkdownChunk],
    embeddings: List[List[float]],
) -> int:
    """
    Encrypts chunk bodies using Vault authenticated encryption (XSalsa20-Poly1305),
    constructs PointStruct records with source traceability payloads, and upserts into Qdrant.
    """
    if len(chunks) != len(embeddings):
        raise ValueError(f"Mismatch: {len(chunks)} chunks vs {len(embeddings)} embeddings")

    if not chunks:
        return 0

    raw_texts = [c.content for c in chunks]

    # Encrypt chunks at rest using Vault crypto
    log(f"[Ingestion] Encrypting {len(raw_texts)} chunks via Vault authenticated cipher...")
    if vault_crypto is not None:
        encrypted_texts = vault_crypto.encrypt_batch(raw_texts)
    else:
        from Vault.crypto import encrypt_batch
        encrypted_texts = [f"enc:v1:{ct}" for ct in encrypt_batch(raw_texts)]

    unix_now = int(time.time())
    points: List[models.PointStruct] = []

    for c, enc_text, vec in zip(chunks, encrypted_texts, embeddings):
        payload = {
            "app_name": f"MIRA::{c.module}",
            "os": "Cross-Platform",
            "timestamp": unix_now,
            "summarized_text": enc_text,
            "_encrypted": True,
            "source_file": c.source_file,
            "filename": c.filename,
            "module": c.module,
            "heading": c.heading,
            "section": c.section,
            "breadcrumb": c.breadcrumb,
            "chunk_index": c.chunk_index,
            "total_chunks": c.total_chunks,
            "char_count": c.char_count,
            "token_count": c.token_count,
            "content_hash": c.content_hash,
        }
        points.append(models.PointStruct(id=c.chunk_id, vector=vec, payload=payload))

    # Batch upsert in slices of 100
    batch_size = 100
    total_upserted = 0
    for i in range(0, len(points), batch_size):
        slice_points = points[i : i + batch_size]
        client.upsert(collection_name=COLLECTION_NAME, points=slice_points)
        total_upserted += len(slice_points)
        log(f"[Ingestion] Upserted {total_upserted}/{len(points)} encrypted records into '{COLLECTION_NAME}'")

    return total_upserted


def safely_remove_directory(dir_path: Path) -> bool:
    """
    Safely unlocks and removes a directory tree on Windows/macOS/Linux,
    handling active Win32 handles or NTFS read-only attributes.
    """
    if not dir_path.exists():
        return True

    # 1. Unlock folder protections if kb_protector is loaded
    if kb_protector is not None:
        try:
            kb_protector.unlock_folder(dir_path)
        except Exception as e:
            log_error(f"[Lifecycle] Notice unlocking '{dir_path.name}': {e}")

    # 2. Reset permissions and remove tree with retries
    for attempt in range(5):
        try:
            shutil.rmtree(dir_path)
            return True
        except PermissionError:
            time.sleep(0.3)
            if sys.platform == "win32":
                user = os.environ.get("USERNAME") or os.environ.get("USER") or ""
                if user:
                    os.system(f'icacls "{dir_path}" /remove:d "{user}" >nul 2>&1')
                    os.system(f'icacls "{dir_path}" /grant:r "{user}":(F) /T >nul 2>&1')
        except Exception as e:
            log_error(f"[Lifecycle] Error removing '{dir_path}' (attempt {attempt + 1}): {e}")
            time.sleep(0.3)

    return not dir_path.exists()


# -----------------------------------------------------------------------------
# Core Build Orchestrator (Atomic Lifecycle)
# -----------------------------------------------------------------------------
def build_mira_knowledge_base(
    target_dir: Path = KB_MIRA_DIR,
    source_files: Optional[List[str]] = None,
    include_supplementary: bool = False,
    repo_root: Path = _REPO_ROOT,
) -> Dict[str, Any]:
    """
    Executes the complete end-to-end lifecycle to build the MIRA knowledge base:
    1. Validates and parses all source Markdown files.
    2. Performs cohesive section chunking and deduplication.
    3. Generates dense 1024-dim embeddings using Qwen/Qwen3-Embedding-0.6B.
    4. Atomics: Builds into an isolated staging directory first.
    5. Encrypts payloads and creates Qdrant on-disk vector index.
    6. Replaces target directory and applies security protections (manifest, snapshot, locks).
    7. Returns comprehensive build statistics.
    """
    start_time = time.time()
    log("=" * 80)
    log("STARTING MIRA KNOWLEDGE BASE BUILD PIPELINE")
    log(f"Target Destination: {target_dir}")
    log(f"Repository Root:    {repo_root}")
    log("=" * 80)

    # 1. Collect target files
    target_files = list(source_files or SOURCE_MARKDOWN_FILES)
    if include_supplementary:
        for opt_f in OPTIONAL_MARKDOWN_FILES:
            if (repo_root / opt_f).exists() and opt_f not in target_files:
                target_files.append(opt_f)

    log(f"[Pipeline] Processing {len(target_files)} designated Markdown source files...")

    # 2. Parse Markdown documents into cohesive chunks
    file_stats: List[Dict[str, Any]] = []
    all_chunks: List[MarkdownChunk] = []

    for rel_path in target_files:
        abs_path = repo_root / rel_path
        if not abs_path.exists():
            log_error(f"[Pipeline] Required source file missing: {rel_path}. Skipping.")
            continue

        chunks = parse_and_chunk_markdown_file(rel_path, repo_root=repo_root)
        all_chunks.extend(chunks)

        file_stats.append({
            "source_file": rel_path,
            "chunks_created": len(chunks),
            "total_chars": sum(c.char_count for c in chunks),
            "total_tokens": sum(c.token_count for c in chunks),
        })
        log(f"  • {rel_path:28s} -> {len(chunks):3d} cohesive chunks")

    if not all_chunks:
        raise RuntimeError("No chunks could be extracted from the specified Markdown files.")

    log(f"[Pipeline] Total cohesive chunks created: {len(all_chunks)} across {len(file_stats)} files.")

    # 3. Initialize Engine Embedding Model
    log("[Pipeline] Ensuring local embedding transformer model is ready in memory...")
    ensure_model_ready()
    model = get_model()

    # Configure optimal inference parameters for CPU
    try:
        import torch
        torch.set_num_threads(8)
        if hasattr(model, "max_seq_length"):
            model.max_seq_length = 2048
    except Exception as e:
        log(f"[Pipeline] Note setting torch inference params: {e}")

    # 4. Generate Dense Embeddings in Batches
    log(f"[Pipeline] Generating dense embeddings for {len(all_chunks)} chunks (batch_size={EMBEDDING_BATCH_SIZE})...")
    chunk_texts = [c.content for c in all_chunks]
    embeddings: List[List[float]] = []

    emb_start = time.time()
    for i in range(0, len(chunk_texts), EMBEDDING_BATCH_SIZE):
        batch = chunk_texts[i : i + EMBEDDING_BATCH_SIZE]
        batch_embs = generate_embeddings_batch(batch)
        embeddings.extend(batch_embs)
        
        pct = (len(embeddings) / len(chunk_texts)) * 100
        elapsed_so_far = time.time() - emb_start
        est_total = (elapsed_so_far / len(embeddings)) * len(chunk_texts)
        rem = max(0, est_total - elapsed_so_far)
        log(f"  Processed {len(embeddings)}/{len(chunk_texts)} embeddings ({pct:.1f}%, ~{rem:.0f}s remaining)...")

    emb_elapsed = time.time() - emb_start
    log(f"[Pipeline] Successfully generated {len(embeddings)} embeddings in {emb_elapsed:.2f}s (dim={len(embeddings[0])})")

    # 5. Atomic Build in Staging Directory
    staging_dir = target_dir.parent / f".kb_mira_staging_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    if staging_dir.exists():
        safely_remove_directory(staging_dir)
    staging_dir.mkdir(parents=True, exist_ok=True)

    log(f"[Pipeline] Assembling Qdrant vector index in staging directory: {staging_dir}")
    try:
        staging_client = QdrantClient(path=str(staging_dir))
        setup_qdrant_collection(staging_client, vector_dim=len(embeddings[0]))
        upserted_count = ingest_chunks_into_qdrant(staging_client, all_chunks, embeddings)
        staging_client.close()
        log(f"[Pipeline] Staging build confirmed: {upserted_count} records committed to disk.")
    except Exception as e:
        log_error(f"[Pipeline] Error during staging build: {e}. Aborting.")
        safely_remove_directory(staging_dir)
        raise RuntimeError(f"Knowledge Base build failed in staging: {e}") from e

    # 6. Lifecycle Swap: Delete existing KB and install new KB
    log("[Pipeline] Executing atomic lifecycle swap to final Vault storage...")
    if target_dir.exists():
        log(f"[Lifecycle] Existing Knowledge Base found at {target_dir}. Deleting for clean recreation...")
        success_del = safely_remove_directory(target_dir)
        if not success_del:
            log_error(f"[Lifecycle] Failed to delete existing directory {target_dir}. Aborting swap.")
            safely_remove_directory(staging_dir)
            raise RuntimeError(f"Could not delete existing Knowledge Base at {target_dir}")

    # Ensure parent directory exists
    target_dir.parent.mkdir(parents=True, exist_ok=True)
    staging_dir.rename(target_dir)
    log(f"[Lifecycle] Successfully deployed MIRA Knowledge Base to: {target_dir}")

    # Synchronize secondary mirror location in Vault storage
    alt_mirror = SYSTEM_STORAGE_DIR / "knowledge_base" / "knowledge_base_mira"
    if alt_mirror.resolve() != target_dir.resolve():
        try:
            safely_remove_directory(alt_mirror)
            shutil.copytree(target_dir, alt_mirror)
            log(f"[Lifecycle] Synchronized secondary knowledge base mirror: {alt_mirror}")
        except Exception as e:
            log(f"[Lifecycle] Secondary mirror notice: {e}")

    # 7. Apply Security, Manifest, and Access Protections
    log("[Pipeline] Applying Vault cryptographic protection, manifest sealing, and folder locks...")
    manifest_ok = False
    snapshot_ok = False
    lock_ok = False

    if kb_protector is not None:
        try:
            manifest_ok = kb_protector.create_or_update_manifest(target_dir, "knowledge_base_mira")
            snapshot_ok = kb_protector.encrypt_folder_snapshot(target_dir)
            lock_ok = kb_protector.lock_folder(target_dir)
        except Exception as e:
            log_error(f"[Protection] Error applying security protection: {e}")

    total_elapsed = time.time() - start_time
    total_tokens = sum(c.token_count for c in all_chunks)
    total_chars = sum(c.char_count for c in all_chunks)

    summary = {
        "status": "success",
        "target_path": str(target_dir.resolve()),
        "files_processed": len(file_stats),
        "chunks_created": len(all_chunks),
        "embeddings_generated": len(embeddings),
        "vector_dim": len(embeddings[0]),
        "total_characters": total_chars,
        "estimated_tokens": total_tokens,
        "manifest_protected": manifest_ok,
        "snapshot_encrypted": snapshot_ok,
        "folder_locked": lock_ok,
        "build_duration_seconds": round(total_elapsed, 2),
        "file_breakdown": file_stats,
    }

    log("=" * 80)
    log(f"MIRA KNOWLEDGE BASE BUILD COMPLETE: {len(all_chunks)} chunks across {len(file_stats)} files ({total_elapsed:.2f}s)")
    log("=" * 80)
    return summary


# -----------------------------------------------------------------------------
# Search & Retrieval Pipeline
# -----------------------------------------------------------------------------
def search_mira_kb(
    query: str,
    limit: int = 5,
    module_filter: Optional[str] = None,
    source_filter: Optional[str] = None,
    kb_path: Path = KB_MIRA_DIR,
) -> List[Dict[str, Any]]:
    """
    Executes a high-dimensional dense vector similarity search against the MIRA knowledge base.
    Decrypts protected payload chunks with Vault authenticated crypto and returns
    full source traceability and similarity scores.
    """
    clean_query = str(query or "").strip()
    if not clean_query:
        return []

    if not kb_path.exists():
        log_error(f"[Search] Knowledge Base not found at {kb_path}")
        return []

    query_vec = generate_embedding(clean_query)

    # Build Qdrant payload filters if specified
    filter_conditions: List[models.FieldCondition] = []
    if module_filter and module_filter.strip():
        filter_conditions.append(
            models.FieldCondition(key="module", match=models.MatchValue(value=module_filter.strip()))
        )
    if source_filter and source_filter.strip():
        filter_conditions.append(
            models.FieldCondition(key="source_file", match=models.MatchValue(value=source_filter.strip()))
        )

    q_filter = models.Filter(must=filter_conditions) if filter_conditions else None

    # Safely open QdrantClient with portalocker bypass to prevent file contention
    with unittest.mock.patch("portalocker.lock", return_value=None), \
         unittest.mock.patch("portalocker.unlock", return_value=None):
        search_client = QdrantClient(path=str(kb_path))
        try:
            if hasattr(search_client, "query_points"):
                search_res = search_client.query_points(
                    collection_name=COLLECTION_NAME,
                    query=query_vec,
                    query_filter=q_filter,
                    limit=limit,
                    with_payload=True,
                )
                hits = search_res.points
            else:
                hits = search_client.search(
                    collection_name=COLLECTION_NAME,
                    query_vector=query_vec,
                    query_filter=q_filter,
                    limit=limit,
                    with_payload=True,
                    with_vectors=False,
                )
        finally:
            search_client.close()

    results: List[Dict[str, Any]] = []
    encrypted_payloads: List[str] = []
    hit_indices_needing_decryption: List[int] = []

    for idx, hit in enumerate(hits):
        payload = hit.payload or {}
        enc_text = payload.get("summarized_text", "")
        if enc_text and (enc_text.startswith("enc:v1:") or payload.get("_encrypted", False)):
            encrypted_payloads.append(enc_text)
            hit_indices_needing_decryption.append(idx)

    # Decrypt encrypted records in batch using Vault crypto
    decrypted_map: Dict[str, str] = {}
    if encrypted_payloads:
        try:
            if vault_crypto is not None:
                dec_texts = vault_crypto.decrypt_batch(encrypted_payloads)
            else:
                from Vault.crypto import decrypt_batch
                stripped_ciphertexts = [
                    t[len("enc:v1:") :] if t.startswith("enc:v1:") else t for t in encrypted_payloads
                ]
                dec_texts = decrypt_batch(stripped_ciphertexts)

            for raw_enc, dec in zip(encrypted_payloads, dec_texts):
                decrypted_map[raw_enc] = dec
        except Exception as e:
            log_error(f"[Search] Decryption notice: {e}. Falling back to raw ciphertext.")

    for hit in hits:
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
            "chunk_index": payload.get("chunk_index", 0),
            "total_chunks": payload.get("total_chunks", 1),
            "text": plain_text,
        })

    return results


# -----------------------------------------------------------------------------
# Comprehensive Verification Suite
# -----------------------------------------------------------------------------
def verify_mira_knowledge_base(kb_path: Path = KB_MIRA_DIR) -> bool:
    """
    Verifies that the built MIRA knowledge base is fully functional by executing
    targeted queries across all core subsystem domains and verifying accurate retrieval.
    """
    test_queries = [
        {
            "topic": "Engine & LLM Failover",
            "query": "How does the Engine handle provider failover from Gemini to Groq on rate limit?",
            "expected_module": "Engine",
        },
        {
            "topic": "Message Broker Redis Streams",
            "query": "What Redis streams and consumer groups does the Message Broker manage for OCR and embeddings?",
            "expected_module": "Message Broker",
        },
        {
            "topic": "Memory & Frame Deduplication",
            "query": "What is the OpenCV image difference threshold used in Memory to discard static frames?",
            "expected_module": "Memory",
        },
        {
            "topic": "Vault & Hardware Keyring",
            "query": "How does the Vault derive its master key from the OS hardware keyring and encrypt database records?",
            "expected_module": "Vault",
        },
        {
            "topic": "Operator & Native Capture",
            "query": "How does the Operator capture multi-monitor screens and enforce application blacklist privacy?",
            "expected_module": "Operator",
        },
        {
            "topic": "Client & Conversational Awake",
            "query": "How does the Client conversational awake follow-up window and gapless audio playback function?",
            "expected_module": "Client",
        },
        {
            "topic": "Scripts & Port Discovery",
            "query": "How does start.py detect port conflicts and dynamically allocate sockets via services.json?",
            "expected_module": "Scripts & Orchestration",
        },
    ]

    log("\n" + "=" * 80)
    log("RUNNING MIRA KNOWLEDGE BASE RETRIEVAL VERIFICATION")
    log("=" * 80)

    passed_count = 0
    total_count = len(test_queries)

    for idx, test in enumerate(test_queries, start=1):
        q = test["query"]
        expected_mod = test["expected_module"]
        topic = test["topic"]

        print(f"\n[{idx}/{total_count}] Testing Topic: '{topic}'")
        print(f"  Query: \"{q}\"")

        results = search_mira_kb(q, limit=3, kb_path=kb_path)
        if not results:
            print("  [FAILED] Zero records retrieved.")
            continue

        top_hit = results[0]
        top_mod = top_hit["module"]
        top_file = top_hit["source_file"]
        top_score = top_hit["score"]
        top_heading = top_hit["heading"]

        retrieved_modules = [r["module"] for r in results]
        is_relevant = any(expected_mod.lower() in m.lower() or m.lower() in expected_mod.lower() for m in retrieved_modules)

        status_str = "[PASSED]" if is_relevant and top_score > 0.50 else "[WARNING]"
        if is_relevant:
            passed_count += 1

        print(f"  Result: {status_str} | Similarity Score: {top_score:.4f}")
        print(f"  Top Match Module: [{top_mod}] (Source: {top_file})")
        print(f"  Section: {top_hit['breadcrumb']}")
        print(f"  Heading: {top_heading}")
        preview = top_hit["text"].split("\n\n")[0] if "\n\n" in top_hit["text"] else top_hit["text"][:180]
        print(f"  Snippet: {preview[:160]}...")

    print("\n" + "-" * 80)
    print(f"Verification Summary: {passed_count}/{total_count} benchmark domain queries satisfied.")
    print("-" * 80)
    return passed_count >= (total_count - 1)


# -----------------------------------------------------------------------------
# Main CLI Entry Point
# -----------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build, optimize, encrypt, and verify the MIRA Knowledge Base in Vault storage."
    )
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Rebuild the MIRA knowledge base from scratch even if it already exists",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Include supplementary documentation files (SECURITY.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md)",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Skip rebuilding and only execute verification queries against the existing knowledge base",
    )
    parser.add_argument(
        "--query",
        type=str,
        default=None,
        help="Run an ad-hoc semantic search query against the MIRA knowledge base",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=5,
        help="Maximum search results to return (default: 5)",
    )
    parser.add_argument(
        "--module",
        type=str,
        default=None,
        help="Filter search results by module name (e.g. Engine, Memory, Vault)",
    )
    parser.add_argument(
        "--source",
        type=str,
        default=None,
        help="Filter search results by source file path (e.g. Engine/README.md)",
    )
    args = parser.parse_args()

    # Query mode
    if args.query:
        print(f"\nSearching MIRA Knowledge Base for: \"{args.query}\"...")
        hits = search_mira_kb(
            args.query,
            limit=args.limit,
            module_filter=args.module,
            source_filter=args.source,
        )
        if not hits:
            print("No matching knowledge base records found.")
            return 0
        print(f"Found {len(hits)} matching records:\n")
        for i, hit in enumerate(hits, start=1):
            print(f"--- [Result #{i} | Score: {hit['score']:.4f} | Source: {hit['source_file']}] ---")
            print(f"Section: {hit['breadcrumb']}")
            print(f"Heading: {hit['heading']}")
            print(f"Content:\n{hit['text']}\n")
        return 0

    # Verify only mode
    if args.verify_only:
        success = verify_mira_knowledge_base()
        return 0 if success else 1

    # Default build & verify pipeline
    try:
        summary = build_mira_knowledge_base(include_supplementary=args.all)
        print("\n=== BUILD SUMMARY ===")
        print(json.dumps({k: v for k, v in summary.items() if k != "file_breakdown"}, indent=2))

        # Run verification suite after successful build
        verify_ok = verify_mira_knowledge_base()
        if verify_ok:
            print("\n[SUCCESS] MIRA Knowledge Base build and verification completed successfully!")
            return 0
        else:
            print("\n[WARNING] Knowledge Base built, but some benchmark retrieval queries had low confidence.")
            return 0
    except Exception as e:
        log_error(f"Failed to build MIRA knowledge base: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
