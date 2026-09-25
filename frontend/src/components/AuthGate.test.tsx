import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/AuthGate";
import { testBoard, testBoardSummaries } from "@/test/fixtures";

type RouteHandler = (init?: RequestInit) => unknown;

const ok = (body: unknown) => ({ ok: true, json: async () => body });

// Routes by URL so tests do not depend on the order requests happen to fire in.
const stubApi = (routes: Record<string, RouteHandler>) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const handler = routes[url];
    if (!handler) {
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    }
    return Promise.resolve(handler(init));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const signedInRoutes = (): Record<string, RouteHandler> => ({
  "/api/boards": () => ok(testBoardSummaries),
  "/api/boards/board-1": () => ok(testBoard),
  "/api/boards/board-2": () => ok({ columns: [], cards: {}, labels: {} }),
  "/api/auth/logout": () => ok({ authenticated: false }),
});

describe("AuthGate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows loading before checking the session", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));

    render(<AuthGate />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading workspace...");
  });

  it("shows the login form when the session is unauthenticated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    render(<AuthGate />);

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Kanban Studio" })
    ).not.toBeInTheDocument();
  });

  it("shows a retry state when the boards cannot be loaded", async () => {
    let failing = true;
    stubApi({
      "/api/boards": () =>
        failing ? { ok: false, status: 503 } : ok(testBoardSummaries),
      "/api/boards/board-1": () => ok(testBoard),
    });

    render(<AuthGate />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load your board. Please try again."
    );

    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { name: "Kanban Studio" })
    ).toBeVisible();
  });

  it("shows the first board after a successful login", async () => {
    let authenticated = false;
    const fetchMock = stubApi({
      ...signedInRoutes(),
      "/api/boards": () =>
        authenticated ? ok(testBoardSummaries) : { ok: false, status: 401 },
      "/api/auth/login": () => {
        authenticated = true;
        return ok({ authenticated: true, username: "user" });
      },
    });
    const user = userEvent.setup();

    render(<AuthGate />);
    await screen.findByRole("heading", { name: /sign in/i });
    await user.type(screen.getByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", { name: "Kanban Studio" })
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        body: JSON.stringify({ username: "user", password: "password" }),
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/board-1",
      expect.objectContaining({ credentials: "same-origin" })
    );
  });

  it("registers a new account and opens its board", async () => {
    let registered = false;
    const fetchMock = stubApi({
      ...signedInRoutes(),
      "/api/boards": () =>
        registered ? ok(testBoardSummaries) : { ok: false, status: 401 },
      "/api/auth/register": () => {
        registered = true;
        return ok({ authenticated: true, username: "ada" });
      },
    });
    const user = userEvent.setup();

    render(<AuthGate />);
    await screen.findByRole("heading", { name: /sign in/i });
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(
      screen.getByRole("heading", { name: "Create your account" })
    ).toBeVisible();

    await user.type(screen.getByLabelText("Username"), "ada");
    await user.type(screen.getByLabelText("Password"), "hunter2pass");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByRole("heading", { name: "Kanban Studio" })
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/register",
      expect.objectContaining({
        body: JSON.stringify({ username: "ada", password: "hunter2pass" }),
      })
    );
  });

  it("switches to another board", async () => {
    const fetchMock = stubApi(signedInRoutes());
    const user = userEvent.setup();

    render(<AuthGate />);
    await screen.findByRole("heading", { name: "Kanban Studio" });

    const boards = screen.getByRole("navigation", { name: "Boards" });
    await user.click(within(boards).getByRole("button", { name: /^Launch plan/ }));

    expect(
      await screen.findByRole("heading", { name: "Launch plan" })
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards/board-2",
      expect.objectContaining({ credentials: "same-origin" })
    );
  });

  it("creates a board and opens it", async () => {
    const summaries = [...testBoardSummaries];
    const fetchMock = stubApi({
      ...signedInRoutes(),
      "/api/boards": (init) => {
        if (init?.method === "POST") {
          const created = {
            id: "board-3",
            title: "Hiring",
            cardCount: 0,
            updatedAt: "2026-01-03T00:00:00+00:00",
            role: "owner" as const,
            memberCount: 1,
          };
          summaries.push(created);
          return ok(created);
        }
        return ok(summaries);
      },
      "/api/boards/board-3": () => ok({ columns: [], cards: {}, labels: {} }),
    });
    const user = userEvent.setup();

    render(<AuthGate />);
    await screen.findByRole("heading", { name: "Kanban Studio" });

    await user.click(screen.getByRole("button", { name: "New board" }));
    await user.type(screen.getByLabelText("New board name"), "Hiring");
    await user.click(screen.getByRole("button", { name: "Add board" }));

    expect(await screen.findByRole("heading", { name: "Hiring" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Hiring" }),
      })
    );
  });

  it("reports a board action that fails", async () => {
    stubApi({
      ...signedInRoutes(),
      "/api/boards": (init) =>
        init?.method === "POST"
          ? {
              ok: false,
              status: 409,
              json: async () => ({ detail: "That board already exists." }),
            }
          : ok(testBoardSummaries),
    });
    const user = userEvent.setup();

    render(<AuthGate />);
    await screen.findByRole("heading", { name: "Kanban Studio" });

    await user.click(screen.getByRole("button", { name: "New board" }));
    await user.type(screen.getByLabelText("New board name"), "Hiring");
    await user.click(screen.getByRole("button", { name: "Add board" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That board already exists."
    );
    expect(screen.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  });

  it("logs out and returns to the login form", async () => {
    let authenticated = true;
    const fetchMock = stubApi({
      ...signedInRoutes(),
      "/api/boards": () =>
        authenticated ? ok(testBoardSummaries) : { ok: false, status: 401 },
      "/api/auth/logout": () => {
        authenticated = false;
        return ok({ authenticated: false });
      },
    });
    const user = userEvent.setup();

    render(<AuthGate />);
    await screen.findByRole("heading", { name: "Kanban Studio" });
    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("keeps the board and reports a logout error", async () => {
    stubApi({
      ...signedInRoutes(),
      "/api/auth/logout": () => ({ ok: false, status: 500 }),
    });
    const user = userEvent.setup();

    render(<AuthGate />);
    await screen.findByRole("heading", { name: "Kanban Studio" });
    await user.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Unable to sign out. Please try again."
      )
    );
    expect(screen.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  });
});
