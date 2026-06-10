import json
import ollama
from services.ai.base import AIProvider


class OllamaProvider(AIProvider):
    def __init__(self, model: str = "llama3.2", base_url: str = "http://localhost:11434"):
        self.model = model
        self.client = ollama.Client(host=base_url)

    def chat(self, prompt: str, as_json: bool = False) -> str:
        options = {"temperature": 0.1 if as_json else 0.4}
        format_arg = "json" if as_json else ""
        kwargs = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "options": options,
        }
        if as_json:
            kwargs["format"] = format_arg
        response = self.client.chat(**kwargs)
        return response["message"]["content"]
