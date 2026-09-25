from fastapi.testclient import TestClient


def register(client: TestClient, username: str) -> None:
    response = client.post(
        "/api/auth/register",
        json={"username": username, "password": "hunter2pass"},
    )
    assert response.status_code == 201


def login(client: TestClient, username: str) -> None:
    client.post("/api/auth/logout")
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "hunter2pass"},
    )
    assert response.status_code == 200


def first_board(client: TestClient) -> str:
    return client.get("/api/boards").json()[0]["id"]


def first_column(client: TestClient, board_id: str) -> str:
    return client.get(f"/api/boards/{board_id}").json()["columns"][0]["id"]


def share_board(client: TestClient) -> tuple[str, str]:
    """Registers ada and grace, shares ada's board, leaves ada signed in."""
    register(client, "grace")
    client.post("/api/auth/logout")
    register(client, "ada")
    board_id = first_board(client)
    shared = client.post(
        f"/api/boards/{board_id}/members", json={"username": "grace"}
    )
    assert shared.status_code == 201
    return board_id, first_column(client, board_id)


def test_a_new_board_lists_its_owner_as_the_only_member(client: TestClient) -> None:
    register(client, "ada")
    board_id = first_board(client)

    members = client.get(f"/api/boards/{board_id}/members").json()

    assert members == [{"username": "ada", "role": "owner"}]
    summary = client.get("/api/boards").json()[0]
    assert summary["role"] == "owner"
    assert summary["memberCount"] == 1


def test_a_shared_board_appears_for_the_invited_user(client: TestClient) -> None:
    board_id, _ = share_board(client)

    assert client.get(f"/api/boards/{board_id}/members").json() == [
        {"username": "ada", "role": "owner"},
        {"username": "grace", "role": "editor"},
    ]

    login(client, "grace")
    boards = client.get("/api/boards").json()

    assert [board["id"] for board in boards] == [first_board(client), board_id]
    shared = next(board for board in boards if board["id"] == board_id)
    assert shared["role"] == "editor"
    assert shared["memberCount"] == 2
    assert client.get(f"/api/boards/{board_id}").status_code == 200


def test_an_invited_user_can_edit_the_board(client: TestClient) -> None:
    board_id, column_id = share_board(client)
    login(client, "grace")

    created = client.post(
        "/api/board/cards",
        json={"column_id": column_id, "title": "From Grace"},
    )
    assert created.status_code == 201

    login(client, "ada")
    cards = client.get(f"/api/boards/{board_id}").json()["cards"]
    assert [card["title"] for card in cards.values()] == ["From Grace"]


def test_only_the_owner_can_share_or_delete_the_board(client: TestClient) -> None:
    board_id, _ = share_board(client)
    register(client, "mallory")
    login(client, "grace")

    assert client.post(
        f"/api/boards/{board_id}/members", json={"username": "mallory"}
    ).status_code == 404
    assert client.delete(f"/api/boards/{board_id}").status_code == 409


def test_sharing_rejects_unknown_and_duplicate_users(client: TestClient) -> None:
    board_id, _ = share_board(client)

    unknown = client.post(
        f"/api/boards/{board_id}/members", json={"username": "nobody"}
    )
    duplicate = client.post(
        f"/api/boards/{board_id}/members", json={"username": "grace"}
    )

    assert unknown.status_code == 409
    assert unknown.json()["detail"] == "That user does not exist."
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"] == "That user is already on this board."


def test_the_owner_can_remove_a_member(client: TestClient) -> None:
    board_id, _ = share_board(client)

    removed = client.delete(f"/api/boards/{board_id}/members/grace")
    assert removed.status_code == 200

    login(client, "grace")
    assert board_id not in [board["id"] for board in client.get("/api/boards").json()]
    assert client.get(f"/api/boards/{board_id}").status_code == 404


def test_a_member_can_leave_but_cannot_remove_others(client: TestClient) -> None:
    board_id, _ = share_board(client)
    login(client, "grace")

    assert client.delete(f"/api/boards/{board_id}/members/ada").status_code == 404

    left = client.delete(f"/api/boards/{board_id}/members/grace")
    assert left.status_code == 200
    assert client.get(f"/api/boards/{board_id}").status_code == 404


def test_the_owner_cannot_be_removed(client: TestClient) -> None:
    board_id, _ = share_board(client)

    response = client.delete(f"/api/boards/{board_id}/members/ada")

    assert response.status_code == 404
    assert client.get(f"/api/boards/{board_id}/members").json()[0]["role"] == "owner"


def test_non_members_cannot_see_members_or_activity(client: TestClient) -> None:
    board_id, _ = share_board(client)
    register(client, "mallory")

    assert client.get(f"/api/boards/{board_id}/members").status_code == 404
    assert client.get(f"/api/boards/{board_id}/activity").status_code == 404


def test_comments_are_added_listed_and_counted(client: TestClient) -> None:
    board_id, column_id = share_board(client)
    card_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Discuss"}
    ).json()["id"]

    first = client.post(
        f"/api/board/cards/{card_id}/comments", json={"body": "  Looks good  "}
    )
    assert first.status_code == 201
    assert first.json()["author"] == "ada"
    assert first.json()["body"] == "Looks good"

    login(client, "grace")
    second = client.post(
        f"/api/board/cards/{card_id}/comments", json={"body": "Agreed"}
    )
    assert second.status_code == 201

    comments = client.get(f"/api/board/cards/{card_id}/comments").json()
    assert [(c["author"], c["body"]) for c in comments] == [
        ("ada", "Looks good"),
        ("grace", "Agreed"),
    ]
    card = client.get(f"/api/boards/{board_id}").json()["cards"][card_id]
    assert card["commentCount"] == 2


def test_only_the_author_can_delete_a_comment(client: TestClient) -> None:
    _, column_id = share_board(client)
    card_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Discuss"}
    ).json()["id"]
    comment_id = client.post(
        f"/api/board/cards/{card_id}/comments", json={"body": "Mine"}
    ).json()["id"]

    login(client, "grace")
    assert client.delete(f"/api/board/comments/{comment_id}").status_code == 404

    login(client, "ada")
    assert client.delete(f"/api/board/comments/{comment_id}").status_code == 200
    assert client.get(f"/api/board/cards/{card_id}/comments").json() == []


def test_comments_are_unreachable_for_non_members(client: TestClient) -> None:
    _, column_id = share_board(client)
    card_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Private"}
    ).json()["id"]
    register(client, "mallory")

    assert client.get(f"/api/board/cards/{card_id}/comments").status_code == 404
    assert client.post(
        f"/api/board/cards/{card_id}/comments", json={"body": "Sneaky"}
    ).status_code == 404


def test_blank_comments_are_rejected(client: TestClient) -> None:
    _, column_id = share_board(client)
    card_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Discuss"}
    ).json()["id"]

    assert client.post(
        f"/api/board/cards/{card_id}/comments", json={"body": "   "}
    ).status_code == 422
    assert client.post(
        f"/api/board/cards/{card_id}/comments", json={"body": "x" * 2001}
    ).status_code == 422


def test_activity_records_who_did_what(client: TestClient) -> None:
    board_id, column_id = share_board(client)
    card_id = client.post(
        "/api/board/cards", json={"column_id": column_id, "title": "Ship it"}
    ).json()["id"]
    client.patch(
        f"/api/board/cards/{card_id}",
        json={"title": "Ship it today", "details": ""},
    )
    second_column = client.get(f"/api/boards/{board_id}").json()["columns"][1]["id"]
    client.post(
        f"/api/board/cards/{card_id}/move",
        json={"target_column_id": second_column, "position": 0},
    )
    login(client, "grace")
    client.post(f"/api/board/cards/{card_id}/comments", json={"body": "Nice"})

    entries = client.get(f"/api/boards/{board_id}/activity").json()
    summaries = [(entry["actor"], entry["summary"]) for entry in entries]

    # Newest first.
    assert summaries[0] == ("grace", 'commented on "Ship it today"')
    assert ("ada", 'moved "Ship it today" to Discovery') in summaries
    assert ("ada", 'updated "Ship it today"') in summaries
    assert ("ada", 'added "Ship it"') in summaries
    assert ("ada", "shared the board with grace") in summaries


def test_activity_covers_renames_and_respects_the_limit(client: TestClient) -> None:
    board_id, _ = share_board(client)
    column_id = first_column(client, board_id)
    client.patch(f"/api/board/columns/{column_id}", json={"title": "Queue"})
    client.patch(f"/api/boards/{board_id}", json={"title": "Delivery"})

    entries = client.get(f"/api/boards/{board_id}/activity").json()
    summaries = [entry["summary"] for entry in entries]
    assert 'renamed the board to "Delivery"' in summaries
    assert 'renamed a column to "Queue"' in summaries

    limited = client.get(f"/api/boards/{board_id}/activity?limit=1").json()
    assert len(limited) == 1
    assert limited[0]["summary"] == 'renamed the board to "Delivery"'


def test_collaboration_routes_require_authentication(client: TestClient) -> None:
    assert client.get("/api/boards/board-user-1/members").status_code == 401
    assert client.post(
        "/api/boards/board-user-1/members", json={"username": "ada"}
    ).status_code == 401
    assert client.delete(
        "/api/boards/board-user-1/members/ada"
    ).status_code == 401
    assert client.get("/api/boards/board-user-1/activity").status_code == 401
    assert client.get("/api/board/cards/card-1/comments").status_code == 401
    assert client.post(
        "/api/board/cards/card-1/comments", json={"body": "hi"}
    ).status_code == 401
    assert client.delete("/api/board/comments/comment-1").status_code == 401
