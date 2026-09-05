import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/AuthGate";

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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<AuthGate />);

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Kanban Studio" })).not.toBeInTheDocument();
  });

  it("shows the board after a successful login", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "user" }),
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
  });

  it("logs out and returns to the login form", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<AuthGate />);
    await screen.findByRole("heading", { name: "Kanban Studio" });
    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeVisible();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("keeps the board and reports a logout error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });
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
