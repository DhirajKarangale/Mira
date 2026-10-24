from __future__ import annotations

from typing import Any, List
import unittest
from unittest.mock import patch, MagicMock

import sys
from pathlib import Path

# Ensure Engine root is on sys.path
_engine_dir = Path(__file__).resolve().parent.parent
if str(_engine_dir) not in sys.path:
    sys.path.insert(0, str(_engine_dir))

from embedding import (
    get_embedding,
    generate_embedding,
    ensure_model_ready,
    is_model_ready,
    DEFAULT_MODEL_NAME,
)

class TestEmbeddingSubmodule(unittest.TestCase):
    def test_default_model_name(self):
        self.assertEqual(DEFAULT_MODEL_NAME, "Qwen/Qwen3-Embedding-0.6B")

    @patch("embedding.model.get_model")
    def test_get_embedding_calls_model_encode(self, mock_get_model):
        mock_model = MagicMock()
        mock_model.encode.return_value = [0.12, -0.45, 0.78, 0.0]
        mock_get_model.return_value = mock_model

        result = get_embedding("User is writing Python code in Visual Studio Code.")
        self.assertIsInstance(result, list)
        self.assertEqual(len(result), 4)
        self.assertAlmostEqual(result[0], 0.12)
        mock_model.encode.assert_called_once_with(
            "User is writing Python code in Visual Studio Code.",
            show_progress_bar=False
        )

    @patch("embedding.model.get_model")
    def test_get_embedding_handles_empty_string(self, mock_get_model):
        mock_model = MagicMock()
        mock_model.encode.return_value = [0.0, 0.1]
        mock_get_model.return_value = mock_model

        result = get_embedding("")
        self.assertEqual(result, [0.0, 0.1])
        # Verifies that empty text defaults to non-empty fallback string
        mock_model.encode.assert_called_once_with(
            "Empty activity",
            show_progress_bar=False
        )

    @patch("embedding.model.get_model")
    def test_get_embedding_converts_numpy_array(self, mock_get_model):
        class MockNumpyArray:
            def tolist(self):
                return [0.5, 0.25, -0.1]
        
        mock_model = MagicMock()
        mock_model.encode.return_value = MockNumpyArray()
        mock_get_model.return_value = mock_model

        result = get_embedding("Sample text")
        self.assertEqual(result, [0.5, 0.25, -0.1])

    @patch("embedding.model.get_model")
    def test_ensure_model_ready(self, mock_get_model):
        mock_get_model.return_value = MagicMock()
        self.assertTrue(ensure_model_ready())

    @patch("embedding.model.get_model", side_effect=RuntimeError("Model load failure"))
    def test_ensure_model_ready_failure(self, mock_get_model):
        self.assertFalse(ensure_model_ready())

from embedding.init_embedding import (
    EmbeddingModelManager,
    initialize_embedding_model,
    is_model_ready as init_is_model_ready,
    get_embedding_status,
)

class TestEmbeddingModelManager(unittest.TestCase):
    def setUp(self):
        # Reset manager singleton state before each test
        EmbeddingModelManager._instance = None
        EmbeddingModelManager._is_ready = False

    def tearDown(self):
        EmbeddingModelManager._instance = None
        EmbeddingModelManager._is_ready = False

    @patch("importlib.util.find_spec")
    def test_is_package_installed_true(self, mock_find_spec):
        mock_find_spec.return_value = MagicMock()
        self.assertTrue(EmbeddingModelManager.is_package_installed("sentence_transformers"))

    @patch("importlib.util.find_spec", return_value=None)
    def test_is_package_installed_false(self, mock_find_spec):
        self.assertFalse(EmbeddingModelManager.is_package_installed("sentence_transformers"))

    @patch.object(EmbeddingModelManager, "is_package_installed", return_value=True)
    def test_ensure_package_installed_when_already_available(self, mock_is_installed):
        self.assertTrue(EmbeddingModelManager.ensure_package_installed())

    @patch("subprocess.run")
    @patch.object(EmbeddingModelManager, "is_package_installed", side_effect=[False, True])
    def test_ensure_package_installed_downloads_when_missing(self, mock_is_installed, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="Successfully installed")
        self.assertTrue(EmbeddingModelManager.ensure_package_installed())
        mock_run.assert_called_once()

    @patch("huggingface_hub.try_to_load_from_cache")
    @patch("os.path.exists", return_value=True)
    def test_is_model_cached_locally_true(self, mock_exists, mock_cache):
        mock_cache.side_effect = ["/cache/config.json", "/cache/model.safetensors"]
        self.assertTrue(EmbeddingModelManager.is_model_cached_locally("Qwen/Qwen3-Embedding-0.6B"))

    @patch("huggingface_hub.try_to_load_from_cache", return_value=None)
    def test_is_model_cached_locally_false(self, mock_cache):
        self.assertFalse(EmbeddingModelManager.is_model_cached_locally("Qwen/Qwen3-Embedding-0.6B"))

    @patch.object(EmbeddingModelManager, "ensure_package_installed", return_value=True)
    @patch.object(EmbeddingModelManager, "is_model_cached_locally", return_value=True)
    @patch("sentence_transformers.SentenceTransformer")
    def test_initialize_loads_and_warms_up_model(self, mock_st_cls, mock_cached, mock_pkg):
        mock_model = MagicMock()
        mock_model.encode.return_value = [0.1] * 1024
        mock_st_cls.return_value = mock_model

        success = initialize_embedding_model("Qwen/Qwen3-Embedding-0.6B")
        self.assertTrue(success)
        self.assertTrue(EmbeddingModelManager.is_ready())
        self.assertTrue(init_is_model_ready())
        self.assertEqual(EmbeddingModelManager.get_model(), mock_model)

        # Verify warm up was called
        mock_model.encode.assert_called_once_with("MIRA embedding initialization warmup", show_progress_bar=False)

    @patch.object(EmbeddingModelManager, "ensure_package_installed", return_value=True)
    @patch.object(EmbeddingModelManager, "is_model_cached_locally", return_value=True)
    @patch("sentence_transformers.SentenceTransformer")
    def test_initialize_avoids_reinitialization_if_already_ready(self, mock_st_cls, mock_cached, mock_pkg):
        mock_model = MagicMock()
        mock_model.encode.return_value = [0.1] * 1024
        mock_st_cls.return_value = mock_model

        # First call initializes
        initialize_embedding_model("Qwen/Qwen3-Embedding-0.6B")
        self.assertEqual(mock_st_cls.call_count, 1)

        # Second call must NOT reinitialize or call SentenceTransformer constructor again
        success2 = initialize_embedding_model("Qwen/Qwen3-Embedding-0.6B")
        self.assertTrue(success2)
        self.assertEqual(mock_st_cls.call_count, 1)

    def test_get_embedding_status(self):
        EmbeddingModelManager._is_ready = True
        EmbeddingModelManager._instance = MagicMock()
        status = get_embedding_status()
        self.assertIn("ready", status)
        self.assertTrue(status["ready"])
        self.assertIn("model_name", status)
        self.assertIn("package_installed", status)
        self.assertIn("cached_locally", status)

if __name__ == "__main__":
    unittest.main()

