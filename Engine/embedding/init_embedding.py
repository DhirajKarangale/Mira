from __future__ import annotations
import argparse
import importlib
import importlib.util
import logging
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
from typing import Any, Dict, Optional
_engine_dir = Path(__file__).resolve().parent.parent
if str(_engine_dir) not in sys.path:
    sys.path.insert(0, str(_engine_dir))
try:
    from vault_logger import log, log_error
except ImportError:

    def log(msg: str) -> None:
        print(f'[INFO] {msg}', flush=True)

    def log_error(msg: str) -> None:
        print(f'[ERROR] {msg}', file=sys.stderr, flush=True)
logger = logging.getLogger('mira.engine.embedding.init_embedding')
DEFAULT_MODEL_NAME: str = 'Qwen/Qwen3-Embedding-0.6B'
PACKAGE_NAME: str = 'sentence-transformers'
MODULE_NAME: str = 'sentence_transformers'

class EmbeddingModelManager:
    _instance: Optional[Any] = None
    _is_ready: bool = False
    _model_name: str = DEFAULT_MODEL_NAME
    _lock = threading.RLock()

    @classmethod
    def is_package_installed(cls, package_module: str=MODULE_NAME) -> bool:
        try:
            return importlib.util.find_spec(package_module) is not None
        except Exception:
            return False

    @classmethod
    def ensure_package_installed(cls, package_name: str=PACKAGE_NAME, package_module: str=MODULE_NAME) -> bool:
        if cls.is_package_installed(package_module):
            log(f"[Embedding Init] Package '{package_name}' is installed and available locally.")
            return True
        log(f"[Embedding Init] Package '{package_name}' not found locally. Initiating automatic installation...")
        try:
            cmd = [sys.executable, '-m', 'pip', 'install', package_name]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            log(f"[Embedding Init] Successfully installed '{package_name}'.")
            importlib.invalidate_caches()
            if cls.is_package_installed(package_module):
                return True
            raise RuntimeError(f"Package '{package_name}' installed but importlib cannot find module '{package_module}'")
        except Exception as e:
            err_msg = f"Failed to install package '{package_name}': {e}"
            log_error(f'[Embedding Init] {err_msg}')
            raise RuntimeError(err_msg) from e

    @classmethod
    def is_model_cached_locally(cls, model_name: str=DEFAULT_MODEL_NAME) -> bool:
        if os.path.isdir(model_name):
            config_path = os.path.join(model_name, 'config.json')
            return os.path.exists(config_path)
        try:
            from huggingface_hub import try_to_load_from_cache
            config_file = try_to_load_from_cache(model_name, 'config.json')
            model_file = try_to_load_from_cache(model_name, 'model.safetensors')
            if config_file and isinstance(config_file, str) and os.path.exists(config_file) and model_file and isinstance(model_file, str) and os.path.exists(model_file):
                return True
        except Exception:
            pass
        return False

    @classmethod
    def initialize(cls, model_name: Optional[str]=None) -> bool:
        if cls._is_ready and cls._instance is not None:
            log(f"[Embedding Init] Model '{cls._model_name}' is already initialized and ready in memory.")
            return True
        with cls._lock:
            if cls._is_ready and cls._instance is not None:
                return True
            target_model = model_name or DEFAULT_MODEL_NAME
            cls._model_name = target_model
            start_time = time.time()
            log(f"[Embedding Init] Starting initialization manager for model '{target_model}'...")
            cls.ensure_package_installed(PACKAGE_NAME, MODULE_NAME)
            is_cached = cls.is_model_cached_locally(target_model)
            if is_cached:
                log(f"[Embedding Init] Model '{target_model}' is already downloaded and cached locally.")
            else:
                log(f"[Embedding Init] Model '{target_model}' not found in local cache. Downloading weights...")
            from sentence_transformers import SentenceTransformer
            try:
                log(f"[Embedding Init] Loading '{target_model}' into memory...")
                if is_cached:
                    try:
                        model = SentenceTransformer(target_model, local_files_only=True)
                    except Exception:
                        model = SentenceTransformer(target_model)
                else:
                    model = SentenceTransformer(target_model)
                log(f"[Embedding Init] Executing warmup inference pass for '{target_model}'...")
                warmup_emb = model.encode('MIRA embedding initialization warmup', show_progress_bar=False)
                emb_dim = len(warmup_emb) if hasattr(warmup_emb, '__len__') else 0
                cls._instance = model
                cls._is_ready = True
                elapsed = time.time() - start_time
                log(f"[Embedding Init] Model '{target_model}' successfully initialized and ready (dim={emb_dim}, elapsed={elapsed:.2f}s).")
                return True
            except Exception as e:
                err_msg = f"Failed to load or initialize embedding model '{target_model}': {e}"
                log_error(f'[Embedding Init] {err_msg}')
                raise RuntimeError(err_msg) from e

    @classmethod
    def get_model(cls, model_name: Optional[str]=None) -> Any:
        if cls._is_ready and cls._instance is not None:
            return cls._instance
        with cls._lock:
            if cls._is_ready and cls._instance is not None:
                return cls._instance
            cls.initialize(model_name)
            return cls._instance

    @classmethod
    def is_ready(cls) -> bool:
        return cls._is_ready and cls._instance is not None

    @classmethod
    def get_status(cls) -> Dict[str, Any]:
        return {'ready': cls.is_ready(), 'model_name': cls._model_name, 'package_installed': cls.is_package_installed(), 'cached_locally': cls.is_model_cached_locally(cls._model_name)}

def initialize_embedding_model(model_name: Optional[str]=None) -> bool:
    return EmbeddingModelManager.initialize(model_name)

def get_model(model_name: Optional[str]=None) -> Any:
    return EmbeddingModelManager.get_model(model_name)

def is_model_ready() -> bool:
    return EmbeddingModelManager.is_ready()

def get_embedding_status() -> Dict[str, Any]:
    return EmbeddingModelManager.get_status()

def main() -> int:
    parser = argparse.ArgumentParser(description='MIRA Engine Embedding Model Initialization Manager')
    parser.add_argument('--model', type=str, default=DEFAULT_MODEL_NAME, help=f'Target embedding model name (default: {DEFAULT_MODEL_NAME})')
    parser.add_argument('--check-only', action='store_true', help='Only check whether the required package and model are available locally without loading into memory')
    args = parser.parse_args()
    print(f'=== MIRA Engine Embedding Model Manager ===', flush=True)
    print(f'Target Model: {args.model}', flush=True)
    pkg_ok = EmbeddingModelManager.is_package_installed()
    print(f"Package '{PACKAGE_NAME}' installed: {pkg_ok}", flush=True)
    cached = EmbeddingModelManager.is_model_cached_locally(args.model)
    print(f"Model '{args.model}' cached locally: {cached}", flush=True)
    if args.check_only:
        print('\n[Check Only] Summary:', flush=True)
        print(f"  Package Available: {('YES' if pkg_ok else 'NO')}")
        print(f"  Model Cached:      {('YES' if cached else 'NO')}")
        return 0 if pkg_ok and cached else 1
    print('\nInitializing model...', flush=True)
    try:
        success = initialize_embedding_model(args.model)
        if success:
            print(f"Successfully initialized '{args.model}'! Model is loaded and ready.", flush=True)
            return 0
        else:
            print(f"Failed to initialize '{args.model}'.", file=sys.stderr, flush=True)
            return 1
    except Exception as e:
        print(f'Error during initialization: {e}', file=sys.stderr, flush=True)
        return 1
if __name__ == '__main__':
    sys.exit(main())
