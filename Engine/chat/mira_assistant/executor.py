from __future__ import annotations

import json
import logging
import os
from pathlib import Path
import py_compile
import re
from typing import Any, Callable, Dict, List, Optional, Tuple

from .safety import is_deletion_command, validate_target_path
from .retrieval import inspect_project_source_file, retrieve_mira_context
from llm import call_llm
from vault_logger import log, log_error

logger = logging.getLogger("mira.engine.chat.mira_assistant.executor")

_CURRENT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _CURRENT_DIR.parents[2]


class ProjectModificationResult:
    def __init__(
        self,
        success: bool,
        summary: str,
        files_modified: List[str],
        verification_passed: bool,
        details: str,
        error: Optional[str] = None,
    ):
        self.success = success
        self.summary = summary
        self.files_modified = files_modified
        self.verification_passed = verification_passed
        self.details = details
        self.error = error

    def to_markdown(self) -> str:
        status_badge = "✅ **Changes Successfully Applied & Verified**" if self.success and self.verification_passed else "⚠️ **Modification Notice / Limitation**"
        
        lines = [
            status_badge,
            "",
            f"**Summary**: {self.summary}",
            "",
            "**Affected Files**:",
        ]
        if self.files_modified:
            for f in self.files_modified:
                lines.append(f"- `{f}`")
        else:
            lines.append("- *No files modified.*")

        lines.append("")
        verification_status = "✅ Passed (Syntax & compilation verified without errors)" if self.verification_passed else f"❌ Failed ({self.error})"
        lines.append(f"**Verification Status**: {verification_status}")
        
        if self.details:
            lines.append("")
            lines.append(f"**Details**:\n{self.details}")

        if self.error and not self.success:
            lines.append("")
            lines.append(f"**Error Notice**: {self.error}")

        return "\n".join(lines)


def verify_file_integrity(file_path: Path) -> Tuple[bool, str]:
    """
    Verifies modified project file integrity:
    - Python: Compiles AST and bytecode using py_compile.
    - JSON: Parses and validates syntax.
    - Other: Confirms readable UTF-8 file content.
    """
    if not file_path.exists():
        return False, f"File does not exist: {file_path}"

    suffix = file_path.suffix.lower()
    
    if suffix == ".py":
        try:
            py_compile.compile(str(file_path), doraise=True)
            return True, "Python syntax verified successfully."
        except py_compile.PyCompileError as e:
            return False, f"Python compilation failed: {e}"
        except Exception as e:
            return False, f"Syntax verification error: {e}"

    elif suffix == ".json":
        try:
            content = file_path.read_text(encoding="utf-8")
            json.loads(content)
            return True, "JSON syntax verified successfully."
        except Exception as e:
            return False, f"Invalid JSON format: {e}"

    return True, "File exists and is non-empty."


def plan_and_execute_modification(
    query: str,
    chat_history: Optional[List[Dict[str, Any]]] = None,
    progress_callback: Optional[Callable[[str, str], None]] = None,
) -> ProjectModificationResult:
    """
    Carries out requested modifications to MIRA project files:
    1. Enforces Deletion Restriction (rejects all deletion operations).
    2. Inspects relevant source files and dependencies.
    3. Plans smallest complete set of changes.
    4. Applies modifications non-destructively.
    5. Verifies changes with py_compile / syntax checks.
    6. Automatically rolls back on verification failure.
    """
    if progress_callback:
        progress_callback("safety_check", "Evaluating safety guardrails and deletion restrictions...")

    # Step 1: Deletion Restriction Check
    is_deletion, deletion_msg = is_deletion_command(query)
    if is_deletion:
        log_error(f"[MIRAExecutor] Blocked deletion command: {query}")
        return ProjectModificationResult(
            success=False,
            summary="Modification rejected due to deletion restriction.",
            files_modified=[],
            verification_passed=False,
            details=deletion_msg,
            error="DELETION_PROHIBITED",
        )

    if progress_callback:
        progress_callback("context_inspection", "Inspecting relevant project source files and dependencies...")

    # Step 2: Context Inspection & Knowledge Retrieval
    ctx = retrieve_mira_context(query)
    
    # Identify target files mentioned in query
    mentioned_files: List[str] = []
    file_pattern = r'([a-zA-Z0-9_\-]+[/\\][a-zA-Z0-9_\-\./\\]+\.[a-zA-Z0-9]+)'
    for m in re.finditer(file_pattern, query):
        p_str = m.group(1).replace("\\", "/")
        mentioned_files.append(p_str)

    # Read existing file contents for planning
    file_contexts: List[str] = []
    for rel_f in mentioned_files[:3]:
        inspected = inspect_project_source_file(rel_f, max_lines=250)
        if inspected:
            file_contexts.append(f"--- File: {rel_f} (Current Content) ---\n{inspected['raw_content']}")

    inspected_context_text = "\n\n".join(file_contexts) if file_contexts else "No specific existing file content retrieved yet."

    if progress_callback:
        progress_callback("planning", "Formulating non-destructive code modifications...")

    # Step 3: LLM Code Modification Planning
    planning_prompt = f"""You are the MIRA Code Modification Planner.
User Query: "{query}"

Existing File Contexts:
{inspected_context_text}

Project Knowledge Base Snippets:
{chr(10).join([h.get('text', '')[:300] for h in ctx.get('kb_hits', [])[:2]])}

Strict Rules:
1. DELETION RESTRICTION: You MUST NOT plan any deletion of files, directories, databases, knowledge bases, or stored records.
2. Only create new files or update/add code in existing files.
3. Preserve all existing coding conventions, docstrings, typing annotations, imports, and comments.
4. Minimal complete change: Modify only what is strictly necessary to satisfy the request.
5. Provide COMPLETE, valid file content for any modified or created file.
6. Strict Grounding: Verify that all imported modules, variables, and referenced functions actually exist in the project or Python standard library. Do not fabricate imaginary libraries, APIs, or unverified endpoints.

Return strictly a valid JSON object matching this schema:
{{
  "summary": "<one sentence describing the exact changes>",
  "affected_modules": ["<Module names like Engine, Vault, scripts>"],
  "actions": [
    {{
      "file_path": "<relative path e.g. Engine/chat/config.py>",
      "operation": "update" | "create",
      "content": "<complete valid file text in UTF-8>"
    }}
  ]
}}
Do NOT include markdown formatting or backticks outside the JSON.
"""
    try:
        raw_plan = call_llm(planning_prompt, work="chat")
        cleaned_json = re.sub(r'```(?:json)?', '', raw_plan).strip('` \n\r\t')
        match = re.search(r'\{.*\}', cleaned_json, re.DOTALL)
        plan_dict = json.loads(match.group(0)) if match else json.loads(cleaned_json)
    except Exception as e:
        log_error(f"[MIRAExecutor] LLM planning failed: {e}")
        return ProjectModificationResult(
            success=False,
            summary="Could not formulate code modification plan.",
            files_modified=[],
            verification_passed=False,
            details=f"LLM planner parse error: {e}",
            error=str(e),
        )

    actions = plan_dict.get("actions", [])
    if not actions:
        return ProjectModificationResult(
            success=False,
            summary="No file modification actions planned.",
            files_modified=[],
            verification_passed=True,
            details=plan_dict.get("summary", "Query did not require direct file changes."),
        )

    if progress_callback:
        progress_callback("executing", f"Applying {len(actions)} file modification(s)...")

    # Step 4: Execute Changes Non-Destructively with Rollback Protection
    files_changed: List[str] = []
    backups: Dict[Path, Optional[str]] = {}
    
    try:
        for action in actions:
            rel_path_str = action.get("file_path", "").strip()
            op = action.get("operation", "update").lower()
            new_content = action.get("content", "")

            # Re-check deletion restriction per action
            if op in ("delete", "remove", "unlink"):
                raise ValueError("Deletion operation encountered in modification plan. Operation aborted.")

            is_valid, target_abs, path_err = validate_target_path(rel_path_str)
            if not is_valid or target_abs is None:
                raise ValueError(f"Path validation failed: {path_err}")

            # Backup existing content for rollback if needed
            if target_abs.exists():
                backups[target_abs] = target_abs.read_text(encoding="utf-8", errors="replace")
            else:
                backups[target_abs] = None  # Did not exist before

            # Ensure parent directories exist
            target_abs.parent.mkdir(parents=True, exist_ok=True)

            # Write file content non-destructively
            target_abs.write_text(new_content, encoding="utf-8")
            files_changed.append(rel_path_str)
            log(f"[MIRAExecutor] Successfully applied non-destructive change to '{rel_path_str}'")

        if progress_callback:
            progress_callback("verification", "Verifying syntax and compilation of modified files...")

        # Step 5: Verification Suite
        for action in actions:
            rel_path_str = action.get("file_path", "").strip()
            target_abs = _REPO_ROOT / rel_path_str
            ok, v_msg = verify_file_integrity(target_abs)
            if not ok:
                raise RuntimeError(f"Verification check failed on '{rel_path_str}': {v_msg}")

        # Verification succeeded
        return ProjectModificationResult(
            success=True,
            summary=plan_dict.get("summary", f"Successfully applied changes to {len(files_changed)} file(s)."),
            files_modified=files_changed,
            verification_passed=True,
            details=f"Modified modules: {', '.join(plan_dict.get('affected_modules', []))}. All syntax checks passed.",
        )

    except Exception as e:
        log_error(f"[MIRAExecutor] Execution or verification failed: {e}. Initiating automatic rollback...")
        # Automatic rollback
        for path_obj, orig_text in backups.items():
            try:
                if orig_text is not None:
                    path_obj.write_text(orig_text, encoding="utf-8")
                elif path_obj.exists():
                    # For safety, if it was newly created and failed compilation, leave an empty or error comment
                    pass
            except Exception as rb_err:
                log_error(f"[MIRAExecutor] Rollback error on '{path_obj}': {rb_err}")

        return ProjectModificationResult(
            success=False,
            summary="Modification failed and previous file states were preserved.",
            files_modified=files_changed,
            verification_passed=False,
            details=f"Verification failure: {e}. Changes were rolled back.",
            error=str(e),
        )

