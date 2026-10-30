from __future__ import annotations
import json
import logging
import re
import time
from typing import Any, Dict, List, Optional
import uuid
from llm import call_llm, AI_UNAVAILABLE_MESSAGE
from vault_logger import log, log_error
logger = logging.getLogger('mira.engine.ocr_summarization.summarizer')

def sanitize_job_input(job: Dict[str, Any]) -> Dict[str, str]:
    app_name = str(job.get('app_name') or 'Unknown').strip()
    os_name = str(job.get('os') or 'Unknown').strip()
    extracted = job.get('extracted_text')
    if extracted is None:
        extracted = ''
    elif not isinstance(extracted, str):
        extracted = str(extracted)
    return {'app_name': app_name, 'os': os_name, 'extracted_text': extracted.strip()}

def clean_fallback_app_name(raw_app: str) -> str:
    if not raw_app or not raw_app.strip():
        return 'Application'
    cleaned = raw_app.strip()
    if cleaned.lower().endswith('.exe'):
        cleaned = cleaned[:-4]
    cleaned = cleaned.replace('_', ' ').replace('-', ' ')
    return cleaned.strip()

def build_single_prompt(item: Dict[str, str]) -> str:
    raw_app = item.get('app_name', 'Unknown')
    os_name = item.get('os', 'Unknown')
    extracted_text = item.get('extracted_text', '')[:4000]
    prompt = (
        f'Analyze the following OCR text captured from a user screen to summarize the activity.\n\n'
        f'Input:\nRaw Application: {raw_app}\nOperating System: {os_name}\nExtracted Text:\n{extracted_text}\n\n'
        f'Strict Rules:\n'
        f'1. "app_name": The human-readable application name identified from window titles, URLs, or text.\n'
        f'2. "summary": A short, simple, and precise description of what the user is doing. Include the real application name.\n'
        f'3. Focus strictly on the primary foreground activity. Do not include UI button lists, unnecessary fluff, or unsolicited commentary.\n'
        f'4. Strict Grounding: Rely strictly on direct OCR text evidence. Do not assume, guess, extrapolate, or invent platforms, projects, actions, or unseen user intentions.\n'
        f'5. Do not treat Git branches or UI labels (e.g. main/master) as project names.\n'
        f'6. If activity cannot be determined, state: "User has <app_name> open, but the specific activity is unclear."\n'
        f'7. Output strictly in English.\n\n'
        f'Return strictly a JSON object:\n{{\n  "app_name": "<Real Application Name>",\n  "summary": "<Short, precise summary with app name>"\n}}\n'
    )
    return prompt

def parse_llm_single_response(raw_response: str, item: Dict[str, str]) -> Optional[Dict[str, str]]:
    if not raw_response or raw_response.strip() == AI_UNAVAILABLE_MESSAGE.strip():
        log_error('LLM call failed or returned unavailable message.')
        return None
    cleaned = raw_response.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub('^```(?:json)?\\s*', '', cleaned)
        cleaned = re.sub('\\s*```$', '', cleaned)
        cleaned = cleaned.strip()
    match = re.search('\\{.*\\}', cleaned, re.DOTALL)
    json_candidate = match.group(0) if match else cleaned
    parsed_app_name: Optional[str] = None
    parsed_summary: Optional[str] = None
    try:
        data = json.loads(json_candidate)
        if isinstance(data, dict):
            parsed_app_name = data.get('app_name')
            parsed_summary = data.get('summary')
        elif isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            parsed_app_name = data[0].get('app_name')
            parsed_summary = data[0].get('summary')
    except Exception as e:
        log_error(f'Direct JSON parsing of LLM single response failed ({e}), attempting regex fallback.')
    if not parsed_summary:
        summary_match = re.search('"summary"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"', cleaned)
        if summary_match:
            parsed_summary = summary_match.group(1).strip()
    if not parsed_app_name:
        app_match = re.search('"app_name"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"', cleaned)
        if app_match:
            parsed_app_name = app_match.group(1).strip()
    default_app = clean_fallback_app_name(item.get('app_name', 'Application'))
    resolved_app = parsed_app_name.strip() if parsed_app_name and parsed_app_name.strip() else default_app
    if parsed_summary and parsed_summary.strip():
        resolved_summary = parsed_summary.strip()
    else:
        text = item.get('extracted_text', '')
        if not text or len(text.strip()) < 5:
            resolved_summary = f'User has {resolved_app} open, but the specific activity is unclear.'
        else:
            resolved_summary = f'Activity in {resolved_app} cannot be determined from the available text.'
    if resolved_app.lower() not in resolved_summary.lower():
        if not resolved_summary.endswith('.'):
            resolved_summary += '.'
        resolved_summary += f' (in {resolved_app})'
    return {'app_name': resolved_app, 'summary': resolved_summary}

def summarize_job(job: Dict[str, Any]) -> Optional[Dict[str, str]]:
    sanitized = sanitize_job_input(job)
    prompt = build_single_prompt(sanitized)
    log(f"Invoking LLM for single job '{job.get('job_id', 'unknown')}' using work='summarization'...")
    raw_response = call_llm(prompt=prompt, work='summarization')
    parsed = parse_llm_single_response(raw_response, sanitized)
    if parsed is None:
        log_error(f"Single job summarization failed for job '{job.get('job_id')}': LLM provider unavailable.")
        return None
    return parsed
summarize_single_job = summarize_job

def build_batch_prompt(batch_items: List[Dict[str, str]]) -> str:
    indexed_items = [{'index': idx, 'raw_app_name': item['app_name'], 'os': item['os'], 'extracted_text': item['extracted_text'][:4000]} for idx, item in enumerate(batch_items)]
    items_json = json.dumps(indexed_items, ensure_ascii=False, indent=2)
    prompt = (
        f'Analyze the following batch of {len(batch_items)} OCR text records captured from user screens.\n'
        f'Input batch:\n{items_json}\n\n'
        f'Strict Rules for each record:\n'
        f'1. "app_name": The human-readable application name identified from window titles, URLs, or text.\n'
        f'2. "summary": A short, simple, and precise description of what the user is doing. Include the real application name.\n'
        f'3. Focus strictly on the primary foreground activity. Do not include UI button lists, unnecessary fluff, or unsolicited commentary.\n'
        f'4. Strict Grounding: Rely strictly on direct OCR text evidence. Do not assume, guess, extrapolate, or invent platforms, projects, actions, or unseen user intentions.\n'
        f'5. Do not treat Git branches or UI labels (e.g. main/master) as project names.\n'
        f'6. If activity cannot be determined, state: "User has <app_name> open, but the specific activity is unclear."\n'
        f'7. Output strictly in English.\n\n'
        f'Return strictly a JSON array matching:\n'
        f'[\n  {{\n    "index": 0,\n    "app_name": "<Real Application Name>",\n    "summary": "<Short, precise summary with app name>"\n  }}\n]\n'
    )
    return prompt

def parse_llm_batch_response(raw_response: str, expected_count: int, batch_items: List[Dict[str, str]]) -> Optional[List[Dict[str, str]]]:
    if not raw_response or raw_response.strip() == AI_UNAVAILABLE_MESSAGE.strip():
        log_error('LLM call failed or returned unavailable message.')
        return None
    cleaned = raw_response.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub('^```(?:json)?\\s*', '', cleaned)
        cleaned = re.sub('\\s*```$', '', cleaned)
        cleaned = cleaned.strip()
    match = re.search('\\[\\s*\\{.*\\}\\s*\\]|\\[\\s*\\"[^\\"]*\\".*\\]', cleaned, re.DOTALL)
    json_candidate = match.group(0) if match else cleaned
    parsed_items: List[Optional[Dict[str, str]]] = [None] * expected_count
    try:
        data = json.loads(json_candidate)
        if isinstance(data, list):
            for i, item in enumerate(data):
                if isinstance(item, dict):
                    idx = item.get('index', i)
                    summary = item.get('summary')
                    app_name = item.get('app_name')
                    if isinstance(idx, int) and 0 <= idx < expected_count and summary:
                        parsed_items[idx] = {'app_name': str(app_name).strip() if app_name else '', 'summary': str(summary).strip()}
                    elif 0 <= i < expected_count and summary:
                        parsed_items[i] = {'app_name': str(app_name).strip() if app_name else '', 'summary': str(summary).strip()}
                elif isinstance(item, str) and 0 <= i < expected_count:
                    parsed_items[i] = {'app_name': '', 'summary': item.strip()}
    except Exception as e:
        log_error(f'Direct JSON parsing of LLM response failed ({e}), attempting fallback extraction.')
    if any((item is None for item in parsed_items)):
        summary_matches = re.findall('"summary"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"', cleaned)
        app_matches = re.findall('"app_name"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"', cleaned)
        if summary_matches:
            for idx, s in enumerate(summary_matches):
                if idx < expected_count and parsed_items[idx] is None:
                    app_val = app_matches[idx].strip() if idx < len(app_matches) else ''
                    parsed_items[idx] = {'app_name': app_val, 'summary': s.strip()}
    final_results: List[Dict[str, str]] = []
    for idx in range(expected_count):
        raw_in = batch_items[idx]
        default_app = clean_fallback_app_name(raw_in.get('app_name', 'Application'))
        existing = parsed_items[idx]
        if existing and existing.get('summary'):
            resolved_app = existing.get('app_name') or default_app
            resolved_summary = existing['summary']
        else:
            resolved_app = default_app
            text = raw_in.get('extracted_text', '')
            if not text or len(text.strip()) < 5:
                resolved_summary = f'User has {resolved_app} open, but the specific activity is unclear.'
            else:
                resolved_summary = f'Activity in {resolved_app} cannot be determined from the available text.'
        if resolved_app.lower() not in resolved_summary.lower():
            if not resolved_summary.endswith('.'):
                resolved_summary += '.'
            resolved_summary += f' (in {resolved_app})'
        final_results.append({'app_name': resolved_app, 'summary': resolved_summary})
    return final_results

def summarize_batch(batch_jobs: List[Dict[str, Any]]) -> Optional[List[Dict[str, Any]]]:
    if not batch_jobs:
        return []
    sanitized_items = [sanitize_job_input(job) for job in batch_jobs]
    prompt = build_batch_prompt(sanitized_items)
    log(f"Invoking LLM for batch of {len(batch_jobs)} jobs using work='summarization'...")
    raw_response = call_llm(prompt=prompt, work='summarization')
    parsed_results = parse_llm_batch_response(raw_response, len(batch_jobs), sanitized_items)
    if parsed_results is None:
        log_error('Batch summarization failed: LLM provider unavailable. Jobs will be retried.')
        return None
    output_jobs: List[Dict[str, Any]] = []
    for idx, input_job in enumerate(batch_jobs):
        res = parsed_results[idx]
        out_job = {'job_id': str(uuid.uuid4()), 'app_name': res['app_name'], 'os': str(input_job.get('os') or 'Unknown').strip(), 'timestamp': input_job.get('timestamp') or int(time.time()), 'summarized_text': res['summary']}
        output_jobs.append(out_job)
    return output_jobs
