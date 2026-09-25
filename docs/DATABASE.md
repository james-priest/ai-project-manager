# Database design

The approved SQLite design is in [database-schema.json](./database-schema.json). It separates persistent relational storage from the board JSON used by the API, frontend, and AI.

The relational tables preserve ownership and integrity:

- `users` supports multiple accounts and stores a password hash.
- `boards` holds one row per board; a user may own several, ordered by `position`.
- `board_members` decides who can reach a board. Every board access check joins through it, so sharing a board is a single row. The creator is the `owner`; invited users are `editors`.
- `card_comments` holds per-card discussion, and `activities` is the board's audit trail.
- `columns` stores renameable columns and their board order.
- `cards` stores card content, column membership, card order, an optional `due_date`, and a free-text `assignee`.
- `labels` stores board-scoped labels; `card_labels` attaches them to cards, and deleting a label detaches it everywhere through the cascade.

The API serializer rebuilds the existing frontend `BoardData` shape (`columns` with ordered `cardIds` plus a `cards` map). This keeps the frontend and AI payload simple while allowing SQLite to enforce foreign keys, ownership, and ordering constraints. Board mutations rewrite affected positions in one transaction.

Sessions live in the `sessions` table rather than process memory, so a container restart no longer signs everyone out and expired rows are cleared when a session is created or replayed. The database seed represents the original demo account without storing its plaintext password; initialization generates the password hash.

Accounts are self-service: registration creates a user plus a starter board with the default columns. Every board query is scoped through `users.username`, so one account cannot read or change another's boards.

`initialize_database` runs `migrate_database` first, which upgrades a database created by schema version 1: it rebuilds `boards` without the old `UNIQUE(user_id)` constraint (SQLite cannot drop one in place) and adds the `position` column. Existing boards, columns, and cards are preserved.

Schema version 1 was approved and implemented in Part 6. Version 2 adds multiple boards per user and persistent sessions. Version 3 adds card due dates and assignees (added in place with `ALTER TABLE`) plus the `labels` and `card_labels` tables. Version 4 adds `board_members` (backfilled with an owner row for every existing board), `card_comments`, and `activities`.
