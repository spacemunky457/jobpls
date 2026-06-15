from abc import ABC, abstractmethod
from typing import Any, Optional

from services import prompts


class AIProvider(ABC):
    """Server-side AI provider. Browser-driven Ollama does NOT use this — it runs in the
    user's browser and posts raw replies back to the pipeline ingest endpoints."""

    @abstractmethod
    def chat(self, prompt: str, as_json: bool = False) -> str:
        """Send a prompt and return the response text."""

    def assess_match(
        self, profile: str, cv_text: str, preferences: str, eligible_types: str, job: dict,
        priorities: str = "",
    ) -> dict:
        prompt = prompts.build_match_prompt(profile, cv_text, preferences, eligible_types, job, priorities)
        try:
            return prompts.parse_match(self.chat(prompt, as_json=True))
        except Exception:
            return {}

    def tailor_cv(
        self,
        profile: str,
        cv_text: str,
        job: dict,
        options: Optional[dict[str, Any]] = None,
        extra_info: str = "",
    ) -> dict:
        prompt = prompts.build_tailor_prompt(profile, cv_text, job, options, extra_info)
        try:
            return prompts.parse_tailor(self.chat(prompt, as_json=True))
        except Exception:
            return {}
