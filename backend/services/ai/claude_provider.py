import anthropic
from services.ai.base import AIProvider


class ClaudeProvider(AIProvider):
    """Server-side Claude API provider (BYO key or our managed key)."""

    def __init__(self, api_key: str, model: str = "claude-haiku-4-5"):
        if not api_key:
            raise ValueError("Claude API key is required — add it in Settings → AI.")
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def chat(self, prompt: str, as_json: bool = False) -> str:
        system = (
            "Output ONLY valid JSON — no prose, no markdown, no code fences."
            if as_json
            else "You are a helpful assistant."
        )
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(b.text for b in resp.content if b.type == "text")
