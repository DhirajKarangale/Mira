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
            top_records = (retrieved_ctx.get("records") or [])[:5]
            summary_lines = []
            for r in top_records:
                ts = r.get("timestamp_formatted", "")
                app = r.get("app_name", "")
                stext = str(r.get("summarized_text") or "")[:180].strip()
                summary_lines.append(f"- **{app}** ({ts}): {stext}")
            recs_text = "\n".join(summary_lines)
            final_answer = (
                f"Hey {user_name}! Here is what I found in your activity logs for {time_desc} ({count} total records):\n\n"
                f"{recs_text}"
            )
        else:
            final_answer = (
                f"Hey {user_name}! I checked your activity logs for {time_desc}, but didn't find any recorded screen events "
                "matching that specific time or application."
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
            "- You MUST explicitly and honestly inform the user that no activity records were found for this period/query.\n"
            "- Do NOT invent, assume, or hallucinate activities, applications, files, or tasks.\n"
            "- Be friendly, warm, and helpful with a polite touch of humor (e.g. suggesting they might have been taking a well-deserved break or working on something offline).\n"
        )
    else:
        sample_records = records[:20]
        lines: List[str] = [f"Found {len(records)} verified activity event(s) in Knowledge Base ({time_desc}) - showing top {len(sample_records)}:"]
        for idx, r in enumerate(sample_records, start=1):
            ts = r.get("timestamp_formatted", "Unknown Time")
            ts_end = r.get("timestamp_end_formatted")
            time_display = f"{ts} - {ts_end}" if ts_end and ts_end != ts else ts
            app = r.get("app_name", "Unknown App")
            summary = r.get("summarized_text", "").strip()[:600]
            lines.append(f"{idx}. [{time_display}] Application: {app}\n   Activity: {summary}")
        evidence_block = "\n".join(lines)

    prompt = f"""You are MIRA, the intelligent, perceptive, highly detailed and friendly desktop AI companion for {user_name}.
Current Date & Time: {current_time_str}

Conversation History:
{history_text}

User Query: "{user_query}"

Verified Ground-Truth Evidence from Screen Activity Database:
{evidence_block}

CRITICAL GUIDELINES FOR SYNTHESIS:
1. Deep Detail & Precision (TOP PRIORITY):
   - You MUST be specific, thorough, and precise about what {user_name} was doing inside each application based ONLY on the evidence.
   - For Web Browsers (e.g. Microsoft Edge, Chrome): Specify the EXACT websites visited, web apps open (e.g. WhatsApp Web, ChatGPT, Bolna.ai, YouTube, local MIRA dashboard at 127.0.0.1:9010), specific chats/conversations ('Message yourself'), shared links, background tabs open, documents viewed, or search queries. NEVER give vague answers like "you were using Edge" or "browsing the web" — explicitly explain WHAT was on the screen!
   - For Code Editors & IDEs (e.g. Antigravity IDE, VS Code): State the exact project name ('Mira'), the exact files viewed or edited ('config.json', 'worker.py', 'router.py'), code analysis tasks, terminal commands, or agent interactions.
   - For Text Editors (e.g. Notepad): State the exact file name (e.g. 'prompts.txt', '12543200 = 4y') and the specific architecture specifications, prompts, or math equations written.
2. NO HALLUCINATION & NO MERGING (STRICT MANDATE):
   - Every single website, URL, file name, app name, and action mentioned MUST come directly and literally from the Evidence above. Do not invent facts, numbers, or activities.
   - DO NOT MERGE separate applications or activities into an imagined narrative story. If {user_name} used Calculator and also had a Notion tab open in the background, report each factually and independently. DO NOT claim or assume that the calculation was for the Notion project!
   - DO NOT ADD speculative assumptions, deductions, or motivations (e.g. do NOT say "suggesting you were planning a 3D game" or "using ChatGPT to estimate storage for your 3D project").
   - If an open tab or workspace title (e.g. a Notion tab) was simply visible in a browser window or sidebar, report it strictly as an open page/tab title. Do NOT claim {user_name} actively worked on that project or made progress on it unless the log explicitly describes direct editing actions.
   - Do NOT perform unrequested extra math or invent interpretations of numbers.
   - Do NOT ask fabricated follow-up questions based on invented connections (e.g., do NOT ask "Did you finish the storage calculation for the 3D project?"). Keep any closing question strictly factual and grounded.
3. Privacy & Decryption Notice: The Evidence above is ALREADY fully decrypted, verified, and safe to share with {user_name}. NEVER state or imply that "details are encrypted in the logs" or that you "cannot see what websites or documents you had open". Share the exact details directly.
4. Tone & Engagement: Warm, conversational, objective, and grounded. Address {user_name} by name.
5. Clean Formatting: Present a clear chronological timeline using Markdown bullet points, bolding application names, websites, files, and key actions.

Write your response directly to {user_name}:
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
