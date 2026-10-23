from __future__ import annotations

import importlib
import logging
import subprocess
import sys
import threading
from typing import Any, List, Optional

from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.embedding.model")

DEFAULT_MODEL_NAME = "Qwen/Qwen3-Embedding-0.6B"

_MODEL_INSTANCE: Any = None
_MODEL_LOCK = threading.Lock()
_INITIALIZATION_LOCK = threading.Lock()
_IS_READY: bool = False

def ensure_package_installed(package_name: str = "sentence-transformers", module_name: str = "sentence_transformers") -> bool:
    """Verifies that the required embedding package is installed; downloads/installs it if missing."""
    try:
        importlib.import_module(module_name)
        return True
    except ImportError:
        log(f"[Embedding Model] Package '{package_name}' not found locally. Attempting automatic installation...")
        try:
            cmd = [sys.executable, "-m", "pip", "install", package_name]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            log(f"[Embedding Model] Successfully installed '{package_name}'. Output: {result.stdout[:200]}")
            importlib.invalidate_caches()
            importlib.import_module(module_name)
            return True
        except Exception as e:
            log_error(f"[Embedding Model] Failed to auto-install package '{package_name}': {e}")
            raise RuntimeError(f"Required package '{package_name}' is not installed and auto-installation failed: {e}")

def get_model(model_name: Optional[str] = None) -> Any:
    """Returns the singleton SentenceTransformer model instance, initializing it if necessary."""
    global _MODEL_INSTANCE, _IS_READY
    if _MODEL_INSTANCE is not None:
        return _MODEL_INSTANCE

    with _INITIALIZATION_LOCK:
        if _MODEL_INSTANCE is not None:
            return _MODEL_INSTANCE

        target_name = model_name or DEFAULT_MODEL_NAME
        log(f"[Embedding Model] Initializing embedding model '{target_name}'...")

        # 1. Ensure sentence-transformers is available
        ensure_package_installed("sentence-transformers", "sentence_transformers")

        # 2. Load model using SentenceTransformer (downloads from HuggingFace if not cached locally)
        from sentence_transformers import SentenceTransformer
        try:
            log(f"[Embedding Model] Loading '{target_name}' weights into memory...")
            model = SentenceTransformer(target_name)
            
            # 3. Warm-up inference pass to verify readiness
            _ = model.encode("MIRA embedding initialization warmup", show_progress_bar=False)
            
            _MODEL_INSTANCE = model
            _IS_READY = True
            log(f"[Embedding Model] Model '{target_name}' is fully loaded and ready.")
            return _MODEL_INSTANCE
        except Exception as e:
            log_error(f"[Embedding Model] Failed to initialize model '{target_name}': {e}")
            raise RuntimeError(f"Failed to load or download embedding model '{target_name}': {e}")

def ensure_model_ready(model_name: Optional[str] = None) -> bool:
    """Public helper to verify and warm up the embedding model during startup."""
    try:
        get_model(model_name)
        return True
    except Exception as e:
        log_error(f"[Embedding Model] Readiness check failed: {e}")
        return False

def is_model_ready() -> bool:
    """Returns whether the model has been initialized and is ready for inference."""
    return _IS_READY and _MODEL_INSTANCE is not None

def generate_embedding(text: str) -> List[float]:
    """Generates an embedding vector for a single text using Qwen/Qwen3-Embedding-0.6B."""
    clean_text = str(text or "").strip()
    if not clean_text:
        clean_text = "Empty activity"

    model = get_model()
    with _MODEL_LOCK:
        # encode returns numpy array or tensor
        raw_emb = model.encode(clean_text, show_progress_bar=False)

    if hasattr(raw_emb, "tolist"):
        return [float(x) for x in raw_emb.tolist()]
    return [float(x) for x in raw_emb]

def generate_embeddings_batch(texts: List[str]) -> List[List[float]]:
    """Generates embedding vectors for a batch of texts efficiently."""
    if not texts:
        return []

    cleaned_texts = [str(t or "").strip() if str(t or "").strip() else "Empty activity" for t in texts]
    model = get_model()

    with _MODEL_LOCK:
        raw_embs = model.encode(cleaned_texts, batch_size=len(cleaned_texts), show_progress_bar=False)

    results: List[List[float]] = []
    for emb in raw_embs:
        if hasattr(emb, "tolist"):
            results.append([float(x) for x in emb.tolist()])
        else:
            results.append([float(x) for x in emb])
    return results
