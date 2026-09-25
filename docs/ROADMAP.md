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

- [x] Column create/delete/reorder (a board keeps at least one column)
- [x] Board templates (kanban, sprint, blank) and archiving
- [x] Keyboard shortcut for search, empty/error states, accessible labels

Phase 5 landed: schema v5 adds `boards.archived_at`. Columns can be added, moved
with Left/Right, and deleted (with a confirm that names how many cards go with it).
New boards pick a template. Archived boards leave the switcher until "Show archived"
is ticked. "/" focuses search, Escape clears it, and the card counter announces
politely. Suites: 106 backend tests, 110 frontend unit tests, 28 Playwright tests.

## Phase 6 - Assistant depth and test isolation

- [x] Assistant can set due dates, assignees, and labels on create and edit
- [x] Assistant can delete a card; edits leave unmentioned fields alone
- [x] Assistant changes appear in the board activity log
- [x] `ai.spec.ts` and `kanban.spec.ts` register their own accounts
- [x] Card detail view with markdown descriptions (Phase 7)

Phase 6 landed: `edit_card` uses `model_fields_set`, so a field the model does not
mention keeps its value while `"due_date": null` clears it. A new `delete_card`
operation rounds out the batch, and every applied operation writes an activity line
ending "with the assistant". `tests/support/workspace.ts` registers a throwaway
account per run; no spec depends on the seeded demo board any more except
`auth.spec.ts`, which signs in with it on purpose. Suites: 114 backend tests,
110 frontend unit tests, 28 Playwright tests.

## Phase 7 - Card detail view

- [x] Card detail dialog: markdown description, fields, labels, comments
- [x] Editing consolidated in the dialog; the card face is read-only plus delete
- [x] Dialog accessibility: focus on open, focus trap, Escape and backdrop close

Phase 7 landed: `CardDetailDialog` renders the description with `react-markdown`
(HTML in a description is escaped, not rendered). The card face now shows a title
button that opens the dialog, a three-line description clamp, and its metadata.
Dragging still works from anywhere on the card, including the title. Suites:
114 backend tests, 124 frontend unit tests, 30 Playwright tests.

## Phase 8 - Dependency health and test depth

- [x] Next 16.1.6 -> 16.3.6, clearing every production advisory (was 3 critical)
- [x] vitest 3 -> 5 and @types/node 20 -> 24, clearing the dev advisories
- [x] Backend lock refreshed; `httpx2` added so Starlette's TestClient stops warning
- [x] Drag decision logic extracted to `resolveCardDrop` in `lib/kanban.ts` and tested
- [x] Error messages prefer a server detail and fall back to action wording

Phase 8 landed: `npm audit --omit=dev` reports zero vulnerabilities, `npm audit`
reports zero overall, and the backend test run is warning-free. `KanbanBoard`
coverage rose from 65% to 75% by moving drag placement into a pure function.
Suites: 114 backend tests, 134 frontend unit tests, 30 Playwright tests.

## Phase 9 - Cross-board work

- [x] `GET /api/me/tasks`: cards assigned to you across every board you belong to
- [x] "My work" panel: board and column, labels, due state, overdue count
- [x] Opening a task switches board and opens that card
- [x] Assignee field suggests board members (free text still allowed)

Phase 9 landed: assigned cards are matched case-insensitively against the
username, sorted by due date with undated cards last, and archived boards and
boards you have left drop out. Suites: 121 backend tests, 142 frontend unit
tests, 32 Playwright tests.

## Phase 10 - Due-date filters and docs

- [x] Filter the board by overdue, due within seven days, or no due date
- [x] `docs/RUNNING.md` rewritten around features rather than build phases
- [x] Whole suite verified against the Docker image, the documented way to run it

Phase 10 landed: `filterBoard` takes today's date and filters on due state
alongside text and labels. Suites: 121 backend tests, 150 frontend unit tests,
33 Playwright tests, all green against `./scripts/start.sh`.

## Phase 11 - Card checklists

- [x] Schema v6: `checklist_items`, with progress counts on the card payload
- [x] Checklist in the card dialog: add, tick, untick, remove
- [x] Progress badge on the card face, complete lists highlighted

Phase 11 landed: ticking a step updates straight away and rolls back if the
server rejects it. Deleting a card takes its checklist with it, and checklists
follow board membership like every other card resource. Suites: 128 backend
tests, 158 frontend unit tests, 34 Playwright tests.

## Phase 12 - Assistant checklists

- [x] `add_checklist` operation: the assistant can break a card into steps
- [x] Steps append to any that exist, are trimmed, and are capped at 20 per call
- [x] Checklist changes land in the activity log like every other assistant change

Phase 12 landed: asking the assistant to "break this card into a checklist"
produces steps on the card, verified against the live model. Suites: 131 backend
tests, 158 frontend unit tests, 34 Playwright tests.

## Conventions for this build-out

- Keep board transforms in `frontend/src/lib/`, persistence in `BoardRepository`.
- Every new endpoint gets ownership checks and a test that another user cannot reach it.
- Update `docs/DATABASE.md` and `docs/database-schema.json` whenever the schema changes.
- Run `uv run --project backend pytest`, `npm run test:coverage`, and `npm run lint`
  before finishing an iteration; Playwright when UI behavior changes.
