from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List
from .state import AgentState
from .timezone_helper import resolve_user_timezone
from llm import call_llm
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.workflow.synthesis")


def synthesis_node(state: AgentState) -> Dict[str, Any]:
    """
    Step 5: Response Synthesis Node.
    Receives the original query, chat history, user profile, and outputs from the executed nodes.
    Synthesizes a clear, accurate, friendly answer with light humor where appropriate.
    Personalizes responses with the user's name.
    Strictly grounds activity responses on verified Qdrant data without inventing facts.
    Uses LLM work category 'synthesis' (temp 0.2 from config.json).
    """
    user_query = state.get("user_query", "").strip()
    chat_history = state.get("chat_history", [])
    user_profile = state.get("user_profile", {})
    user_name = user_profile.get("user_name", "User")
    user_tz = resolve_user_timezone(user_profile)
    current_time_str = datetime.now(user_tz).strftime("%A, %B %d, %Y at %I:%M %p")

    retrieved_ctx = state.get("retrieved_context") or {}
    node_outputs = state.get("node_outputs") or {}
    executed_node = node_outputs.get("executed_node") or state.get("next_node")

    log(f"[SynthesisNode] Synthesizing final answer for user '{user_name}' (node='{executed_node}')")

    # Format conversation history
    recent_turns: List[str] = []
    for item in chat_history[-6:]:
        role = item.get("role") or ("user" if "user" in item else "ai")
        content = item.get("content") or item.get("user") or item.get("ai") or ""
        clean_c = str(content).strip()
        if clean_c and clean_c != user_query:
            # Strip previous assistant hallucinations about encrypted logs so model does not parrot them
            if "encrypted in the logs" in clean_c.lower() or "encrypted in the activity logs" in clean_c.lower():
                continue
            speaker = user_name if role == "user" else "MIRA"
            recent_turns.append(f"{speaker}: {clean_c}")
    history_text = "\n".join(recent_turns) if recent_turns else "None"

    # Build prompt depending on whether user activity or general query was executed
    if executed_node == "user_activity" or "user_activity" in node_outputs:
        prompt = _build_activity_synthesis_prompt(
            user_name=user_name,
            current_time_str=current_time_str,
            user_query=user_query,
            history_text=history_text,
            activity_ctx=retrieved_ctx,
        )
    else:
        general_draft = node_outputs.get("general_llm_response") or state.get("final_response") or ""
        prompt = _build_general_synthesis_prompt(
            user_name=user_name,
            current_time_str=current_time_str,
            user_query=user_query,
            history_text=history_text,
            general_draft=general_draft,
        )

    try:
        final_answer = call_llm(prompt, work="synthesis").strip()
        if not final_answer or "The AI request could not be completed" in final_answer:
            raise RuntimeError("LLM provider unavailable for synthesis")
    except Exception as e:
        log_error(f"[SynthesisNode] LLM call failed in synthesis node: {e}")
        time_desc = retrieved_ctx.get("time_description", "the requested time")
        if retrieved_ctx.get("found"):
            count = retrieved_ctx.get("count", 0)
            top_records = (retrieved_ctx.get("records") or [])[:50]
            summary_lines = []
            for r in top_records:
                ts = r.get("timestamp_formatted", "")
                ts_end = r.get("timestamp_end_formatted")
                time_display = f"{ts} - {ts_end}" if ts_end and ts_end != ts else ts
                app = r.get("app_name", "")
                stext = str(r.get("summarized_text") or "").strip()
                summary_lines.append(f"- **{time_display}** — **{app}**: {stext}")
            recs_text = "\n".join(summary_lines)
            final_answer = (
                f"**Activity Timeline ({time_desc}):**\n\n"
                f"{recs_text}"
            )
        else:
            final_answer = (
                f"No activity records were found for {time_desc}."
            )

    return {
        "final_response": final_answer,
    }


def _build_activity_synthesis_prompt(
    user_name: str,
    current_time_str: str,
    user_query: str,
    history_text: str,
    activity_ctx: Dict[str, Any]
) -> str:
    found = activity_ctx.get("found", False)
    records = activity_ctx.get("records", [])
    time_desc = activity_ctx.get("time_description", "specified time")
    app_filter = activity_ctx.get("app_filter")

    if not found or not records:
        evidence_block = (
            f"STATUS: ZERO (0) matching activity logs were found in the Knowledge Base.\n"
            f"Searched time range: {time_desc}\n"
            f"App filter: {app_filter or 'Any application'}\n\n"
            "CRITICAL INSTRUCTION FOR MISSING DATA:\n"
            "- State directly that no activity records were found for this period.\n"
            "- Do NOT invent, assume, or hallucinate activities, applications, files, or tasks.\n"
            "- Avoid conversational filler, greetings, or suggestions.\n"
        )
    else:
        sample_records = records[:50]
        lines: List[str] = [f"Verified activity events in Knowledge Base for {time_desc} ({len(sample_records)} event(s)):"]
        for idx, r in enumerate(sample_records, start=1):
            ts = r.get("timestamp_formatted", "Unknown Time")
            ts_end = r.get("timestamp_end_formatted")
            time_display = f"{ts} - {ts_end}" if ts_end and ts_end != ts else ts
            app = r.get("app_name", "Unknown App")
            summary = r.get("summarized_text", "").strip()
            lines.append(f"{idx}. [{time_display}] Application: {app}\n   Activity: {summary}")
        evidence_block = "\n".join(lines)

    prompt = f"""You are MIRA, the desktop AI assistant.
Current Date & Time: {current_time_str}

User Query: "{user_query}"

Verified Ground-Truth Evidence from Screen Activity Database:
{evidence_block}

STRICT REQUIREMENTS FOR THE ACTIVITY RESPONSE:
1. Explain Each Activity in Simple, Clear Language:
   - Describe exactly what {user_name} was doing at that time based ONLY on the available captured data.
   - For applications and browsers: state the specific document, file, website, tool, or query being used whenever confirmed by the data.

2. Do NOT Confuse Project Names with Git Branch Names:
   - If Antigravity, an IDE, or an editor displays 'main', 'master', or a similar label, do NOT assume or state that it is the project name or Git branch.
   - Explain ONLY what the captured data confirms. Never guess or label an element as a project name or Git branch unless explicitly verified by repository or directory path labels in the text.

3. No Assumptions, Inventions, or Autocompletion:
   - Do NOT autocomplete missing context, make assumptions, invent actions, or hallucinate details.
   - Do NOT guess user motivations, intentions, or deductions.
   - If the activity is unclear, state only what is known (e.g. "You had <Application> open, but the specific activity is unclear from the captured data.").
   - Never merge unrelated tasks into an imagined narrative.

4. Factual, Chronological, and Focused on Actual Activity:
   - Present a clean chronological timeline covering the activities in the requested time window.
   - AVOID unnecessary greetings (do NOT include "Hello!", "Hey there!", or conversational pleasantries).
   - AVOID suggestions, recommendations, or trailing questions (do NOT offer follow-ups, advice, or trailing questions like "Let me know if you would like me to unpack...").
   - AVOID repetition of calculations, numbers, or identical descriptions.
   - Format structure:
     * **[Timestamp or Range]** — **[Application]**: [Clear, simple, factual description of what the user was doing at that time].

5. Privacy & Decryption:
   - The evidence above is ALREADY fully decrypted and verified. Never state or imply that details are encrypted in the logs.

Output the response directly:
"""
    return prompt


def _build_general_synthesis_prompt(
    user_name: str,
    current_time_str: str,
    user_query: str,
    history_text: str,
    general_draft: str
) -> str:
    prompt = f"""You are MIRA, the intelligent, perceptive, and friendly desktop AI companion for {user_name}.
Current Date & Time: {current_time_str}

Conversation History:
{history_text}

User Query: "{user_query}"

Initial Assistant Output:
{general_draft}

Guidelines:
1. Present a clear, thorough, and highly accurate answer to {user_name}'s request.
2. Tone: Warm, engaging, conversational, with a dash of friendly wit where appropriate.
3. Personalization: Address {user_name} naturally by name.
4. Formatting: Use clean GitHub-flavored Markdown for readability (headings, code blocks, bullet points).

Write your response directly to {user_name}:
"""
    return prompt
