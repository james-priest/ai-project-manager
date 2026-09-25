import hashlib
import hmac
import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .config import get_database_path
from .schemas import (
    BOARD_TEMPLATES,
    ActivityEntry,
    AddChecklistOperation,
    AssignedCard,
    DeleteCardOperation,
    BoardData,
    BoardMember,
    BoardSummary,
    ChecklistItem,
    CommentData,
    LabelData,
    BoardOperation,
    CardData,
    ColumnData,
    CreateCardOperation,
    EditCardOperation,
    MoveCardOperation,
)

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


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = stored_hash.split("$")
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    computed = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations)
    )
    return hmac.compare_digest(computed.hex(), digest_hex)


def get_user_password_hash(
    username: str, database_path: Path | None = None
) -> str | None:
    with closing(connect(database_path)) as connection, connection:
        row = connection.execute(
            "SELECT password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        return row["password_hash"] if row else None


def connect(database_path: Path | None = None) -> sqlite3.Connection:
    # Callers use this inside `with closing(...)` so the handle is released;
    # sqlite3's own context manager only commits or rolls back.
    path = database_path or get_database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database(database_path: Path | None = None) -> None:
    with closing(connect(database_path)) as connection, connection:
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
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
                archived_at TEXT,
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
                due_date TEXT,
                assignee TEXT NOT NULL DEFAULT '',
                position INTEGER NOT NULL CHECK (position >= 0),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (column_id, position),
                FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS board_members (
                board_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'editor'
                    CHECK (role IN ('owner', 'editor')),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (board_id, user_id),
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS checklist_items (
                id TEXT PRIMARY KEY,
                card_id TEXT NOT NULL,
                text TEXT NOT NULL,
                done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
                position INTEGER NOT NULL CHECK (position >= 0),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS card_comments (
                id TEXT PRIMARY KEY,
                card_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                body TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS activities (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL,
                user_id TEXT,
                summary TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS labels (
                id TEXT PRIMARY KEY,
                board_id TEXT NOT NULL,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT 'blue',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (board_id, name),
                FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS card_labels (
                card_id TEXT NOT NULL,
                label_id TEXT NOT NULL,
                PRIMARY KEY (card_id, label_id),
                FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
                FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        migrate_database(connection)
        seed_initial_data(connection)


def migrate_database(connection: sqlite3.Connection) -> None:
    """Bring a database created by an earlier schema up to date."""
    boards_sql = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'boards'"
    ).fetchone()
    if boards_sql is None:
        return

    if "user_id TEXT NOT NULL UNIQUE" in boards_sql["sql"]:
        # SQLite cannot drop a constraint, so rebuild the table without it.
        # Child rows in columns/cards point at boards, so foreign keys have to
        # be off while the parent table is swapped (and off means outside a
        # transaction, which executescript's implicit commit gives us).
        connection.execute("PRAGMA foreign_keys = OFF")
        connection.executescript(
            """
            CREATE TABLE boards_migrated (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
                archived_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            INSERT INTO boards_migrated (id, user_id, title, created_at, updated_at)
            SELECT id, user_id, title, created_at, updated_at FROM boards;

            DROP TABLE boards;
            ALTER TABLE boards_migrated RENAME TO boards;
            """
        )
        connection.execute("PRAGMA foreign_keys = ON")
        _migrate_card_columns(connection)
        _backfill_board_members(connection)
        return

    columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(boards)").fetchall()
    }
    if "position" not in columns:
        connection.execute(
            "ALTER TABLE boards ADD COLUMN position INTEGER NOT NULL DEFAULT 0"
        )
    if "archived_at" not in columns:
        connection.execute("ALTER TABLE boards ADD COLUMN archived_at TEXT")

    _migrate_card_columns(connection)
    _backfill_board_members(connection)


def _backfill_board_members(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        INSERT INTO board_members (board_id, user_id, role, created_at)
        SELECT boards.id, boards.user_id, 'owner', ?
        FROM boards
        WHERE NOT EXISTS (
            SELECT 1 FROM board_members
            WHERE board_members.board_id = boards.id
              AND board_members.user_id = boards.user_id
        )
        """,
        (utc_now(),),
    )


def _migrate_card_columns(connection: sqlite3.Connection) -> None:
    card_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(cards)").fetchall()
    }
    if "due_date" not in card_columns:
        connection.execute("ALTER TABLE cards ADD COLUMN due_date TEXT")
    if "assignee" not in card_columns:
        connection.execute(
            "ALTER TABLE cards ADD COLUMN assignee TEXT NOT NULL DEFAULT ''"
        )


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
        INSERT INTO boards (id, user_id, title, position)
        VALUES (?, ?, ?, 0)
        ON CONFLICT(id) DO NOTHING
        """,
        ("board-user-1", user["id"], "Kanban Studio"),
    )
    board = connection.execute(
        "SELECT id FROM boards WHERE id = ?", ("board-user-1",)
    ).fetchone()
    if board is None:
        return

    connection.execute(
        """
        INSERT INTO board_members (board_id, user_id, role, created_at)
        VALUES (?, ?, 'owner', ?)
        ON CONFLICT(board_id, user_id) DO NOTHING
        """,
        (board["id"], user["id"], utc_now()),
    )

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


class UserExistsError(ValueError):
    """Raised when a username is already registered."""


DEFAULT_BOARD_TITLE = "My board"


class UserRepository:
    def __init__(self, database_path: Path | None = None) -> None:
        self.database_path = database_path or get_database_path()

    def create_user(self, username: str, password: str) -> str:
        """Create a user with a starter board. Returns the new user id."""
        with closing(connect(self.database_path)) as connection, connection:
            existing = connection.execute(
                "SELECT 1 FROM users WHERE username = ?", (username,)
            ).fetchone()
            if existing is not None:
                raise UserExistsError("That username is already taken.")

            user_id = f"user-{secrets.token_hex(8)}"
            connection.execute(
                """
                INSERT INTO users (id, username, password_hash, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (user_id, username, password_hash(password), utc_now()),
            )
            _insert_board(connection, user_id, DEFAULT_BOARD_TITLE, 0)
            return user_id

    def authenticate(self, username: str, password: str) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            row = connection.execute(
                "SELECT password_hash FROM users WHERE username = ?", (username,)
            ).fetchone()
        return row is not None and verify_password(password, row["password_hash"])


class SessionRepository:
    """Sessions live in SQLite so they survive a restart."""

    def __init__(self, database_path: Path | None = None) -> None:
        self.database_path = database_path or get_database_path()

    def create(self, username: str, max_age_seconds: int) -> str | None:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=max_age_seconds)
        with closing(connect(self.database_path)) as connection, connection:
            user = connection.execute(
                "SELECT id FROM users WHERE username = ?", (username,)
            ).fetchone()
            if user is None:
                return None

            connection.execute(
                "DELETE FROM sessions WHERE expires_at <= ?", (utc_now(),)
            )
            session_id = secrets.token_urlsafe(32)
            connection.execute(
                """
                INSERT INTO sessions (id, user_id, expires_at, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (session_id, user["id"], expires_at.isoformat(), utc_now()),
            )
            return session_id

    def get_username(self, session_id: str) -> str | None:
        with closing(connect(self.database_path)) as connection, connection:
            row = connection.execute(
                """
                SELECT users.username, sessions.expires_at
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.id = ?
                """,
                (session_id,),
            ).fetchone()
            if row is None:
                return None
            if row["expires_at"] <= utc_now():
                connection.execute(
                    "DELETE FROM sessions WHERE id = ?", (session_id,)
                )
                return None
            return row["username"]

    def delete(self, session_id: str) -> None:
        with closing(connect(self.database_path)) as connection, connection:
            connection.execute("DELETE FROM sessions WHERE id = ?", (session_id,))


def _insert_board(
    connection: sqlite3.Connection,
    user_id: str,
    title: str,
    position: int,
    template: str = "kanban",
) -> str:
    board_id = f"board-{secrets.token_hex(8)}"
    connection.execute(
        """
        INSERT INTO boards (id, user_id, title, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (board_id, user_id, title, position, utc_now(), utc_now()),
    )
    connection.execute(
        """
        INSERT INTO board_members (board_id, user_id, role, created_at)
        VALUES (?, ?, 'owner', ?)
        """,
        (board_id, user_id, utc_now()),
    )
    connection.executemany(
        """
        INSERT INTO columns (id, board_id, title, position)
        VALUES (?, ?, ?, ?)
        """,
        [
            (f"col-{secrets.token_hex(8)}", board_id, column_title, index)
            for index, column_title in enumerate(BOARD_TEMPLATES[template])
        ],
    )
    return board_id


class BoardOperationError(ValueError):
    """Raised when a batch contains an invalid board operation."""


class BoardRepository:
    def __init__(self, database_path: Path | None = None) -> None:
        self.database_path = database_path or get_database_path()

    def initialize(self) -> None:
        initialize_database(self.database_path)

    def list_boards(
        self, username: str, include_archived: bool = False
    ) -> list[BoardSummary]:
        with closing(connect(self.database_path)) as connection, connection:
            rows = connection.execute(
                """
                SELECT boards.id, boards.title, boards.updated_at,
                       board_members.role AS role,
                       boards.archived_at AS archived_at,
                       COUNT(DISTINCT cards.id) AS card_count,
                       (
                           SELECT COUNT(*)
                           FROM board_members AS all_members
                           WHERE all_members.board_id = boards.id
                       ) AS member_count
                FROM boards
                JOIN board_members ON board_members.board_id = boards.id
                JOIN users ON users.id = board_members.user_id
                LEFT JOIN columns ON columns.board_id = boards.id
                LEFT JOIN cards ON cards.column_id = columns.id
                WHERE users.username = ?
                  AND (boards.archived_at IS NULL OR ?)
                GROUP BY boards.id
                ORDER BY boards.position, boards.created_at
                """,
                (username, include_archived),
            ).fetchall()
        return [
            BoardSummary(
                id=row["id"],
                title=row["title"],
                cardCount=row["card_count"],
                updatedAt=row["updated_at"],
                role=row["role"],
                memberCount=row["member_count"],
                archived=row["archived_at"] is not None,
            )
            for row in rows
        ]

    def create_board(
        self, username: str, title: str, template: str = "kanban"
    ) -> BoardSummary | None:
        with closing(connect(self.database_path)) as connection, connection:
            user = connection.execute(
                "SELECT id FROM users WHERE username = ?", (username,)
            ).fetchone()
            if user is None:
                return None

            next_position = connection.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM boards WHERE user_id = ?",
                (user["id"],),
            ).fetchone()[0]
            board_id = _insert_board(
                connection, user["id"], title, next_position, template
            )
            return BoardSummary(
                id=board_id, title=title, cardCount=0, updatedAt=utc_now()
            )

    def rename_board(self, username: str, board_id: str, title: str) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            result = connection.execute(
                """
                UPDATE boards
                SET title = ?, updated_at = ?
                WHERE id = ?
                  AND user_id = (SELECT id FROM users WHERE username = ?)
                """,
                (title, utc_now(), board_id, username),
            )
            if result.rowcount == 1:
                self._record_activity(
                    connection, board_id, username, f'renamed the board to "{title}"'
                )
            return result.rowcount == 1

    def delete_board(self, username: str, board_id: str) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            owned = connection.execute(
                """
                SELECT boards.id
                FROM boards
                JOIN board_members ON board_members.board_id = boards.id
                JOIN users ON users.id = board_members.user_id
                WHERE boards.id = ? AND users.username = ?
                  AND board_members.role = 'owner'
                """,
                (board_id, username),
            ).fetchone()
            if owned is None:
                return False

            # A user always keeps at least one board to land on.
            remaining = connection.execute(
                """
                SELECT COUNT(*)
                FROM boards
                JOIN board_members ON board_members.board_id = boards.id
                JOIN users ON users.id = board_members.user_id
                WHERE users.username = ?
                """,
                (username,),
            ).fetchone()[0]
            if remaining <= 1:
                return False

            connection.execute("DELETE FROM boards WHERE id = ?", (board_id,))
            return True

    def set_board_archived(
        self, username: str, board_id: str, archived: bool
    ) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            if self._board_role(connection, username, board_id) != "owner":
                return False

            connection.execute(
                "UPDATE boards SET archived_at = ?, updated_at = ? WHERE id = ?",
                (utc_now() if archived else None, utc_now(), board_id),
            )
            self._record_activity(
                connection,
                board_id,
                username,
                "archived the board" if archived else "restored the board",
            )
            return True

    def create_column(
        self, username: str, board_id: str, title: str
    ) -> ColumnData | None:
        with closing(connect(self.database_path)) as connection, connection:
            if self._get_board(connection, username, board_id) is None:
                return None

            next_position = connection.execute(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM columns WHERE board_id = ?",
                (board_id,),
            ).fetchone()[0]
            column_id = f"col-{secrets.token_hex(8)}"
            connection.execute(
                """
                INSERT INTO columns (id, board_id, title, position)
                VALUES (?, ?, ?, ?)
                """,
                (column_id, board_id, title, next_position),
            )
            self._record_activity(
                connection, board_id, username, f'added the column "{title}"'
            )
            self._touch_board(connection, board_id)
            return ColumnData(id=column_id, title=title, cardIds=[])

    def delete_column(self, username: str, column_id: str) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            board_id = self._column_board_id(connection, username, column_id)
            if board_id is None:
                return False

            remaining = connection.execute(
                "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
                (board_id,),
            ).fetchall()
            # A board always keeps one column so cards have somewhere to live.
            if len(remaining) <= 1:
                raise BoardOperationError(
                    "A board needs at least one column."
                )

            title = next(
                row["title"] for row in remaining if row["id"] == column_id
            )
            connection.execute("DELETE FROM columns WHERE id = ?", (column_id,))
            self._set_column_order(
                connection,
                [row["id"] for row in remaining if row["id"] != column_id],
            )
            self._record_activity(
                connection, board_id, username, f'deleted the column "{title}"'
            )
            self._touch_board(connection, board_id)
            return True

    def move_column(self, username: str, column_id: str, position: int) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            board_id = self._column_board_id(connection, username, column_id)
            if board_id is None:
                return False

            column_ids = [
                row["id"]
                for row in connection.execute(
                    "SELECT id FROM columns WHERE board_id = ? ORDER BY position",
                    (board_id,),
                ).fetchall()
            ]
            if position >= len(column_ids):
                raise BoardOperationError("Invalid column position")

            column_ids.remove(column_id)
            column_ids.insert(position, column_id)
            self._set_column_order(connection, column_ids)
            title = connection.execute(
                "SELECT title FROM columns WHERE id = ?", (column_id,)
            ).fetchone()["title"]
            self._record_activity(
                connection, board_id, username, f'reordered the column "{title}"'
            )
            self._touch_board(connection, board_id)
            return True

    @staticmethod
    def _set_column_order(
        connection: sqlite3.Connection, column_ids: list[str]
    ) -> None:
        # Park the columns first so UNIQUE(board_id, position) never collides.
        offset = connection.execute(
            "SELECT COALESCE(MAX(position), 0) + 1000 FROM columns"
        ).fetchone()[0]
        for column_id in column_ids:
            connection.execute(
                "UPDATE columns SET position = position + ? WHERE id = ?",
                (offset, column_id),
            )
        for position, column_id in enumerate(column_ids):
            connection.execute(
                "UPDATE columns SET position = ?, updated_at = ? WHERE id = ?",
                (position, utc_now(), column_id),
            )

    def get_board_by_id(self, username: str, board_id: str) -> BoardData | None:
        with closing(connect(self.database_path)) as connection, connection:
            board = connection.execute(
                """
                SELECT boards.id
                FROM boards
                JOIN board_members ON board_members.board_id = boards.id
                JOIN users ON users.id = board_members.user_id
                WHERE boards.id = ? AND users.username = ?
                """,
                (board_id, username),
            ).fetchone()
            if board is None:
                return None
            return self._board_data(connection, board)

    def get_board(self, username: str) -> BoardData | None:
        with closing(connect(self.database_path)) as connection, connection:
            board = self._get_board(connection, username)
            if board is None:
                return None

            return self._board_data(connection, board)

    def apply_operations(
        self,
        username: str,
        operations: list[BoardOperation],
        board_id: str | None = None,
    ) -> BoardData | None:
        with closing(connect(self.database_path)) as connection, connection:
            board = self._get_board(connection, username, board_id)
            if board is None:
                return None

            current_board = self._board_data(connection, board)
            if not operations:
                return current_board

            column_card_ids = {
                column.id: list(column.cardIds)
                for column in current_board.columns
            }
            cards = dict(current_board.cards)
            created_card_ids: list[str] = []
            deleted_card_ids: list[str] = []
            checklist_additions: list[tuple[str, list[str]]] = []
            known_label_ids = set(current_board.labels)

            def checked_label_ids(label_ids: list[str]) -> list[str]:
                unknown = [
                    label_id
                    for label_id in label_ids
                    if label_id not in known_label_ids
                ]
                if unknown:
                    raise BoardOperationError("Unknown label for this board")
                return list(dict.fromkeys(label_ids))

            for operation in operations:
                if isinstance(operation, CreateCardOperation):
                    if operation.column_id not in column_card_ids:
                        raise BoardOperationError("Column not found")
                    card_ids = column_card_ids[operation.column_id]

                    card_id = f"card-{secrets.token_hex(8)}"
                    self._insert_card_at_position(
                        card_ids, card_id, operation.position
                    )
                    cards[card_id] = CardData(
                        id=card_id,
                        title=operation.title,
                        details=operation.details,
                        dueDate=operation.due_date,
                        assignee=operation.assignee,
                        labelIds=checked_label_ids(operation.label_ids),
                    )
                    created_card_ids.append(card_id)
                    continue

                if isinstance(operation, EditCardOperation):
                    if operation.card_id not in cards:
                        raise BoardOperationError("Card not found")
                    existing_card = cards[operation.card_id]
                    provided = operation.model_fields_set
                    cards[operation.card_id] = CardData(
                        id=existing_card.id,
                        title=operation.title,
                        details=operation.details,
                        dueDate=(
                            operation.due_date
                            if "due_date" in provided
                            else existing_card.dueDate
                        ),
                        assignee=(
                            operation.assignee or ""
                            if "assignee" in provided
                            else existing_card.assignee
                        ),
                        labelIds=(
                            checked_label_ids(operation.label_ids or [])
                            if "label_ids" in provided
                            else existing_card.labelIds
                        ),
                        commentCount=existing_card.commentCount,
                    )
                    continue

                if isinstance(operation, AddChecklistOperation):
                    if operation.card_id not in cards:
                        raise BoardOperationError("Card not found")
                    checklist_additions.append(
                        (operation.card_id, operation.steps)
                    )
                    continue

                if isinstance(operation, DeleteCardOperation):
                    if operation.card_id not in cards:
                        raise BoardOperationError("Card not found")
                    for card_ids in column_card_ids.values():
                        if operation.card_id in card_ids:
                            card_ids.remove(operation.card_id)
                    cards.pop(operation.card_id)
                    if operation.card_id in created_card_ids:
                        created_card_ids.remove(operation.card_id)
                    else:
                        deleted_card_ids.append(operation.card_id)
                    continue

                if isinstance(operation, MoveCardOperation):
                    if operation.target_column_id not in column_card_ids:
                        raise BoardOperationError("Column not found")

                    source_column_id = next(
                        (
                            column_id
                            for column_id, card_ids in column_card_ids.items()
                            if operation.card_id in card_ids
                        ),
                        None,
                    )
                    if source_column_id is None:
                        raise BoardOperationError("Card not found")

                    self._move_card_id(
                        column_card_ids[source_column_id],
                        column_card_ids[operation.target_column_id],
                        operation.card_id,
                        operation.position,
                    )
                    continue

                raise BoardOperationError("Unsupported board operation")

            self._persist_board_state(
                connection,
                board["id"],
                current_board,
                column_card_ids,
                cards,
                created_card_ids,
                deleted_card_ids,
            )

            for card_id, steps in checklist_additions:
                self._append_checklist_items(connection, card_id, steps)

            for summary in self._assistant_activity(
                current_board, cards, created_card_ids, deleted_card_ids, operations
            ):
                self._record_activity(connection, board["id"], username, summary)

        updated_board = (
            self.get_board_by_id(username, board_id)
            if board_id
            else self.get_board(username)
        )
        if updated_board is None:
            raise BoardOperationError("Board not found")
        return updated_board

    @staticmethod
    def _board_data(
        connection: sqlite3.Connection, board: sqlite3.Row
    ) -> BoardData:
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
            SELECT cards.id, cards.column_id, cards.title, cards.details,
                   cards.due_date, cards.assignee
            FROM cards
            JOIN columns ON columns.id = cards.column_id
            WHERE columns.board_id = ?
            ORDER BY columns.position, cards.position
            """,
            (board["id"],),
        ).fetchall()
        labels = connection.execute(
            """
            SELECT id, name, color
            FROM labels
            WHERE board_id = ?
            ORDER BY name
            """,
            (board["id"],),
        ).fetchall()
        comment_counts = {
            row["card_id"]: row["total"]
            for row in connection.execute(
                """
                SELECT card_comments.card_id, COUNT(*) AS total
                FROM card_comments
                JOIN cards ON cards.id = card_comments.card_id
                JOIN columns ON columns.id = cards.column_id
                WHERE columns.board_id = ?
                GROUP BY card_comments.card_id
                """,
                (board["id"],),
            ).fetchall()
        }
        checklist_progress = {
            row["card_id"]: (row["done"], row["total"])
            for row in connection.execute(
                """
                SELECT checklist_items.card_id,
                       SUM(checklist_items.done) AS done,
                       COUNT(*) AS total
                FROM checklist_items
                JOIN cards ON cards.id = checklist_items.card_id
                JOIN columns ON columns.id = cards.column_id
                WHERE columns.board_id = ?
                GROUP BY checklist_items.card_id
                """,
                (board["id"],),
            ).fetchall()
        }
        card_label_rows = connection.execute(
            """
            SELECT card_labels.card_id, card_labels.label_id
            FROM card_labels
            JOIN labels ON labels.id = card_labels.label_id
            WHERE labels.board_id = ?
            ORDER BY labels.name
            """,
            (board["id"],),
        ).fetchall()

        label_ids_by_card: dict[str, list[str]] = {}
        for row in card_label_rows:
            label_ids_by_card.setdefault(row["card_id"], []).append(row["label_id"])

        card_ids_by_column = {column["id"]: [] for column in columns}
        card_data = {}
        for card in cards:
            card_ids_by_column[card["column_id"]].append(card["id"])
            card_data[card["id"]] = CardData(
                id=card["id"],
                title=card["title"],
                details=card["details"],
                dueDate=card["due_date"],
                assignee=card["assignee"],
                labelIds=label_ids_by_card.get(card["id"], []),
                commentCount=comment_counts.get(card["id"], 0),
                checklistDone=checklist_progress.get(card["id"], (0, 0))[0],
                checklistTotal=checklist_progress.get(card["id"], (0, 0))[1],
            )

        return BoardData(
            columns=[
                ColumnData(
                    id=column["id"],
                    title=column["title"],
                    cardIds=card_ids_by_column[column["id"]],
                )
                for column in columns
            ],
            cards=card_data,
            labels={
                label["id"]: LabelData(
                    id=label["id"], name=label["name"], color=label["color"]
                )
                for label in labels
            },
        )

    @staticmethod
    def _persist_board_state(
        connection: sqlite3.Connection,
        board_id: str,
        current_board: BoardData,
        column_card_ids: dict[str, list[str]],
        cards: dict[str, CardData],
        created_card_ids: list[str],
        deleted_card_ids: list[str] | None = None,
    ) -> None:
        for card_id in deleted_card_ids or []:
            connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))

        current_placement = {
            card_id: (column.id, position)
            for column in current_board.columns
            for position, card_id in enumerate(column.cardIds)
        }
        next_placement = {
            card_id: (column_id, position)
            for column_id, card_ids in column_card_ids.items()
            for position, card_id in enumerate(card_ids)
        }

        # Move the cards that change place out of the way first, so the
        # UNIQUE(column_id, position) index never sees a transient collision.
        moved_ids = [
            card_id
            for card_id, placement in next_placement.items()
            if card_id not in created_card_ids
            and current_placement[card_id] != placement
        ]
        BoardRepository._park_card_positions(connection, moved_ids)

        for card_id, (column_id, position) in next_placement.items():
            card = cards[card_id]
            if card_id in created_card_ids:
                connection.execute(
                    """
                    INSERT INTO cards
                        (id, column_id, title, details, due_date, assignee,
                         position)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        card.id,
                        column_id,
                        card.title,
                        card.details,
                        card.dueDate,
                        card.assignee,
                        position,
                    ),
                )
                BoardRepository._set_card_labels(
                    connection, card.id, card.labelIds
                )
                continue

            # Leave untouched cards, and their updated_at, alone.
            if (
                card_id not in moved_ids
                and card == current_board.cards[card_id]
            ):
                continue

            connection.execute(
                """
                UPDATE cards
                SET column_id = ?, title = ?, details = ?, due_date = ?,
                    assignee = ?, position = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    column_id,
                    card.title,
                    card.details,
                    card.dueDate,
                    card.assignee,
                    position,
                    utc_now(),
                    card_id,
                ),
            )
            if card.labelIds != current_board.cards[card_id].labelIds:
                BoardRepository._set_card_labels(
                    connection, card_id, card.labelIds
                )

        BoardRepository._touch_board(connection, board_id)

    def rename_column(self, username: str, column_id: str, title: str) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            result = connection.execute(
                """
                UPDATE columns
                SET title = ?, updated_at = ?
                WHERE id = ?
                  AND board_id = (
                      SELECT boards.id
                      FROM boards
                      JOIN board_members ON board_members.board_id = boards.id
                JOIN users ON users.id = board_members.user_id
                      WHERE users.username = ?
                  )
                """,
                (title, utc_now(), column_id, username),
            )
            if result.rowcount == 1:
                board = connection.execute(
                    "SELECT board_id FROM columns WHERE id = ?", (column_id,)
                ).fetchone()
                self._record_activity(
                    connection,
                    board["board_id"],
                    username,
                    f'renamed a column to "{title}"',
                )
                self._touch_board_for_column(connection, column_id)
            return result.rowcount == 1

    def create_card(
        self,
        username: str,
        column_id: str,
        title: str,
        details: str,
        due_date: str | None = None,
        assignee: str = "",
        label_ids: list[str] | None = None,
    ) -> str | None:
        with closing(connect(self.database_path)) as connection, connection:
            board_id = self._column_board_id(connection, username, column_id)
            if board_id is None:
                return None

            card_id = f"card-{secrets.token_hex(8)}"
            card_ids = self._card_ids(connection, column_id)
            card_ids.append(card_id)
            connection.execute(
                """
                INSERT INTO cards
                    (id, column_id, title, details, due_date, assignee, position)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    card_id,
                    column_id,
                    title,
                    details,
                    due_date,
                    assignee,
                    len(card_ids) - 1,
                ),
            )
            self._set_card_labels(connection, card_id, label_ids or [])
            self._record_activity(connection, board_id, username, f'added "{title}"')
            self._touch_board(connection, board_id)
            return card_id

    def update_card(
        self,
        username: str,
        card_id: str,
        title: str,
        details: str,
        due_date: str | None = None,
        assignee: str = "",
        label_ids: list[str] | None = None,
    ) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            result = connection.execute(
                """
                UPDATE cards
                SET title = ?, details = ?, due_date = ?, assignee = ?,
                    updated_at = ?
                WHERE id = ?
                  AND column_id IN (
                      SELECT columns.id
                      FROM columns
                      JOIN boards ON boards.id = columns.board_id
                      JOIN board_members ON board_members.board_id = boards.id
                JOIN users ON users.id = board_members.user_id
                      WHERE users.username = ?
                  )
                """,
                (title, details, due_date, assignee, utc_now(), card_id, username),
            )
            if result.rowcount == 1:
                self._set_card_labels(connection, card_id, label_ids or [])
                board_id = self._card_board_id(connection, username, card_id)
                if board_id:
                    self._record_activity(
                        connection, board_id, username, f'updated "{title}"'
                    )
                self._touch_board_for_card(connection, card_id)
            return result.rowcount == 1

    def create_label(
        self, username: str, board_id: str, name: str, color: str
    ) -> LabelData | None:
        with closing(connect(self.database_path)) as connection, connection:
            board = self._get_board(connection, username, board_id)
            if board is None:
                return None

            existing = connection.execute(
                "SELECT id, name, color FROM labels WHERE board_id = ? AND name = ?",
                (board_id, name),
            ).fetchone()
            if existing is not None:
                raise BoardOperationError("That label already exists on this board.")

            label_id = f"label-{secrets.token_hex(8)}"
            connection.execute(
                """
                INSERT INTO labels (id, board_id, name, color, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (label_id, board_id, name, color, utc_now()),
            )
            return LabelData(id=label_id, name=name, color=color)

    def delete_label(self, username: str, board_id: str, label_id: str) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            result = connection.execute(
                """
                DELETE FROM labels
                WHERE id = ?
                  AND board_id = (
                      SELECT boards.id
                      FROM boards
                      JOIN board_members ON board_members.board_id = boards.id
                JOIN users ON users.id = board_members.user_id
                      WHERE boards.id = ? AND users.username = ?
                  )
                """,
                (label_id, board_id, username),
            )
            return result.rowcount == 1

    def list_members(self, username: str, board_id: str) -> list[BoardMember] | None:
        with closing(connect(self.database_path)) as connection, connection:
            if self._get_board(connection, username, board_id) is None:
                return None

            rows = connection.execute(
                """
                SELECT users.username, board_members.role
                FROM board_members
                JOIN users ON users.id = board_members.user_id
                WHERE board_members.board_id = ?
                ORDER BY
                    CASE board_members.role WHEN 'owner' THEN 0 ELSE 1 END,
                    users.username
                """,
                (board_id,),
            ).fetchall()
        return [
            BoardMember(username=row["username"], role=row["role"]) for row in rows
        ]

    def add_member(
        self, username: str, board_id: str, new_member: str
    ) -> BoardMember | None:
        with closing(connect(self.database_path)) as connection, connection:
            if self._board_role(connection, username, board_id) != "owner":
                return None

            user = connection.execute(
                "SELECT id FROM users WHERE username = ?", (new_member,)
            ).fetchone()
            if user is None:
                raise BoardOperationError("That user does not exist.")

            existing = connection.execute(
                "SELECT 1 FROM board_members WHERE board_id = ? AND user_id = ?",
                (board_id, user["id"]),
            ).fetchone()
            if existing is not None:
                raise BoardOperationError("That user is already on this board.")

            connection.execute(
                """
                INSERT INTO board_members (board_id, user_id, role, created_at)
                VALUES (?, ?, 'editor', ?)
                """,
                (board_id, user["id"], utc_now()),
            )
            self._record_activity(
                connection, board_id, username, f"shared the board with {new_member}"
            )
            return BoardMember(username=new_member, role="editor")

    def remove_member(self, username: str, board_id: str, member: str) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            role = self._board_role(connection, username, board_id)
            # Owners can remove anyone but themselves; members can leave.
            if role is None or (role != "owner" and member != username):
                return False

            result = connection.execute(
                """
                DELETE FROM board_members
                WHERE board_id = ?
                  AND role != 'owner'
                  AND user_id = (SELECT id FROM users WHERE username = ?)
                """,
                (board_id, member),
            )
            if result.rowcount == 1:
                self._record_activity(
                    connection, board_id, username, f"removed {member} from the board"
                )
            return result.rowcount == 1

    def list_checklist(
        self, username: str, card_id: str
    ) -> list[ChecklistItem] | None:
        with closing(connect(self.database_path)) as connection, connection:
            if self._card_board_id(connection, username, card_id) is None:
                return None
            return self._checklist_items(connection, card_id)

    def add_checklist_item(
        self, username: str, card_id: str, text: str
    ) -> ChecklistItem | None:
        with closing(connect(self.database_path)) as connection, connection:
            if self._card_board_id(connection, username, card_id) is None:
                return None

            next_position = connection.execute(
                """
                SELECT COALESCE(MAX(position), -1) + 1
                FROM checklist_items
                WHERE card_id = ?
                """,
                (card_id,),
            ).fetchone()[0]
            item_id = f"check-{secrets.token_hex(8)}"
            connection.execute(
                """
                INSERT INTO checklist_items
                    (id, card_id, text, done, position, created_at)
                VALUES (?, ?, ?, 0, ?, ?)
                """,
                (item_id, card_id, text, next_position, utc_now()),
            )
            return ChecklistItem(id=item_id, text=text, done=False)

    def set_checklist_item_done(
        self, username: str, item_id: str, done: bool
    ) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            if self._checklist_item_card_id(connection, username, item_id) is None:
                return False

            connection.execute(
                "UPDATE checklist_items SET done = ? WHERE id = ?",
                (1 if done else 0, item_id),
            )
            return True

    def delete_checklist_item(self, username: str, item_id: str) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            if self._checklist_item_card_id(connection, username, item_id) is None:
                return False

            connection.execute(
                "DELETE FROM checklist_items WHERE id = ?", (item_id,)
            )
            return True

    @staticmethod
    def _append_checklist_items(
        connection: sqlite3.Connection, card_id: str, steps: list[str]
    ) -> None:
        next_position = connection.execute(
            """
            SELECT COALESCE(MAX(position), -1) + 1
            FROM checklist_items
            WHERE card_id = ?
            """,
            (card_id,),
        ).fetchone()[0]
        connection.executemany(
            """
            INSERT INTO checklist_items
                (id, card_id, text, done, position, created_at)
            VALUES (?, ?, ?, 0, ?, ?)
            """,
            [
                (
                    f"check-{secrets.token_hex(8)}",
                    card_id,
                    step,
                    next_position + offset,
                    utc_now(),
                )
                for offset, step in enumerate(steps)
            ],
        )

    @staticmethod
    def _checklist_items(
        connection: sqlite3.Connection, card_id: str
    ) -> list[ChecklistItem]:
        return [
            ChecklistItem(
                id=row["id"], text=row["text"], done=bool(row["done"])
            )
            for row in connection.execute(
                """
                SELECT id, text, done
                FROM checklist_items
                WHERE card_id = ?
                ORDER BY position
                """,
                (card_id,),
            ).fetchall()
        ]

    @staticmethod
    def _checklist_item_card_id(
        connection: sqlite3.Connection, username: str, item_id: str
    ) -> str | None:
        row = connection.execute(
            """
            SELECT checklist_items.card_id
            FROM checklist_items
            JOIN cards ON cards.id = checklist_items.card_id
            JOIN columns ON columns.id = cards.column_id
            JOIN boards ON boards.id = columns.board_id
            JOIN board_members ON board_members.board_id = boards.id
            JOIN users ON users.id = board_members.user_id
            WHERE checklist_items.id = ? AND users.username = ?
            """,
            (item_id, username),
        ).fetchone()
        return row["card_id"] if row else None

    def list_comments(self, username: str, card_id: str) -> list[CommentData] | None:
        with closing(connect(self.database_path)) as connection, connection:
            if self._card_board_id(connection, username, card_id) is None:
                return None

            rows = connection.execute(
                """
                SELECT card_comments.id, users.username AS author,
                       card_comments.body, card_comments.created_at
                FROM card_comments
                JOIN users ON users.id = card_comments.user_id
                WHERE card_comments.card_id = ?
                ORDER BY card_comments.created_at
                """,
                (card_id,),
            ).fetchall()
        return [
            CommentData(
                id=row["id"],
                author=row["author"],
                body=row["body"],
                createdAt=row["created_at"],
            )
            for row in rows
        ]

    def add_comment(
        self, username: str, card_id: str, body: str
    ) -> CommentData | None:
        with closing(connect(self.database_path)) as connection, connection:
            board_id = self._card_board_id(connection, username, card_id)
            if board_id is None:
                return None

            user = connection.execute(
                "SELECT id FROM users WHERE username = ?", (username,)
            ).fetchone()
            comment_id = f"comment-{secrets.token_hex(8)}"
            created_at = utc_now()
            connection.execute(
                """
                INSERT INTO card_comments (id, card_id, user_id, body, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (comment_id, card_id, user["id"], body, created_at),
            )
            card = connection.execute(
                "SELECT title FROM cards WHERE id = ?", (card_id,)
            ).fetchone()
            self._record_activity(
                connection, board_id, username, f'commented on "{card["title"]}"'
            )
            return CommentData(
                id=comment_id, author=username, body=body, createdAt=created_at
            )

    def delete_comment(self, username: str, comment_id: str) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            # Only the author may delete their own comment.
            result = connection.execute(
                """
                DELETE FROM card_comments
                WHERE id = ?
                  AND user_id = (SELECT id FROM users WHERE username = ?)
                """,
                (comment_id, username),
            )
            return result.rowcount == 1

    def list_assigned_cards(self, username: str) -> list[AssignedCard]:
        """Cards assigned to this user across every board they belong to.

        Due cards come first, oldest date first; undated cards follow.
        """
        with closing(connect(self.database_path)) as connection, connection:
            rows = connection.execute(
                """
                SELECT cards.id AS card_id, cards.title, cards.due_date,
                       columns.title AS column_title,
                       boards.id AS board_id, boards.title AS board_title
                FROM cards
                JOIN columns ON columns.id = cards.column_id
                JOIN boards ON boards.id = columns.board_id
                JOIN board_members ON board_members.board_id = boards.id
                JOIN users ON users.id = board_members.user_id
                WHERE users.username = ?
                  AND boards.archived_at IS NULL
                  AND LOWER(cards.assignee) = LOWER(?)
                ORDER BY
                    CASE WHEN cards.due_date IS NULL THEN 1 ELSE 0 END,
                    cards.due_date,
                    boards.position,
                    columns.position,
                    cards.position
                """,
                (username, username),
            ).fetchall()

            labels_by_card: dict[str, list[LabelData]] = {}
            for row in connection.execute(
                """
                SELECT card_labels.card_id, labels.id, labels.name, labels.color
                FROM card_labels
                JOIN labels ON labels.id = card_labels.label_id
                ORDER BY labels.name
                """
            ).fetchall():
                labels_by_card.setdefault(row["card_id"], []).append(
                    LabelData(id=row["id"], name=row["name"], color=row["color"])
                )

        return [
            AssignedCard(
                cardId=row["card_id"],
                title=row["title"],
                boardId=row["board_id"],
                boardTitle=row["board_title"],
                columnTitle=row["column_title"],
                dueDate=row["due_date"],
                labels=labels_by_card.get(row["card_id"], []),
            )
            for row in rows
        ]

    def list_activity(
        self, username: str, board_id: str, limit: int = 50
    ) -> list[ActivityEntry] | None:
        with closing(connect(self.database_path)) as connection, connection:
            if self._get_board(connection, username, board_id) is None:
                return None

            rows = connection.execute(
                """
                SELECT activities.id, activities.summary, activities.created_at,
                       COALESCE(users.username, 'someone') AS actor
                FROM activities
                LEFT JOIN users ON users.id = activities.user_id
                WHERE activities.board_id = ?
                ORDER BY activities.created_at DESC, activities.id DESC
                LIMIT ?
                """,
                (board_id, limit),
            ).fetchall()
        return [
            ActivityEntry(
                id=row["id"],
                actor=row["actor"],
                summary=row["summary"],
                createdAt=row["created_at"],
            )
            for row in rows
        ]

    @staticmethod
    def _assistant_activity(
        current_board: BoardData,
        cards: dict[str, CardData],
        created_card_ids: list[str],
        deleted_card_ids: list[str],
        operations: list[BoardOperation],
    ) -> list[str]:
        """One activity line per operation the assistant applied."""
        summaries: list[str] = []
        for operation in operations:
            if isinstance(operation, CreateCardOperation):
                summaries.append(
                    f'added "{operation.title}" with the assistant'
                )
            elif isinstance(operation, EditCardOperation):
                summaries.append(
                    f'updated "{operation.title}" with the assistant'
                )
            elif isinstance(operation, AddChecklistOperation):
                card = cards.get(operation.card_id) or current_board.cards.get(
                    operation.card_id
                )
                if card is not None:
                    summaries.append(
                        f'added {len(operation.steps)} checklist steps to '
                        f'"{card.title}" with the assistant'
                    )
            elif isinstance(operation, DeleteCardOperation):
                title = current_board.cards[operation.card_id].title
                summaries.append(f'deleted "{title}" with the assistant')
            elif isinstance(operation, MoveCardOperation):
                card = cards.get(operation.card_id) or current_board.cards.get(
                    operation.card_id
                )
                column = next(
                    (
                        column.title
                        for column in current_board.columns
                        if column.id == operation.target_column_id
                    ),
                    "another column",
                )
                if card is not None:
                    summaries.append(
                        f'moved "{card.title}" to {column} with the assistant'
                    )
        return summaries

    @staticmethod
    def _board_role(
        connection: sqlite3.Connection, username: str, board_id: str
    ) -> str | None:
        row = connection.execute(
            """
            SELECT board_members.role
            FROM board_members
            JOIN users ON users.id = board_members.user_id
            WHERE board_members.board_id = ? AND users.username = ?
            """,
            (board_id, username),
        ).fetchone()
        return row["role"] if row else None

    @staticmethod
    def _column_board_id(
        connection: sqlite3.Connection, username: str, column_id: str
    ) -> str | None:
        row = connection.execute(
            """
            SELECT boards.id
            FROM columns
            JOIN boards ON boards.id = columns.board_id
            JOIN board_members ON board_members.board_id = boards.id
            JOIN users ON users.id = board_members.user_id
            WHERE columns.id = ? AND users.username = ?
            """,
            (column_id, username),
        ).fetchone()
        return row["id"] if row else None

    @staticmethod
    def _card_board_id(
        connection: sqlite3.Connection, username: str, card_id: str
    ) -> str | None:
        row = connection.execute(
            """
            SELECT boards.id
            FROM cards
            JOIN columns ON columns.id = cards.column_id
            JOIN boards ON boards.id = columns.board_id
            JOIN board_members ON board_members.board_id = boards.id
            JOIN users ON users.id = board_members.user_id
            WHERE cards.id = ? AND users.username = ?
            """,
            (card_id, username),
        ).fetchone()
        return row["id"] if row else None

    @staticmethod
    def _record_activity(
        connection: sqlite3.Connection,
        board_id: str,
        username: str,
        summary: str,
    ) -> None:
        user = connection.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        connection.execute(
            """
            INSERT INTO activities (id, board_id, user_id, summary, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                f"activity-{secrets.token_hex(8)}",
                board_id,
                user["id"] if user else None,
                summary,
                utc_now(),
            ),
        )

    @staticmethod
    def _set_card_labels(
        connection: sqlite3.Connection, card_id: str, label_ids: list[str]
    ) -> None:
        connection.execute("DELETE FROM card_labels WHERE card_id = ?", (card_id,))
        if not label_ids:
            return

        # Only labels from the card's own board may be attached.
        allowed = {
            row["id"]
            for row in connection.execute(
                """
                SELECT labels.id
                FROM labels
                JOIN columns ON columns.board_id = labels.board_id
                JOIN cards ON cards.column_id = columns.id
                WHERE cards.id = ?
                """,
                (card_id,),
            ).fetchall()
        }
        unknown = [label_id for label_id in label_ids if label_id not in allowed]
        if unknown:
            raise BoardOperationError("Unknown label for this board")

        connection.executemany(
            "INSERT INTO card_labels (card_id, label_id) VALUES (?, ?)",
            [(card_id, label_id) for label_id in dict.fromkeys(label_ids)],
        )

    def delete_card(self, username: str, card_id: str) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            card = connection.execute(
                """
                SELECT cards.column_id, boards.id AS board_id
                FROM cards
                JOIN columns ON columns.id = cards.column_id
                JOIN boards ON boards.id = columns.board_id
                JOIN board_members ON board_members.board_id = boards.id
                JOIN users ON users.id = board_members.user_id
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
            title = connection.execute(
                "SELECT title FROM cards WHERE id = ?", (card_id,)
            ).fetchone()["title"]
            connection.execute("DELETE FROM cards WHERE id = ?", (card_id,))
            self._set_card_order(connection, card["column_id"], remaining_ids)
            self._record_activity(
                connection, card["board_id"], username, f'deleted "{title}"'
            )
            self._touch_board(connection, card["board_id"])
            return True

    def move_card(
        self,
        username: str,
        card_id: str,
        target_column_id: str,
        position: int,
    ) -> bool:
        with closing(connect(self.database_path)) as connection, connection:
            card = connection.execute(
                """
                SELECT cards.column_id, boards.id AS board_id
                FROM cards
                JOIN columns ON columns.id = cards.column_id
                JOIN boards ON boards.id = columns.board_id
                JOIN board_members ON board_members.board_id = boards.id
                JOIN users ON users.id = board_members.user_id
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
            target_ids = (
                source_ids
                if source_column_id == target_column_id
                else self._card_ids(connection, target_column_id)
            )
            self._move_card_id(source_ids, target_ids, card_id, position)

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
            if target_column_id != source_column_id:
                moved = connection.execute(
                    """
                    SELECT cards.title, columns.title AS column_title
                    FROM cards
                    JOIN columns ON columns.id = ?
                    WHERE cards.id = ?
                    """,
                    (target_column_id, card_id),
                ).fetchone()
                self._record_activity(
                    connection,
                    card["board_id"],
                    username,
                    f'moved "{moved["title"]}" to {moved["column_title"]}',
                )
            self._touch_board(connection, card["board_id"])
            return True

    @staticmethod
    def _get_board(
        connection: sqlite3.Connection,
        username: str,
        board_id: str | None = None,
    ) -> sqlite3.Row | None:
        if board_id is not None:
            return connection.execute(
                """
                SELECT boards.id
                FROM boards
                JOIN board_members ON board_members.board_id = boards.id
                JOIN users ON users.id = board_members.user_id
                WHERE boards.id = ? AND users.username = ?
                """,
                (board_id, username),
            ).fetchone()

        return connection.execute(
            """
            SELECT boards.id
            FROM boards
            JOIN board_members ON board_members.board_id = boards.id
            JOIN users ON users.id = board_members.user_id
            WHERE users.username = ?
            ORDER BY boards.position, boards.created_at
            LIMIT 1
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
    def _insert_card_at_position(
        card_ids: list[str], card_id: str, position: int
    ) -> None:
        if position > len(card_ids):
            raise BoardOperationError("Invalid card position")
        card_ids.insert(position, card_id)

    @staticmethod
    def _move_card_id(
        source_ids: list[str], target_ids: list[str], card_id: str, position: int
    ) -> None:
        # Validate against the target's count before removal so a same-column
        # move to its card count means "move to the end".
        if position > len(target_ids):
            raise BoardOperationError("Invalid card position")
        source_ids.remove(card_id)
        target_ids.insert(position, card_id)

    @staticmethod
    def _park_card_positions(
        connection: sqlite3.Connection, card_ids: list[str]
    ) -> None:
        if not card_ids:
            return
        placeholders = ", ".join("?" for _ in card_ids)
        offset = connection.execute(
            "SELECT COALESCE(MAX(position), 0) + 1000 FROM cards"
        ).fetchone()[0]
        connection.execute(
            f"UPDATE cards SET position = position + ? WHERE id IN ({placeholders})",
            (offset, *card_ids),
        )

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
