from fastapi.testclient import TestClient


def register(client: TestClient, username: str = "ada") -> str:
    response = client.post(
        "/api/auth/register",
        json={"username": username, "password": "hunter2pass"},
    )
    assert response.status_code == 201
    return client.get("/api/boards").json()[0]["id"]


def first_column(client: TestClient, board_id: str) -> str:
    return client.get(f"/api/boards/{board_id}").json()["columns"][0]["id"]


def test_cards_carry_due_date_assignee_and_labels(client: TestClient) -> None:
    board_id = register(client)
    column_id = first_column(client, board_id)
    label = client.post(
        f"/api/boards/{board_id}/labels",
        json={"name": "Urgent", "color": "purple"},
    )
    assert label.status_code == 201
    label_id = label.json()["id"]

    created = client.post(
        "/api/board/cards",
        json={
            "column_id": column_id,
            "title": "Ship the release",
            "details": "Cut the tag",
            "due_date": "2026-03-01",
            "assignee": "  Ada  ",
            "label_ids": [label_id],
        },
    )
    assert created.status_code == 201
    card_id = created.json()["id"]

    board = client.get(f"/api/boards/{board_id}").json()
    assert board["labels"][label_id] == {
        "id": label_id,
        "name": "Urgent",
        "color": "purple",
    }
    assert board["cards"][card_id] == {
        "id": card_id,
        "title": "Ship the release",
        "details": "Cut the tag",
        "dueDate": "2026-03-01",
        "assignee": "Ada",
        "labelIds": [label_id],
        "commentCount": 0,
        "checklistDone": 0,
        "checklistTotal": 0,
    }


def test_updating_a_card_replaces_its_fields_and_labels(client: TestClient) -> None:
    board_id = register(client)
    column_id = first_column(client, board_id)
    first_label = client.post(
        f"/api/boards/{board_id}/labels", json={"name": "Bug"}
    ).json()["id"]
    second_label = client.post(
        f"/api/boards/{board_id}/labels", json={"name": "Chore", "color": "gray"}
    ).json()["id"]
    card_id = client.post(
        "/api/board/cards",
        json={
            "column_id": column_id,
            "title": "Fix crash",
            "due_date": "2026-02-01",
            "label_ids": [first_label],
        },
    ).json()["id"]

    updated = client.patch(
        f"/api/board/cards/{card_id}",
        json={
            "title": "Fix crash",
            "details": "Root cause found",
            "assignee": "Grace",
            "label_ids": [second_label],
        },
    )
    assert updated.status_code == 200

    card = client.get(f"/api/boards/{board_id}").json()["cards"][card_id]
    assert card["labelIds"] == [second_label]
    assert card["assignee"] == "Grace"
    # Omitting the due date clears it.
    assert card["dueDate"] is None


def test_card_fields_are_validated(client: TestClient) -> None:
    board_id = register(client)
    column_id = first_column(client, board_id)

    bad_date = client.post(
        "/api/board/cards",
        json={"column_id": column_id, "title": "Bad date", "due_date": "March 1"},
    )
    long_assignee = client.post(
        "/api/board/cards",
        json={"column_id": column_id, "title": "Long", "assignee": "x" * 101},
    )

    assert bad_date.status_code == 422
    assert long_assignee.status_code == 422


def test_labels_are_rejected_from_another_board(client: TestClient) -> None:
    board_id = register(client)
    other_board_id = client.post("/api/boards", json={"title": "Other"}).json()["id"]
    other_label = client.post(
        f"/api/boards/{other_board_id}/labels", json={"name": "Elsewhere"}
    ).json()["id"]
    column_id = first_column(client, board_id)

    response = client.post(
        "/api/board/cards",
        json={
            "column_id": column_id,
            "title": "Wrong label",
            "label_ids": [other_label],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Unknown label for this board"
    assert client.get(f"/api/boards/{board_id}").json()["cards"] == {}


def test_labels_are_created_listed_and_deleted(client: TestClient) -> None:
    board_id = register(client)
    column_id = first_column(client, board_id)
    label_id = client.post(
        f"/api/boards/{board_id}/labels", json={"name": "Urgent"}
    ).json()["id"]
    card_id = client.post(
        "/api/board/cards",
        json={"column_id": column_id, "title": "Task", "label_ids": [label_id]},
    ).json()["id"]

    duplicate = client.post(
        f"/api/boards/{board_id}/labels", json={"name": "Urgent"}
    )
    assert duplicate.status_code == 409

    bad_color = client.post(
        f"/api/boards/{board_id}/labels", json={"name": "Teal", "color": "teal"}
    )
    assert bad_color.status_code == 422

    deleted = client.delete(f"/api/boards/{board_id}/labels/{label_id}")
    assert deleted.status_code == 200

    board = client.get(f"/api/boards/{board_id}").json()
    assert board["labels"] == {}
    # Deleting a label detaches it from its cards.
    assert board["cards"][card_id]["labelIds"] == []
    assert client.delete(
        f"/api/boards/{board_id}/labels/{label_id}"
    ).status_code == 404


def test_labels_are_private_to_their_board_owner(client: TestClient) -> None:
    ada_board_id = register(client, "ada")
    ada_label = client.post(
        f"/api/boards/{ada_board_id}/labels", json={"name": "Private"}
    ).json()["id"]
    client.post("/api/auth/logout")
    register(client, "grace")

    assert client.post(
        f"/api/boards/{ada_board_id}/labels", json={"name": "Sneaky"}
    ).status_code == 404
    assert client.delete(
        f"/api/boards/{ada_board_id}/labels/{ada_label}"
    ).status_code == 404


def test_label_routes_require_authentication(client: TestClient) -> None:
    assert client.post(
        "/api/boards/board-user-1/labels", json={"name": "Nope"}
    ).status_code == 401
    assert client.delete(
        "/api/boards/board-user-1/labels/label-1"
    ).status_code == 401


def test_ai_created_cards_get_empty_card_fields(client: TestClient) -> None:
    board_id = register(client)
    column_id = first_column(client, board_id)
    card_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Plain"}
    ).json()["id"]

    card = client.get(f"/api/boards/{board_id}").json()["cards"][card_id]

    assert card["dueDate"] is None
    assert card["assignee"] == ""
    assert card["labelIds"] == []


def test_cards_can_be_added_to_a_board_other_than_the_first(
    client: TestClient,
) -> None:
    register(client)
    second_board = client.post("/api/boards", json={"title": "Launch"}).json()["id"]
    column_id = first_column(client, second_board)

    created = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "On board two"}
    )

    assert created.status_code == 201
    cards = client.get(f"/api/boards/{second_board}").json()["cards"]
    assert [card["title"] for card in cards.values()] == ["On board two"]
    # The first board is untouched.
    assert client.get("/api/boards").json()[0]["cardCount"] == 0
