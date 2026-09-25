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

- [x] Board switcher (list, create, rename, delete) in the frontend
- [x] Registration and account UI; per-user session handling
- [x] AI assistant scoped to the active board
- [x] Unit/component tests and Playwright journeys

Phase 2 landed: `BoardSwitcher` drives board selection from `AuthGate`, which owns the
board list and the active board. `LoginForm` toggles between sign-in and registration.
`/api/ai/chat` takes a `board_id`, verified against the live provider. Frontend suites:
65 unit tests, 20 Playwright tests (`tests/boards.spec.ts` registers a throwaway account
per run).

## Phase 3 - Richer cards

- [x] Labels (board-scoped, five colors), due dates, assignees
- [x] Filtering and search across title, details, and assignee
- [x] Tests at each layer
- [ ] Description markdown and a full card detail view (deferred)

Phase 3 landed: schema v3 adds `cards.due_date`, `cards.assignee`, `labels`, and
`card_labels`. `BoardToolbar` holds search, label filters, and label management;
`filterBoard` in `lib/kanban.ts` does the filtering. Suites: 84 backend tests,
83 frontend unit tests, 22 Playwright tests.

## Phase 4 - Collaboration and history

- [x] Board members and sharing (owner invites, members can leave)
- [x] Activity log / audit trail per board
- [x] Comments on cards, with counts on the card face

Phase 4 landed: schema v4 adds `board_members`, `card_comments`, and `activities`.
Access is membership-based everywhere; only owners can share or delete a board.
`CollaborationPanel` shows members and recent activity; `CardComments` lives in the
card editor. Suites: 94 backend tests, 96 frontend unit tests, 23 Playwright tests.

Known issue: `tests/kanban.spec.ts` and `tests/ai.spec.ts` share the seeded demo
board, so a failed run can leave it dirty for the next one. Both now reset the state
they depend on, but converting them to per-run accounts (as `boards.spec.ts` and
`collaboration.spec.ts` do) would remove the coupling.

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
