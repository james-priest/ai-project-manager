import json
import os

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.app.dependencies import get_ai_provider
from backend.app.main import app
from backend.app.openrouter import (
    OPENROUTER_API_URL,
    OPENROUTER_MODEL,
    OpenRouterClient,
    OpenRouterConfigurationError,
    OpenRouterProviderError,
    OpenRouterTimeoutError,
)


def login(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200


class FakeProvider:
    def __init__(self, response: str = "4", error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.prompts: list[str] = []

    def complete(self, prompt: str) -> str:
        self.prompts.append(prompt)
        if self.error:
            raise self.error
        return self.response


def test_openrouter_client_builds_expected_request_from_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "  4  "}}]},
        )

    client = OpenRouterClient(
        timeout=7.0,
        transport=httpx.MockTransport(handler),
    )

    assert client.complete("2+2") == "4"
    request = requests[0]
    assert str(request.url) == OPENROUTER_API_URL
    assert request.headers["Authorization"] == "Bearer test-key"
    assert json.loads(request.content) == {
        "model": OPENROUTER_MODEL,
        "messages": [{"role": "user", "content": "2+2"}],
    }
    assert client.timeout == 7.0


def test_openrouter_client_requires_an_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    client = OpenRouterClient()

    with pytest.raises(
        OpenRouterConfigurationError,
        match="API key is not configured",
    ):
        client.complete("2+2")


def test_openrouter_client_maps_timeout_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    client = OpenRouterClient(
        api_key="test-key",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(OpenRouterTimeoutError, match="timed out"):
        client.complete("2+2")


def test_openrouter_client_maps_provider_status_error() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": {"message": "secret detail"}})

    client = OpenRouterClient(
        api_key="test-key",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(OpenRouterProviderError, match="error response") as error:
        client.complete("2+2")
    assert "secret detail" not in str(error.value)


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"choices": []},
        {"choices": [{"message": {"content": ""}}]},
        {"choices": [{"message": {"content": 4}}]},
    ],
)
def test_openrouter_client_rejects_invalid_provider_response(
    body: dict[str, object],
) -> None:
    client = OpenRouterClient(
        api_key="test-key",
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json=body)),
    )

    with pytest.raises(OpenRouterProviderError, match="invalid response"):
        client.complete("2+2")


def test_connectivity_route_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/ai/connectivity")

    assert response.status_code == 401


def test_connectivity_route_returns_prompt_and_provider_response(
    client: TestClient,
) -> None:
    provider = FakeProvider()
    app.dependency_overrides[get_ai_provider] = lambda: provider
    login(client)

    response = client.post("/api/ai/connectivity")

    assert response.status_code == 200
    assert response.json() == {"prompt": "2+2", "response": "4"}
    assert provider.prompts == ["2+2"]


@pytest.mark.parametrize(
    ("error", "status_code", "detail"),
    [
        (
            OpenRouterConfigurationError("OpenRouter API key is not configured."),
            503,
            "OpenRouter API key is not configured.",
        ),
        (
            OpenRouterTimeoutError("OpenRouter request timed out."),
            504,
            "OpenRouter request timed out.",
        ),
        (
            OpenRouterProviderError("OpenRouter returned an error response."),
            502,
            "OpenRouter returned an error response.",
        ),
    ],
)
def test_connectivity_route_returns_controlled_provider_errors(
    client: TestClient,
    error: Exception,
    status_code: int,
    detail: str,
) -> None:
    app.dependency_overrides[get_ai_provider] = lambda: FakeProvider(error=error)
    login(client)

    response = client.post("/api/ai/connectivity")

    assert response.status_code == status_code
    assert response.json() == {"detail": detail}


def test_live_openrouter_connectivity() -> None:
    if os.getenv("RUN_LIVE_OPENROUTER_TESTS") != "1":
        pytest.skip("Set RUN_LIVE_OPENROUTER_TESTS=1 to run the live check.")
    if not os.getenv("OPENROUTER_API_KEY"):
        pytest.skip("OPENROUTER_API_KEY is not available.")

    response = OpenRouterClient().complete("2+2")

    assert response.strip()
