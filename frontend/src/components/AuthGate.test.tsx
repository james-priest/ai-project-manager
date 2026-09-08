import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/AuthGate";
import { testBoard } from "@/test/fixtures";

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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );

    render(<AuthGate />);

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Kanban Studio" })).not.toBeInTheDocument();
  });

  it("shows a retry state when the board cannot be loaded", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => testBoard });
    vi.stubGlobal("fetch", fetchMock);

    render(<AuthGate />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load your board. Please try again."
    );

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  });

  it("shows the board after a successful login", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => testBoard,
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AuthGate />);
    await screen.findByRole("heading", { name: /sign in/i });
    await user.type(screen.getByLabelText("Username"), "user");
    await user.type(screen.getByLabelText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username: "user", password: "password" }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/board", {
      credentials: "same-origin",
    });
  });

  it("logs out and returns to the login form", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => testBoard })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AuthGate />);
    await screen.findByRole("heading", { name: "Kanban Studio" });
    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("keeps the board and reports a logout error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => testBoard })
      .mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal("fetch", fetchMock);
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
