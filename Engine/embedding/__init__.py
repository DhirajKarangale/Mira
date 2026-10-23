"""Embedding Module for MIRA Engine.

Exposes a single public function `get_embedding` that accepts text and returns
its embedding vector using Qwen/Qwen3-Embedding-0.6B.
"""
from __future__ import annotations

from typing import List, Optional
from .model import (
    generate_embedding,
    ensure_model_ready,
    is_model_ready,
    get_model,
    DEFAULT_MODEL_NAME,
)

def get_embedding(text: str) -> List[float]:
    """Generates an embedding vector for the given text using Qwen/Qwen3-Embedding-0.6B.
    
    Accepts:
        text: String to embed (e.g. summarized text).
    Returns:
        List of floats representing the embedding vector.
    """
    return generate_embedding(text)

# Alias for backwards compatibility if needed
generate = get_embedding

__all__ = [
    "get_embedding",
    "generate_embedding",
    "ensure_model_ready",
    "is_model_ready",
    "get_model",
    "DEFAULT_MODEL_NAME",
]
