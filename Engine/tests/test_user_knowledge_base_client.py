from __future__ import annotations

import sys
import unittest
from pathlib import Path

_engine_dir = Path(__file__).resolve().parent.parent
_root_dir = _engine_dir.parent
for p in (_root_dir / "Vault", _root_dir / "Message_Broker", _root_dir, _engine_dir):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from user_knowledge_base.client import (
    get_user_profile,
    get_user_preferences,
    get_user_likings,
    get_user_dislikes,
    get_music_preferences,
    get_viewing_interests,
    get_sports_interests,
    get_life_activities,
    search_user_knowledge,
    get_complete_knowledge_base,
    get_user_summary_for_llm,
)


class TestUserKnowledgeBaseClient(unittest.TestCase):

    def test_client_get_user_profile(self):
        profile = get_user_profile()
        self.assertIsInstance(profile, dict)

    def test_client_get_user_preferences(self):
        prefs = get_user_preferences()
        self.assertIsInstance(prefs, list)

    def test_client_get_user_likings(self):
        likes = get_user_likings()
        self.assertIsInstance(likes, list)

    def test_client_get_user_dislikes(self):
        dislikes = get_user_dislikes()
        self.assertIsInstance(dislikes, list)

    def test_client_get_music_preferences(self):
        music = get_music_preferences()
        self.assertIsInstance(music, list)

    def test_client_get_viewing_interests(self):
        viewing = get_viewing_interests()
        self.assertIsInstance(viewing, list)

    def test_client_get_sports_interests(self):
        sports = get_sports_interests()
        self.assertIsInstance(sports, list)

    def test_client_get_life_activities(self):
        acts = get_life_activities()
        self.assertIsInstance(acts, list)

    def test_client_search_user_knowledge(self):
        res = search_user_knowledge("python", limit=5)
        self.assertIsInstance(res, list)

    def test_client_get_user_summary_for_llm(self):
        summary = get_user_summary_for_llm()
        self.assertIsInstance(summary, str)


if __name__ == "__main__":
    unittest.main()
