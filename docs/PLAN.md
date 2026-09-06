# Project Management MVP implementation plan

Status: Parts 1 through 6 are complete. Part 7 is next.

## Agreed constraints and decisions

- The app runs locally in one Docker container.
- The frontend is Next.js with the App Router and is statically built for FastAPI to serve.
- The backend is Python FastAPI and owns authentication, board data, and AI calls.
- SQLite is created automatically when it does not exist.
- The MVP login is `user` / `password`; the data model supports multiple users.
- Authentication uses a server-side session identifier in an HTTP-only cookie. The MVP may use an in-process session store because it runs as one local container; board data remains persistent in SQLite.
- OpenRouter is used with model `openai/gpt-oss-120b` and `OPENROUTER_API_KEY` from the project root `.env`.
- The existing frontend test setup remains the default: Vitest, Testing Library, and Playwright.
- Unit tests must maintain at least 80% coverage. Coverage should be enforced for statements, branches, functions, and lines across unit-testable application code.
- Integration testing must cover frontend/backend behavior and the main user journeys, not only isolated components.
- The implementation stays focused on the stated MVP. No unrelated features or infrastructure are added.

## Test policy

- Keep unit tests beside the code they test where practical.
- Use Vitest and Testing Library for pure functions, components, state transitions, form behavior, API-client behavior, loading states, and error states.
- Add a coverage command and enforce the 80% thresholds in Vitest. Generated files, configuration files, and end-to-end test files are excluded from the unit-coverage calculation.
- Use Playwright for browser-level integration tests, including authentication, board persistence, drag and drop, and AI-chat refresh behavior.
- Use FastAPI test clients with temporary SQLite databases for backend integration tests. Tests must not modify the developer's local database.
- External OpenRouter tests are opt-in and require `OPENROUTER_API_KEY`; normal CI/local test runs use a mocked provider.
- Every part below has explicit tests and success criteria. A part is complete only when its tests pass and its success criteria are met.

## Part 1: Planning and frontend documentation

- [x] Review the repository instructions and existing project structure.
- [x] Inspect the existing frontend components, data model, scripts, and test configuration.
- [x] Record the existing frontend architecture in `frontend/AGENTS.md`.
- [x] Expand this document with implementation checklists, tests, and success criteria.
- [x] Obtain user approval for this plan.

Tests:

- Verify the documentation files exist and accurately describe the current frontend setup.
- No application test run is required for documentation-only changes.

Success criteria:

- The user has approved the plan.
- Future implementation work can proceed part by part without unresolved architectural decisions.

## Part 2: Docker and backend scaffolding

- [x] Create the minimal FastAPI application in `backend/`.
- [x] Add a health endpoint and a simple example API endpoint.
- [x] Add a minimal static HTML response or placeholder static directory so the container can prove that `/` is served by FastAPI.
- [x] Add the Python project configuration and dependencies managed by `uv`.
- [x] Add a multi-stage Docker build that builds the frontend assets and runs FastAPI.
- [x] Add local Docker configuration with a persistent location for the SQLite database.
- [x] Add start and stop scripts for macOS/Linux and Windows in `scripts/`, following `scripts/AGENTS.md`.
- [x] Document the minimum local setup, environment file, ports, and start/stop commands.
- [x] Keep the backend's static-file and API routing arrangement compatible with the later Next.js static export.

Tests:

- Backend unit test for the health/example endpoints.
- Container smoke test that starts the application, receives the static example at `/`, and receives a successful API response.
- Verify the start and stop scripts report useful errors when Docker is unavailable.
- Run frontend lint/build checks as part of the container build validation.

Success criteria:

- A fresh checkout with Docker and `uv` available can be started with the documented script.
- `GET /` returns the example static page and the example API route returns the expected response.
- The application stops cleanly and does not require a manually created database.

## Part 3: Add the existing frontend as a static site

- [x] Configure the existing Next.js app for a static export compatible with FastAPI static serving.
- [x] Preserve the current visual design and color variables from `frontend/src/app/globals.css`.
- [x] Copy or mount the generated static output into the backend image at build time.
- [x] Make FastAPI serve the exported site at `/` and retain `/api/*` for backend routes.
- [x] Preserve the current demo behavior: five columns, column renaming, card creation, card removal, and drag-and-drop.
- [x] Replace only the minimum browser-incompatible behavior required by static hosting.

Tests:

- Unit tests for current Kanban state transitions and component interactions.
- Add coverage for invalid/unchanged drag targets and empty-column behavior.
- Playwright smoke test against the container: load `/`, verify the board, rename a column, add/remove a card, and move a card.
- Verify the static build produces the files FastAPI expects and that a missing static asset returns an appropriate response.

Success criteria:

- The container serves the real Kanban frontend at `/`.
- The existing demo behavior works in a browser through FastAPI.
- The frontend unit suite meets the 80% coverage threshold.

## Part 4: Fake user sign-in experience

- [x] Add a login view shown when no valid session exists.
- [x] Submit credentials to a FastAPI login route using `user` / `password`.
- [x] Create a server-side session and set an HTTP-only cookie on successful login.
- [x] Return a clear, accessible error for invalid credentials without revealing which field was wrong.
- [x] Add a session-check route used on initial page load.
- [x] Add a logout action that invalidates the server-side session and clears the cookie.
- [x] Protect the board route/API access from unauthenticated requests.
- [x] Keep the login implementation simple and avoid client-only authentication state as the source of truth.

Tests:

- Unit tests for credential validation, session creation, invalidation, and cookie attributes.
- Frontend tests for login form submission, validation, loading, error, authenticated, and logged-out states.
- Backend integration tests for successful login, failed login, session reuse, logout, expired/unknown session, and protected routes.
- Playwright journey: unauthenticated visit, failed login, successful login, board access, logout, and blocked return to the board.

Success criteria:

- Only `user` / `password` can access the board.
- The session is represented by a server-managed HTTP-only cookie.
- Logout immediately prevents further access through the session.

## Part 5: Database modeling and approval

- [x] Propose the SQLite schema for users, boards, columns, cards, and any required session metadata.
- [x] Define primary keys, foreign keys, ordering fields, timestamps, and deletion behavior.
- [x] Define the canonical board JSON representation used by the frontend and AI prompt.
- [x] Save the proposal as `docs/database-schema.json`.
- [x] Add a short explanation in `docs/` covering why the relational storage and board JSON shape are separate concerns.
- [x] Include seed data for the single MVP user and the existing demo board without duplicating cards within a column.
- [x] Obtain user sign-off on the schema before implementing persistent board access.

Tests:

- Validate `docs/database-schema.json` as valid JSON and check required entities/fields are present.
- Review example seed data against the existing frontend board and verify IDs/order are stable.

Success criteria:

- The user has approved the schema.
- The schema supports multiple users and one board per user without requiring a redesign for the MVP.
- The canonical board JSON can represent renamed columns, ordered cards, and card edits.

## Part 6: Persistent backend board API

- [x] Initialize SQLite on application startup or first use, creating all required tables if absent.
- [x] Seed the MVP user and its initial board only when the database is new or the records are absent.
- [x] Add a small repository/service layer using the simplest appropriate SQLite access pattern.
- [x] Add authenticated routes to read the current user's board.
- [x] Add routes to rename columns, create cards, edit cards, remove cards, and move cards to a target column/position.
- [x] Validate ownership, IDs, required fields, column membership, and card ordering on every mutation.
- [x] Use transactions for mutations so a failed operation cannot leave columns and cards inconsistent.
- [x] Return stable JSON matching the canonical board representation.
- [x] Return consistent 4xx responses for authentication, validation, and missing-resource errors.

Tests:

- Unit tests for schema initialization, seed behavior, repository operations, validation, ordering, and transaction rollback.
- Backend integration tests for every route, including cross-user access attempts and missing IDs.
- Test restart behavior: write a board change, recreate the app against the same database, and verify the change remains.
- Test a temporary fresh database and verify it is created and seeded automatically.
- Add concurrency/duplicate-request coverage only where needed to protect ordering and transaction invariants.

Success criteria:

- The database is created automatically and survives application restarts.
- An authenticated user can fully manage their own board through the API.
- A user cannot read or mutate another user's board.
- The 80% unit-coverage threshold remains satisfied.

## Part 7: Connect the frontend to the backend

- [ ] Replace the frontend's in-memory board source with the authenticated board API.
- [ ] Add a small typed API client for auth and board operations.
- [ ] Load the board after session verification and show clear loading/empty/error states.
- [ ] Persist column renames, card creation, card edits, card removal, and drag-and-drop moves.
- [ ] Keep UI state and server state synchronized after successful mutations.
- [ ] Recover cleanly from failed mutations without silently losing the user's visible board state.
- [ ] Ensure the static frontend uses same-origin `/api` requests in the container.

Tests:

- Unit tests for API-client request/response mapping and error handling.
- Component integration tests with mocked network responses for loading, success, failure, and retry behavior.
- Backend/frontend integration tests using a temporary SQLite database.
- Playwright tests covering login, initial board load, each board mutation, page reload persistence, logout, and unauthorized API responses.

Success criteria:

- The board shown in the browser is backed by SQLite rather than local component state.
- Changes remain after a reload and container restart.
- All major user journeys work through the built static site and FastAPI server.

## Part 8: OpenRouter connectivity

- [ ] Add a backend AI client that reads `OPENROUTER_API_KEY` from the environment.
- [ ] Use `openai/gpt-oss-120b` exactly as the configured model.
- [ ] Add a minimal internal service/route that sends the test prompt `2+2` and returns the model response.
- [ ] Set a bounded request timeout and return a useful application error for provider failures.
- [ ] Never log the API key or full sensitive request headers.
- [ ] Keep the provider behind a small interface so normal tests can use a fake provider.

Tests:

- Unit tests for request construction, configuration errors, timeout handling, provider errors, and response parsing using a mocked HTTP/provider client.
- An opt-in live connectivity test using the real key and the `2+2` prompt.
- Verify normal unit/integration test commands do not require network access or a real API key.

Success criteria:

- With a valid key, the backend can complete the `2+2` connectivity check through OpenRouter.
- Without a key or when OpenRouter fails, the app returns a controlled error and remains running.

## Part 9: Structured AI board operations

- [ ] Define typed request/response models for the user's question, conversation history, current board JSON, assistant response, and optional board update.
- [ ] Send the current authenticated user's complete board JSON, the user's question, and conversation history to the model on every chat request.
- [ ] Define structured operations for creating, editing, and moving one or more cards; include optional column rename only if required by the approved product scope.
- [ ] Require the model response to contain user-facing text and either no update or a validated update operation list.
- [ ] Validate every model-generated ID, column, position, title, and details field on the server.
- [ ] Apply multiple valid operations atomically against the authenticated user's board.
- [ ] Reject malformed or unauthorized operations without partially applying them.
- [ ] Return the assistant response and the resulting board (or a signal that no board change occurred) to the frontend.
- [ ] Keep conversation history request-scoped for the MVP; do not add chat-history persistence unless separately approved.

Tests:

- Unit tests for structured-output parsing, operation validation, operation ordering, and atomic rollback.
- Provider-mocked integration tests proving the prompt includes the current board, question, and history.
- Tests for create, edit, and move operations singly and in combination.
- Tests for malformed JSON, unknown IDs, invalid columns/positions, duplicate operations, and provider refusal/error responses.
- Security tests proving model output cannot escape the authenticated user's board.

Success criteria:

- Each chat request includes the required board and conversation context.
- The backend can safely apply zero, one, or multiple model-requested card operations.
- Invalid model output never corrupts persisted board data.

## Part 10: AI chat sidebar

- [ ] Add an accessible, responsive sidebar widget to the authenticated board view.
- [ ] Render conversation history, user messages, assistant responses, and provider/application errors.
- [ ] Add an input and submit action with disabled/loading behavior while a request is in flight.
- [ ] Send the current question and conversation history to the structured AI endpoint.
- [ ] Display the assistant response and automatically refresh the board when the response includes an update.
- [ ] Preserve the board's drag-and-drop, editing, and card creation behavior while the sidebar is open.
- [ ] Match the existing color scheme, typography, spacing, and visual style.
- [ ] Ensure keyboard navigation, labels, focus states, and mobile layout are usable.

Tests:

- Unit/component tests for rendering, submitting, loading, errors, history, keyboard behavior, and board-refresh triggering.
- Integration tests with mocked structured responses for no-op, single-card, and multi-card updates.
- Playwright journey: ask the assistant to create, edit, and move cards; verify the response, refreshed board, persisted result, and continued manual board interaction.
- Playwright failure tests for unavailable AI and malformed server responses.
- Run the complete unit, backend integration, frontend integration, and browser suites with coverage reporting.

Success criteria:

- A signed-in user can use the sidebar to ask questions and see responses.
- The AI can create, edit, and move one or more cards through validated structured output.
- AI-triggered board changes appear automatically and remain persisted after reload.
- The complete test suite passes and unit coverage remains at or above 80%.
