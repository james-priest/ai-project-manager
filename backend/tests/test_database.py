from pathlib import Path

import pytest

from backend.app.database import (
    BoardRepository,
    INITIAL_COLUMNS,
    INITIAL_CARDS,
    connect,
    initialize_database,
    password_hash,
)


def test_initialize_creates_and_seeds_a_fresh_database(tmp_path: Path) -> None:
    database_path = tmp_path / "nested" / "kanban.db"

    initialize_database(database_path)

    assert database_path.is_file()
    board = BoardRepository(database_path).get_board("user")
    assert board is not None
    assert [column.id for column in board.columns] == [
        column_id for column_id, _, _ in INITIAL_COLUMNS
    ]
    assert board.columns[0].cardIds == ["card-1", "card-2"]
    assert len(board.cards) == len(INITIAL_CARDS)

    initialize_database(database_path)
    seeded_again = BoardRepository(database_path).get_board("user")
    assert seeded_again == board


def test_repository_mutations_preserve_order_and_persist(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.db"
    initialize_database(database_path)
    repository = BoardRepository(database_path)

    assert repository.rename_column("user", "col-backlog", "Queue")
    card_id = repository.create_card("user", "col-backlog", "New card", "Notes")
    assert card_id is not None
    assert repository.update_card("user", card_id, "Updated card", "Updated notes")
    assert repository.move_card("user", card_id, "col-review", 0)

    board = repository.get_board("user")
    assert board is not None
    assert board.columns[0].title == "Queue"
    assert board.columns[0].cardIds == ["card-1", "card-2"]
    assert board.columns[3].cardIds == [card_id, "card-6"]
    assert board.cards[card_id].title == "Updated card"
    assert board.cards[card_id].details == "Updated notes"

    restarted_repository = BoardRepository(database_path)
    persisted_board = restarted_repository.get_board("user")
    assert persisted_board == board

    assert restarted_repository.delete_card("user", card_id)
    after_delete = restarted_repository.get_board("user")
    assert after_delete is not None
    assert card_id not in after_delete.cards
    assert after_delete.columns[3].cardIds == ["card-6"]


def test_repository_can_reorder_a_card_within_one_column(tmp_path: Path) -> None:
    database_path = tmp_path / "kanban.db"
    initialize_database(database_path)
    repository = BoardRepository(database_path)

    assert repository.move_card("user", "card-2", "col-backlog", 0)

    board = repository.get_board("user")
    assert board is not None
    assert board.columns[0].cardIds == ["card-2", "card-1"]


def test_repository_rejects_other_users_and_unknown_resources(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "kanban.db"
    initialize_database(database_path)
    repository = BoardRepository(database_path)

    with connect(database_path) as connection:
        connection.execute(
            "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
            ("user-2", "other", password_hash("different-password")),
        )
        connection.execute(
            "INSERT INTO boards (id, user_id, title) VALUES (?, ?, ?)",
            ("board-user-2", "user-2", "Other board"),
        )
        connection.execute(
            """
            INSERT INTO columns (id, board_id, title, position)
            VALUES (?, ?, ?, ?)
            """,
            ("other-column", "board-user-2", "Other column", 0),
        )
        connection.execute(
            """
            INSERT INTO cards (id, column_id, title, details, position)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("other-card", "other-column", "Other card", "", 0),
        )

    other_board = repository.get_board("other")
    assert other_board is not None
    assert "other-card" in other_board.cards
    assert repository.rename_column("other", "col-backlog", "No access") is False
    assert repository.create_card("other", "col-backlog", "No access", "") is None
    assert repository.rename_column("user", "other-column", "No access") is False
    assert repository.create_card("user", "other-column", "No access", "") is None
    assert repository.update_card("user", "other-card", "No access", "") is False
    assert repository.delete_card("user", "other-card") is False
    assert repository.move_card("user", "other-card", "col-done", 0) is False
    assert repository.update_card("user", "missing-card", "Title", "") is False
    assert repository.delete_card("user", "missing-card") is False
    assert repository.move_card("user", "missing-card", "col-done", 0) is False
    assert repository.move_card("user", "card-1", "missing-column", 0) is False


def test_failed_mutation_rolls_back_all_order_changes(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database_path = tmp_path / "kanban.db"
    initialize_database(database_path)
    repository = BoardRepository(database_path)
    before = repository.get_board("user")

    def fail_order_update(*_: object) -> None:
        raise RuntimeError("forced order update failure")

    monkeypatch.setattr(BoardRepository, "_set_card_order", fail_order_update)

    with pytest.raises(RuntimeError, match="forced order update failure"):
        repository.move_card("user", "card-1", "col-review", 0)

    assert repository.get_board("user") == before
