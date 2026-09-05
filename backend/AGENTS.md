# Backend instructions

## Current application

The backend is a small FastAPI application. `app/main.py` currently serves a placeholder static page at `/` and exposes `/api/health` and `/api/example` for the Part 2 container smoke test.

The project uses `uv` for Python dependency management. Runtime dependencies are declared in `pyproject.toml`; backend tests use pytest and FastAPI's test client.

## Structure

- `app/main.py`: FastAPI application and initial routes.
- `static/index.html`: Part 2 placeholder page served at `/`.
- `tests/`: backend unit tests.
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

- Keep API routes small and move persistent board behavior into focused services/repositories as the plan adds it.
- Keep authentication and ownership checks on the backend; do not trust browser-provided user IDs.
- Use typed request and response models for non-trivial API payloads.
- Use temporary SQLite databases in tests and never modify the developer's local database from the test suite.
- Do not log secrets such as `OPENROUTER_API_KEY`.
