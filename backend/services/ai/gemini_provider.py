"""Google Gemini (AI Studio) provider — the free-tier-friendly server-side engine.
Calls the REST API directly (no SDK needed) and rate-limits itself to stay inside
the free tier, backing off on 429s instead of failing the whole batch."""

import logging
import threading
import time

import requests

from services.ai.base import AIProvider

log = logging.getLogger(__name__)

API_BASE = "https://generativelanguage.googleapis.com/v1beta"

# Free-tier flash models are roughly 10-15 requests/minute; default conservatively.
DEFAULT_RPM = 10


class GeminiProvider(AIProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.5-flash", rpm: int = DEFAULT_RPM):
        # Strip whitespace/newlines that ride along with copy-paste — a key with a
        # trailing newline is silently ignored by Google and yields a confusing
        # "Expected OAuth 2 access token" 401 instead of "invalid key".
        self.api_key = (api_key or "").strip()
        if not self.api_key:
            raise ValueError("Gemini API key is required — add it in Setup → Matching engine.")
        self.model = (model or "gemini-2.5-flash").strip()
        self.min_interval = 60.0 / max(1, rpm)
        self._lock = threading.Lock()
        self._last_call = 0.0

    def _throttle(self) -> None:
        with self._lock:
            wait = self._last_call + self.min_interval - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self._last_call = time.monotonic()

    def chat(self, prompt: str, as_json: bool = False) -> str:
        gen_config: dict = {
            "temperature": 0.1 if as_json else 0.4,
            "maxOutputTokens": 4096,
        }
        if as_json:
            # Native JSON mode: the model is constrained to emit valid JSON,
            # which makes parse_json_loose's job trivial.
            gen_config["responseMimeType"] = "application/json"
        body = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": gen_config,
        }
        url = f"{API_BASE}/models/{self.model}:generateContent"

        last_err = "unknown error"
        for attempt in range(4):
            self._throttle()
            # The key goes in the x-goog-api-key header (Google's documented method);
            # the ?key= query param is legacy and rejects some newer AI Studio keys.
            resp = requests.post(
                url,
                headers={"x-goog-api-key": self.api_key, "Content-Type": "application/json"},
                json=body,
                timeout=120,
            )
            if resp.status_code == 429:
                delay = min(60.0, 5.0 * (2 ** attempt))
                log.warning("Gemini rate-limited (429); retrying in %.0fs", delay)
                last_err = "rate limited — free-tier requests/minute exceeded"
                time.sleep(delay)
                continue
            if resp.status_code >= 400:
                try:
                    detail = resp.json().get("error", {}).get("message", resp.text[:200])
                except Exception:
                    detail = resp.text[:200]
                if resp.status_code in (401, 403):
                    detail += (
                        " — make sure you pasted an API key from aistudio.google.com/apikey"
                        " (it starts with 'AIza'), not an OAuth client ID or service-account file."
                    )
                raise RuntimeError(f"Gemini API error {resp.status_code}: {detail}")
            data = resp.json()
            candidates = data.get("candidates") or []
            if not candidates:
                # Safety block or empty response — surface the reason if present.
                reason = (data.get("promptFeedback") or {}).get("blockReason", "no candidates returned")
                raise RuntimeError(f"Gemini returned no content: {reason}")
            parts = candidates[0].get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts)
            if text.strip():
                return text
            # A candidate with no text: 2.5 models can burn the whole token
            # budget on internal "thinking" (common under load) — retry.
            reason = candidates[0].get("finishReason", "?")
            last_err = f"empty response (finishReason={reason})"
            log.warning("Gemini returned empty text (finishReason=%s); retrying", reason)
        raise RuntimeError(f"Gemini API kept failing: {last_err}")
