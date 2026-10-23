from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Dict, List, Optional
import uuid

from llm import call_llm, AI_UNAVAILABLE_MESSAGE
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.ocr_summarization.summarizer")

def sanitize_job_input(job: Dict[str, Any]) -> Dict[str, str]:
    """Extracts only app_name, os, and extracted_text from an input job."""
    app_name = str(job.get("app_name") or "Unknown").strip()
    os_name = str(job.get("os") or "Unknown").strip()
    
    extracted = job.get("extracted_text")
    if extracted is None:
        extracted = ""
    elif not isinstance(extracted, str):
        extracted = str(extracted)
    
    return {
        "app_name": app_name,
        "os": os_name,
        "extracted_text": extracted.strip(),
    }

def build_batch_prompt(batch_items: List[Dict[str, str]]) -> str:
    """Builds a structured prompt instructing the LLM to summarize each item independently."""
    indexed_items = [
        {
            "index": idx,
            "app_name": item["app_name"],
            "os": item["os"],
            "extracted_text": item["extracted_text"][:4000],  # Bound text size per record
        }
        for idx, item in enumerate(batch_items)
    ]

    items_json = json.dumps(indexed_items, indent=2, ensure_ascii=False)

    prompt = f"""You are the OCR Activity Summarization Engine for MIRA personal assistant.
Analyze the following batch of {len(batch_items)} OCR text records captured from user screens.
Each record represents a separate, independent user activity.
You must summarize each record independently without merging information between records.

Strict Rules for every summary:
1. Briefly and accurately describe what the user is doing based ONLY on the provided text, application name, and OS.
2. Avoid assumptions, hallucinations, suggestions, and unnecessary details.
3. If the activity cannot be determined from the available text, explicitly state: "Activity cannot be determined from the available text."
4. If only the application is identifiable, state: "User has <app_name> open, but the specific activity is unclear." (replace <app_name> with the actual application name).
5. Keep each summary concise (1 to 2 clear sentences).

Input batch:
{items_json}

Output Format:
You MUST return strictly a JSON array containing an object for each input item in the exact same order:
[
  {{
    "index": 0,
    "summary": "<concise summary for item 0>"
  }},
  ...
]
"""
    return prompt

def parse_llm_batch_response(raw_response: str, expected_count: int, batch_items: List[Dict[str, str]]) -> Optional[List[str]]:
    """Parses the LLM response into an ordered list of summaries matching the batch count.
    
    Returns None if the response indicates complete provider failure.
    """
    if not raw_response or raw_response.strip() == AI_UNAVAILABLE_MESSAGE.strip():
        log_error("LLM call failed or returned unavailable message.")
        return None

    cleaned = raw_response.strip()

    # Strip markdown code blocks if present
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

    # Try to locate JSON array block
    match = re.search(r"\[\s*\{.*\}\s*\]|\[\s*\"[^\"]*\".*\]", cleaned, re.DOTALL)
    json_candidate = match.group(0) if match else cleaned

    parsed_summaries: List[Optional[str]] = [None] * expected_count

    try:
        data = json.loads(json_candidate)
        if isinstance(data, list):
            for i, item in enumerate(data):
                if isinstance(item, dict):
                    idx = item.get("index", i)
                    summary = item.get("summary")
                    if isinstance(idx, int) and 0 <= idx < expected_count and summary:
                        parsed_summaries[idx] = str(summary).strip()
                    elif 0 <= i < expected_count and summary:
                        parsed_summaries[i] = str(summary).strip()
                elif isinstance(item, str) and 0 <= i < expected_count:
                    parsed_summaries[i] = item.strip()
    except Exception as e:
        log_error(f"Direct JSON parsing of LLM response failed ({e}), attempting fallback line extraction.")

    # Fallback line regex if some summaries are missing
    if any(s is None for s in parsed_summaries):
        # Look for regex matches of '"summary":\s*"([^"]+)"'
        summary_matches = re.findall(r'"summary"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"', cleaned)
        if summary_matches:
            for idx, s in enumerate(summary_matches):
                if idx < expected_count and parsed_summaries[idx] is None:
                    parsed_summaries[idx] = s.strip()

    # Ensure complete 1-to-1 mapping for all expected items
    final_summaries: List[str] = []
    for idx in range(expected_count):
        existing = parsed_summaries[idx]
        if existing and str(existing).strip():
            final_summaries.append(str(existing).strip())
        else:
            # Deterministic rule-based fallback if summary was omitted or unparseable
            item = batch_items[idx]
            app_name = item.get("app_name", "the application")
            text = item.get("extracted_text", "")
            if not text or len(text.strip()) < 5:
                fallback = f"User has {app_name} open, but the specific activity is unclear."
            else:
                fallback = "Activity cannot be determined from the available text."
            final_summaries.append(fallback)

    return final_summaries

def summarize_batch(batch_jobs: List[Dict[str, Any]]) -> Optional[List[Dict[str, Any]]]:
    """Executes OCR summarization for a batch of jobs in a single LLM call.
    
    Creates output jobs matching the input jobs with 1-to-1 preservation.
    Returns None if the LLM request completely failed (preserving jobs for retry).
    """
    if not batch_jobs:
        return []

    # 1. Create array containing only app_name, os, and extracted_text
    sanitized_items = [sanitize_job_input(job) for job in batch_jobs]

    # 2. Build single prompt for the batch
    prompt = build_batch_prompt(sanitized_items)

    log(f"Invoking LLM for batch of {len(batch_jobs)} jobs using work='summarization'...")
    
    # 3. Call LLM in ONE call
    raw_response = call_llm(prompt=prompt, work="summarization")

    # 4. Parse the summaries
    summaries = parse_llm_batch_response(raw_response, len(batch_jobs), sanitized_items)
    if summaries is None:
        log_error("Batch summarization failed: LLM provider unavailable. Jobs will be retried.")
        return None

    # 5. Create output jobs preserving exact 1-to-1 mapping
    output_jobs: List[Dict[str, Any]] = []
    for idx, input_job in enumerate(batch_jobs):
        out_job = {
            "job_id": str(uuid.uuid4()),
            "app_name": str(input_job.get("app_name") or "Unknown").strip(),
            "os": str(input_job.get("os") or "Unknown").strip(),
            "timestamp": input_job.get("timestamp") or int(time.time()),
            "summarized_text": summaries[idx],
        }
        output_jobs.append(out_job)

    return output_jobs
