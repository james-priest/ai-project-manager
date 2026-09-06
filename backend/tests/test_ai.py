import json

import pytest
from fastapi.testclient import TestClient

from backend.app.database import BoardRepository
from backend.app.main import app, get_ai_provider
from backend.app.openrouter import OpenRouterProviderError
from backend.app.schemas import EditCardOperation


class FakeProvider:
    def __init__(self, response: str, error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.prompts: list[str] = []

    def complete(self, prompt: str) -> str:
        self.prompts.append(prompt)
        if self.error:
            raise self.error
        return self.response


def login(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200


def model_response(response: str, operations: list[dict[str, object]]) -> str:
    return json.dumps({"response": response, "operations": operations})


def test_chat_route_requires_authentication(client: TestClient) -> None:
    response = client.post("/api/ai/chat", json={"question": "What is next?"})

    assert response.status_code == 401


def test_chat_prompt_contains_board_question_and_history(
    client: TestClient,
) -> None:
    provider = FakeProvider(model_response("Nothing to change.", []))
    app.dependency_overrides[get_ai_provider] = lambda: provider
    login(client)

    response = client.post(
        "/api/ai/chat",
        json={
            "question": "What should we prioritize?",
            "history": [
                {"role": "user", "content": "Summarize the board."},
                {"role": "assistant", "content": "The review queue is next."},
            ],
        },
    )

    assert response.status_code == 200
    assert response.json()["updated"] is False
    assert provider.prompts
    prompt = provider.prompts[0]
    assert "Align roadmap themes" in prompt
    assert "What should we prioritize?" in prompt
    assert "Summarize the board." in prompt
    assert "The review queue is next." in prompt


def test_chat_can_create_a_card(client: TestClient) -> None:
    provider = FakeProvider(
        model_response(
            "I added the task.",
            [
                {
                    "operation": "create_card",
                    "column_id": "col-backlog",
                    "position": 1,
                    "title": "Prepare launch brief",
                    "details": "Collect the final launch requirements.",
                }
            ],
        )
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider
    login(client)

    response = client.post("/api/ai/chat", json={"question": "Add a launch task."})

    assert response.status_code == 200
    body = response.json()
    assert body["updated"] is True
    board = body["board"]
    new_card_ids = set(board["cards"]) - {f"card-{index}" for index in range(1, 9)}
    assert len(new_card_ids) == 1
    new_card_id = next(iter(new_card_ids))
    assert board["columns"][0]["cardIds"] == [
        "card-1",
        new_card_id,
        "card-2",
    ]
    assert board["cards"][new_card_id]["title"] == "Prepare launch brief"


def test_chat_can_edit_a_card(client: TestClient) -> None:
    provider = FakeProvider(
        model_response(
            "I updated the task.",
            [
                {
                    "operation": "edit_card",
                    "card_id": "card-1",
                    "title": "Align strategic themes",
                    "details": "Add measurable quarterly outcomes.",
                }
            ],
        )
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider
    login(client)

    response = client.post("/api/ai/chat", json={"question": "Update the first task."})

    assert response.status_code == 200
    card = response.json()["board"]["cards"]["card-1"]
    assert card["title"] == "Align strategic themes"
    assert card["details"] == "Add measurable quarterly outcomes."


def test_chat_can_move_a_card(client: TestClient) -> None:
    provider = FakeProvider(
        model_response(
            "I moved the task.",
            [
                {
                    "operation": "move_card",
                    "card_id": "card-1",
                    "target_column_id": "col-review",
                    "position": 1,
                }
            ],
        )
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider
    login(client)

    response = client.post("/api/ai/chat", json={"question": "Move the first task to review."})

    assert response.status_code == 200
    board = response.json()["board"]
    assert board["columns"][0]["cardIds"] == ["card-2"]
    assert board["columns"][3]["cardIds"] == ["card-6", "card-1"]


def test_chat_applies_multiple_operations_in_order(client: TestClient) -> None:
    provider = FakeProvider(
        model_response(
            "I updated the board.",
            [
                {
                    "operation": "edit_card",
                    "card_id": "card-1",
                    "title": "Align strategic themes",
                    "details": "Add measurable quarterly outcomes.",
                },
                {
                    "operation": "move_card",
                    "card_id": "card-1",
                    "target_column_id": "col-review",
                    "position": 1,
                },
                {
                    "operation": "create_card",
                    "column_id": "col-done",
                    "position": 2,
                    "title": "Publish summary",
                    "details": "Share the completed work.",
                },
            ],
        )
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider
    login(client)

    response = client.post("/api/ai/chat", json={"question": "Update the roadmap."})

    assert response.status_code == 200
    board = response.json()["board"]
    assert board["columns"][0]["cardIds"] == ["card-2"]
    assert board["columns"][3]["cardIds"] == ["card-6", "card-1"]
    assert board["columns"][4]["cardIds"][:2] == ["card-7", "card-8"]
    new_card_id = board["columns"][4]["cardIds"][2]
    assert board["cards"]["card-1"]["title"] == "Align strategic themes"
    assert board["cards"][new_card_id]["title"] == "Publish summary"


@pytest.mark.parametrize(
    "provider_response",
    [
        "not json",
        model_response(
            "Bad card.",
            [
                {
                    "operation": "edit_card",
                    "card_id": "card-does-not-exist",
                    "title": "Should not persist",
                    "details": "",
                }
            ],
        ),
        model_response(
            "Bad column.",
            [
                {
                    "operation": "move_card",
                    "card_id": "card-1",
                    "target_column_id": "col-does-not-exist",
                    "position": 0,
                }
            ],
        ),
        model_response(
            "Bad position.",
            [
                {
                    "operation": "move_card",
                    "card_id": "card-1",
                    "target_column_id": "col-review",
                    "position": 99,
                }
            ],
        ),
        model_response(
            "Duplicate.",
            [
                {
                    "operation": "edit_card",
                    "card_id": "card-1",
                    "title": "Same edit",
                    "details": "",
                },
                {
                    "operation": "edit_card",
                    "card_id": "card-1",
                    "title": "Same edit",
                    "details": "",
                },
            ],
        ),
    ],
)
def test_invalid_model_output_does_not_change_board(
    client: TestClient,
    provider_response: str,
) -> None:
    provider = FakeProvider(provider_response)
    app.dependency_overrides[get_ai_provider] = lambda: provider
    login(client)
    before = client.get("/api/board").json()

    response = client.post("/api/ai/chat", json={"question": "Change the board."})

    assert response.status_code == 502
    assert client.get("/api/board").json() == before


def test_chat_maps_provider_errors(client: TestClient) -> None:
    provider = FakeProvider(
        "",
        error=OpenRouterProviderError("OpenRouter returned an error response."),
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider
    login(client)

    response = client.post("/api/ai/chat", json={"question": "What is next?"})

    assert response.status_code == 502
    assert response.json() == {"detail": "OpenRouter returned an error response."}


def test_repository_rolls_back_a_failed_batch(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path,
) -> None:
    repository = BoardRepository(tmp_path / "rollback.db")
    repository.initialize()
    before = repository.get_board("user")

    def fail_persist(*args: object, **kwargs: object) -> None:
        raise RuntimeError("simulated persistence failure")

    monkeypatch.setattr(BoardRepository, "_persist_board_state", fail_persist)

    with pytest.raises(RuntimeError, match="simulated persistence failure"):
        repository.apply_operations(
            "user",
            [
                EditCardOperation(
                    operation="edit_card",
                    card_id="card-1",
                    title="Should roll back",
                    details="",
                )
            ],
        )

    assert repository.get_board("user") == before
