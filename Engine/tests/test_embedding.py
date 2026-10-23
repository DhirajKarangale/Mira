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

if __name__ == "__main__":
    unittest.main()
