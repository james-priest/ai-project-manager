from fastapi.testclient import TestClient


def register(client: TestClient, username: str = "ada") -> str:
    assert client.post(
        "/api/auth/register",
        json={"username": username, "password": "hunter2pass"},
    ).status_code == 201
    return client.get("/api/boards").json()[0]["id"]


def make_card(client: TestClient, board_id: str, title: str = "Ship it") -> str:
    column_id = client.get(f"/api/boards/{board_id}").json()["columns"][0]["id"]
    return client.post(
        "/api/board/cards", json={"column_id": column_id, "title": title}
    ).json()["id"]


def test_checklist_items_are_added_listed_and_ordered(client: TestClient) -> None:
    board_id = register(client)
    card_id = make_card(client, board_id)

    first = client.post(
        f"/api/board/cards/{card_id}/checklist", json={"text": "  Cut the tag  "}
    )
    assert first.status_code == 201
    assert first.json()["text"] == "Cut the tag"
    assert first.json()["done"] is False
    client.post(
        f"/api/board/cards/{card_id}/checklist", json={"text": "Publish notes"}
    )

    items = client.get(f"/api/board/cards/{card_id}/checklist").json()
    assert [item["text"] for item in items] == ["Cut the tag", "Publish notes"]


def test_checklist_progress_appears_on_the_card(client: TestClient) -> None:
    board_id = register(client)
    card_id = make_card(client, board_id)
    first_item = client.post(
        f"/api/board/cards/{card_id}/checklist", json={"text": "One"}
    ).json()["id"]
    client.post(f"/api/board/cards/{card_id}/checklist", json={"text": "Two"})

    card = client.get(f"/api/boards/{board_id}").json()["cards"][card_id]
    assert (card["checklistDone"], card["checklistTotal"]) == (0, 2)

    assert client.patch(
        f"/api/board/checklist/{first_item}", json={"done": True}
    ).status_code == 200

    card = client.get(f"/api/boards/{board_id}").json()["cards"][card_id]
    assert (card["checklistDone"], card["checklistTotal"]) == (1, 2)


def test_checklist_items_can_be_unticked_and_deleted(client: TestClient) -> None:
    board_id = register(client)
    card_id = make_card(client, board_id)
    item_id = client.post(
        f"/api/board/cards/{card_id}/checklist", json={"text": "One"}
    ).json()["id"]

    client.patch(f"/api/board/checklist/{item_id}", json={"done": True})
    client.patch(f"/api/board/checklist/{item_id}", json={"done": False})
    assert client.get(f"/api/board/cards/{card_id}/checklist").json()[0]["done"] is False

    assert client.delete(f"/api/board/checklist/{item_id}").status_code == 200
    assert client.get(f"/api/board/cards/{card_id}/checklist").json() == []
    assert client.delete(f"/api/board/checklist/{item_id}").status_code == 404


def test_deleting_a_card_takes_its_checklist(client: TestClient) -> None:
    board_id = register(client)
    card_id = make_card(client, board_id)
    item_id = client.post(
        f"/api/board/cards/{card_id}/checklist", json={"text": "One"}
    ).json()["id"]

    client.delete(f"/api/board/cards/{card_id}")

    assert client.patch(
        f"/api/board/checklist/{item_id}", json={"done": True}
    ).status_code == 404


def test_blank_checklist_text_is_rejected(client: TestClient) -> None:
    board_id = register(client)
    card_id = make_card(client, board_id)

    assert client.post(
        f"/api/board/cards/{card_id}/checklist", json={"text": "   "}
    ).status_code == 422


def test_checklists_follow_board_membership(client: TestClient) -> None:
    register(client, "grace")
    client.post("/api/auth/logout")
    board_id = register(client, "ada")
    card_id = make_card(client, board_id)
    item_id = client.post(
        f"/api/board/cards/{card_id}/checklist", json={"text": "Private"}
    ).json()["id"]

    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login", json={"username": "grace", "password": "hunter2pass"}
    )
    assert client.get(f"/api/board/cards/{card_id}/checklist").status_code == 404
    assert client.patch(
        f"/api/board/checklist/{item_id}", json={"done": True}
    ).status_code == 404

    # Sharing the board grants access.
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login", json={"username": "ada", "password": "hunter2pass"}
    )
    client.post(f"/api/boards/{board_id}/members", json={"username": "grace"})
    client.post("/api/auth/logout")
    client.post(
        "/api/auth/login", json={"username": "grace", "password": "hunter2pass"}
    )

    assert client.get(f"/api/board/cards/{card_id}/checklist").status_code == 200
    assert client.patch(
        f"/api/board/checklist/{item_id}", json={"done": True}
    ).status_code == 200


def test_checklist_routes_require_authentication(client: TestClient) -> None:
    assert client.get("/api/board/cards/card-1/checklist").status_code == 401
    assert client.post(
        "/api/board/cards/card-1/checklist", json={"text": "x"}
    ).status_code == 401
    assert client.patch(
        "/api/board/checklist/check-1", json={"done": True}
    ).status_code == 401
    assert client.delete("/api/board/checklist/check-1").status_code == 401
