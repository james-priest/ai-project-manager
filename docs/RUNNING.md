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

## Part 3 smoke checks

- `GET /` serves the statically exported Next.js Kanban application.
- Next.js assets are served by FastAPI from the exported `out/` directory.
- `GET /api/health` returns `{ "status": "ok" }`.
- `GET /api/example` returns `{ "message": "hello world" }`.

## Part 4 authentication checks

- Open `/` and confirm the sign-in form appears before the board.
- Sign in with username `user` and password `password`.
- Confirm the board appears and a `Log out` button is available.
- Log out and reload `/`; confirm the sign-in form appears again.
- Try an incorrect password and confirm an error is shown without revealing which credential was wrong.

The SQLite volume is named `kanban-data` and is retained by the stop command for the persistence work in later parts.
