from fastapi.testclient import TestClient


def register(client: TestClient, username: str) -> str:
    response = client.post(
        "/api/auth/register",
        json={"username": username, "password": "hunter2pass"},
    )
    assert response.status_code == 201
    return client.get("/api/boards").json()[0]["id"]


def login(client: TestClient, username: str) -> None:
    client.post("/api/auth/logout")
    assert client.post(
        "/api/auth/login",
        json={"username": username, "password": "hunter2pass"},
    ).status_code == 200


def add_card(
    client: TestClient,
    board_id: str,
    title: str,
    assignee: str = "",
    due_date: str | None = None,
    column_index: int = 0,
) -> str:
    column_id = client.get(f"/api/boards/{board_id}").json()["columns"][
        column_index
    ]["id"]
    response = client.post(
        "/api/board/cards",
        json={
            "column_id": column_id,
            "title": title,
            "assignee": assignee,
            "due_date": due_date,
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


def test_my_tasks_gathers_cards_from_every_board(client: TestClient) -> None:
    first_board = register(client, "ada")
    second_board = client.post("/api/boards", json={"title": "Launch"}).json()["id"]
    add_card(client, first_board, "Write spec", assignee="ada", due_date="2026-05-01")
    add_card(client, second_board, "Book venue", assignee="Ada", due_date="2026-04-01")
    add_card(client, first_board, "Someone else's", assignee="grace")
    add_card(client, first_board, "Unassigned")

    tasks = client.get("/api/me/tasks").json()

    # Only this user's cards, soonest due date first, matched case-insensitively.
    assert [task["title"] for task in tasks] == ["Book venue", "Write spec"]
    assert tasks[0]["boardTitle"] == "Launch"
    assert tasks[0]["columnTitle"] == "Backlog"
    assert tasks[1]["boardId"] == first_board


def test_undated_tasks_come_last(client: TestClient) -> None:
    board_id = register(client, "ada")
    add_card(client, board_id, "No date", assignee="ada")
    add_card(client, board_id, "Dated", assignee="ada", due_date="2026-05-01")

    tasks = client.get("/api/me/tasks").json()

    assert [task["title"] for task in tasks] == ["Dated", "No date"]
    assert tasks[1]["dueDate"] is None


def test_my_tasks_include_labels(client: TestClient) -> None:
    board_id = register(client, "ada")
    label_id = client.post(
        f"/api/boards/{board_id}/labels", json={"name": "Urgent", "color": "purple"}
    ).json()["id"]
    column_id = client.get(f"/api/boards/{board_id}").json()["columns"][0]["id"]
    client.post(
        "/api/board/cards",
        json={
            "column_id": column_id,
            "title": "Labelled",
            "assignee": "ada",
            "label_ids": [label_id],
        },
    )

    tasks = client.get("/api/me/tasks").json()

    assert tasks[0]["labels"] == [
        {"id": label_id, "name": "Urgent", "color": "purple"}
    ]


def test_my_tasks_cover_shared_boards_only_while_a_member(
    client: TestClient,
) -> None:
    register(client, "grace")
    client.post("/api/auth/logout")
    ada_board = register(client, "ada")
    client.post(f"/api/boards/{ada_board}/members", json={"username": "grace"})
    add_card(client, ada_board, "Shared work", assignee="grace")

    login(client, "grace")
    assert [task["title"] for task in client.get("/api/me/tasks").json()] == [
        "Shared work"
    ]

    # Leaving the board takes the task with it.
    client.delete(f"/api/boards/{ada_board}/members/grace")
    assert client.get("/api/me/tasks").json() == []


def test_archived_boards_are_left_out(client: TestClient) -> None:
    board_id = register(client, "ada")
    other_board = client.post("/api/boards", json={"title": "Old"}).json()["id"]
    add_card(client, board_id, "Current work", assignee="ada")
    add_card(client, other_board, "Old work", assignee="ada")

    client.post(f"/api/boards/{other_board}/archive")

    assert [task["title"] for task in client.get("/api/me/tasks").json()] == [
        "Current work"
    ]


def test_my_tasks_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/me/tasks").status_code == 401


def test_my_tasks_is_empty_without_assignments(client: TestClient) -> None:
    board_id = register(client, "ada")
    add_card(client, board_id, "Nobody's job")

    assert client.get("/api/me/tasks").json() == []
