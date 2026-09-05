# Running locally

## Requirements

- Docker with Docker Compose support
- A project-root `.env` file. Copy `.env.example` to `.env` if needed.

The OpenRouter key can remain in `.env` for later work, but Part 2 does not pass it into the container or call OpenRouter.

## Start and stop

From the project root, use one of these pairs:

```bash
./scripts/start.sh
./scripts/stop.sh
```

On Windows, run `scripts\\start.bat` and `scripts\\stop.bat`.

The application is available at [http://127.0.0.1:3000](http://127.0.0.1:3000). The `APP_PORT` environment variable changes the host port.

## Part 2 smoke checks

- `GET /` serves the FastAPI static example page.
- The page calls `GET /api/example` and displays `hello world` when the API is available.
- `GET /api/health` returns `{ "status": "ok" }`.

The SQLite volume is named `kanban-data` and is retained by the stop command for the persistence work in later parts.
