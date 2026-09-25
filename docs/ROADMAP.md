# Build-out roadmap

Goal: grow the single-board MVP into a comprehensive project management app, keeping
every phase shippable, tested, and covered (frontend thresholds stay at >=80%).

Each phase is a vertical slice: schema + API + tests, then UI + tests, then e2e.
Check items off as they land so later work can resume from here.

## Phase 1 - Multi-user accounts and multiple boards (backend)

- [x] Schema: `boards` no longer unique per user; add `position`; add `sessions` table
- [x] Migration for existing databases (rebuild `boards`, add missing columns)
- [x] Sessions persisted in SQLite (survive restart) and scoped to a real user
- [x] Registration endpoint; login works for any registered user
- [x] Board CRUD API (`/api/boards`), each new board seeded with default columns
- [x] Board-scoped card/column operations with ownership checks
- [x] Backend tests for all of the above

Phase 1 landed: 14 backend tests in `backend/tests/test_accounts.py` cover registration,
login, session persistence, board CRUD, card counts, and cross-account isolation. The
existing single-board frontend still works against `/api/board`, which now resolves to
the user's first board.

## Phase 2 - Multi-board UI

- [ ] Board switcher (list, create, rename, delete) in the frontend
- [ ] Registration and account UI; per-user session handling
- [ ] AI assistant scoped to the active board
- [ ] Unit/component tests and Playwright journeys

## Phase 3 - Richer cards

- [ ] Labels, due dates, assignees, description markdown
- [ ] Card detail view; filtering and search
- [ ] Tests at each layer

## Phase 4 - Collaboration and history

- [ ] Board members and sharing
- [ ] Activity log / audit trail
- [ ] Comments on cards

## Phase 5 - Polish

- [ ] Column create/delete/reorder
- [ ] Board templates and archiving
- [ ] Keyboard shortcuts, accessibility pass, empty/error states

## Conventions for this build-out

- Keep board transforms in `frontend/src/lib/`, persistence in `BoardRepository`.
- Every new endpoint gets ownership checks and a test that another user cannot reach it.
- Update `docs/DATABASE.md` and `docs/database-schema.json` whenever the schema changes.
- Run `uv run --project backend pytest`, `npm run test:coverage`, and `npm run lint`
  before finishing an iteration; Playwright when UI behavior changes.
