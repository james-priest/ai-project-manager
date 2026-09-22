import os
from typing import Protocol

import httpx

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "openai/gpt-oss-120b"
DEFAULT_TIMEOUT_SECONDS = 20.0


class AIProvider(Protocol):
    def complete(self, prompt: str, json_output: bool = False) -> str:
        """Return the provider's text response for a prompt.

        With json_output, the provider must return a single JSON object.
        """


class OpenRouterError(RuntimeError):
    """Base error for controlled OpenRouter failures."""


class OpenRouterConfigurationError(OpenRouterError):
    """Raised when the provider is not configured with an API key."""


class OpenRouterTimeoutError(OpenRouterError):
    """Raised when OpenRouter does not respond before the timeout."""


class OpenRouterProviderError(OpenRouterError):
    """Raised when OpenRouter returns an error or invalid response."""


class OpenRouterClient:
    def __init__(
        self,
        api_key: str | None = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else os.getenv(
            "OPENROUTER_API_KEY"
        )
        self.timeout = timeout
        self.transport = transport

    def complete(self, prompt: str, json_output: bool = False) -> str:
        if not self.api_key:
            raise OpenRouterConfigurationError(
                "OpenRouter API key is not configured."
            )

        payload: dict[str, object] = {
            "model": OPENROUTER_MODEL,
            "messages": [{"role": "user", "content": prompt}],
        }
        if json_output:
            payload["response_format"] = {"type": "json_object"}
            # Route only to providers that honor response_format.
            payload["provider"] = {"require_parameters": True}

        try:
            with httpx.Client(
                timeout=self.timeout,
                transport=self.transport,
            ) as client:
                response = client.post(
                    OPENROUTER_API_URL,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                response.raise_for_status()
        except httpx.TimeoutException as error:
            raise OpenRouterTimeoutError(
                "OpenRouter request timed out."
            ) from error
        except httpx.HTTPStatusError as error:
            raise OpenRouterProviderError(
                "OpenRouter returned an error response."
            ) from error
        except httpx.RequestError as error:
            raise OpenRouterProviderError(
                "Unable to reach OpenRouter."
            ) from error

        try:
            content = response.json()["choices"][0]["message"]["content"]
        except (IndexError, KeyError, TypeError, ValueError) as error:
            raise OpenRouterProviderError(
                "OpenRouter returned an invalid response."
            ) from error

        if not isinstance(content, str) or not content.strip():
            raise OpenRouterProviderError(
                "OpenRouter returned an invalid response."
            )

        return content.strip()
