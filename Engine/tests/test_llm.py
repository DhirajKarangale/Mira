from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch
import json
import os
import sys
from pathlib import Path

# Add Engine directory to sys.path
engine_dir = Path(__file__).resolve().parent.parent
if str(engine_dir) not in sys.path:
    sys.path.insert(0, str(engine_dir))

import config
from llm.error_analysis import (
    ErrorType,
    classify_error,
    mask_sensitive,
    AllKeysExhaustedError,
    AllModelsExhaustedError,
    ProviderUnavailableError,
)
from llm.response_parser import parse_response, clean_content
from llm.config import get_work_config, get_temperature, get_models_for_work
from llm.caller import call_llm, AI_UNAVAILABLE_MESSAGE

class TestResponseParser(unittest.TestCase):
    def test_clean_thinking_tags(self):
        raw = "<think>Let me ponder this problem deeply.\nStep 1...</think>The final answer is 42."
        self.assertEqual(clean_content(raw), "The final answer is 42.")

        raw_thought = "<thought>Thinking...</thought>Here is the response."
        self.assertEqual(clean_content(raw_thought), "Here is the response.")

        raw_reasoning = "<reasoning>Analyzing...</reasoning>Clear result."
        self.assertEqual(clean_content(raw_reasoning), "Clear result.")

    def test_unclosed_thinking_tags(self):
        raw = "Partial answer <think>still going..."
        self.assertEqual(clean_content(raw), "Partial answer")

    def test_parse_groq_object(self):
        mock_msg = MagicMock()
        mock_msg.content = "<think>internal reasoning</think>  Groq summarized content  "
        mock_choice = MagicMock()
        mock_choice.message = mock_msg
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]

        result = parse_response(mock_resp)
        self.assertEqual(result, "Groq summarized content")

    def test_parse_gemini_object(self):
        mock_resp = MagicMock()
        mock_resp.text = "Gemini generated text"
        self.assertEqual(parse_response(mock_resp), "Gemini generated text")

    def test_parse_dict(self):
        d = {"choices": [{"message": {"content": "Dict response"}}]}
        self.assertEqual(parse_response(d), "Dict response")

class TestErrorAnalysis(unittest.TestCase):
    def test_classify_key_errors(self):
        err = Exception("Error 401: Invalid API Key provided.")
        self.assertEqual(classify_error(err), ErrorType.API_KEY_EXPIRED_OR_INVALID)

        err_gemini = Exception("API_KEY_INVALID: API key not valid. Please pass a valid API key.")
        self.assertEqual(classify_error(err_gemini), ErrorType.API_KEY_EXPIRED_OR_INVALID)

    def test_classify_model_errors(self):
        err = Exception("Error 404: The model `llama-old` does not exist or you do not have access to it.")
        self.assertEqual(classify_error(err), ErrorType.MODEL_UNAVAILABLE)

        err_gemini = Exception("404 NOT_FOUND. This model models/gemini-old is no longer available.")
        self.assertEqual(classify_error(err_gemini), ErrorType.MODEL_UNAVAILABLE)

    def test_classify_provider_errors(self):
        err = Exception("Failed to establish a new connection: [WinError 10061] Connection refused")
        self.assertEqual(classify_error(err), ErrorType.PROVIDER_UNAVAILABLE)

        err_503 = Exception("503 Service Unavailable")
        self.assertEqual(classify_error(err_503), ErrorType.PROVIDER_UNAVAILABLE)

    def test_mask_sensitive(self):
        secret = "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"
        msg = f"Failed with key {secret} on server"
        masked = mask_sensitive(msg)
        self.assertNotIn(secret, masked)
        self.assertIn("[REDACTED_API_KEY]", masked)

class TestWorkConfiguration(unittest.TestCase):
    def test_get_work_config(self):
        cfg = get_work_config("summarization")
        self.assertIn("gemini", cfg)
        self.assertIn("groq", cfg)
        self.assertIn("temperature", cfg)

    def test_get_models_ordered(self):
        models = get_models_for_work("summarization", "groq")
        self.assertTrue(len(models) >= 2)
        self.assertIsInstance(models, list)

    def test_get_temperature(self):
        t = get_temperature("summarization")
        self.assertEqual(t, 0.1)

class TestFallbackHandling(unittest.TestCase):
    @patch("llm.caller.PROVIDER_HANDLERS")
    def test_all_providers_fail_returns_friendly_message(self, mock_handlers):
        # Both gemini and groq raise errors
        mock_handlers.__getitem__.side_effect = KeyError
        mock_handlers.get.side_effect = lambda k: MagicMock(side_effect=ProviderUnavailableError("Unavailable"))

        res = call_llm("test prompt", "summarization")
        self.assertEqual(res, AI_UNAVAILABLE_MESSAGE)

    @patch("llm.gemini.genai.Client")
    def test_gemini_model_fallback(self, mock_genai_client):
        # First model fails with 404 Model Unavailable, second model succeeds
        from llm.gemini import call as gemini_call
        from google.genai.errors import ClientError

        mock_instance = MagicMock()
        mock_genai_client.return_value = mock_instance

        # Model 1 throws 404, Model 2 succeeds
        def side_effect(model, contents, config):
            if "gemini-2.5-flash" in model and "lite" not in model:
                raise ClientError(404, {"error": {"code": 404, "message": "model not found", "status": "NOT_FOUND"}}, None)
            resp = MagicMock()
            resp.text = f"Success with {model}"
            return resp

        mock_instance.models.generate_content.side_effect = side_effect

        with patch("llm.gemini.get_provider_config", return_value={"keys": ["key1"], "current_key": 0}):
            with patch("llm.gemini.get_active_key", return_value="key1"):
                with patch("llm.gemini.get_models_for_work", return_value=["gemini-2.5-flash", "gemini-3.8-flash"]):
                    result = gemini_call("hello", "summarization")
                    self.assertIn("gemini-3.8-flash", result)

    @patch("llm.groq.groq.Groq")
    def test_groq_key_rotation(self, mock_groq_class):
        # Key 1 throws 401, key 2 succeeds
        from llm.groq import call as groq_call
        import groq

        mock_instance = MagicMock()
        mock_groq_class.return_value = mock_instance

        call_count = {"val": 0}
        def side_effect(model, messages, temperature):
            call_count["val"] += 1
            if call_count["val"] == 1:
                # Key 1 fails
                resp_mock = MagicMock()
                resp_mock.status_code = 401
                raise groq.AuthenticationError("Invalid API Key", response=resp_mock, body={"error": {"code": "invalid_api_key"}})
            # Key 2 succeeds
            resp = MagicMock()
            mock_choice = MagicMock()
            mock_choice.message.content = "Success with key 2"
            resp.choices = [mock_choice]
            return resp

        mock_instance.chat.completions.create.side_effect = side_effect

        with patch("llm.groq.get_provider_config", return_value={"keys": ["k1", "k2"], "current_key": 0}):
            with patch("llm.groq.get_active_key", side_effect=["k1", "k2"]):
                with patch("llm.groq.rotate_key", return_value="k2"):
                    with patch("llm.groq.get_models_for_work", return_value=["llama-3.3-70b-versatile"]):
                        result = groq_call("hello", "summarization")
                        self.assertEqual(result, "Success with key 2")

if __name__ == "__main__":
    unittest.main()
