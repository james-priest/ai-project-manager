# Code Review

Date: 2026-09-21. Commit reviewed: `af4ee8f` (main).

Scope: all backend source (`backend/app/`), frontend source (`frontend/src/`), Docker/Compose packaging, scripts, and test setup. References use `file:line`.

Verification performed:

- Backend: `uv run --project backend pytest` - 47 passed, 1 skipped (live OpenRouter test).
- Frontend: `npm run test:unit` - 38 passed; `npm run lint` - clean.
- Both high-severity bugs below were reproduced with throwaway scripts/tests (not committed).

Relationship to `docs/code_review.md`: most findings from that earlier review are still present in the code. They are restated here so this document stands alone; items new to this review are marked **(new)**.

Overall: a clean, well-tested MVP with sound structure and correct security basics. Every finding in this review has since been fixed, except three low-severity items marked NOT FIXED (the in-memory session store's restart/multi-worker limits, a Starlette deprecation warning that needs an upstream fix, and `allowJs`, which Next.js re-adds to `tsconfig.json`).

## High severity

### H1. Moving a card to the end of its own column is rejected (AI and REST) - FIXED

- **Status: fixed.** A new `BoardRepository._move_card_id` helper validates the position against the target column's count *before* removing the card, and both `apply_operations` and `move_card` use it. A same-column move to the card count now means "move to the end", matching the prompt; larger positions are still rejected. Regression tests: `test_repository_can_move_a_card_to_the_end_of_its_own_column` and `test_apply_operations_can_move_a_card_to_the_end_of_its_own_column` in `backend/tests/test_database.py`.

- `backend/app/database.py:314-323` (`apply_operations`), `backend/app/database.py:583-591` (`move_card`), `backend/app/database.py:656-661` (`_insert_card_at_position`)
- The card is removed from its source list before the position is validated against the now-shorter list. For `col-backlog = [card-1, card-2]`, moving `card-1` to position `2` fails with `Invalid card position`.
- `backend/app/ai.py:48-49` tells the model positions "may be from 0 through the target column's current card count", so the prompt invites exactly this request. On the AI path it surfaces as a 502 and the whole batch is discarded.
- The frontend is unaffected only because `getCardDropPosition` computes post-removal indices (`frontend/src/lib/kanban.ts:41-57`) and `moveCardToPosition` clamps (`kanban.ts:84-87`).
- Reproduced: both `apply_operations` and `move_card` return `Invalid card position` for the case above.
- Fix: pick one semantic and make both sides agree. Simplest is to clamp to `len(card_ids)` in `_insert_card_at_position` (matching the frontend), or reword the prompt to "for a move within the same column, 0 through count - 1". Add a regression test for same-column move-to-end.

### H2. Pressing Escape in a column title saves the edit instead of cancelling - FIXED

- **Status: fixed.** Escape now sets a `cancelTitleEditRef` flag that makes the following `onBlur` skip `saveTitle` once. Regression test: `cancels a column rename on Escape without saving` in `frontend/src/components/KanbanBoard.test.tsx`.

- `frontend/src/components/KanbanColumn.tsx:79-88`
- The Escape handler calls `setDraftTitle(column.title)` then `blur()`. `blur()` synchronously fires `onBlur`, which runs `saveTitle` from the current render's closure where `draftTitle` is still the edited text, so the rename is committed.
- Reproduced: typing "New" then Escape calls `onRename("c", "New")`.
- Fix: have Escape skip the save (e.g. a ref flag checked in `saveTitle`, or call a `cancel` path that does not blur-save). Add a component test asserting no rename on Escape.

## Medium severity

### M1. Board routes bypass FastAPI dependency injection (new) - FIXED

- **Status: fixed.** Both routers now take `repository: BoardRepository = Depends(get_board_repository)`, so the repository is overridable in tests like `get_ai_provider`.

- `backend/app/routes/board.py:18,30,43,57,70,83`, `backend/app/routes/ai.py:47`
- Routes call `get_board_repository()` directly instead of `Depends(get_board_repository)`. CLAUDE.md states routes should depend on `dependencies.py`; as written the repository cannot be overridden via `app.dependency_overrides` (tests work around it with the `DATABASE_PATH` env var). `get_ai_provider` is injected correctly, so this is also inconsistent.

### M2. Model output format is enforced only by the prompt - FIXED

- **Status: fixed.** `OpenRouterClient.complete` takes `json_output`, and the chat path sends `response_format: {"type": "json_object"}` plus `provider: {"require_parameters": true}` so only providers that honor it are used; the connectivity prompt still asks for plain text. Verified with one live OpenRouter call. Regression test: `test_openrouter_client_requests_json_output_when_asked`.

- `backend/app/openrouter.py:62-67` sends only `model` and `messages`. A response wrapped in a Markdown fence or with leading prose fails `parse_model_response` (`backend/app/ai.py:63-69`) and becomes a 502. Pass `response_format` (JSON schema / `json_object`) to OpenRouter. No test covers the fenced-JSON case.

### M3. Optimistic rollbacks restore stale whole-board snapshots - FIXED

- **Status: fixed.** Handlers capture only the affected entity and roll back through the new `setColumnTitle` / `setCard` / `removeCard` / `insertCard` transforms in `frontend/src/lib/kanban.ts`; the move handler restores the card's original column and index. Regression tests: `rolls back only the failed change when mutations overlap` in `KanbanBoard.test.tsx` and the transform tests in `kanban.test.ts`.

- `frontend/src/components/KanbanBoard.tsx:117,145,209,235`
- Each handler captures `previousBoard = board` and restores it on failure. Any mutation or AI board replacement that lands in between is silently undone. Roll back only the affected entity, or refetch the board on failure.

### M4. AI board replacement races with in-flight user edits - FIXED

- **Status: fixed.** The sidebar prop is now `onBoardChanged()`; `KanbanBoard.refreshBoard` waits for pending mutations to settle, reloads from `/api/board`, and repeats if another mutation started during the load. Regression test: `reloads the board after an assistant update once pending edits settle`.

- `frontend/src/components/AIChatSidebar.tsx:119-121`, `frontend/src/components/KanbanBoard.tsx:358`
- `onBoardUpdate(result.board)` replaces the board wholesale. A drag made while a chat request is pending can be overwritten visually, and combined with M3 a later rollback can leave the UI inconsistent with the server.

### M5. Escape closes the assistant only while focus is inside it - FIXED

- **Status: fixed.** A document-level `keydown` listener runs while the dialog is open and ignores events an inner control already handled (`event.defaultPrevented`), so Escape in a column title only cancels the rename. Regression tests: `closes on Escape even when focus has moved outside the assistant` and `leaves the assistant open when an inner control already handled Escape`.

- `frontend/src/components/AIChatSidebar.tsx:151-156,282`
- The key handler is on the `<aside>`. Once focus moves to the board, Escape does nothing. Use a document-level `keydown` listener while open (the existing `useEffect` at line 59 is a natural home).

### M6. Cards cannot be moved with the keyboard - FIXED

- **Status: fixed.** `KeyboardSensor` with `sortableKeyboardCoordinates` is registered, collision detection falls back to `closestCorners` when there are no pointer coordinates, keyboard drops use arrayMove semantics via `getKeyboardDropPosition`, and each card is its own activator node so Enter/Space on its buttons and edit fields no longer starts a drag. Regression tests: `getKeyboardDropPosition` unit tests and the `moves cards with the keyboard` Playwright journey.

- `frontend/src/components/KanbanBoard.tsx:71-75`
- Only `PointerSensor` is registered. Add dnd-kit's `KeyboardSensor` with `sortableKeyboardCoordinates`.

### M7. Duplicate operations in an AI batch cause a hard failure - FIXED

- **Status: fixed.** `validate_operations_are_unique` is removed; operations apply in the order the model lists them, so a repeated `create_card` now creates two cards. Regression test: `test_chat_applies_repeated_identical_operations`.

- `backend/app/ai.py:72-77`
- `validate_operations_are_unique` rejects any repeated operation, including harmless ones (identical `edit_card`). The user sees a 502 for an otherwise valid response. Either drop the check or dedupe instead of failing.

## Low severity

All items below are fixed except the three marked NOT FIXED.

### Backend

- FIXED (app-level `OpenRouterError` / `AIResponseError` / `LookupError` handlers in `main.py`; both AI routes are now plain calls). Was: exception-to-status mapping is duplicated across both routes, and the `except OpenRouterError` branches are unreachable (all subclasses are caught first). A single `app.exception_handler` would remove both.
- FIXED (`_persist_board_state` writes only created, moved, or edited cards; `_park_card_positions` moves just the affected rows out of the way. Test: `test_apply_operations_only_touches_changed_cards`). Was: `_persist_board_state` rewrites every card on the board and bumps `updated_at` on all of them for any AI batch, so card timestamps stop meaning anything. Only write cards whose column/position/content changed. **(new)**
- FIXED (every caller now uses `with closing(connect(...)) as connection, connection:`). Was: `with connect(...)` on `sqlite3.Connection` commits/rolls back but does not close the connection; closing relies on garbage collection. Use `contextlib.closing` or an explicit close. **(new)**
- FIXED (branch removed). Was: the `else` branch re-applies the same order to the same list already set on line 611; for same-column moves `target_ids is source_ids`. Dead weight.
- FIXED (route removed; `StaticFiles(html=True)` serves `/`). Was: `read_index` duplicates what `StaticFiles(html=True)` already serves at `/`.
- FIXED (`pydantic>=2.9,<3` declared; `uv.lock` refreshed). Was: `pydantic` is imported directly (`schemas.py:3`, `ai.py:3`, `routes/auth.py:2`) but not declared.
- FIXED (`MAX_TEXT_LENGTH` 2000 on every title/details/question/message, `MAX_HISTORY_MESSAGES` 50; over-limit requests get 422. Test: `test_chat_rejects_oversized_input`). Was: no length limits on `question`, `history`, or card text; an arbitrarily large history becomes an arbitrarily large (and billed) prompt.
- NOT FIXED, except that `create_session` now purges expired entries. Restart loss and multi-worker sharing are inherent to the in-memory store and out of scope for the single-worker MVP. Was: in-memory sessions are lost on restart and not shared across workers; expired sessions are only purged when replayed. Fine for the local MVP.
- FIXED (`session_cookie_is_secure()` reads `SESSION_COOKIE_SECURE`, defaulting to off for local HTTP). Was: `secure=False` is correct for local HTTP but must change behind TLS.
- NOT FIXED: needs an upstream move to `httpx2` in Starlette's TestClient; nothing to change here yet. Was: test run emits a Starlette deprecation warning about `httpx` in `TestClient`; worth tracking before the next FastAPI/Starlette upgrade. **(new)**

### Frontend

- FIXED (empty details are stored as `""`; `KanbanCard` renders the placeholder. Test: `stores empty details as empty and shows a placeholder`). Was: an empty details field is persisted to the database as the literal string "No details yet." This is presentation text stored as data (and the AI will see it as real content). Store `""` and render the placeholder in `KanbanCard`. **(new)**
- FIXED (a failed question is removed from the log and restored to the textarea. Test: `restores the question and drops the unanswered turn after a failure`). Was: on a failed request the user's question stays in `messages` with no reply, so the next request sends two consecutive `user` turns in `history`, and the question is not restored to the textarea for retry. **(new, extends earlier note)**
- FIXED (both dead branches removed). Was: the `!authenticated` branches are dead: the backend returns 401 rather than `authenticated: false`. **(new)**
- FIXED (the workspace toast moved to `top-20`, below the board toast). Was: both error toasts use the same `fixed right-6 top-6` slot and overlap if shown together. **(new)**
- FIXED (a drop onto the same column and index returns early). Was: a drop that does not change position still sends a move request. **(new)**
- FIXED (the card declares `role: "group"`, so its buttons and edit form are no longer inside a button). Was: dnd-kit `attributes` put `role="button"` and `tabIndex=0` on the `<article>`, which contains other buttons and, in edit mode, a form. Nested interactive roles confuse screen readers. **(new)**
- FIXED (label is now `Column title: <name>`). Was: all five title inputs share `aria-label="Column title"`; include the column name.
- FIXED (the draft is only synced while the input is not focused). Was: the effect resets `draftTitle` whenever `column.title` changes, wiping in-progress typing on an AI rename or rollback.
- FIXED (a sentinel at the end of the log is scrolled into view when messages change). Was: the conversation does not auto-scroll to the newest message.
- FIXED (two-step inline confirm: the trash icon becomes `Confirm delete <card>`, cancelled by Escape or blur. Test: `cancels a delete when the confirm button is dismissed`). Was: delete has no confirmation or undo.
- FIXED (`moveCard` and `isColumnId` removed; the live `getCardDropPosition` / `moveCardToPosition` coverage was kept). Was: `moveCard` is used only by its own test.
- FIXED (both call the exported `findCardColumn` in `lib/kanban.ts`). Was: `findColumn` duplicates `findColumnId` in `lib/kanban.ts`; per project convention it belongs in `src/lib/`.
- FIXED (uses `board.cards` directly). Was: `useMemo(() => board.cards, [board.cards])` is a no-op.
- FIXED (card add/edit failures report only in the form; the board toast is reserved for drag and delete). Was: failures show both a board-level toast and an in-form alert.
- FIXED (cards use `h3` under a visually hidden per-column `h2`). Was: card headings are `h4` directly under the page `h1`.
- FIXED (script removed). Was: `npm start` (`next start`) does not work with `output: "export"`.
- FIXED (`src/test/vitest.d.ts` referenced `types="vitest"`, which no longer supplies the `describe`/`it`/`expect`/`vi` globals in Vitest 3; it now references `vitest/globals`, clearing 221 `tsc` errors across the test files). Was: test files had no vitest global types, so `tsc` and the IDE flagged every test.
- NOT FIXED: removing it does not stick. Next.js rewrites `frontend/tsconfig.json` on every `next build` / `next dev` and re-adds `"allowJs": true` (it also reformats the file). Was: `allowJs: true` is unnecessary for an all-TS project.

### Packaging and repo

- FIXED (pinned to `uv:0.12.11`). Was: `ghcr.io/astral-sh/uv:latest` is unpinned, so builds are not reproducible; pin a version. **(new)**
- FIXED (runs as `app`, uid 10001; verified end to end, and `docs/RUNNING.md` documents the one-time chown for volumes created by the old root-only image). Was: the runtime container runs as root; add a non-root `USER` (the `/app/data` volume needs matching ownership). **(new)**
- FIXED (untracked with `git rm --cached`). Was: `frontend/test-results/.last-run.json` is committed even though `/test-results` is in `frontend/.gitignore`; remove it from the index with `git rm --cached`. **(new)**

## Test coverage gaps

1. ~~Same-column move to `len(cards)` via both the REST route and `apply_operations` (H1).~~ Added.
2. ~~Escape-cancel in the column title editor (H2).~~ Added.
3. `KanbanBoard.handleDragEnd` still has no unit coverage; the `moves cards with the keyboard` Playwright test now exercises it end to end, and the move-failure rollback remains untested.
4. ~~Model response wrapped in a Markdown fence (M2).~~ Prevented at the source by `response_format`, so no test was added for the fenced output itself.
5. Chat failure followed by a retry (history shape).
6. `KanbanColumn`, `KanbanCard`, and `NewCardForm` still have no direct test files; their new behavior (title-draft sync, delete confirm, empty details) is covered through `KanbanBoard.test.tsx`.

## Things done well

- AI operations are simulated in memory and persisted in a single transaction only after the whole batch validates; bad model output never touches the database.
- Ownership is enforced server-side on every query via joins on `username`, with cross-user tests.
- PBKDF2-SHA256 with per-hash salt and constant-time comparison; parameterized SQL throughout.
- Provider errors are mapped to precise status codes (502/503/504) without leaking upstream details.
- Consistent 401 handling on every mutation routes the user back to login.
- Pure, well-tested geometry module for the draggable/resizable assistant.
- Docker layers copy dependency manifests before source, so code changes do not reinstall dependencies.
- Strict TypeScript with no `any` in `src/`.
