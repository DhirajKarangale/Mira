from __future__ import annotations
import re
from typing import Any
_THINKING_REGEXES = [re.compile('<think>.*?</think>', re.DOTALL | re.IGNORECASE), re.compile('<thought>.*?</thought>', re.DOTALL | re.IGNORECASE), re.compile('<reasoning>.*?</reasoning>', re.DOTALL | re.IGNORECASE), re.compile('<think>.*$', re.DOTALL | re.IGNORECASE), re.compile('<thought>.*$', re.DOTALL | re.IGNORECASE), re.compile('<reasoning>.*$', re.DOTALL | re.IGNORECASE)]

def clean_content(raw_text: str) -> str:
    if not isinstance(raw_text, str):
        raw_text = str(raw_text)
    cleaned = raw_text
    for pattern in _THINKING_REGEXES:
        cleaned = pattern.sub('', cleaned)
    return cleaned.strip()

def parse_response(response: Any) -> str:
    if response is None:
        return ''
    if isinstance(response, str):
        return clean_content(response)
    if hasattr(response, 'text') and isinstance(response.text, str) and response.text:
        return clean_content(response.text)
    if hasattr(response, 'choices') and isinstance(response.choices, (list, tuple)) and response.choices:
        first_choice = response.choices[0]
        if hasattr(first_choice, 'message'):
            msg = first_choice.message
            content = getattr(msg, 'content', '')
            if isinstance(content, str):
                return clean_content(content or '')
    if hasattr(response, 'candidates') and isinstance(response.candidates, (list, tuple)) and response.candidates:
        candidate = response.candidates[0]
        content_obj = getattr(candidate, 'content', None)
        if content_obj and hasattr(content_obj, 'parts') and isinstance(content_obj.parts, (list, tuple)):
            text_parts = []
            for part in content_obj.parts:
                is_thought = getattr(part, 'thought', False)
                if not is_thought and hasattr(part, 'text') and isinstance(part.text, str) and part.text:
                    text_parts.append(part.text)
            if text_parts:
                return clean_content(''.join(text_parts))
    if hasattr(response, 'text') and getattr(response, 'text'):
        return clean_content(str(response.text))
    if isinstance(response, dict):
        if 'choices' in response and isinstance(response['choices'], list) and response['choices']:
            choice = response['choices'][0]
            if isinstance(choice, dict):
                msg = choice.get('message', {})
                if isinstance(msg, dict) and 'content' in msg:
                    return clean_content(msg['content'] or '')
        if 'candidates' in response and isinstance(response['candidates'], list) and response['candidates']:
            cand = response['candidates'][0]
            if isinstance(cand, dict):
                content = cand.get('content', {})
                parts = content.get('parts', []) if isinstance(content, dict) else []
                parts_text = [p.get('text', '') for p in parts if isinstance(p, dict) and p.get('text')]
                if parts_text:
                    return clean_content(''.join(parts_text))
        for key in ('text', 'content', 'response', 'result'):
            if key in response and isinstance(response[key], str):
                return clean_content(response[key])
    return clean_content(str(response))
