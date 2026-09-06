import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .schemas import BoardData

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "kanban.db"

INITIAL_COLUMNS = [
    ("col-backlog", "Backlog", 0),
    ("col-discovery", "Discovery", 1),
    ("col-progress", "In Progress", 2),
    ("col-review", "Review", 3),
    ("col-done", "Done", 4),
]

INITIAL_CARDS = [
    (
        "card-1",
        "col-backlog",
        "Align roadmap themes",
        "Draft quarterly themes with impact statements and metrics.",
        0,
    ),
    (
        "card-2",
        "col-backlog",
        "Gather customer signals",
        "Review support tags, sales notes, and churn feedback.",
        1,
    ),
    (
        "card-3",
        "col-discovery",
        "Prototype analytics view",
        "Sketch initial dashboard layout and key drill-downs.",
        0,
    ),
    (
        "card-4",
        "col-progress",
        "Refine status language",
        "Standardize column labels and tone across the board.",
        0,
    ),
    (
        "card-5",
        "col-progress",
        "Design card layout",
        "Add hierarchy and spacing for scanning dense lists.",
        1,
    ),
    (
        "card-6",
        "col-review",
        "QA micro-interactions",
        "Verify hover, focus, and loading states.",
        0,
    ),
    (
        "card-7",
        "col-done",
        "Ship marketing page",
        "Final copy approved and asset pack delivered.",
        0,
    ),
    (
        "card-8",
        "col-done",
        "Close onboarding sprint",
        "Document release notes and share internally.",
        1,
    ),
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def password_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return f"pbkdf2_sha256$100000${salt.hex()}${digest.hex()}"


def get_database_path() -> Path:
    return Path(os.getenv("DATABASE_PATH", str(DEFAULT_DATABASE_PATH)))


def connect(database_path: Path | None = None) -> sqlite3.Connection:
    path = database_path or get_database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(database_path: Path | None = None) -> None:
    with connect(database_path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS boards (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS columns (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL,
                title TEXT NOT NULL,
                position INTEGER NOT NULL CHECK (position >= 0),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (board_id, position),
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS cards (
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
            """
        )
        seed_initial_data(connection)


def seed_initial_data(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        INSERT INTO users (id, username, password_hash)
        VALUES (?, ?, ?)
        ON CONFLICT(username) DO NOTHING
        """,
        ("user-1", "user", password_hash("password")),
    )
    user = connection.execute(
        "SELECT id FROM users WHERE username = ?", ("user",)
    ).fetchone()
    if user is None:
        return

    connection.execute(
        """
        INSERT INTO boards (id, user_id, title)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO NOTHING
        """,
        ("board-user-1", user["id"], "Kanban Studio"),
    )
    board = connection.execute(
        "SELECT id FROM boards WHERE user_id = ?", (user["id"],)
    ).fetchone()
    if board is None:
        return

    has_columns = connection.execute(
        "SELECT 1 FROM columns WHERE board_id = ? LIMIT 1", (board["id"],)
    ).fetchone()
    if has_columns is not None:
        return

    connection.executemany(
        """
        INSERT INTO columns (id, board_id, title, position)
        VALUES (?, ?, ?, ?)
        """,
        [
            (column_id, board["id"], title, position)
            for column_id, title, position in INITIAL_COLUMNS
        ],
    )
    connection.executemany(
        """
        INSERT INTO cards (id, column_id, title, details, position)
        VALUES (?, ?, ?, ?, ?)
        """,
        INITIAL_CARDS,
    )


class BoardRepository:
    def __init__(self, database_path: Path | None = None) -> None:
        self.database_path = database_path or get_database_path()

    def initialize(self) -> None:
        initialize_database(self.database_path)

    def get_board(self, username: str) -> BoardData | None:
        with connect(self.database_path) as connection:
            board = self._get_board(connection, username)
            if board is None:
                return None

            columns = connection.execute(
                """
                SELECT id, title
                FROM columns
                WHERE board_id = ?
                ORDER BY position
                """,
                (board["id"],),
            ).fetchall()
            cards = connection.execute(
                """
                SELECT cards.id, cards.column_id, cards.title, cards.details
                FROM cards
                JOIN columns ON columns.id = cards.column_id
                WHERE columns.board_id = ?
                ORDER BY columns.position, cards.position
                """,
                (board["id"],),
            ).fetchall()

        card_ids_by_column = {column["id"]: [] for column in columns}
        card_data = {}
        for card in cards:
            card_ids_by_column[card["column_id"]].append(card["id"])
            card_data[card["id"]] = {
                "id": card["id"],
                "title": card["title"],
                "details": card["details"],
            }

        return BoardData(
            columns=[
                {
                    "id": column["id"],
                    "title": column["title"],
                    "cardIds": card_ids_by_column[column["id"]],
                }
                for column in columns
            ],
            cards=card_data,
        )

    def rename_column(self, username: str, column_id: str, title: str) -> bool:
        with connect(self.database_path) as connection:
            result = connection.execute(
                """
                UPDATE columns
                SET title = ?, updated_at = ?
                WHERE id = ?
                  AND board_id = (
                      SELECT boards.id
                      FROM boards
                      JOIN users ON users.id = boards.user_id
                      WHERE users.username = ?
                  )
                """,
                (title, utc_now(), column_id, username),
            )
            if result.rowcount == 1:
                self._touch_board_for_column(connection, column_id)
            return result.rowcount == 1

    def create_card(
        self,
        username: str,
        column_id: str,
        title: str,
        details: str,
    ) -> str | None:
        with connect(self.database_path) as connection:
            board = self._get_board(connection, username)
            if board is None or not self._column_belongs_to_board(
                connection, column_id, board["id"]
            ):
                return None

            card_id = f"card-{secrets.token_hex(8)}"
            card_ids = self._card_ids(connection, column_id)
            card_ids.append(card_id)
            connection.execute(
                """
                INSERT INTO cards (id, column_id, title, details, position)
                VALUES (?, ?, ?, ?, ?)
                """,
                (card_id, column_id, title, details, len(card_ids) - 1),
            )
            self._touch_board(connection, board["id"])
            return card_id

    def update_card(
        self,
        username: str,
        card_id: str,
        title: str,
        details: str,
    ) -> bool:
        with connect(self.database_path) as connection:
            result = connection.execute(
                """
                UPDATE cards
                SET title = ?, details = ?, updated_at = ?
                WHERE id = ?
                  AND column_id IN (
                      SELECT columns.id
                      FROM columns
                      JOIN boards ON boards.id = columns.board_id
                      JOIN users ON users.id = boards.user_id
                      WHERE users.username = ?
                  )
                """,
                (title, details, utc_now(), card_id, username),
            )
            if result.rowcount == 1:
                self._touch_board_for_card(connection, card_id)
            return result.rowcount == 1

    def delete_card(self, username: str, card_id: str) -> bool:
        with connect(self.database_path) as connection:
            card = connection.execute(
                """
                SELECT cards.column_id, boards.id AS board_id
                FROM cards
                JOIN columns ON columns.id = cards.column_id
                JOIN boards ON boards.id = columns.board_id
                JOIN users ON users.id = boards.user_id
                WHERE cards.id = ? AND users.username = ?
                """,
                (card_id, username),
            ).fetchone()
            if card is None:
                return False

            remaining_ids = [
                card_row["id"]
                for card_row in connection.execute(
                    """
                    SELECT id
                    FROM cards
                    WHERE column_id = ? AND id != ?
                    ORDER BY position
                    """,
                    (card["column_id"], card_id),
                ).fetchall()
            ]
            connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))
            self._set_card_order(connection, card["column_id"], remaining_ids)
            self._touch_board(connection, card["board_id"])
            return True

    def move_card(
        self,
        username: str,
        card_id: str,
        target_column_id: str,
        position: int,
    ) -> bool:
        with connect(self.database_path) as connection:
            card = connection.execute(
                """
                SELECT cards.column_id, boards.id AS board_id
                FROM cards
                JOIN columns ON columns.id = cards.column_id
                JOIN boards ON boards.id = columns.board_id
                JOIN users ON users.id = boards.user_id
                WHERE cards.id = ? AND users.username = ?
                """,
                (card_id, username),
            ).fetchone()
            if card is None or not self._column_belongs_to_board(
                connection, target_column_id, card["board_id"]
            ):
                return False

            source_column_id = card["column_id"]
            source_ids = self._card_ids(connection, source_column_id)
            source_ids.remove(card_id)
            target_ids = (
                source_ids
                if source_column_id == target_column_id
                else self._card_ids(connection, target_column_id)
            )
            insert_at = min(position, len(target_ids))
            target_ids.insert(insert_at, card_id)

            affected_columns = {source_column_id, target_column_id}
            self._offset_card_positions(connection, affected_columns)
            temporary_position = connection.execute(
                """
                SELECT COALESCE(MAX(position), 0) + 1
                FROM cards
                WHERE column_id IN (?, ?)
                """,
                (source_column_id, target_column_id),
            ).fetchone()[0]
            connection.execute(
                "UPDATE cards SET position = ? WHERE id = ?",
                (temporary_position, card_id),
            )
            connection.execute(
                "UPDATE cards SET column_id = ? WHERE id = ?",
                (target_column_id, card_id),
            )
            self._set_card_order(connection, source_column_id, source_ids)
            if target_column_id != source_column_id:
                self._set_card_order(connection, target_column_id, target_ids)
            else:
                self._set_card_order(connection, source_column_id, target_ids)
            self._touch_board(connection, card["board_id"])
            return True

    @staticmethod
    def _get_board(
        connection: sqlite3.Connection, username: str
    ) -> sqlite3.Row | None:
        return connection.execute(
            """
            SELECT boards.id
            FROM boards
            JOIN users ON users.id = boards.user_id
            WHERE users.username = ?
            """,
            (username,),
        ).fetchone()

    @staticmethod
    def _column_belongs_to_board(
        connection: sqlite3.Connection, column_id: str, board_id: str
    ) -> bool:
        return (
            connection.execute(
                "SELECT 1 FROM columns WHERE id = ? AND board_id = ?",
                (column_id, board_id),
            ).fetchone()
            is not None
        )

    @staticmethod
    def _card_ids(connection: sqlite3.Connection, column_id: str) -> list[str]:
        return [
            card["id"]
            for card in connection.execute(
                "SELECT id FROM cards WHERE column_id = ? ORDER BY position",
                (column_id,),
            ).fetchall()
        ]

    @staticmethod
    def _offset_card_positions(
        connection: sqlite3.Connection, column_ids: set[str]
    ) -> None:
        placeholders = ", ".join("?" for _ in column_ids)
        max_position = connection.execute(
            f"SELECT COALESCE(MAX(position), 0) FROM cards WHERE column_id IN ({placeholders})",
            tuple(column_ids),
        ).fetchone()[0]
        offset = max_position + 1000
        connection.execute(
            f"UPDATE cards SET position = position + ? WHERE column_id IN ({placeholders})",
            (offset, *column_ids),
        )

    @staticmethod
    def _set_card_order(
        connection: sqlite3.Connection, column_id: str, card_ids: list[str]
    ) -> None:
        for position, card_id in enumerate(card_ids):
            connection.execute(
                "UPDATE cards SET position = ?, updated_at = ? WHERE id = ?",
                (position, utc_now(), card_id),
            )

    @staticmethod
    def _touch_board(connection: sqlite3.Connection, board_id: str) -> None:
        connection.execute(
            "UPDATE boards SET updated_at = ? WHERE id = ?",
            (utc_now(), board_id),
        )

    @staticmethod
    def _touch_board_for_card(connection: sqlite3.Connection, card_id: str) -> None:
        connection.execute(
            """
            UPDATE boards
            SET updated_at = ?
            WHERE id = (
                SELECT boards.id
                FROM boards
                JOIN columns ON columns.board_id = boards.id
                JOIN cards ON cards.column_id = columns.id
                WHERE cards.id = ?
            )
            """,
            (utc_now(), card_id),
        )

    @staticmethod
    def _touch_board_for_column(
        connection: sqlite3.Connection, column_id: str
    ) -> None:
        connection.execute(
            """
            UPDATE boards
            SET updated_at = ?
            WHERE id = (SELECT board_id FROM columns WHERE id = ?)
            """,
            (utc_now(), column_id),
        )
