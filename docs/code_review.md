# Code Review

Full-repository manual review (not diff-based) of the Project Management MVP: FastAPI backend, SQLite persistence, Next.js static-export frontend, and the OpenRouter-backed AI board assistant. Reviewed against `AGENTS.md`, `CLAUDE.md`, and `docs/`.

Scope: `backend/app/{main,database,ai,openrouter,schemas}.py`, `backend/tests/*.py`, `frontend/src/lib/*.ts`, all `frontend/src/components/*.tsx`, `frontend/src/app/*`, and build config.

Date: 2026-09-08

## Summary of actions

| # | Priority | Area | Action |
|---|----------|------|--------|
| 1 | High | Correctness | Unify `move_card` position validation between the single-card REST path and the AI batch path (§2.1) |
| 2 | High | Security/Docs | Resolve the `password_hash` vs. plaintext-constant login mismatch — implement or document (§3.1 / §5.1) |
| 3 | Medium | Frontend | Recover from mid-session auth expiry instead of showing a generic error forever (§2.2) |
| 4 | Medium | Cleanup | Delete dead `initialData`/`createId` demo data from `frontend/src/lib/kanban.ts` (§4.1) |
| 5 | Medium | Architecture | Extract a shared card-reordering helper used by both REST and AI mutation paths (§4.2) |
| 6 | Low | Testing | Add a test for out-of-range `position` on the single-move REST path (§6.1) |
| 7 | Low | Testing | Add component coverage for `handleDragEnd`'s rollback-on-failure branch (§6.2) |
| 8 | Low | Security | Add `max_length` validation to user-supplied text fields (§3.2) |
| 9 | Low | Frontend UX | Give blank column-title save inline validation feedback (§7.1) |
| 10 | Low | Frontend UX | Add a dismiss control to the mutation-error banner (§7.2) |
| 11 | Low | Frontend UX | Make card creation optimistic, consistent with other mutations (§7.3) |
| — | — | Testing | Add direct unit coverage of `password_hash()` once #2 is resolved (§6.3) |

## Strengths

- The SQLite position-reindexing technique (offset existing rows to a safe high range, then reassign `0..n-1`) correctly satisfies the `UNIQUE(column_id, position)` constraint without relying on deferred constraints (which SQLite doesn't fully support) — used correctly everywhere it appears.
- Auth/ownership is consistently enforced at the SQL layer via `JOIN`s back to `users.username` in every mutation (`rename_column`, `update_card`, `delete_card`, `move_card`) rather than trusting client-supplied IDs.
- The AI operation-application path (`ai.py` + `BoardRepository.apply_operations`) is well-guarded: strict Pydantic discriminated-union validation, duplicate-operation detection, and full rollback via `BoardOperationError` → `AIResponseError` on any invalid operation. Backend test coverage for this path (`test_ai.py`) is thorough, including several malformed-model-output cases.
- The frontend's optimistic-update-with-rollback pattern (rename/edit/move/delete) is implemented correctly and consistently, aside from the auth-expiry gap noted in §2.2.
- `CLAUDE.md`/`AGENTS.md`/`docs/*` are accurate and low-drift for a project built incrementally across ~11 "Parts" — unusually well-maintained documentation for an iteratively-built MVP.

## 1. Correctness bugs

### 1.1 Inconsistent position validation: single-move vs. AI batch-move — **High**

- **Where:** `backend/app/database.py:572` (`BoardRepository.move_card`) vs. the `MoveCardOperation` handling in `apply_operations` (`backend/app/database.py:302`)
- **Issue:** The single-card REST move path (`POST /api/board/cards/{id}/move`) silently clamps an out-of-range `position` via `insert_at = min(position, len(target_ids))`. The AI batch path raises `BoardOperationError` on the identical condition, rolling back the entire batch.
- **Failure scenario:** A REST client (or a buggy frontend call) passes `position: 999` — the card silently lands at the end of the column with no error. The AI performing the same logical operation gets its whole multi-operation batch rejected. Same input class, two different outcomes depending on entry point.
- **Fix:** Pick one behavior (clamping is friendlier for direct API/drag-and-drop use) and apply it in both places, or explicitly document why they differ.

### 1.2 Frontend never recovers from mid-session auth expiry — **Medium**

- **Where:** All mutation handlers in `frontend/src/components/KanbanBoard.tsx` (`handleDragEnd:128`, `handleRenameColumn:149`, `handleAddCard:165`, `handleEditCard:206`, `handleDeleteCard:235`) and `frontend/src/components/AIChatSidebar.tsx:109`
- **Issue:** These handlers catch API errors generically via `getApiErrorMessage` with no check for `ApiError.status === 401`. Only `AuthGate.tsx:23` and `LoginForm.tsx:30` handle 401.
- **Failure scenario:** The 8-hour session (`SESSION_MAX_AGE`, `backend/app/main.py:44`) expires while the board is open. Every subsequent action (drag, edit, add, AI chat) fails with a generic "Unable to move/save/add card" banner forever — the user has no way back to the login screen short of a manual page reload.
- **Fix:** Have `KanbanBoard`/`AIChatSidebar` bubble a 401 up to `AuthGate` (e.g. via a callback prop) to reset the workspace state to `"unauthenticated"`.

## 2. Security

Weighted for what this actually is: a local, single-user MVP with one hardcoded account. "No rate limiting" etc. is not flagged as a real issue at this scale.

### 2.1 Seeded `password_hash` is dead code; login uses a plaintext constant instead — **High**

- **Where:** `backend/app/database.py:91-94` (`password_hash`, seeded in `seed_initial_data` at line 164) vs. `backend/app/main.py:42,96` (`login`)
- **Issue:** `seed_initial_data` generates and stores a real PBKDF2 hash of `"password"` in the `users` table. `login()` never reads it — it compares `credentials.password` directly against the hardcoded plaintext constant `MVP_PASSWORD = "password"`.
- **Why it matters:** Not independently exploitable (the credential is hardcoded either way), but it's misleading: `docs/DATABASE.md:14` states the seed "does not store its plaintext password; initialization will generate the password hash," implying the hash is the real auth mechanism — it isn't. Anyone reading the docs or the seed code would reasonably assume login is hash-verified. The risk is false confidence, and future work wiring in a second real user while assuming `password_hash` verification already works.
- **Fix:** Either wire `login()` to verify against `password_hash` (reuse `hashlib.pbkdf2_hmac` with the stored salt, parsing the `pbkdf2_sha256$...` format), or remove the seeded hash and update the doc to state auth is intentionally hardcoded-only for the MVP.

### 2.2 No max-length validation on user-supplied text — **Low**

- **Where:** `backend/app/schemas.py` (`title`, `details`, `question`, `ConversationMessage.content` — none set `max_length`); no caps on the frontend either (`NewCardForm.tsx`, `KanbanCard.tsx`, `AIChatSidebar.tsx`)
- **Issue:** Arbitrarily large text is accepted end-to-end and stored as-is in SQLite `TEXT` columns.
- **Failure scenario:** A very large paste (card title/details, or an AI question) gets stored, then re-embedded verbatim into the AI prompt (`backend/app/ai.py:52`) — could blow past the model's context window or bloat the local SQLite file. Low severity for a local single-user demo, but cheap to add.
- **Fix:** Add `Field(max_length=...)` to the relevant Pydantic fields; optionally mirror with `maxLength` on the frontend inputs.

## 3. Reuse / simplification / efficiency

### 3.1 Dead demo data left over from the pre-backend frontend — **Medium (easy, safe cleanup)**

- **Where:** `frontend/src/lib/kanban.ts:18-72` (`initialData`) and `:188-192` (`createId`)
- **Verified:** Both are unused outside test files. `initialData` is imported only by `AuthGate.test.tsx`, `AIChatSidebar.test.tsx`, `KanbanBoard.test.tsx`, and `api.test.ts` as fixture data. `createId` has zero references anywhere, including tests.
- **Why it matters:** Leftovers from the "frontend-only demo" phase (per `AGENTS.md`, before the backend became the source of truth for board data). Not a runtime bug, but a maintenance trap: `initialData` looks like it could be the real seed source, when the actual seed lives in `backend/app/database.py:19-84` — two disconnected copies of the same demo board that can silently drift.
- **Fix:** Delete `initialData` and `createId` from `kanban.ts`; give the affected test files their own minimal inline fixture board.

### 3.2 Card-reordering logic duplicated across the REST and AI mutation paths — **Medium**

- **Where:** `backend/app/database.py:540-599` (`move_card`, REST path) vs. `:230-431` (`apply_operations` / `_persist_board_state`, AI path); `create_card`/`update_card`/`delete_card` (`:453-538`) each hand-roll their own position bookkeeping too.
- **Issue:** Both paths independently reimplement "offset existing positions out of the way, then reassign `0..n-1`" with subtly different structure — which is exactly what produced the validation inconsistency in §1.1.
- **Fix:** Extract a single shared helper — "apply a reordering to a set of columns given target card-ID lists" — called by both the REST handlers and the AI batch path, so there's one place to fix bugs or change validation rules.

## 4. Consistency with docs

### 4.1 `docs/DATABASE.md` password-hash claim doesn't match implementation — **High**

- **Where:** `docs/DATABASE.md:14` vs. `backend/app/main.py:92-98`
- Same underlying issue as §2.1, from the docs-consistency angle: the doc describes hash-backed auth that the code doesn't deliver.
- **Fix:** Same as §2.1 — implement or update the doc, whichever direction is chosen.

No other doc/code drift found — `CLAUDE.md`/`AGENTS.md` route lists, module boundaries, exception classes, model name (`openai/gpt-oss-120b`), npm scripts, and coverage thresholds all check out against the real code.

## 5. Test coverage gaps

### 5.1 `move_card`'s out-of-range `position` clamping is untested — **Low (tied to §1.1)**

- **Where:** `backend/tests/test_database.py` (move_card tests at lines 43, 69, 116, 119, 120, 137 — none use an out-of-range position)
- **Issue:** No test exercises the single-move REST path with a `position` beyond the target column's length, so its clamping behavior (unlike the AI path's tested strict-reject at `test_ai.py:231`, `position: 99`) is unverified — the inconsistency in §1.1 could regress unnoticed in either direction.
- **Fix:** Add a test asserting the clamping behavior explicitly (or, once §1.1 is resolved, a test asserting the unified behavior).

### 5.2 `handleDragEnd`'s rollback-on-failure branch has no unit/component coverage — **Low**

- **Where:** `frontend/src/components/KanbanBoard.tsx:81-136` (`handleDragEnd`, failure branch at `:130-135`) and `:328-331` (`DragOverlay`/`activeCard` render)
- **Issue:** `KanbanBoard.test.tsx`'s five tests cover rename, add, edit, and delete — including delete's failure/rollback path (`"restores a card when a delete fails"`, line 118) — but none simulate a drag-end event. Drag-and-drop is only exercised at the Playwright e2e level (happy path only), so `handleDragEnd`'s own rollback-on-failure branch has no unit-level coverage, unlike the equivalent branches for delete/edit/rename.
- **Fix:** Add a component-level test that fires a `dnd-kit` drag-end event (or calls `handleDragEnd` indirectly through a mocked failing `api.moveCard`) to verify the rollback branch, mirroring the existing delete-failure test.

### 5.3 `password_hash()` has no direct unit test — **Low, defer**

- **Where:** `backend/app/database.py:91-94`; only indirectly exercised via a second-user seed in `test_database.py:86`
- **Issue:** No test verifies the hash format round-trips correctly (correct password matches, incorrect one doesn't).
- **Note:** This becomes moot if §2.1 is fixed by wiring `password_hash` into `login()` — it would then get real coverage through the existing login tests. Recommend deferring until that decision is made.

## 6. Frontend-specific issues

### 6.1 Blank column-title save silently reverts with no feedback — **Low**

- **Where:** `frontend/src/components/KanbanColumn.tsx:42-49` (`saveTitle`)
- **Issue:** Clearing the title input and blurring silently reverts to the previous title (`if (!nextTitle) setDraftTitle(column.title)`) with no error message — unlike every other form in the app (card add/edit, login), which shows a `role="alert"` message on invalid input.
- **Fix:** Show a brief inline validation message consistent with the other forms.

### 6.2 Mutation-error banner has no dismiss control or auto-clear — **Low**

- **Where:** `frontend/src/components/KanbanBoard.tsx:248-254`
- **Issue:** The fixed error banner only clears when the *next* mutation starts. If a user triggers one failing action and does nothing else, the banner persists indefinitely.
- **Fix:** Add a dismiss (×) button and/or an auto-clear timeout.

### 6.3 Card creation is the only mutation without optimistic UI — **Low, polish**

- **Where:** `frontend/src/components/KanbanBoard.tsx:158-188` (`handleAddCard`) vs. every other handler, which applies state optimistically before awaiting the API call
- **Issue:** `handleAddCard` waits for the server response before updating local state — no optimistic insert. Not a bug, but inconsistent: creating a card feels slower than every other action in an otherwise-optimistic UI.
- **Fix (optional):** Apply an optimistic placeholder card with a temporary client-side ID, reconciled with the server-assigned ID on success.
