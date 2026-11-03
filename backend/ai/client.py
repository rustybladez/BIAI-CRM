"""
The single LLM call function: DeepSeek first, Gemini fallback.

Both providers are called through the OpenAI-compatible client. Keys, base URLs and model
names come from env vars (see .env.example). Fallback to the next provider happens on:
API error, rate limit (429), timeout, or JSON that still fails Pydantic validation after one retry.
"""

import json
import os
import re
import time
from dataclasses import dataclass, field

from openai import OpenAI, OpenAIError
from pydantic import BaseModel, ValidationError

from backend import config  # noqa: F401  (loads .env)


@dataclass(frozen=True)
class Provider:
    name: str  # "deepseek" | "gemini"
    model: str
    base_url: str
    api_key: str


def _provider(name: str, default_base: str, default_model: str) -> Provider | None:
    prefix = name.upper()
    key = os.getenv(f"{prefix}_API_KEY")
    if not key:
        return None
    return Provider(
        name=name,
        model=os.getenv(f"{prefix}_MODEL") or default_model,
        base_url=os.getenv(f"{prefix}_BASE_URL") or default_base,
        api_key=key,
    )


def configured_providers() -> list[Provider]:
    """Providers with an API key, in routing order (DeepSeek first)."""
    found = [
        _provider("deepseek", "https://api.deepseek.com", "deepseek-chat"),
        _provider("gemini", "https://generativelanguage.googleapis.com/v1beta/openai/", "gemini-2.5-flash"),
    ]
    return [p for p in found if p is not None]


class AIUnavailable(RuntimeError):
    """Every provider failed (or none is configured). `errors` says why, per attempt."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__(
            "; ".join(errors) or "no AI provider configured (set DEEPSEEK_API_KEY / GEMINI_API_KEY)"
        )


@dataclass
class AIResult[T: BaseModel]:
    data: T
    model_used: str  # e.g. "deepseek:deepseek-chat"
    latency_ms: int  # total time including retries / fallback
    first_try_valid: bool  # first provider, first attempt returned valid JSON
    errors: list[str] = field(default_factory=list)  # what went wrong before success


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


def _parse[T: BaseModel](text: str, model_cls: type[T]) -> T:
    return model_cls.model_validate(json.loads(_FENCE.sub("", text.strip())))


def _client(p: Provider) -> OpenAI:
    timeout = float(os.getenv("AI_TIMEOUT") or 60)
    # max_retries=0: on 429 / 5xx we move to the fallback provider instead of waiting.
    return OpenAI(api_key=p.api_key, base_url=p.base_url, timeout=timeout, max_retries=0)


def call_json[T: BaseModel](
    messages: list[dict],
    model_cls: type[T],
    *,
    providers: list[Provider] | None = None,
    temperature: float = 0.0,
) -> AIResult[T]:
    """Ask for a JSON object and validate it with `model_cls`. Raises AIUnavailable if all fail."""
    providers = configured_providers() if providers is None else providers
    errors: list[str] = []
    start = time.perf_counter()

    for p_index, p in enumerate(providers):
        client = _client(p)
        convo = list(messages)
        for attempt in (1, 2):  # one retry on invalid JSON
            try:
                resp = client.chat.completions.create(
                    model=p.model,
                    messages=convo,
                    response_format={"type": "json_object"},
                    temperature=temperature,
                )
            except OpenAIError as e:
                errors.append(f"{p.name}: {type(e).__name__}: {str(e)[:200]}")
                break  # API error / 429 / timeout -> next provider
            text = resp.choices[0].message.content or ""
            try:
                data = _parse(text, model_cls)
            except (json.JSONDecodeError, ValidationError) as e:
                errors.append(f"{p.name} attempt {attempt}: invalid JSON: {str(e)[:300]}")
                convo = [
                    *messages,
                    {"role": "assistant", "content": text},
                    {
                        "role": "user",
                        "content": "That JSON did not match the schema. Error:\n"
                        f"{str(e)[:1500]}\nReturn the corrected JSON object only.",
                    },
                ]
                continue
            return AIResult(
                data=data,
                model_used=f"{p.name}:{p.model}",
                latency_ms=round((time.perf_counter() - start) * 1000),
                first_try_valid=(p_index == 0 and attempt == 1),
                errors=errors,
            )

    raise AIUnavailable(errors)
