import json

import pytest
from fastapi.testclient import TestClient

from backend.app.database import BoardRepository
from backend.app.dependencies import get_ai_provider
from backend.app.main import app
from backend.app.openrouter import OpenRouterProviderError
from backend.app.schemas import EditCardOperation


class FakeProvider:
    def __init__(self, response: str, error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.prompts: list[str] = []
        self.json_outputs: list[bool] = []

    def complete(self, prompt: str, json_output: bool = False) -> str:
        self.prompts.append(prompt)
        self.json_outputs.append(json_output)
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
    assert provider.json_outputs == [True]


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


def test_chat_applies_repeated_identical_operations(client: TestClient) -> None:
    edit = {
        "operation": "edit_card",
        "card_id": "card-1",
        "title": "Same edit",
        "details": "",
    }
    provider = FakeProvider(model_response("Updated.", [edit, edit]))
    app.dependency_overrides[get_ai_provider] = lambda: provider
    login(client)

    response = client.post("/api/ai/chat", json={"question": "Rename card 1."})

    assert response.status_code == 200
    assert response.json()["board"]["cards"]["card-1"]["title"] == "Same edit"


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


def test_chat_rejects_oversized_input(client: TestClient) -> None:
    login(client)

    too_long = client.post("/api/ai/chat", json={"question": "x" * 2_001})
    too_much_history = client.post(
        "/api/ai/chat",
        json={
            "question": "Summarize.",
            "history": [{"role": "user", "content": "hi"}] * 51,
        },
    )

    assert too_long.status_code == 422
    assert too_much_history.status_code == 422


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


def test_chat_targets_the_requested_board(client: TestClient) -> None:
    register = client.post(
        "/api/auth/register",
        json={"username": "ada", "password": "hunter2pass"},
    )
    assert register.status_code == 201
    second_board = client.post("/api/boards", json={"title": "Launch"}).json()
    column_id = client.get(f"/api/boards/{second_board['id']}").json()["columns"][0][
        "id"
    ]

    provider = FakeProvider(
        model_response(
            "Added it.",
            [
                {
                    "operation": "create_card",
                    "column_id": column_id,
                    "position": 0,
                    "title": "Book launch venue",
                    "details": "",
                }
            ],
        )
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider

    response = client.post(
        "/api/ai/chat",
        json={"question": "Add a task.", "board_id": second_board["id"]},
    )

    assert response.status_code == 200
    titles = [card["title"] for card in response.json()["board"]["cards"].values()]
    assert titles == ["Book launch venue"]
    # The prompt and the change both stay on the requested board.
    assert "Book launch venue" not in provider.prompts[0]
    first_board = client.get("/api/boards").json()[0]
    assert first_board["cardCount"] == 0


def test_chat_rejects_a_board_owned_by_someone_else(client: TestClient) -> None:
    client.post(
        "/api/auth/register", json={"username": "ada", "password": "hunter2pass"}
    )
    ada_board_id = client.get("/api/boards").json()[0]["id"]
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/register", json={"username": "grace", "password": "hunter2pass"}
    )

    provider = FakeProvider(model_response("Nothing to do.", []))
    app.dependency_overrides[get_ai_provider] = lambda: provider

    response = client.post(
        "/api/ai/chat",
        json={"question": "Summarize.", "board_id": ada_board_id},
    )

    assert response.status_code == 404
    assert provider.prompts == []


def ada_board(client: TestClient) -> tuple[str, str]:
    assert client.post(
        "/api/auth/register",
        json={"username": "ada", "password": "hunter2pass"},
    ).status_code == 201
    board_id = client.get("/api/boards").json()[0]["id"]
    column_id = client.get(f"/api/boards/{board_id}").json()["columns"][0]["id"]
    return board_id, column_id


def test_chat_can_set_card_fields_on_create(client: TestClient) -> None:
    board_id, column_id = ada_board(client)
    label_id = client.post(
        f"/api/boards/{board_id}/labels", json={"name": "Urgent"}
    ).json()["id"]
    provider = FakeProvider(
        model_response(
            "Added it.",
            [
                {
                    "operation": "create_card",
                    "column_id": column_id,
                    "position": 0,
                    "title": "Ship the release",
                    "details": "",
                    "due_date": "2026-03-01",
                    "assignee": "Ada",
                    "label_ids": [label_id],
                }
            ],
        )
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider

    response = client.post(
        "/api/ai/chat", json={"question": "Add a task.", "board_id": board_id}
    )

    assert response.status_code == 200
    card = list(response.json()["board"]["cards"].values())[0]
    assert card["dueDate"] == "2026-03-01"
    assert card["assignee"] == "Ada"
    assert card["labelIds"] == [label_id]


def test_chat_edit_leaves_untouched_fields_alone(client: TestClient) -> None:
    board_id, column_id = ada_board(client)
    label_id = client.post(
        f"/api/boards/{board_id}/labels", json={"name": "Urgent"}
    ).json()["id"]
    card_id = client.post(
        "/api/board/cards",
        json={
            "column_id": column_id,
            "title": "Ship",
            "due_date": "2026-03-01",
            "assignee": "Ada",
            "label_ids": [label_id],
        },
    ).json()["id"]

    provider = FakeProvider(
        model_response(
            "Renamed it.",
            [
                {
                    "operation": "edit_card",
                    "card_id": card_id,
                    "title": "Ship v2",
                    "details": "Cut the tag",
                }
            ],
        )
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider

    response = client.post(
        "/api/ai/chat", json={"question": "Rename it.", "board_id": board_id}
    )

    card = response.json()["board"]["cards"][card_id]
    assert card["title"] == "Ship v2"
    # Fields the model did not mention survive the edit.
    assert card["dueDate"] == "2026-03-01"
    assert card["assignee"] == "Ada"
    assert card["labelIds"] == [label_id]


def test_chat_edit_can_clear_a_due_date(client: TestClient) -> None:
    board_id, column_id = ada_board(client)
    card_id = client.post(
        "/api/board/cards",
        json={"column_id": column_id, "title": "Ship", "due_date": "2026-03-01"},
    ).json()["id"]

    provider = FakeProvider(
        model_response(
            "Cleared it.",
            [
                {
                    "operation": "edit_card",
                    "card_id": card_id,
                    "title": "Ship",
                    "details": "",
                    "due_date": None,
                }
            ],
        )
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider

    response = client.post(
        "/api/ai/chat", json={"question": "Clear the date.", "board_id": board_id}
    )

    assert response.json()["board"]["cards"][card_id]["dueDate"] is None


def test_chat_can_delete_a_card(client: TestClient) -> None:
    board_id, column_id = ada_board(client)
    keep_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Keep"}
    ).json()["id"]
    drop_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Drop"}
    ).json()["id"]

    provider = FakeProvider(
        model_response(
            "Removed it.",
            [{"operation": "delete_card", "card_id": drop_id}],
        )
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider

    response = client.post(
        "/api/ai/chat", json={"question": "Drop that card.", "board_id": board_id}
    )

    board = response.json()["board"]
    assert list(board["cards"]) == [keep_id]
    assert board["columns"][0]["cardIds"] == [keep_id]


def test_chat_rejects_unknown_labels_and_cards(client: TestClient) -> None:
    board_id, column_id = ada_board(client)
    before = client.get(f"/api/boards/{board_id}").json()

    for operations in (
        [
            {
                "operation": "create_card",
                "column_id": column_id,
                "position": 0,
                "title": "Bad label",
                "label_ids": ["label-nope"],
            }
        ],
        [{"operation": "delete_card", "card_id": "card-nope"}],
    ):
        app.dependency_overrides[get_ai_provider] = lambda: FakeProvider(
            model_response("Trying.", operations)
        )
        response = client.post(
            "/api/ai/chat", json={"question": "Do it.", "board_id": board_id}
        )
        assert response.status_code == 502

    assert client.get(f"/api/boards/{board_id}").json() == before


def test_prompt_describes_the_new_operations(client: TestClient) -> None:
    board_id, _ = ada_board(client)
    provider = FakeProvider(model_response("Nothing to do.", []))
    app.dependency_overrides[get_ai_provider] = lambda: provider

    client.post(
        "/api/ai/chat", json={"question": "What can you do?", "board_id": board_id}
    )

    prompt = provider.prompts[0]
    assert "delete_card" in prompt
    assert "due_date" in prompt
    assert "label_ids" in prompt
    assert "Today is" in prompt


def test_assistant_changes_appear_in_activity(client: TestClient) -> None:
    board_id, column_id = ada_board(client)
    second_column = client.get(f"/api/boards/{board_id}").json()["columns"][1]["id"]
    card_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Existing"}
    ).json()["id"]

    provider = FakeProvider(
        model_response(
            "Done.",
            [
                {
                    "operation": "create_card",
                    "column_id": column_id,
                    "position": 0,
                    "title": "Fresh",
                },
                {
                    "operation": "move_card",
                    "card_id": card_id,
                    "target_column_id": second_column,
                    "position": 0,
                },
                {"operation": "delete_card", "card_id": card_id},
            ],
        )
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider

    response = client.post(
        "/api/ai/chat", json={"question": "Tidy up.", "board_id": board_id}
    )
    assert response.status_code == 200

    summaries = [
        entry["summary"]
        for entry in client.get(f"/api/boards/{board_id}/activity").json()
    ]
    assert 'added "Fresh" with the assistant' in summaries
    assert 'moved "Existing" to Discovery with the assistant' in summaries
    assert 'deleted "Existing" with the assistant' in summaries


def test_a_failed_assistant_batch_records_no_activity(client: TestClient) -> None:
    board_id, column_id = ada_board(client)
    provider = FakeProvider(
        model_response(
            "Trying.",
            [
                {
                    "operation": "create_card",
                    "column_id": column_id,
                    "position": 0,
                    "title": "Fresh",
                },
                {"operation": "delete_card", "card_id": "card-nope"},
            ],
        )
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider

    assert client.post(
        "/api/ai/chat", json={"question": "Tidy up.", "board_id": board_id}
    ).status_code == 502
    assert client.get(f"/api/boards/{board_id}/activity").json() == []


def test_chat_can_add_checklist_steps(client: TestClient) -> None:
    board_id, column_id = ada_board(client)
    card_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Release"}
    ).json()["id"]
    client.post(
        f"/api/board/cards/{card_id}/checklist", json={"text": "Existing step"}
    )

    provider = FakeProvider(
        model_response(
            "Added the steps.",
            [
                {
                    "operation": "add_checklist",
                    "card_id": card_id,
                    "steps": ["  Cut the tag  ", "Publish notes"],
                }
            ],
        )
    )
    app.dependency_overrides[get_ai_provider] = lambda: provider

    response = client.post(
        "/api/ai/chat", json={"question": "Plan the release.", "board_id": board_id}
    )

    assert response.status_code == 200
    card = response.json()["board"]["cards"][card_id]
    assert (card["checklistDone"], card["checklistTotal"]) == (0, 3)

    steps = client.get(f"/api/board/cards/{card_id}/checklist").json()
    # Existing steps stay, new ones are appended in order and trimmed.
    assert [step["text"] for step in steps] == [
        "Existing step",
        "Cut the tag",
        "Publish notes",
    ]

    summaries = [
        entry["summary"]
        for entry in client.get(f"/api/boards/{board_id}/activity").json()
    ]
    assert 'added 2 checklist steps to "Release" with the assistant' in summaries


def test_chat_rejects_checklist_steps_for_an_unknown_card(
    client: TestClient,
) -> None:
    board_id, column_id = ada_board(client)
    card_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Release"}
    ).json()["id"]

    app.dependency_overrides[get_ai_provider] = lambda: FakeProvider(
        model_response(
            "Trying.",
            [
                {
                    "operation": "add_checklist",
                    "card_id": "card-nope",
                    "steps": ["Nope"],
                }
            ],
        )
    )

    response = client.post(
        "/api/ai/chat", json={"question": "Plan it.", "board_id": board_id}
    )

    assert response.status_code == 502
    assert client.get(f"/api/board/cards/{card_id}/checklist").json() == []


def test_chat_rejects_blank_checklist_steps(client: TestClient) -> None:
    board_id, column_id = ada_board(client)
    card_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Release"}
    ).json()["id"]

    app.dependency_overrides[get_ai_provider] = lambda: FakeProvider(
        model_response(
            "Trying.",
            [{"operation": "add_checklist", "card_id": card_id, "steps": ["   "]}],
        )
    )

    response = client.post(
        "/api/ai/chat", json={"question": "Plan it.", "board_id": board_id}
    )

    assert response.status_code == 502
    assert client.get(f"/api/board/cards/{card_id}/checklist").json() == []
