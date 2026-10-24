from __future__ import annotations

import logging
import threading
from typing import Any, List, Optional

from vault_logger import log, log_error
from .init_embedding import (
    EmbeddingModelManager,
    DEFAULT_MODEL_NAME,
    get_model as _manager_get_model,
    is_model_ready as _manager_is_model_ready,
    initialize_embedding_model as _manager_initialize,
)

logger = logging.getLogger("mira.engine.embedding.model")

_MODEL_LOCK = threading.Lock()

def get_model(model_name: Optional[str] = None) -> Any:
    """Returns the singleton SentenceTransformer model instance via the initialization manager."""
    return _manager_get_model(model_name)

def ensure_model_ready(model_name: Optional[str] = None) -> bool:
    """Public helper to verify and initialize the embedding model."""
    try:
        get_model(model_name)
        return True
    except Exception as e:
        log_error(f"[Embedding Model] Readiness check failed: {e}")
        return False

def is_model_ready() -> bool:
    """Returns whether the model has been initialized and is ready for inference."""
    return _manager_is_model_ready()

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
