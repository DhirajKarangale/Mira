from __future__ import annotations

import asyncio
import concurrent.futures
import json
import logging
import os
from pathlib import Path
import re
import sys
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger("mira.engine.chat.mira_assistant.operations")

_CURRENT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _CURRENT_DIR.parents[2]

for _p in (_REPO_ROOT / "Engine", _REPO_ROOT, _REPO_ROOT / "Vault", _REPO_ROOT / "Memory"):
    _p_str = str(_p)
    if _p_str not in sys.path:
        sys.path.insert(0, _p_str)


def _mask_key(key: Optional[str]) -> str:
    """Masks an API key for safe display (e.g. gsk_1234...abcd)."""
    if key is None:
        return "(not set)"
    k = str(key).strip()
    if not k or k.lower() in ("none", "(not set)"):
        return "(not set)"
    if len(k) <= 8:
        return "***"
    prefix_len = 6 if len(k) > 16 else 4
    suffix_len = 4 if len(k) > 16 else 2
    return f"{k[:prefix_len]}...{k[-suffix_len:]}"


def _run_coroutine_safely(coro):
    """Safely executes an async coroutine from synchronous code whether a loop is running or not."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result()
    else:
        return asyncio.run(coro)


# =============================================================================
# 1. Daily Suggestions Operations
# =============================================================================

def handle_daily_suggestions_op(query: str, tool_params: Optional[Dict[str, Any]] = None) -> str:
    """
    Executes Daily Suggestions queries and updates:
      - View / Fetch today's or latest suggestions with completion checklist
      - Force refresh / regenerate suggestions
      - Mark suggestion complete or incomplete by index
      - View historical or previous suggestions
    """
    q = query.strip().lower()
    from Engine.daily_suggestions.vault_client import (
        fetch_today_daily_suggestions,
        fetch_latest_daily_suggestions,
        fetch_previous_daily_suggestions,
        fetch_daily_suggestions_history,
        save_suggestion_completion,
    )

    # 1. Check for complete / uncomplete toggle action
    complete_match = re.search(r'\b(mark|set|toggle)?\s*(?:daily\s+)?suggestion\s*#?(\d+)\s*(?:as\s+)?(complete|completed|done|finished|incomplete|undone|uncompleted)\b', q)
    if not complete_match:
        complete_match = re.search(r'\b(complete|finish|unmark)\s*(?:daily\s+)?suggestion\s*#?(\d+)\b', q)

    if complete_match:
        if len(complete_match.groups()) == 3 and complete_match.group(3):
            idx_str = complete_match.group(2)
            state_str = complete_match.group(3).lower()
            is_completed = state_str in ("complete", "completed", "done", "finished")
        else:
            action_word = complete_match.group(1).lower()
            idx_str = complete_match.group(2)
            is_completed = action_word != "unmark"

        try:
            user_idx = int(idx_str)
            zero_based_idx = user_idx - 1 if user_idx >= 1 else user_idx
        except ValueError:
            zero_based_idx = 0

        res = save_suggestion_completion(index=zero_based_idx, completed=is_completed)
        status_word = "completed" if is_completed else "marked as pending"

        # Fetch fresh record to display updated checklist
        rec = fetch_today_daily_suggestions() or fetch_latest_daily_suggestions() or {}
        suggestions = rec.get("suggestions") or []
        completed_indices = set(rec.get("completed") or [])

        lines = [
            f"✅ **Daily Suggestion #{zero_based_idx + 1} {status_word}!**",
            "",
            "### 📋 Updated Suggestions Checklist:",
        ]
        if suggestions:
            for i, text in enumerate(suggestions, start=1):
                box = "[x]" if (i - 1) in completed_indices else "[ ]"
                lines.append(f"- {box} **{i}.** {text}")
        else:
            lines.append(f"- Status updated in Vault (Record #{rec.get('id', 'N/A')}).")

        return "\n".join(lines)

    # 2. Check for refresh / regenerate action
    if any(w in q for w in ("refresh", "regenerate", "re-generate", "generate today", "update suggestions")):
        from Engine.daily_suggestions.suggestions_section import refresh_suggestions
        try:
            new_suggestions = _run_coroutine_safely(refresh_suggestions(force=True, force_regenerate=True))
            rec = fetch_today_daily_suggestions() or fetch_latest_daily_suggestions() or {}
            completed_indices = set(rec.get("completed") or [])

            lines = [
                "🔄 **Daily Suggestions Successfully Refreshed & Generated!**",
                "",
                "### 📋 Today's Continuity & Action Items:",
            ]
            if new_suggestions:
                for i, text in enumerate(new_suggestions, start=1):
                    box = "[x]" if (i - 1) in completed_indices else "[ ]"
                    lines.append(f"- {box} **{i}.** {text}")
            else:
                lines.append("- *No action items were synthesized. Check back after your next work session!*")

            # Add weather & news highlights if present
            weather = rec.get("weather") or {}
            curr = weather.get("current") or {}
            loc = weather.get("location") or {}
            if curr:
                lines.append("")
                lines.append(f"🌤️ **Weather**: {curr.get('condition', 'N/A')}, {curr.get('temperature_celsius', 'N/A')}°C ({loc.get('name', 'Local')})")

            return "\n".join(lines)
        except Exception as e:
            logger.error(f"[Operations] Error refreshing suggestions: {e}")
            return f"⚠️ Encountered an issue refreshing daily suggestions: {e}. Please ensure your AI keys are active."

    # 3. Check for previous / history suggestions
    if any(w in q for w in ("previous", "yesterday", "past", "history", "earlier")):
        history_records = fetch_daily_suggestions_history(days=7)
        if not history_records:
            return "No previous daily suggestions history found in Vault storage."

        lines = ["### 📅 Past Daily Suggestions History:"]
        for entry in history_records[:5]:
            d_str = entry.get("date_suggestions") or entry.get("date_weather") or f"Record #{entry.get('id')}"
            items = entry.get("suggestions") or []
            comp = set(entry.get("completed") or [])
            lines.append(f"\n**{d_str}**:")
            if items:
                for idx, item in enumerate(items, start=1):
                    box = "[x]" if (idx - 1) in comp else "[ ]"
                    lines.append(f"  - {box} {item}")
            else:
                lines.append("  - *No specific items recorded.*")

        return "\n".join(lines)

    # 4. Default: Fetch today's suggestions or latest suggestions
    rec = fetch_today_daily_suggestions()
    is_today = True
    if not rec or not rec.get("suggestions"):
        rec = fetch_latest_daily_suggestions()
        is_today = False

    if not rec or not rec.get("suggestions"):
        return (
            "📋 **Daily Suggestions**: No suggestions have been generated for today yet.\n\n"
            "You can say **\"Refresh daily suggestions\"** to synthesize today's agenda, tasks, and weather briefing."
        )

    suggestions = rec.get("suggestions") or []
    completed_indices = set(rec.get("completed") or [])
    date_label = rec.get("date_suggestions") or ("Today" if is_today else "Latest Available")

    lines = [
        f"### 📋 Daily Suggestions ({date_label})",
        "",
        "**Prioritized Tasks & Project Continuity:**",
    ]
    for idx, text in enumerate(suggestions, start=1):
        box = "[x]" if (idx - 1) in completed_indices else "[ ]"
        lines.append(f"- {box} **{idx}.** {text}")

    # Append localized weather briefing if present in record
    weather = rec.get("weather") or {}
    curr = weather.get("current") or {}
    loc = weather.get("location") or {}
    if curr:
        lines.append("")
        lines.append(
            f"🌤️ **Weather**: {curr.get('condition', 'Current')} | "
            f"Temp: **{curr.get('temperature_celsius', 'N/A')}°C** (feels like {curr.get('apparent_temperature_celsius', 'N/A')}°C) | "
            f"Humidity: {curr.get('relative_humidity_percent', 'N/A')}% | "
            f"Location: {loc.get('name', 'Detected Area')}"
        )

    # Append top curated news headlines if present in record
    news_items = rec.get("news") or []
    if news_items:
        lines.append("")
        lines.append("📰 **Top Briefing Headlines**:")
        for item in news_items[:3]:
            title = item.get("title", "")
            source = item.get("source", "News")
            lines.append(f"- **{source}**: {title}")

    return "\n".join(lines)


# =============================================================================
# 2. API Key Retrieval & Update Operations
# =============================================================================

def handle_api_key_op(query: str, tool_params: Optional[Dict[str, Any]] = None) -> str:
    """
    Executes API key retrieval, additions, updates, rotations, and priority configuration:
      - List all configured keys across LLM, Voice, and News providers with secure masking
      - Update or add an API key for Gemini, Groq, OpenWeather, GNews, ElevenLabs
      - Remove an API key
      - View or reorder AI provider failover priorities
    """
    q = query.strip()
    q_lower = q.lower()

    import config_storage
    config_storage.init_config_storage()
    from config import CONFIG

    # 1. Check for AI priorities update
    pri_update_match = re.search(r'\b(?:set|change|update)\s+ai\s+priorities\s+(?:to\s+)?([a-zA-Z0-9_,\s]+)\b', q_lower)
    if pri_update_match:
        raw_list = pri_update_match.group(1).replace(",", " ").split()
        cleaned_priorities = [p.strip().lower() for p in raw_list if p.strip().lower() in ("groq", "gemini")]
        if cleaned_priorities:
            config_storage.update_ai_priorities(cleaned_priorities)
            CONFIG.ai_priorities = cleaned_priorities
            CONFIG.active_provider = cleaned_priorities[0]
            return f"✅ **AI Priorities Updated**: `{' -> '.join(cleaned_priorities)}`. Primary active provider set to **{cleaned_priorities[0]}**."

    if any(w in q_lower for w in ("what are the ai priorities", "show ai priorities", "ai priority order")):
        pris = config_storage.get_ai_priorities()
        return f"⚡ **Current AI Failover Priority Order**: `{' -> '.join(pris)}` (Active Provider: **{CONFIG.get_active_provider()}**)."

    # 2. Check for update / set / add API key action
    update_patterns = [
        # e.g. "update my gemini api key to AIzaSy..."
        r'\b(?:update|set|add|change|store|save)\s+(?:my\s+)?([a-zA-Z0-9_\-]+)\s+(?:api\s+)?key\s*(?:to|=|:)?\s*([a-zA-Z0-9_\-\.\:\+]+)\b',
        # e.g. "update api key for groq to gsk_..."
        r'\b(?:update|set|add|change|store|save)\s+(?:my\s+)?(?:api\s+)?key\s+(?:for\s+)?([a-zA-Z0-9_\-]+)\s*(?:to|=|:)?\s*([a-zA-Z0-9_\-\.\:\+]+)\b',
        # e.g. "add key sk_... for elevenlabs"
        r'\b(?:update|set|add|change|store|save)\s+(?:my\s+)?(?:api\s+)?key\s+([a-zA-Z0-9_\-\.\:\+]{16,})\s+(?:for\s+)?([a-zA-Z0-9_\-]+)\b',
        # e.g. "elevenlabs key: sk_..."
        r'\b([a-zA-Z0-9_\-]+)\s+(?:api\s+)?key\s*(?:is|:|=)\s*([a-zA-Z0-9_\-\.\:\+]+)\b',
    ]

    prov_identified = None
    key_identified = None

    for pat in update_patterns:
        m = re.search(pat, q, re.IGNORECASE)
        if m:
            g1, g2 = m.group(1).strip(), m.group(2).strip()
            if len(g1) > 20 and len(g2) <= 15:
                key_identified = g1
                prov_identified = g2.lower()
            else:
                prov_identified = g1.lower()
                key_identified = g2
            break

    # If key wasn't found through normal patterns, check for auto-identifiable key formats
    if not key_identified:
        auto_key_match = re.search(r'\b(?:update|set|add|save|store)\s+(?:my\s+)?(?:api\s+)?key\s*(?:to|=|:)?\s*([a-zA-Z0-9_\-\.\:\+]{20,})\b', q, re.IGNORECASE)
        if auto_key_match:
            cand_key = auto_key_match.group(1).strip()
            if cand_key.startswith("AIzaSy"):
                prov_identified = "gemini"
                key_identified = cand_key
            elif cand_key.startswith("gsk_"):
                prov_identified = "groq"
                key_identified = cand_key
            elif cand_key.startswith("sk_"):
                prov_identified = "elevenlabs"
                key_identified = cand_key

    if prov_identified and key_identified:
        prov_raw = prov_identified
        new_key = key_identified

        # Normalize provider alias
        if prov_raw in ("google", "gemini", "gemini-api"):
            provider = "gemini"
        elif prov_raw in ("groq", "groq-api"):
            provider = "groq"
        elif prov_raw in ("elevenlabs", "eleven_labs", "voice"):
            provider = "elevenlabs"
        elif prov_raw in ("gnews", "news"):
            provider = "gnews"
        elif prov_raw in ("weather", "openweather", "open-meteo"):
            provider = "openweather"
        else:
            provider = prov_raw

        masked = _mask_key(new_key)

        if provider in ("gemini", "groq"):
            config_storage.update_ai_config(
                provider=provider,
                add_keys=[new_key],
                create_if_missing=True,
            )
            CONFIG.fetch_from_vault()
            total = len(CONFIG.get_provider_config(provider).get("keys", []))
            return f"✅ **API Key Successfully Added & Configured** for provider **{provider.title()}**!\n- Key: `{masked}`\n- Total Keys for {provider.title()}: **{total}**\n- State: Ready for inference."

        elif provider == "gnews":
            config_storage.update_gnews_config(keys=[new_key])
            return f"✅ **GNews API Key Successfully Updated**!\n- Key: `{masked}`"

        elif provider == "elevenlabs":
            config_storage.update_voice_model(provider="elevenlabs", add_keys=[new_key])
            return f"✅ **ElevenLabs Voice API Key Successfully Added**!\n- Key: `{masked}`"

        elif provider == "openweather":
            config_storage.update_configuration("weather_config", {"api_key": new_key})
            return f"✅ **Weather API Key Successfully Configured**!\n- Key: `{masked}`"

        else:
            config_storage.update_ai_config(provider=provider, add_keys=[new_key], create_if_missing=True)
            CONFIG.fetch_from_vault()
            return f"✅ **API Key Stored in Vault** for provider **{provider}** (Key: `{masked}`)."

    # If the user is requesting to add/update keys but has not yet supplied the key value
    is_add_request = (
        (tool_params and tool_params.get("op_action") == "update")
        or (bool(re.search(r'\b(add|set|update|insert|configure|put|save|store)\b', q_lower)) and bool(re.search(r'\bkeys?\b', q_lower)))
        or any(w in q_lower for w in ("how to add", "want to add", "new key", "new keys"))
    )
    if is_add_request:
        if any(w in q_lower for w in ("elevenlabs", "eleven labs", "voice")):
            return (
                "🔑 I can add and activate your **ElevenLabs** voice API key directly in Vault!\n\n"
                "Please provide your key using this format:\n"
                "`add elevenlabs key <YOUR_KEY>`\n\n"
                "*(e.g., `add elevenlabs key sk_...`)*"
            )
        elif "gemini" in q_lower:
            return (
                "🔑 I can add and activate your **Gemini** API key directly in Vault!\n\n"
                "Please provide your key using this format:\n"
                "`add gemini key <YOUR_KEY>`\n\n"
                "*(e.g., `add gemini key AIzaSy...`)*"
            )
        elif "groq" in q_lower:
            return (
                "🔑 I can add and activate your **Groq** API key directly in Vault!\n\n"
                "Please provide your key using this format:\n"
                "`add groq key <YOUR_KEY>`\n\n"
                "*(e.g., `add groq key gsk_...`)*"
            )
        else:
            return (
                "🔑 I can add and configure your API keys directly here in chat!\n\n"
                "Simply provide the key in one of the following formats:\n"
                "- **ElevenLabs**: `add elevenlabs key <YOUR_KEY>`\n"
                "- **Gemini**: `add gemini key <YOUR_KEY>`\n"
                "- **Groq**: `add groq key <YOUR_KEY>`\n"
                "- **GNews**: `add gnews key <YOUR_KEY>`\n"
                "- **OpenWeather**: `add weather key <YOUR_KEY>`\n\n"
                "Once provided, your key will be securely stored in Vault's encrypted database and activated immediately.\n\n"
                "You can also view your currently configured keys anytime with **\"What API keys do I have?\"**."
            )

    # 3. Check for remove / delete / clear API key action
    remove_match = re.search(r'\b(?:remove|delete|clear)\s+(?:my\s+)?([a-zA-Z0-9_\-]+)\s+(?:api\s+)?key\b', q_lower)
    if remove_match:
        prov = remove_match.group(1).lower().strip()
        if prov in ("gemini", "groq"):
            config_storage.delete_ai_config(prov)
            CONFIG.fetch_from_vault()
            return f"🗑️ **Cleared all configured API keys** for provider **{prov.title()}** from Vault."
        elif prov in ("gnews", "news"):
            config_storage.delete_gnews_config()
            return f"🗑️ **Cleared GNews API key** configuration."
        elif prov in ("elevenlabs", "voice"):
            config_storage.delete_voice_model("elevenlabs")
            return f"🗑️ **Cleared ElevenLabs API keys** from Vault."

    # 4. Default: List / View all configured API keys with secure masking
    ai_configs = config_storage.get_all_ai_configs()
    priorities = config_storage.get_ai_priorities()
    active_prov = CONFIG.get_active_provider() or (priorities[0] if priorities else "None")

    lines = [
        "### 🔐 Configured API Keys & Credentials",
        "",
        f"**Active AI Provider**: **{active_prov.title()}** | **Failover Order**: `{' -> '.join(priorities)}`",
        "",
        "| Provider | Total Keys | Active Index | Key Previews | Status |",
        "| :--- | :---: | :---: | :--- | :---: |",
    ]

    for item in ai_configs:
        prov = item.get("llm_provider", "Unknown").lower()
        keys = item.get("keys") or []
        curr = item.get("current_key", 0)
        status_badge = "🟢 Active" if prov == active_prov.lower() else "⚪ Standby"
        if keys:
            previews = ", ".join([f"`{_mask_key(k)}`" for k in keys[:3]])
            if len(keys) > 3:
                previews += f" *(+{len(keys) - 3} more)*"
        else:
            previews = "*No keys set*"
            status_badge = "🔴 Unconfigured"

        lines.append(f"| **{prov.title()}** | {len(keys)} | #{curr + 1 if keys else 0} | {previews} | {status_badge} |")

    # Add GNews and Voice Keys
    gnews = config_storage.get_gnews_config()
    gkeys = gnews.get("keys") or []
    gnews_prev = f"`{_mask_key(gkeys[0])}`" if gkeys else "*No key set*"
    lines.append(f"| **GNews** | {len(gkeys)} | #{gnews.get('current_key', 0) + 1 if gkeys else 0} | {gnews_prev} | {'🟢 Active' if gkeys else '⚪ Optional'} |")

    vkeys = config_storage.get_voice_keys("elevenlabs").get("keys") or []
    vprev = f"`{_mask_key(vkeys[0])}`" if vkeys else "*No key set*"
    lines.append(f"| **ElevenLabs** | {len(vkeys)} | - | {vprev} | {'🟢 Active' if vkeys else '⚪ Standby (Browser TTS)'} |")

    lines.append("")
    lines.append("> [!NOTE]")
    lines.append("> Keys are masked for your privacy. You can update any key directly in chat using: `update gemini api key to <YOUR_KEY>`.")

    return "\n".join(lines)


# =============================================================================
# 3. Configuration & User Profile Operations
# =============================================================================

def handle_config_op(query: str, user_profile: Optional[Dict[str, Any]] = None) -> str:
    """
    Reads and updates MIRA configurations:
      - User profile (Name, location, role, notes, timezone)
      - Engine workers (chat_workers, poll intervals)
      - App permissions (Operator screen capture allow / deny list)
    """
    q = query.strip()
    q_lower = q.lower()

    import config_storage
    config_storage.init_config_storage()
    from config import CONFIG

    # 1. User Profile Update: e.g. "update my city to London" or "set my name to Alice"
    user_field_patterns = [
        (r'\b(?:update|set|change)\s+my\s+name\s*(?:to|=)?\s*([a-zA-Z\s]+)\b', "user_name"),
        (r'\b(?:update|set|change)\s+my\s+city\s*(?:to|=)?\s*([a-zA-Z\s]+)\b', "city"),
        (r'\b(?:update|set|change)\s+my\s+state\s*(?:to|=)?\s*([a-zA-Z\s]+)\b', "state"),
        (r'\b(?:update|set|change)\s+my\s+country\s*(?:to|=)?\s*([a-zA-Z\s]+)\b', "country"),
        (r'\b(?:update|set|change)\s+my\s+role\s*(?:to|=)?\s*(.+)\b', "role"),
        (r'\b(?:update|set|change)\s+my\s+notes\s*(?:to|=)?\s*(.+)\b', "notes"),
    ]

    for pat, field in user_field_patterns:
        m = re.search(pat, q, re.IGNORECASE)
        if m:
            val = m.group(1).strip()
            config_storage.update_configuration("user_details", {field: val})
            CONFIG.get_user_profile(force_refresh=True)
            return f"✅ **User Profile Updated**: `{field}` set to **{val}**."

    # 2. Engine Worker Update: e.g. "update chat workers to 2" or "set chat poll time to 2.0"
    worker_patterns = [
        (r'\b(?:update|set)\s+chat\s*workers\s*(?:to|=)?\s*(\d+)\b', "chat_workers", int),
        (r'\b(?:update|set)\s+chat\s*(?:workers\s*)?poll\s*(?:time|interval)?\s*(?:to|=)?\s*(\d+(?:\.\d+)?)\b', "chat_workers_poll_time", float),
        (r'\b(?:update|set)\s+extraction\s*workers\s*(?:to|=)?\s*(\d+)\b', "screenshot_extraction_workers", int),
        (r'\b(?:update|set)\s+summarization\s*workers\s*(?:to|=)?\s*(\d+)\b', "screenshot_summarization_workers", int),
    ]

    for pat, key, type_fn in worker_patterns:
        m = re.search(pat, q_lower)
        if m:
            val = type_fn(m.group(1))
            config_storage.update_engine_workers({key: val})
            CONFIG.workers[key] = val
            return f"✅ **Engine Worker Configuration Updated**: `{key}` set to **{val}**."

    # 3. App Permissions: e.g. "allow app VS Code" or "blacklist Chrome"
    app_perm_match = re.search(r'\b(allow|permit|whitelist|block|blacklist|deny)\s+(?:app\s+)?([a-zA-Z0-9_\-\.\s]+)\b', q_lower)
    if app_perm_match:
        action_word = app_perm_match.group(1)
        app_name = app_perm_match.group(2).strip()
        is_allowed = action_word in ("allow", "permit", "whitelist")
        # Find matching app id in permissions
        apps = config_storage.get_all_app_permissions()
        matched_id = None
        for a in apps:
            if app_name in a.get("app_name", "").lower():
                matched_id = a.get("app_id")
                app_name = a.get("app_name")
                break
        if not matched_id:
            matched_id = app_name.lower().replace(" ", "_")

        config_storage.update_app_permission(matched_id, is_allowed)
        action_label = "Allowed (Capture Enabled)" if is_allowed else "Blacklisted (Capture Blocked)"
        return f"🛡️ **App Screen Capture Permission Updated**:\n- Application: **{app_name}**\n- Status: **{action_label}**"

    # 4. View Worker Config
    if any(w in q_lower for w in ("worker config", "show workers", "engine workers", "workers status")):
        workers = config_storage.get_engine_workers()
        lines = [
            "### ⚙️ Engine Worker Configuration",
            "",
            f"- **Chat Workers**: `{workers.get('chat_workers', 1)}` (Poll interval: `{workers.get('chat_workers_poll_time', 1.0)}s`)",
            f"- **OCR Extraction Workers**: `{workers.get('screenshot_extraction_workers', 1)}` (Poll: `{workers.get('screenshot_extraction_poll_time', 5.0)}s`)",
            f"- **Summarization Workers**: `{workers.get('screenshot_summarization_workers', 1)}` (Poll: `{workers.get('screenshot_summarization_poll_time', 5.0)}s`)",
            f"- **Embedding Store Workers**: `{workers.get('embedding_vector_store_workers', 1)}` (Poll: `{workers.get('embedding_vector_store_workers_poll_time', 1.0)}s`)",
        ]
        return "\n".join(lines)

    # 5. View App Permissions
    if any(w in q_lower for w in ("app permissions", "app capture permissions", "app blacklist", "capture permissions")):
        apps = config_storage.get_all_app_permissions()
        if not apps:
            return "No application permissions have been recorded yet."
        lines = [
            "### 🛡️ Operator Application Privacy & Capture Permissions",
            "",
            "| Application | Allowed to Capture | Last Discovered |",
            "| :--- | :---: | :--- |",
        ]
        for a in apps[:15]:
            allowed = "🟢 Yes" if a.get("allowed_to_capture") else "🔴 Blacklisted"
            lines.append(f"| **{a.get('app_name', 'Unknown')}** | {allowed} | {a.get('last_discovered', 'N/A')} |")
        return "\n".join(lines)

    # 6. Default: View User Profile
    prof = config_storage.get_configuration("user_details") or user_profile or {}
    lines = [
        "### 👤 MIRA User Profile & Identity",
        "",
        f"- **Name**: **{prof.get('user_name', 'User')}**",
        f"- **Location**: {prof.get('city', 'Not set')}, {prof.get('state', '')} {prof.get('country', '')}".strip(" ,"),
        f"- **Role**: {prof.get('role', 'Not set')}",
        f"- **Timezone**: {prof.get('timezone', 'Asia/Kolkata')}",
        f"- **Notes & Instructions**: {prof.get('notes', 'None')}",
    ]
    return "\n".join(lines)


# =============================================================================
# 4. Redis Streams & Message Broker Operations
# =============================================================================

def handle_streams_and_services_op(query: str) -> str:
    """
    Executes live inspections of Redis streams, consumer groups, pending entries (PEL),
    and validates service health across the MIRA ecosystem.
    """
    lines = ["### 📡 MIRA Live Telemetry & Redis Stream Status", ""]

    # 1. Connect to Redis with protocol=2 for full Windows compatibility
    try:
        import redis
        r = redis.Redis(host="127.0.0.1", port=6379, protocol=2, socket_timeout=1.5)
        r.ping()
        redis_online = True
    except Exception as e:
        redis_online = False
        lines.append(f"⚠️ **Redis Connection**: Offline or unreachable ({e}).")

    if redis_online:
        stream_keys = [
            ("mira:stream:operator_screen", "Raw Screen Frame Captures"),
            ("mira:stream:ocr_extraction", "OCR Text Extraction Pipeline"),
            ("mira:stream:ocr_summarization", "Activity Summarization Pipeline"),
            ("mira:stream:embedding_memory", "Dense Vector Ingestion Pipeline"),
            ("mira:stream:llm_chat", "Conversational Chat Workflows"),
            ("mira:stream:user_knowledge_base", "Knowledge Base Sync"),
        ]

        lines.append("| Redis Stream | Description | Length | Consumer Groups | Pending (PEL) |")
        lines.append("| :--- | :--- | :---: | :---: | :---: |")

        for key, desc in stream_keys:
            try:
                xlen = r.xlen(key) if r.exists(key) else 0
                groups = r.xinfo_groups(key) if r.exists(key) else []
                group_count = len(groups)
                total_pending = sum(g.get("pending", 0) for g in groups)
                lines.append(f"| `{key.split(':')[-1]}` | {desc} | **{xlen}** | {group_count} | {total_pending} |")
            except Exception:
                lines.append(f"| `{key.split(':')[-1]}` | {desc} | *idle* | 0 | 0 |")

    # 2. Check service health endpoints
    lines.append("")
    lines.append("### 🏥 Subsystem Microservice Health:")
    lines.append("| Microservice | Host / Port | Status | Protocol |")
    lines.append("| :--- | :---: | :---: | :---: |")

    import requests
    services_to_check = [
        ("Vault", "http://127.0.0.1:9001/health", "HTTP (PyNaCl/SQLite)"),
        ("Message Broker", "http://127.0.0.1:9002/health", "HTTP/REST (Redis)"),
        ("Operator", "http://127.0.0.1:9003/health", "HTTP (Rust Native)"),
        ("Engine", "http://127.0.0.1:9007/health", "HTTP / WebSocket (FastAPI)"),
    ]

    for name, url, proto in services_to_check:
        try:
            resp = requests.get(url, timeout=0.8)
            status_text = "🟢 Online (200 OK)" if resp.status_code == 200 else f"🟡 Status {resp.status_code}"
        except Exception:
            status_text = "🔴 Offline / Busy"

        port_str = url.split(":")[-1].split("/")[0]
        lines.append(f"| **{name}** | `127.0.0.1:{port_str}` | {status_text} | {proto} |")

    return "\n".join(lines)


# =============================================================================
# 5. Database & Storage Operations
# =============================================================================

def handle_database_op(query: str) -> str:
    """
    Queries Vault encrypted database tables, chat session statistics,
    and Memory Qdrant knowledge base storage metrics.
    """
    import config_storage
    config_storage.init_config_storage()

    lines = ["### 🗄️ MIRA Database & Vector Storage Status", ""]

    # 1. Vault SQLite Tables
    conn = config_storage._DB_CONN
    if conn:
        try:
            cur = conn.execute("SELECT count(*) FROM chat_sessions")
            sessions_count = cur.fetchone()[0]
        except Exception:
            sessions_count = 0

        try:
            cur = conn.execute("SELECT count(*) FROM chat_messages")
            messages_count = cur.fetchone()[0]
        except Exception:
            messages_count = 0

        try:
            cur = conn.execute("SELECT count(*) FROM daily_suggestions")
            suggestions_count = cur.fetchone()[0]
        except Exception:
            suggestions_count = 0

        try:
            cur = conn.execute("SELECT count(*) FROM app_permissions")
            apps_count = cur.fetchone()[0]
        except Exception:
            apps_count = 0

        enc_db_path = _REPO_ROOT / "Vault" / "system" / "config.db.enc"
        db_size_kb = round(enc_db_path.stat().st_size / 1024, 2) if enc_db_path.exists() else 0.0

        lines.append(f"- **Encrypted Vault Database**: `Vault/system/config.db.enc` ({db_size_kb} KB)")
        lines.append(f"- **Chat Sessions**: **{sessions_count}** sessions ({messages_count} total messages)")
        lines.append(f"- **Daily Suggestions Records**: **{suggestions_count}** entries")
        lines.append(f"- **Discovered Applications**: **{apps_count}** registered apps")

    # 2. Memory Qdrant Knowledge Bases
    kb_parent = _REPO_ROOT / "Vault" / "system" / "knowledge_base"
    lines.append("")
    lines.append("**Vector Knowledge Bases (Memory & System):**")

    if kb_parent.exists():
        sub_kbs = [p for p in kb_parent.iterdir() if p.is_dir() and (p / "collection" / "knowledge_base" / "storage.sqlite").exists()]
        if sub_kbs:
            for kb in sub_kbs:
                sqlite_f = kb / "collection" / "knowledge_base" / "storage.sqlite"
                size_mb = round(sqlite_f.stat().st_size / (1024 * 1024), 2)
                lines.append(f"- `knowledge_base/{kb.name}`: Qdrant on-disk collection ({size_mb} MB)")
        else:
            lines.append("- *No partitioned activity knowledge bases currently on disk.*")

    mira_kb_path = _REPO_ROOT / "Vault" / "system" / "knowledge_base_mira"
    if mira_kb_path.exists():
        sq = mira_kb_path / "collection" / "knowledge_base" / "storage.sqlite"
        if sq.exists():
            lines.append(f"- `knowledge_base_mira`: Master System Knowledge Base ({round(sq.stat().st_size / (1024 * 1024), 2)} MB)")

    return "\n".join(lines)


# =============================================================================
# Master Dispatcher
# =============================================================================

def is_mira_operational_query(query: str) -> Optional[Tuple[str, str]]:
    """
    Determines whether a query is an operational request to read or update MIRA data.
    Returns (category, action) or None.
    """
    q = query.strip().lower()

    # Exclusions: do not match general non-MIRA suggestions (e.g. food, dinner, movie)
    foreign_suggestion_topics = ("movie", "film", "book", "restaurant", "food", "dinner", "lunch", "breakfast", "gift", "song", "music", "hotel", "vacation", "trip", "travel", "game", "recipe")
    is_foreign_suggestion = any(w in q for w in foreign_suggestion_topics)

    # 1. Daily Suggestions Patterns
    if not is_foreign_suggestion:
        is_suggestion_query = (
            any(term in q for term in (
                "daily suggestion", "daily suggestions", "my suggestions", "today's suggestion",
                "morning briefing", "daily briefing", "daily agenda", "suggestions checklist", "suggestion checklist",
                "continuity item", "continuity items", "action item", "action items", "daily tasks",
                "list of suggestions", "list suggestions", "show suggestions", "give suggestions",
                "suggestions here", "suggestions list"
            ))
            or bool(re.search(r'\b(?:suggestion|suggestions)\b', q) and re.search(r'\b(mark|complete|unmark|check\s*off|finish|done|toggle|refresh|regenerate|generate|history|list|show|give|fetch|view)\b', q))
            or bool(re.search(r'\b(give|show|get|list|display|view|check|see|read|fetch|what\s+are)\s+(?:me\s+)?(?:the\s+|a\s+|my\s+)?(?:list\s+of\s+|of\s+)?suggestions?\b', q))
            or bool(re.search(r'\b(?:a\s+)?list\s+of\s+suggestions?\b', q))
            or bool(re.search(r'\bsuggestions?\s+(?:here|today|now|list|for\s+today)\b', q))
            or q in ("suggestions", "suggestions list", "my suggestions", "daily suggestions", "list suggestions", "show suggestions", "give suggestions", "list of suggestions")
            or q.strip(" ?.!").endswith("suggestions")
            or q.strip(" ?.!").endswith("suggestion")
        )

        if is_suggestion_query:
            if re.search(r'\b(mark|complete|unmark|check\s+off|finish|done)\b', q) and (re.search(r'\b\d+\b', q) or "suggestion" in q):
                return "DAILY_SUGGESTIONS", "complete"
            elif any(w in q for w in ("refresh", "regenerate", "re-generate", "generate today", "generate daily", "generate", "create new", "generate new", "new suggestions", "new suggestion")):
                return "DAILY_SUGGESTIONS", "refresh"
            elif any(w in q for w in ("previous", "yesterday", "past", "history", "earlier")):
                return "DAILY_SUGGESTIONS", "history"
            else:
                return "DAILY_SUGGESTIONS", "view"

    # 2. API Key & Credential Patterns
    key_terms = (
        "api key", "api keys", "llm key", "llm keys", "ai priorities", "ai priority",
        "failover priority", "failover order", "gemini key", "groq key", "elevenlabs key",
        "gnews key", "weather key", "openweather key", "voice key", "voice keys", "credentials"
    )
    is_key_query = (
        any(term in q for term in key_terms)
        or bool(re.search(r'\b(add|update|set|change|remove|delete|clear|show|list|view|check|my|get|configured)\s+.*keys?\b', q))
        or bool(re.search(r'\bkeys?\s+(?:configured|set|saved|in\s+vault|list)\b', q))
        or q in ("keys", "api keys", "show keys", "my keys", "list keys", "add keys", "update keys")
    )
    if is_key_query:
        if any(w in q for w in ("priority", "failover", "reorder", "order")):
            return "API_KEYS", "priority"
        elif any(w in q for w in ("update", "set", "add", "change", "store", "save", "configure", "insert", "put")):
            return "API_KEYS", "update"
        elif any(w in q for w in ("remove", "delete", "clear", "erase")):
            return "API_KEYS", "remove"
        else:
            return "API_KEYS", "list"

    # 3. Stream & Services Patterns
    if any(term in q for term in ("redis stream", "redis streams", "message broker stream", "stream status", "consumer group", "pending entries", "pel status", "mira health", "system status", "mira status", "services status", "services running", "microservices", "microservice", "stream:operator_screen", "stream:ocr")):
        return "STREAMS_AND_SERVICES", "view"

    # 4. Configuration & User Profile Patterns
    if any(term in q for term in ("user profile", "user details", "who am i in mira", "user role", "user name", "user city", "user location", "worker config", "engine workers", "engine worker", "app permissions", "app capture permissions", "app blacklist", "allowed apps", "screen capture permissions")):
        if any(w in q for w in ("update", "set", "change", "allow", "block", "blacklist", "add")):
            return "CONFIGURATIONS", "update"
        else:
            return "CONFIGURATIONS", "view"

    # 5. Database & Storage Patterns
    if any(term in q for term in ("vault storage", "vault database", "config.db", "config storage", "database status", "sqlite storage", "memory knowledge bases", "how many chat sessions", "database tables", "database counts", "inspect vault database", "chat messages", "sqlite")):
        return "DATABASES", "view"

    return None


def execute_mira_operation(
    category: str,
    action: str,
    query: str,
    tool_params: Optional[Dict[str, Any]] = None,
    user_profile: Optional[Dict[str, Any]] = None,
) -> str:
    """Dispatches operational requests to the respective live handler."""
    if category == "DAILY_SUGGESTIONS":
        return handle_daily_suggestions_op(query, tool_params)
    elif category == "API_KEYS":
        return handle_api_key_op(query, tool_params)
    elif category == "CONFIGURATIONS":
        return handle_config_op(query, user_profile)
    elif category == "STREAMS_AND_SERVICES":
        return handle_streams_and_services_op(query)
    elif category == "DATABASES":
        return handle_database_op(query)
    return "Operation completed."
