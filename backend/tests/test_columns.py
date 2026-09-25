from fastapi.testclient import TestClient


def register(client: TestClient, username: str = "ada") -> str:
    response = client.post(
        "/api/auth/register",
        json={"username": username, "password": "hunter2pass"},
    )
    assert response.status_code == 201
    return client.get("/api/boards").json()[0]["id"]


def column_titles(client: TestClient, board_id: str) -> list[str]:
    board = client.get(f"/api/boards/{board_id}").json()
    return [column["title"] for column in board["columns"]]


def test_columns_are_created_at_the_end(client: TestClient) -> None:
    board_id = register(client)

    created = client.post(
        f"/api/boards/{board_id}/columns", json={"title": "  Blocked  "}
    )

    assert created.status_code == 201
    assert created.json()["title"] == "Blocked"
    assert created.json()["cardIds"] == []
    assert column_titles(client, board_id)[-1] == "Blocked"


def test_columns_can_be_reordered(client: TestClient) -> None:
    board_id = register(client)
    board = client.get(f"/api/boards/{board_id}").json()
    last_column = board["columns"][-1]["id"]

    moved = client.post(
        f"/api/board/columns/{last_column}/move", json={"position": 0}
    )

    assert moved.status_code == 200
    assert column_titles(client, board_id) == [
        "Done",
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
    ]

    # The order survives a reload from the database.
    assert column_titles(client, board_id)[0] == "Done"


def test_moving_a_column_out_of_range_is_rejected(client: TestClient) -> None:
    board_id = register(client)
    column_id = client.get(f"/api/boards/{board_id}").json()["columns"][0]["id"]

    response = client.post(
        f"/api/board/columns/{column_id}/move", json={"position": 99}
    )

    assert response.status_code == 400
    assert column_titles(client, board_id)[0] == "Backlog"


def test_deleting_a_column_removes_its_cards(client: TestClient) -> None:
    board_id = register(client)
    board = client.get(f"/api/boards/{board_id}").json()
    column_id = board["columns"][0]["id"]
    card_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Goes away"}
    ).json()["id"]

    deleted = client.delete(f"/api/board/columns/{column_id}")

    assert deleted.status_code == 200
    board = client.get(f"/api/boards/{board_id}").json()
    assert column_titles(client, board_id) == [
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert card_id not in board["cards"]


def test_the_last_column_cannot_be_deleted(client: TestClient) -> None:
    board_id = register(client)
    board = client.get(f"/api/boards/{board_id}").json()
    for column in board["columns"][:-1]:
        assert client.delete(f"/api/board/columns/{column['id']}").status_code == 200

    last_column = client.get(f"/api/boards/{board_id}").json()["columns"][0]
    response = client.delete(f"/api/board/columns/{last_column['id']}")

    assert response.status_code == 409
    assert column_titles(client, board_id) == [last_column["title"]]


def test_columns_are_private_to_their_board(client: TestClient) -> None:
    ada_board = register(client, "ada")
    ada_column = client.get(f"/api/boards/{ada_board}").json()["columns"][0]["id"]
    client.post("/api/auth/logout")
    register(client, "grace")

    assert client.post(
        f"/api/boards/{ada_board}/columns", json={"title": "Sneaky"}
    ).status_code == 404
    assert client.delete(f"/api/board/columns/{ada_column}").status_code == 404
    assert client.post(
        f"/api/board/columns/{ada_column}/move", json={"position": 0}
    ).status_code == 404


def test_column_routes_require_authentication(client: TestClient) -> None:
    assert client.post(
        "/api/boards/board-user-1/columns", json={"title": "Nope"}
    ).status_code == 401
    assert client.delete("/api/board/columns/col-backlog").status_code == 401
    assert client.post(
        "/api/board/columns/col-backlog/move", json={"position": 0}
    ).status_code == 401


def test_boards_can_be_created_from_a_template(client: TestClient) -> None:
    register(client)

    sprint = client.post(
        "/api/boards", json={"title": "Sprint 12", "template": "sprint"}
    ).json()["id"]
    blank = client.post(
        "/api/boards", json={"title": "Empty", "template": "blank"}
    ).json()["id"]

    assert column_titles(client, sprint) == [
        "Sprint backlog",
        "In progress",
        "In review",
        "Done",
    ]
    assert column_titles(client, blank) == []

    unknown = client.post(
        "/api/boards", json={"title": "Bad", "template": "nonsense"}
    )
    assert unknown.status_code == 422


def test_a_blank_board_can_have_columns_added(client: TestClient) -> None:
    register(client)
    blank = client.post(
        "/api/boards", json={"title": "Empty", "template": "blank"}
    ).json()["id"]

    created = client.post(f"/api/boards/{blank}/columns", json={"title": "Ideas"})

    assert created.status_code == 201
    assert column_titles(client, blank) == ["Ideas"]


def test_boards_can_be_archived_and_restored(client: TestClient) -> None:
    register(client)
    board_id = client.post("/api/boards", json={"title": "Old work"}).json()["id"]

    archived = client.post(f"/api/boards/{board_id}/archive")
    assert archived.status_code == 200

    assert board_id not in [b["id"] for b in client.get("/api/boards").json()]
    with_archived = client.get("/api/boards?include_archived=true").json()
    assert [b["archived"] for b in with_archived if b["id"] == board_id] == [True]
    # An archived board is still readable by its members.
    assert client.get(f"/api/boards/{board_id}").status_code == 200

    restored = client.post(f"/api/boards/{board_id}/unarchive")
    assert restored.status_code == 200
    assert board_id in [b["id"] for b in client.get("/api/boards").json()]


def test_only_the_owner_can_archive(client: TestClient) -> None:
    register(client, "grace")
    client.post("/api/auth/logout")
    board_id = register(client, "ada")
    client.post(f"/api/boards/{board_id}/members", json={"username": "grace"})
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login", json={"username": "grace", "password": "hunter2pass"}
    )

    response = client.post(f"/api/boards/{board_id}/archive")

    assert response.status_code == 404


def test_archiving_is_recorded_in_activity(client: TestClient) -> None:
    board_id = register(client)
    client.post(f"/api/boards/{board_id}/archive")
    client.post(f"/api/boards/{board_id}/unarchive")

    summaries = [
        entry["summary"]
        for entry in client.get(f"/api/boards/{board_id}/activity").json()
    ]

    assert summaries[:2] == ["restored the board", "archived the board"]


def test_column_changes_are_recorded_in_activity(client: TestClient) -> None:
    board_id = register(client)
    column_id = client.post(
        f"/api/boards/{board_id}/columns", json={"title": "Blocked"}
    ).json()["id"]
    client.post(f"/api/board/columns/{column_id}/move", json={"position": 0})
    client.delete(f"/api/board/columns/{column_id}")

    summaries = [
        entry["summary"]
        for entry in client.get(f"/api/boards/{board_id}/activity").json()
    ]

    assert summaries[:3] == [
        'deleted the column "Blocked"',
        'reordered the column "Blocked"',
        'added the column "Blocked"',
    ]
