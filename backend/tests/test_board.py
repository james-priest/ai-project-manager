from fastapi.testclient import TestClient

from backend.app.main import SESSION_COOKIE, app


def login(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "user", "password": "password"},
    )
    assert response.status_code == 200
    assert client.cookies.get(SESSION_COOKIE)


def test_board_api_supports_authenticated_crud_and_ordering(
    client: TestClient,
) -> None:
    login(client)

    board_response = client.get("/api/board")
    assert board_response.status_code == 200
    board = board_response.json()
    assert len(board["columns"]) == 5
    assert board["columns"][0]["cardIds"] == ["card-1", "card-2"]

    rename_response = client.patch(
        "/api/board/columns/col-backlog",
        json={"title": "Queue"},
    )
    assert rename_response.status_code == 200
    assert rename_response.json() == {"updated": True}

    create_response = client.post(
        "/api/board/cards",
        json={
            "column_id": "col-backlog",
            "title": "New card",
            "details": "Notes",
        },
    )
    assert create_response.status_code == 201
    card_id = create_response.json()["id"]

    update_response = client.patch(
        f"/api/board/cards/{card_id}",
        json={"title": "Updated card", "details": "Updated notes"},
    )
    assert update_response.status_code == 200
    assert update_response.json() == {"updated": True}

    move_response = client.post(
        f"/api/board/cards/{card_id}/move",
        json={"target_column_id": "col-review", "position": 0},
    )
    assert move_response.status_code == 200
    assert move_response.json() == {"moved": True}

    persisted_response = client.get("/api/board")
    persisted_board = persisted_response.json()
    assert persisted_board["columns"][0] == {
        "id": "col-backlog",
        "title": "Queue",
        "cardIds": ["card-1", "card-2"],
    }
    assert persisted_board["columns"][3]["cardIds"] == [card_id, "card-6"]
    assert persisted_board["cards"][card_id] == {
        "id": card_id,
        "title": "Updated card",
        "details": "Updated notes",
    }

    delete_response = client.delete(f"/api/board/cards/{card_id}")
    assert delete_response.status_code == 200
    assert delete_response.json() == {"deleted": True}


def test_board_api_requires_authentication_for_every_operation(
    client: TestClient,
) -> None:
    requests = [
        client.get("/api/board"),
        client.patch("/api/board/columns/col-backlog", json={"title": "Queue"}),
        client.post(
            "/api/board/cards",
            json={"column_id": "col-backlog", "title": "Card"},
        ),
        client.patch(
            "/api/board/cards/card-1",
            json={"title": "Updated"},
        ),
        client.delete("/api/board/cards/card-1"),
        client.post(
            "/api/board/cards/card-1/move",
            json={"target_column_id": "col-done", "position": 0},
        ),
    ]

    assert [response.status_code for response in requests] == [401] * len(requests)


def test_board_api_validates_input_and_missing_resources(
    client: TestClient,
) -> None:
    login(client)

    assert client.patch(
        "/api/board/columns/col-backlog", json={"title": "  "}
    ).status_code == 422
    assert client.post(
        "/api/board/cards",
        json={"column_id": "col-backlog", "title": "  "},
    ).status_code == 422
    assert client.post(
        "/api/board/cards",
        json={"column_id": "missing-column", "title": "Card"},
    ).status_code == 404
    assert client.patch(
        "/api/board/cards/missing-card", json={"title": "Card"}
    ).status_code == 404
    assert client.delete("/api/board/cards/missing-card").status_code == 404
    assert client.post(
        "/api/board/cards/card-1/move",
        json={"target_column_id": "col-done", "position": -1},
    ).status_code == 422
    assert client.post(
        "/api/board/cards/card-1/move",
        json={"target_column_id": "missing-column", "position": 0},
    ).status_code == 404


def test_board_changes_survive_a_new_application_client(client: TestClient) -> None:
    login(client)
    assert client.patch(
        "/api/board/columns/col-done", json={"title": "Released"}
    ).status_code == 200

    with TestClient(app) as restarted_client:
        login(restarted_client)
        board = restarted_client.get("/api/board").json()

    assert board["columns"][-1]["title"] == "Released"
