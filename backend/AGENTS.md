# Backend instructions

## Current application

The backend is a small FastAPI application. `app/main.py` serves the exported frontend (or a placeholder during backend-only development), exposes the health and authentication routes, and owns the authenticated board API. SQLite persistence lives in `app/database.py`; request and response models live in `app/schemas.py`.

The project uses `uv` for Python dependency management. Runtime dependencies are declared in `pyproject.toml`; backend tests use pytest and FastAPI's test client.

## Structure

- `app/main.py`: FastAPI application, startup initialization, authentication, and board routes.
- `app/database.py`: SQLite schema initialization, seed data, and board repository mutations.
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
- Keep authentication and ownership checks on the backend; do not trust browser-provided user IDs.
- Use typed request and response models for non-trivial API payloads.
- Use temporary SQLite databases in tests and never modify the developer's local database from the test suite.
- Do not log secrets such as `OPENROUTER_API_KEY`.
