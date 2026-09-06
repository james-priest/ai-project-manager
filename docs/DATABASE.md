# Database design

The approved SQLite design is in [database-schema.json](./database-schema.json). It separates persistent relational storage from the board JSON used by the API, frontend, and AI.

The relational tables preserve ownership and integrity:

- `users` supports multiple accounts and stores a password hash.
- `boards` enforces one board per user for the MVP.
- `columns` stores renameable columns and their board order.
- `cards` stores card content, column membership, and card order.

The API serializer rebuilds the existing frontend `BoardData` shape (`columns` with ordered `cardIds` plus a `cards` map). This keeps the frontend and AI payload simple while allowing SQLite to enforce foreign keys, ownership, and ordering constraints. Board mutations rewrite affected positions in one transaction.

The Part 4 session store remains in process memory. It is intentionally not part of the SQLite schema because this MVP runs as one local container and sessions do not need to survive a restart. The database seed represents the hardcoded MVP account without storing its plaintext password; initialization will generate the password hash.

This design was approved and implemented in Part 6.
