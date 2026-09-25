# Running locally

## Requirements

- Docker with Docker Compose support
- A project-root `.env` file. Copy `.env.example` to `.env` if needed.

The OpenRouter key is read from `.env` and passed into the container for the AI routes. Do not commit `.env` or print the key in logs.

## Start and stop

From the project root, use one of these pairs:

```bash
./scripts/start.sh
./scripts/stop.sh
```

On Windows, run `scripts\\start.bat` and `scripts\\stop.bat`.

The application is available at [http://127.0.0.1:3000](http://127.0.0.1:3000). The `APP_PORT` environment variable changes the host port.

## Smoke checks

- `GET /` serves the statically exported Next.js Kanban application.
- Next.js assets are served by FastAPI from the exported `out/` directory.
- `GET /api/health` returns `{ "status": "ok" }`.
- Authenticated `GET /api/example` returns `{ "message": "hello world" }`.

## Data and persistence

- The SQLite database is created and seeded automatically in the persistent
  `kanban-data` volume, and `GET /api/health` returns `{ "status": "ok" }`.
- Board changes go through the authenticated API and survive a container restart.
- `./scripts/stop.sh` keeps the named volume. Remove it only when intentionally
  resetting local board data.
- The container runs as the non-root user `app` (uid 10001). A `kanban-data` volume
  created by an older, root-only image is not writable by that user; fix it once,
  with the stack stopped, before starting again:

  ```bash
  docker compose run --rm --user root --entrypoint sh app -c 'chown -R app:app /app/data'
  ```

- The schema migrates itself on startup: earlier databases gain multiple boards per
  user, card due dates and assignees, labels, sharing, comments, activity, and board
  archiving without losing data.

## Accounts

- Open `/`. The sign-in form appears before any board.
- `Create an account` registers a new user (3+ characters, password 8+) and opens a
  starter board. A taken username is reported without saying whether the password
  was right.
- The seeded demo account is `user` / `password`.
- Sessions live in SQLite, so a container restart no longer signs everyone out.

## Boards

- The board switcher lists your boards with their card counts. `New board` creates
  one from a template: `kanban` (five columns), `sprint` (four), or `blank`.
- The active board can be renamed, archived, or deleted. Archiving hides a board
  until `Show archived` is ticked; the last remaining board cannot be deleted.
- Columns can be added, moved with `Left`/`Right`, and deleted. Deleting names how
  many cards go with it, and a board always keeps one column.

## Cards

- Click a card title to open its detail dialog: a Markdown description, due date,
  assignee, labels, a checklist, and comments. Editing happens here.
- Checklist steps can be ticked off; the card face shows progress such as `1/2 done`.
- Cards can be dragged between columns, or moved with the keyboard: focus a card,
  press Space, use the arrow keys, then press Space again.
- The toolbar filters by text, by label, and by due date (overdue, due within seven
  days, or no due date). `/` jumps to the search box and Escape clears it.
- `My work` lists cards assigned to you across every board you belong to, soonest
  due date first, and opens one straight from the list.

## Sharing

- `Sharing and activity` shows the board's members and its recent history.
- The owner can invite another registered user by username and remove members.
  Members can leave a board themselves but cannot remove anyone else.
- Every change is recorded in the activity log, including changes the assistant makes.

## OpenRouter checks

- Sign in before calling the protected `POST /api/ai/connectivity` route.
- With a configured key, the route sends `2+2` to OpenRouter using `openai/gpt-oss-120b` and returns the provider response.
- Without a key or when the provider is unavailable, the route returns a controlled error without exposing the key.
- Normal backend tests use mocked provider transports. To opt into the live test, export the key and set `RUN_LIVE_OPENROUTER_TESTS=1` before running:

```bash
set -a
source .env
set +a
RUN_LIVE_OPENROUTER_TESTS=1 uv run --project backend pytest backend/tests/test_openrouter.py -k live
```

## AI chat checks

- Sign in before calling the protected `POST /api/ai/chat` route.
- Send a question and, optionally, request-scoped conversation history. The response includes the assistant text, an `updated` flag, and the resulting board.
- The backend rejects malformed or unauthorized model operations and leaves the board unchanged.

Example request body:

```json
{
  "question": "Move the roadmap themes card to review.",
  "history": [],
  "board_id": "board-..."
}
```

The assistant can add, edit, move, and delete cards, set due dates, assignees, and
existing labels, and break a card into checklist steps. An edit only changes the fields it mentions, so asking it to
rename a card leaves that card's due date and assignee alone.

## Assistant behavior checks

- Sign in and confirm the fixed assistant launcher appears in the lower-right corner without taking space from the board.
- Click the launcher and confirm the `Ask the board` dialog appears above the board in the lower-right corner.
- Drag the dialog by its header and resize it from the lower-right handle. Confirm it stays within the viewport.
- Scroll the page when the board extends below the fold and confirm the assistant remains fixed in the same viewport position.
- Enter a question and press `Send message`, or press Enter. Use Shift+Enter for a multiline question.
- Confirm user and assistant messages appear in the conversation and that the send controls are disabled while the request is running.
- When the assistant changes cards, confirm the board updates without a page reload and remains changed after reloading.
- If the AI request fails, confirm an application error appears and the existing board remains usable.
