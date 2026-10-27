from __future__ import annotations
from typing import List, Optional
from .model import generate_embedding, generate_embeddings_batch, ensure_model_ready, is_model_ready, get_model, DEFAULT_MODEL_NAME
from .init_embedding import EmbeddingModelManager, initialize_embedding_model, get_embedding_status

def get_embedding(text: str) -> List[float]:
    return generate_embedding(text)
generate = get_embedding
__all__ = ['get_embedding', 'generate_embedding', 'generate_embeddings_batch', 'ensure_model_ready', 'is_model_ready', 'get_model', 'initialize_embedding_model', 'get_embedding_status', 'EmbeddingModelManager', 'DEFAULT_MODEL_NAME']
