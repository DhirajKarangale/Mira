from __future__ import annotations

import time
from typing import Any, Dict, List, Optional
import uuid

from vault_logger import log

class ActivitySession:

    def __init__(
        self,
        app_name: str,
        os_name: str,
        timestamp: Optional[str] = None,
        initial_summary: str = "",
    ) -> None:
        self.session_id: str = str(uuid.uuid4())
        self.app_name: str = app_name
        self.os_name: str = os_name
        self.start_timestamp: str = timestamp or time.strftime("%d/%m/%YT%H:%M:%S")
        self.start_epoch: float = time.time()
        self.last_epoch: float = self.start_epoch
        self.observation_count: int = 1
        self.meaningful_events: List[str] = []
        self.vlm_insights: List[str] = [initial_summary] if initial_summary else []
        self.is_active: bool = True

    def record_frame(
        self,
        timestamp: Optional[str],
        changes: Dict[str, Any],
        vlm_summary: str = "",
    ) -> None:
        self.last_epoch = time.time()
        self.observation_count += 1

        if vlm_summary and vlm_summary not in self.vlm_insights:
            self.vlm_insights.append(vlm_summary)

        change_summary = changes.get("change_summary", "")
        if changes.get("has_meaningful_changes") and change_summary:
            if change_summary not in self.meaningful_events:
                self.meaningful_events.append(change_summary)

    @property
    def duration_seconds(self) -> float:
        return round(max(0.0, self.last_epoch - self.start_epoch), 1)

    def get_summary(self) -> str:
        dur = self.duration_seconds
        cnt = self.observation_count
        obs_word = "observation" if cnt == 1 else "observations"
        base = f"Active in {self.app_name} for {dur}s ({cnt} {obs_word})."

        if self.vlm_insights:
            return f"{base} Context: {self.vlm_insights[-1]}"
        elif self.meaningful_events:
            return f"{base} Recent action: {self.meaningful_events[-1]}"
        return base

    def to_dict(self) -> Dict[str, Any]:
        return {
            "activity_id": self.session_id,
            "app_name": self.app_name,
            "os": self.os_name,
            "start_time": self.start_timestamp,
            "duration_seconds": self.duration_seconds,
            "observation_count": self.observation_count,
            "is_active": self.is_active,
            "meaningful_events_count": len(self.meaningful_events),
            "meaningful_events": self.meaningful_events[-5:],
            "activity_summary": self.get_summary(),
        }

class ActivityTracker:

    def __init__(self, idle_timeout_seconds: float = 90.0) -> None:
        self.idle_timeout: float = idle_timeout_seconds
        self.current_session: Optional[ActivitySession] = None

    def record_observation(
        self,
        app_name: str,
        os_name: str,
        timestamp: Optional[str],
        changes: Dict[str, Any],
        vlm_summary: str = "",
        major_context_switch: bool = False,
    ) -> Dict[str, Any]:
        now = time.time()
        start_new = False

        if not self.current_session:
            start_new = True
        elif self.current_session.app_name.lower() != app_name.lower():
            start_new = True
        elif (now - self.current_session.last_epoch) > self.idle_timeout:
            start_new = True
        elif major_context_switch:
            start_new = True

        if start_new:
            if self.current_session:
                self.current_session.is_active = False
                log(f"[ActivityTracker] Rollover activity session for '{self.current_session.app_name}' (duration: {self.current_session.duration_seconds}s)")

            self.current_session = ActivitySession(
                app_name=app_name,
                os_name=os_name,
                timestamp=timestamp,
                initial_summary=vlm_summary,
            )
            log(f"[ActivityTracker] Started new activity session {self.current_session.session_id[:8]} for '{app_name}'")
        else:
            self.current_session.record_frame(
                timestamp=timestamp,
                changes=changes,
                vlm_summary=vlm_summary,
            )

        return self.current_session.to_dict()

    def get_current_activity(self) -> Optional[Dict[str, Any]]:
        return self.current_session.to_dict() if self.current_session else None

activity_tracker = ActivityTracker()
