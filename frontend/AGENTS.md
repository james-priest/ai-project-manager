# Frontend instructions

## Current application

This directory contains the existing Kanban Studio frontend. It is a Next.js 16 App Router application using TypeScript, React 19, Tailwind CSS 4, and `@dnd-kit` for drag and drop. `next.config.ts` is configured for a static export; production builds write the site to `out/` for FastAPI to serve.

The current app is a frontend-only demo. `src/app/page.tsx` renders `KanbanBoard`, and the board is held in React state initialized from `src/lib/kanban.ts`. There is currently no authentication, backend API, persistence, or AI chat.

## Structure

- `src/app/`: Next.js layout, page, global styles, and favicon.
- `src/components/`: board, column, card, drag preview, and new-card form components.
- `src/lib/kanban.ts`: `Card`, `Column`, and `BoardData` types, demo data, card movement, and ID creation.
- `src/test/`: Vitest setup and type declarations.
- `src/**/*.test.ts(x)`: Vitest unit/component tests.
- `tests/`: Playwright browser integration tests.
- `public/`: static assets.

## Existing behavior

- The demo renders five columns and the initial sample cards.
- Column titles can be edited inline.
- Cards can be added, removed, and moved within or between columns with `@dnd-kit`.
- The visual system uses the project colors in `src/app/globals.css`: yellow `#ecad0a`, blue `#209dd7`, purple `#753991`, navy `#032147`, and gray `#888888`.

## Commands

Run from this directory:

```bash
npm run dev
npm run build
npm run lint
npm run test:unit
npm run test:e2e
npm run test:all
```

Vitest uses jsdom, Testing Library, `user-event`, and the setup file at `src/test/setup.ts`. Playwright starts the Next.js development server at `http://127.0.0.1:3000` by default. Set `PLAYWRIGHT_BASE_URL` to test an externally running container; set `PLAYWRIGHT_CHANNEL=chrome` when using an installed system Chrome.

## Conventions for future work

- Keep board transformations in small, testable functions in `src/lib/` rather than embedding them in render logic.
- Keep components focused on presentation and user interaction; pass state changes through typed callbacks or a small API/data layer.
- Use accessible labels and roles for controls so both users and browser tests can interact with the UI.
- Preserve the existing visual language and avoid adding features outside the approved project plan.
- Add unit/component tests for new behavior and Playwright coverage for important end-to-end journeys. Maintain at least 80% unit-test coverage once coverage thresholds are enabled.
- Use same-origin `/api` requests when the static site is served by FastAPI.
