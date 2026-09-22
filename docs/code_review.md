# Code Review

Scope: full review of the backend (`backend/`), frontend (`frontend/`), Docker packaging, start/stop scripts, and tests. Findings are based on reading all source files, test files, and configuration. References use `file:line`.

Overall verdict: a high-quality MVP. Architecture matches PLAN.md, tests are thorough, and the security basics are right. Two high-severity bugs need fixing before release; several medium issues are worth addressing but are not launch blockers.

## High severity

### H1. Same-column move-to-end is rejected; the AI prompt encourages exactly that

- `backend/app/database.py:314-323` (`apply_operations`) and `backend/app/database.py:584-591` (`move_card`)
- The card is removed from the source column's list *before* `_insert_card_at_position` (`database.py:656-661`) validates the position against the shortened list. For a column `[A, B]`, "move A to end of its column" means position `2`, which is legal per the prompt but rejected because the list is now `[B]` (length 1). The AI path has no clamp, so this yields a 502.
- `backend/app/ai.py:48-50` tells the model positions "may be from 0 through the target column's current card count" - the prompt actively produces the failing request.
- The frontend avoids this only by clamping in `frontend/src/lib/kanban.ts:84-87`; no such guard exists on the AI path.
- Fix: either correct the prompt to `0..count-1` for same-column moves, or validate against the pre-removal count (a moved card still counts toward its own column's bound). Add a regression test: same-column move to `len(cards)`.

### H2. Escape in the column title editor saves the new title instead of cancelling

- `frontend/src/components/KanbanColumn.tsx:80-88`
- The Escape handler calls `setDraftTitle(column.title)` then `event.currentTarget.blur()`. The synchronous `blur()` fires `onBlur` (line 79), which invokes `saveTitle` from the current render's closure - where `draftTitle` is still the user's edited text. The state update has not been applied to the captured closure, so `saveTitle` commits the rename to the server. The exact opposite of the intended revert.
- Fix: guard `saveTitle` with an `isCancel` parameter or a ref flag set by the Escape handler. Add a test: type new text, press Escape, assert no PATCH request.

## Medium severity

### M1. No `response_format` sent to OpenRouter

- `backend/app/openrouter.py:62-67` sends only `model` and `messages`. The strict-JSON contract rests entirely on the prompt in `backend/app/ai.py:19-60`. If the model wraps the JSON in a Markdown fence or adds prose, `parse_model_response` (`ai.py:63-69`) fails and the user gets a 502. Use OpenRouter/OpenAI structured outputs (`response_format: {"type": "json_schema", ...}`) to enforce the contract. There is also no test for the realistic fenced-JSON failure mode.

### M2. Optimistic-update rollback restores stale whole-board snapshots

- `frontend/src/components/KanbanBoard.tsx:117, 145, 209, 235`
- Each mutation handler captures `const previousBoard = board` and restores it on failure. If a second mutation (or an AI board replacement, see M3) lands between the optimistic set and the failure, the rollback reverts everything to the older snapshot, silently discarding newer changes. A functional rollback scoped to the affected entity, or a sequence guard, fixes the root cause.

### M3. AI board replacement races with in-flight optimistic mutations

- `frontend/src/components/AIChatSidebar.tsx:119-121` and `frontend/src/components/KanbanBoard.tsx:130-141`
- `onBoardUpdate(result.board)` wholesale-replaces the board. A drag committed while a chat request is in flight can be overwritten by the AI response, and combined with M2 the failure path can leave the UI inconsistent with the server. Acceptable for an MVP, but the failure path makes it observable.

### M4. Escape-to-close only works while focus is inside the assistant

- `frontend/src/components/AIChatSidebar.tsx:151-156, 282`
- `handleDialogKeyDown` is attached to the `<aside>`. If focus moves to the board (no containment, which is fine for a non-modal), Escape no longer closes the dialog, so the "Escape to close" requirement is only partially met. A document-level key listener while open fixes it.

### M5. `validate_operations_are_unique` rejects benign duplicate operations

- `backend/app/ai.py:72-77`
- Two identical operations in one batch are rejected, but an idempotent duplicate (same `edit_card` content, repeated `move_card`) is harmless; only duplicate `create_card` pairs are genuinely problematic. A model emitting a redundant duplicate causes a hard 502 instead of a no-op. Also leans over-engineered relative to the project's simplicity standard.

### M6. In-memory session store caveats

- `backend/app/dependencies.py:10-16`
- Sessions are lost on container restart (users are logged out on `docker compose up --build`), expired entries are only purged on replay, and the design silently breaks with multiple workers. Acceptable for the single-worker local MVP (and documented in PLAN.md), but worth noting for the future multi-user version.

### M7. Cards cannot be moved with the keyboard

- `frontend/src/components/KanbanBoard.tsx:71-75`
- Only `PointerSensor` is configured; dnd-kit's `KeyboardSensor` is absent, so keyboard-only users cannot reorder or move cards. Given the app's otherwise strong keyboard support, this is the biggest accessibility gap.

### M8. Multiple identical "Column title" labels

- `frontend/src/components/KanbanColumn.tsx:91`
- All five column inputs share `aria-label="Column title"`, so a screen-reader rotor lists five indistinguishable fields. Include the column name or position in the label.

## Low severity

### Backend

- `backend/app/routes/auth.py:25-33`: cookie `secure=False` is intentional for local HTTP but must flip behind TLS; no rate limiting on login (low impact with hardcoded credentials).
- `backend/app/schemas.py:119-129` and `backend/app/ai.py:14-17`: `question` and history messages have no max length; a large history produces a large, expensive prompt. Add `max_length` constraints.
- `backend/app/routes/ai.py:24-33` and `44-62`: identical exception mapping is copy-pasted between the two routes, and the `except OpenRouterError` fallback is unreachable because all concrete subclasses are caught first. A single FastAPI exception handler would remove ~20 lines.
- `backend/pyproject.toml:6-10`: `pydantic` is imported directly (`schemas.py:3`, `ai.py:3`, `routes/auth.py:2`) but not declared as a dependency.
- `backend/app/database.py:611-615`: when `target_column_id == source_column_id`, `target_ids` is the same object as `source_ids`, so the `else` branch is dead weight.
- `backend/app/main.py:24-26`: the explicit `read_index` route duplicates what `StaticFiles(html=True)` at `main.py:34` already serves.
- `backend/app/database.py:249-340`: read-modify-write board mutations are not concurrency-safe (interleaved reads can lose updates or hit the `UNIQUE(column_id, position)` constraint). Acceptable for the single-user MVP; worth a note, not a rewrite.

### Frontend

- `frontend/src/components/KanbanColumn.tsx:38-40`: the `useEffect` resets `draftTitle` whenever `column.title` changes, so an AI-driven rename or a rollback wipes text the user is typing.
- `frontend/src/components/AIChatSidebar.tsx:321-348`: the chat log does not scroll the newest message into view once history exceeds the dialog height.
- `frontend/src/components/AIChatSidebar.tsx:109-136`: on failure the question stays in the message list unanswered and is not refilled into the textarea, making retry awkward.
- `frontend/src/components/AuthGate.tsx:33-65`: no stale-response guard on overlapping `getBoard` requests; the slower response wins.
- `frontend/src/components/KanbanCard.tsx:156`: delete has no confirmation or undo (acceptable for MVP, noted as a destructive-action concern).
- `frontend/package.json:8`: `npm start` errors under `output: "export"`; the script is dead and misleading - remove it.
- `frontend/playwright.config.ts:20-28`: the Playwright webServer leaves the Docker stack running after a test run; undocumented trade-off.
- `frontend/src/lib/kanban.ts:104-130`: `moveCard` is only used by its own test (production uses `moveCardToPosition`); keeping it means part of the test suite exercises dead code.
- `frontend/src/components/KanbanBoard.tsx:77`: `useMemo(() => board.cards, [board.cards])` returns its own dependency; use `board.cards` directly.
- `frontend/src/components/KanbanBoard.tsx:31-34`: `findColumn` duplicates `findColumnId` in `frontend/src/lib/kanban.ts:21-26`.
- `frontend/src/components/KanbanBoard.tsx:222-231`: card-edit failure reports both a board-level toast and a rethrow that produces a second in-form alert (same duplication in `NewCardForm.tsx:27-29`).
- `frontend/tsconfig.json:5`: `allowJs: true` is unnecessary for an all-TS project.
- `frontend/src/components/KanbanCard.tsx:127` and `KanbanCardPreview.tsx:11`: heading hierarchy jumps from `h1` to `h4`.

## Requirements compliance

| Requirement | Status |
|---|---|
| Static NextJS export served at `/` | Met (`main.py:24-34`, `next.config.ts` `output: "export"`) |
| `/api/*` routes | Met (health, auth, board, ai routers) |
| uv package manager, `uv.lock` committed | Met (`Dockerfile:13-20`) |
| SQLite auto-create and seed | Met (`database.py:120-126`, lifespan) |
| Model `openai/gpt-oss-120b` | Met (`openrouter.py:7`) |
| 20s timeout, controlled provider errors | Met, mapped to 502/503/504 |
| Secrets not baked into image | Met (key flows via compose env; `.env` dockerignored) |
| Strict JSON structured output | Partially met - prompt only, no `response_format` (M1) |
| Escape-to-close on assistant | Partially met - only with focus inside the dialog (M4) |
| Keyboard navigation | Partially met - cards not movable by keyboard (M7) |

## Test coverage gaps

In priority order; the first three map directly to the bugs above.

1. Drag-and-drop failure path untested at unit level: `KanbanBoard.test.tsx` never exercises `handleDragEnd`, so the move-failure rollback (`KanbanBoard.tsx:130-141`) - the code affected by M2/M3 - has zero coverage.
2. No test for Escape-cancel in the column title editor (would have caught H2).
3. No test for same-column move-to-end (would have caught H1); existing move tests cover cross-column and same-column reorder-to-front only.
4. Nothing asserts the behavior when the model returns a Markdown-fenced JSON block, the realistic failure mode of M1.
5. `AuthGate` 401-during-`getBoard` and logout-failure-then-retry paths untested.
6. `KanbanColumn`, `KanbanCard`, `NewCardForm` have no direct test files; behaviors like the `isSavingTitle` guard are only covered incidentally through `KanbanBoard.test.tsx`.
7. Minor: `test_main.py:41-45` is sensitive to a developer-set `FRONTEND_STATIC_DIR` because `conftest.py` does not neutralize the env var; no test pins `OPENROUTER_MODEL` to the required value.

Note: the 80% coverage thresholds in `vitest.config.ts:15-20` are enforced and met; the concern is untested *behaviors*, not the threshold.

## Things done well

1. **Transactional AI operations**: `apply_operations` (`database.py:263-335`) simulates the full batch in memory and persists in one transaction only after validation; invalid model output never touches the DB. Both rollback paths are explicitly tested.
2. **Ownership enforcement everywhere**: every mutation scopes by `username` through SQL joins, and cross-user isolation is thoroughly tested rather than trusted to the frontend.
3. **Strong crypto and SQL hygiene**: PBKDF2-SHA256 with per-hash salt and `hmac.compare_digest`; parameterized SQL throughout.
4. **Uniform 401 handling**: every mutation and chat call routes `ApiError(401)` to session-expiry handling, each with a dedicated unit test.
5. **Well-tested pure geometry module**: `assistantGeometry.ts` covers all clamping math including degenerate tiny viewports, matching the project convention of keeping transformations in `src/lib/`.
6. **Careful Docker layer caching**: dependency manifests copied before source in both stages, so code edits do not rebuild dependencies.
7. **TypeScript discipline**: `strict: true`, no `any` in `src/`, discriminated state machine in `AuthGate`.
8. **Leak-proof error taxonomy**: provider error details are tested never to reach the client, and mapped to precise status codes.
