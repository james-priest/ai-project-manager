import { api, ApiError, getApiErrorMessage } from "@/lib/api";
import { testBoard } from "@/test/fixtures";

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends same-origin auth requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true, username: "user" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.getCurrentUser();
    await api.login("user", "password");
    await api.logout();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/auth/me", {
      credentials: "same-origin",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "user", password: "password" }),
      credentials: "same-origin",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("maps board operations to the backend routes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "card-new" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.getBoard();
    await api.renameColumn("col/backlog", "Queue");
    await api.createCard("col-backlog", "New card", "Notes");
    await api.updateCard("card/1", "Updated", "Details");
    await api.deleteCard("card/1");
    await api.moveCard("card/1", "col-review", 2);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/board", {
      credentials: "same-origin",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/board/columns/col%2Fbacklog",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ title: "Queue" }) })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/board/cards",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          column_id: "col-backlog",
          title: "New card",
          details: "Notes",
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/board/cards/card%2F1",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/board/cards/card%2F1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      "/api/board/cards/card%2F1/move",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ target_column_id: "col-review", position: 2 }),
      })
    );
  });

  it("surfaces API error details and fallback errors", async () => {
    const detailResponse = {
      ok: false,
      status: 404,
      json: async () => ({ detail: "Card not found" }),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(detailResponse));

    await expect(api.getBoard()).rejects.toEqual(
      expect.objectContaining({
        name: "ApiError",
        message: "Card not found",
        status: 404,
      })
    );

    const emptyResponse = {
      ok: false,
      status: 503,
      json: async () => {
        throw new Error("not JSON");
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(emptyResponse));
    await expect(api.getBoard()).rejects.toEqual(
      expect.objectContaining({
        message: "Request failed with status 503.",
        status: 503,
      })
    );

    expect(getApiErrorMessage(new ApiError("Bad request", 400), "Fallback")).toBe(
      "Bad request"
    );
    expect(getApiErrorMessage(new Error("offline"), "Fallback")).toBe("Fallback");
  });

  it("sends the chat question and request-scoped history", async () => {
    const chatResponse = {
      response: "I found one priority.",
      board: testBoard,
      updated: false,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => chatResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const history = [
      { role: "user" as const, content: "Summarize the board." },
      { role: "assistant" as const, content: "Review is next." },
    ];
    await expect(api.chat("What should we prioritize?", history)).resolves.toEqual(
      chatResponse
    );

    expect(fetchMock).toHaveBeenCalledWith("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "What should we prioritize?",
        history,
      }),
      credentials: "same-origin",
    });
  });
});
