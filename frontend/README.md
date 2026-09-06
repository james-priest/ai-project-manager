# Kanban Studio

## Run

```bash
npm install
npm run dev
```

The production build writes a static export to `out/`. The project Docker image builds that export and FastAPI serves it at `/`.

## Tests

```bash
npm run test:unit
npm run test:coverage
npm run test:e2e
```

The end-to-end command starts the full Docker Compose application by default, so it exercises the FastAPI API and the static frontend together.

To run the browser journeys against the Docker container instead of the Next.js development server:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

If the bundled Playwright browser is unavailable locally but system Chrome is installed, add `PLAYWRIGHT_CHANNEL=chrome`.
