from contextlib import closing
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.database import (
    BoardRepository,
    SessionRepository,
    UserExistsError,
    UserRepository,
    connect,
    initialize_database,
)


def register(client: TestClient, username: str, password: str = "hunter2pass"):
    return client.post(
        "/api/auth/register",
        json={"username": username, "password": password},
    )


def test_register_creates_an_account_with_a_starter_board(
    client: TestClient,
) -> None:
    response = register(client, "ada")

    assert response.status_code == 201
    assert response.json() == {"authenticated": True, "username": "ada"}

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "ada"

    boards = client.get("/api/boards").json()
    assert len(boards) == 1
    assert boards[0]["cardCount"] == 0

    board = client.get(f"/api/boards/{boards[0]['id']}").json()
    assert [column["title"] for column in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert board["cards"] == {}


def test_register_rejects_duplicates_and_weak_input(client: TestClient) -> None:
    assert register(client, "ada").status_code == 201

    assert register(client, "ada").status_code == 409
    assert register(client, "ADA").status_code == 409
    assert register(client, "ada", "short").status_code == 422
    assert register(client, "no spaces allowed").status_code == 422


def test_registered_user_can_log_in_again(client: TestClient) -> None:
    register(client, "ada")
    client.post("/api/auth/logout")

    assert client.get("/api/auth/me").status_code == 401

    response = client.post(
        "/api/auth/login",
        json={"username": "Ada", "password": "hunter2pass"},
    )

    assert response.status_code == 200
    assert response.json()["username"] == "ada"
    assert client.get("/api/auth/me").status_code == 200


def test_login_rejects_a_wrong_password(client: TestClient) -> None:
    register(client, "ada")
    client.post("/api/auth/logout")

    response = client.post(
        "/api/auth/login",
        json={"username": "ada", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_sessions_survive_a_restart(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.db"
    initialize_database(database_path)

    session_id = SessionRepository(database_path).create("user", 3600)
    assert session_id is not None

    # A second repository stands in for a fresh process against the same file.
    assert SessionRepository(database_path).get_username(session_id) == "user"


def test_session_repository_rejects_unknown_users_and_sessions(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "kanban.db"
    initialize_database(database_path)
    sessions = SessionRepository(database_path)

    assert sessions.create("nobody", 3600) is None
    assert sessions.get_username("unknown-session") is None


def test_user_repository_rejects_duplicate_usernames(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.db"
    initialize_database(database_path)
    users = UserRepository(database_path)

    users.create_user("ada", "hunter2pass")
    with pytest.raises(UserExistsError):
        users.create_user("ada", "another-password")

    assert users.authenticate("ada", "hunter2pass")
    assert not users.authenticate("ada", "wrong-password")
    assert not users.authenticate("missing", "hunter2pass")


def test_boards_are_created_listed_renamed_and_deleted(client: TestClient) -> None:
    register(client, "ada")

    created = client.post("/api/boards", json={"title": "Launch plan"})
    assert created.status_code == 201
    board_id = created.json()["id"]
    assert created.json()["title"] == "Launch plan"

    boards = client.get("/api/boards").json()
    assert [board["title"] for board in boards] == ["My board", "Launch plan"]

    renamed = client.patch(f"/api/boards/{board_id}", json={"title": "Launch"})
    assert renamed.status_code == 200
    assert client.get("/api/boards").json()[1]["title"] == "Launch"

    deleted = client.delete(f"/api/boards/{board_id}")
    assert deleted.status_code == 200
    assert [board["title"] for board in client.get("/api/boards").json()] == [
        "My board"
    ]


def test_the_last_board_cannot_be_deleted(client: TestClient) -> None:
    register(client, "ada")
    board_id = client.get("/api/boards").json()[0]["id"]

    response = client.delete(f"/api/boards/{board_id}")

    assert response.status_code == 409
    assert len(client.get("/api/boards").json()) == 1


def test_board_card_counts_track_their_cards(client: TestClient) -> None:
    register(client, "ada")
    board_id = client.get("/api/boards").json()[0]["id"]
    column_id = client.get(f"/api/boards/{board_id}").json()["columns"][0]["id"]

    client.post(
        "/api/board/cards",
        json={"column_id": column_id, "title": "First task", "details": ""},
    )

    assert client.get("/api/boards").json()[0]["cardCount"] == 1


def test_boards_are_private_to_their_owner(client: TestClient) -> None:
    register(client, "ada")
    ada_board_id = client.get("/api/boards").json()[0]["id"]
    client.post("/api/auth/logout")

    register(client, "grace")

    assert client.get(f"/api/boards/{ada_board_id}").status_code == 404
    assert client.patch(
        f"/api/boards/{ada_board_id}", json={"title": "Stolen"}
    ).status_code == 404
    assert client.delete(f"/api/boards/{ada_board_id}").status_code == 409
    assert ada_board_id not in [
        board["id"] for board in client.get("/api/boards").json()
    ]


def test_board_routes_require_authentication(client: TestClient) -> None:
    assert client.get("/api/boards").status_code == 401
    assert client.post("/api/boards", json={"title": "Nope"}).status_code == 401
    assert client.get("/api/boards/board-user-1").status_code == 401
    assert client.patch(
        "/api/boards/board-user-1", json={"title": "Nope"}
    ).status_code == 401
    assert client.delete("/api/boards/board-user-1").status_code == 401


def test_each_user_keeps_their_own_boards(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.db"
    initialize_database(database_path)
    users = UserRepository(database_path)
    boards = BoardRepository(database_path)

    users.create_user("ada", "hunter2pass")
    users.create_user("grace", "hunter2pass")
    boards.create_board("ada", "Second")

    assert [board.title for board in boards.list_boards("ada")] == [
        "My board",
        "Second",
    ]
    assert [board.title for board in boards.list_boards("grace")] == ["My board"]
    assert boards.create_board("missing-user", "Nope") is None
    assert boards.rename_board("grace", boards.list_boards("ada")[0].id, "No") is False


def test_migration_upgrades_a_single_board_database(tmp_path: Path) -> None:
    database_path = tmp_path / "legacy.db"
    with closing(connect(database_path)) as connection, connection:
        connection.executescript(
            """
            CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE boards (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE columns (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL,
                title TEXT NOT NULL,
                position INTEGER NOT NULL CHECK (position >= 0),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (board_id, position),
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
            );

            CREATE TABLE cards (
                id TEXT PRIMARY KEY,
                column_id TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT NOT NULL DEFAULT '',
                position INTEGER NOT NULL CHECK (position >= 0),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (column_id, position),
                FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
            );

            INSERT INTO users (id, username, password_hash)
            VALUES ('user-1', 'user', 'pbkdf2_sha256$1$00$00');

            INSERT INTO boards (id, user_id, title)
            VALUES ('board-user-1', 'user-1', 'Kanban Studio');

            INSERT INTO columns (id, board_id, title, position)
            VALUES ('col-backlog', 'board-user-1', 'Backlog', 0);

            INSERT INTO cards (id, column_id, title, details, position)
            VALUES ('card-1', 'col-backlog', 'Existing card', 'Kept', 0);
            """
        )

    initialize_database(database_path)

    repository = BoardRepository(database_path)
    board = repository.get_board("user")
    assert board is not None
    assert board.cards["card-1"].title == "Existing card"

    # The old one-board-per-user constraint is gone.
    second = repository.create_board("user", "Second board")
    assert second is not None
    assert [summary.title for summary in repository.list_boards("user")] == [
        "Kanban Studio",
        "Second board",
    ]
