# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A Project Management MVP: a Kanban board app with an AI chat assistant that can create/edit/move cards. Single hardcoded user (`user`/`password`), one board per user, runs locally in Docker. See `docs/PLAN.md` for the incremental build plan this repo was implemented against (the git history follows "Part N" commits matching plan phases) and `docs/DATABASE.md` / `docs/database-schema.json` for the approved SQLite schema.

## Architecture

Two apps combined into one Docker image:

- **`frontend/`** — Next.js 16 (App Router, React 19, TypeScript, Tailwind CSS 4, `@dnd-kit`). Built with `output: "export"`, producing a static `out/` directory — there is no Next.js server at runtime.
- **`backend/`** — FastAPI app (`backend/app/main.py`) that serves the exported static frontend at `/` and exposes the JSON API under `/api/*`. In Docker, `FRONTEND_STATIC_DIR` points at the copied `out/`; when that directory has no `index.html` (e.g. backend-only local dev), it falls back to the placeholder at `backend/static/index.html`.

Request flow: browser loads the static SPA from FastAPI → `AuthGate` (frontend) checks `/api/auth/me` → on success, board loads via `src/lib/api.ts` from `/api/board` → all board mutations (rename column, create/update/delete/move card) go through same-origin `/api/board/*` routes and are persisted immediately to SQLite → the AI sidebar posts to `/api/ai/chat`, and if the response has `updated: true`, the frontend reloads the board.

Backend module boundaries (`backend/app/`):
- `main.py` — routes, session-cookie auth (in-memory `SESSION_STORE`, not persisted), dependency wiring.
- `database.py` — SQLite schema init/seed and `BoardRepository` (all board reads/mutations; enforces ownership and ordering, rewrites affected positions in one transaction per mutation).
- `ai.py` — builds the AI prompt from board state, strictly parses/validates the model's response into board operations, applies them via `BoardRepository`.
- `openrouter.py` — `AIProvider` interface and `OpenRouterClient` implementation (model: `openai/gpt-oss-120b`), translates transport/provider errors into typed exceptions (`OpenRouterConfigurationError`, `OpenRouterTimeoutError`, `OpenRouterProviderError`) that `main.py` maps to HTTP status codes.
- `schemas.py` — Pydantic request/response models shared by routes.

The API always returns/consumes the full `BoardData` shape (columns with ordered `cardIds` + a `cards` map) even though SQLite stores normalized `users`/`boards`/`columns`/`cards` tables — the repository is responsible for reshaping between the two.

Frontend module boundaries (`frontend/src/`):
- `app/` — layout, page (renders `AuthGate`), global styles.
- `components/` — `KanbanBoard` (holds working board state), column/card/drag-preview/new-card components, `AIChatSidebar` (fixed launcher + draggable/resizable chat dialog, sends request-scoped conversation history).
- `lib/kanban.ts` — pure `Card`/`Column`/`BoardData` types and board transform functions; keep board logic here, not in components.
- `lib/api.ts` — typed same-origin API client (auth + board).

## Commands

Run the full stack (Docker Compose, requires `.env` copied from `.env.example` with `OPENROUTER_API_KEY`):

```bash
./scripts/start.sh   # scripts\start.bat on Windows
./scripts/stop.sh    # scripts\stop.bat on Windows
```

App is served at `http://127.0.0.1:3000` (override host port with `APP_PORT`). The SQLite DB lives in the `kanban-data` named volume and survives `stop`; only remove it to intentionally reset board data.

**Backend** (from repo root or `backend/`):

```bash
uv run --project backend pytest                          # all backend tests
uv run --project backend pytest backend/tests/test_ai.py -k some_test  # single test
uv run uvicorn app.main:app --reload                      # dev server (run from backend/)
```

Live OpenRouter test (normally mocked): requires a real key and is opt-in:

```bash
set -a; source .env; set +a
RUN_LIVE_OPENROUTER_TESTS=1 uv run --project backend pytest backend/tests/test_openrouter.py -k live
```

**Frontend** (from `frontend/`):

```bash
npm run dev
npm run build          # static export to out/
npm run lint
npm run test:unit
npm run test:coverage  # enforces >=80% statements/branches/functions/lines
npm run test:e2e       # Playwright; starts full Docker Compose app by default
npm run test:all       # coverage + e2e
```

Playwright: set `PLAYWRIGHT_BASE_URL` to target an already-running server instead of Docker Compose; set `PLAYWRIGHT_CHANNEL=chrome` to use an installed system Chrome instead of the bundled browser.

## Conventions

- Keep it simple: never over-engineer, no unnecessary defensive programming, no speculative features. Use latest/idiomatic library versions.
- When debugging, find the root cause before applying a fix — don't guess.
- No emojis, anywhere.
- Backend: keep persistent board behavior in `BoardRepository`, not in routes. Keep auth/ownership checks server-side — never trust a client-supplied user ID. Tests must use temporary SQLite databases, never the developer's local DB. Never log `OPENROUTER_API_KEY`.
- Frontend: keep board transform logic in `src/lib/`, not in component render logic. Use accessible labels/roles on controls (both users and Playwright tests rely on them). Add unit/component tests for new behavior and Playwright coverage for new end-to-end journeys.
- Visual system colors (`frontend/src/app/globals.css`): accent yellow `#ecad0a`, blue `#209dd7`, purple `#753991` (submit/important actions), navy `#032147` (headings), gray `#888888` (supporting text).
