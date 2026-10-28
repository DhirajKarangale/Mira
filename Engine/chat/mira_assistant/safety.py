from __future__ import annotations

import logging
import os
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger("mira.engine.chat.mira_assistant.safety")

_CURRENT_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _CURRENT_DIR.parents[2]

# Explicit deletion intent patterns against project resources
DELETION_KEYWORDS = {
    "delete", "remove", "unlink", "rmdir", "erase", "purge", "destroy",
    "drop table", "drop database", "truncate table", "wipe", "clean all"
}

# Protected system paths that should never be written or altered directly
PROTECTED_RELATIVE_PREFIXES = [
    ".git",
    ".github/workflows/secret",
    "Vault/system/config.db.enc",
]


class SafetyPolicyViolation(Exception):
    """Raised when an operation violates MIRA Assistant safety guardrails."""
    pass


def is_deletion_command(query: str, action: str = "") -> Tuple[bool, str]:
    """
    Enforces the strict deletion restriction:
    The addon must NEVER execute deletion operations against project files,
    directories, databases, knowledge bases, stored user data, or other resources.
    
    Returns (is_prohibited, explanation_message).
    """
    clean_q = query.strip().lower()
    clean_action = (action or "").strip().lower()

    # If action is explicitly deletion
    if clean_action in ("delete", "remove", "unlink", "drop", "truncate", "purge"):
        return True, (
            "Safety Restriction: MIRA Assistant is strictly prohibited from executing deletion "
            "operations against project files, directories, databases, knowledge bases, stored user data, "
            "or system resources. You may request non-destructive modifications (additions, updates, edits), "
            "but deletions must be performed manually by the authorized developer or administrator."
        )

    # Patterns indicating imperative command to delete resources
    deletion_patterns = [
        r"\b(delete|remove|unlink|drop|purge|erase|destroy|wipe)\s+(the\s+)?(file|folder|dir|directory|database|db|table|record|records|log|logs|knowledge\s*base|kb|user\s*data|data)\b",
        r"\b(delete|remove|rm|del|unlink)\s+([a-zA-Z0-9_\-\./\\]+\.[a-zA-Z0-9]+)\b",
        r"\b(delete|remove|rmdir)\s+([a-zA-Z0-9_\-\./\\]+[\/\\]?)\b",
        r"\b(drop|truncate)\s+table\b",
        r"\b(drop|delete)\s+database\b",
        r"\b(delete|clear|purge|wipe)\s+(all\s+)?(chats|sessions|memories|user\s*data|history)\b",
    ]

    # Whitelist pure informational queries like "how do I delete...", "where is delete implemented", "explain how deletion works"
    info_preambles = (
        "how do i delete", "how to delete", "where is delete", "why can't i delete",
        "explain delete", "explain how delete", "what deletes", "how does delete work",
        "is there a delete", "can you explain how to delete", "show me how delete"
    )
    if any(clean_q.startswith(p) for p in info_preambles):
        return False, ""

    for pat in deletion_patterns:
        if re.search(pat, clean_q):
            return True, (
                "Safety Restriction: MIRA Assistant is strictly prohibited from executing deletion "
                "operations against project files, directories, databases, knowledge bases, stored user data, "
                "or system resources. Non-destructive operations (additions, updates, edits) are supported, "
                "but deletion operations must be performed manually by the authorized developer or administrator."
            )

    return False, ""


def validate_target_path(target_path: Union[str, Path], repo_root: Optional[Path] = None) -> Tuple[bool, Optional[Path], str]:
    """
    Validates that the target path is safe and strictly contained within the project repository root.
    Prevents path traversal attacks and writes to protected system structures.
    """
    root = (repo_root or _REPO_ROOT).resolve()
    
    try:
        raw_p = Path(target_path)
        if raw_p.is_absolute():
            resolved = raw_p.resolve()
        else:
            resolved = (root / raw_p).resolve()
            
        # Check if resolved path is within repo root
        try:
            resolved.relative_to(root)
        except ValueError:
            return False, None, f"Security error: Path '{target_path}' is outside the authorized project root '{root}'."

        rel_str = str(resolved.relative_to(root)).replace("\\", "/")
        
        # Check against protected system paths
        for protected in PROTECTED_RELATIVE_PREFIXES:
            if rel_str == protected or rel_str.startswith(f"{protected}/"):
                return False, None, f"Security error: Modifications to protected path '{rel_str}' are restricted."

        return True, resolved, ""
    except Exception as e:
        return False, None, f"Invalid path syntax: {e}"

