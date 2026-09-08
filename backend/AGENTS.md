# Backend instructions

## Current application

The backend is a small FastAPI application. `app/main.py` only assembles the app: lifespan (DB init), static-frontend serving (or a placeholder during backend-only development), and the route modules under `app/routes/`. Environment-derived settings (database path, static-dir resolution, session cookie name/lifetime, the hardcoded MVP username) live in `app/config.py`. Shared FastAPI dependencies (session auth, repository/provider factories) live in `app/dependencies.py`. SQLite persistence lives in `app/database.py`; AI prompt and response handling lives in `app/ai.py`; request and response models live in `app/schemas.py`; the OpenRouter provider lives in `app/openrouter.py`.

The project uses `uv` for Python dependency management. Runtime dependencies are declared in `pyproject.toml`; backend tests use pytest and FastAPI's test client.

## Structure

- `app/main.py`: FastAPI app assembly — lifespan, static-file serving, `include_router` wiring. No route handlers or business logic.
- `app/config.py`: environment-derived settings and path resolution (database path, static dir, session cookie name/lifetime, MVP username).
- `app/dependencies.py`: shared FastAPI dependencies — `get_current_user` (session-cookie auth backed by the in-memory `SESSION_STORE`), `create_session`, `get_board_repository`, `get_ai_provider`.
- `app/routes/health.py`: `GET /api/health`.
- `app/routes/auth.py`: login, logout, current-user check, and the authenticated `/api/example` demo route.
- `app/routes/board.py`: authenticated board CRUD routes (read/rename/create/update/delete/move).
- `app/routes/ai.py`: AI connectivity and structured AI chat routes.
- `app/database.py`: SQLite schema initialization, seed data, password hashing, and board repository mutations.
- `app/ai.py`: AI chat prompt construction, strict response parsing, and operation validation.
- `app/openrouter.py`: OpenRouter client, provider interface, request construction, and controlled provider errors.
- `app/schemas.py`: typed board and mutation request/response models.
- `static/index.html`: Part 2 placeholder page served at `/`.
- `tests/`: backend unit and integration tests using temporary SQLite databases.
- `pyproject.toml`: project metadata and runtime/development dependencies.

## Commands

Run from the repository root:

```bash
uv run --project backend pytest
```

Run the development server from the `backend/` directory:

```bash
uv run uvicorn app.main:app --reload
```

## Conventions for future work

- Keep API routes small and keep persistent board behavior in the focused repository.
- Add new routes under `app/routes/` (one module per resource); add new environment/settings values to `app/config.py`; add new shared FastAPI dependencies to `app/dependencies.py` rather than defining them inline in a route module.
- Keep authentication and ownership checks on the backend; do not trust browser-provided user IDs.
- Use typed request and response models for non-trivial API payloads.
- Use temporary SQLite databases in tests and never modify the developer's local database from the test suite.
- Do not log secrets such as `OPENROUTER_API_KEY`.
