import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import type { BoardData } from "@/lib/kanban";
import { testBoard } from "@/test/fixtures";

const chatResult = (response: string, board: BoardData = testBoard, updated = false) => ({
  response,
  board,
  updated,
});

describe("AIChatSidebar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows an empty conversation and validates a blank question", async () => {
    render(<AIChatSidebar onBoardUpdate={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Open workspace assistant" })).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Open workspace assistant" })
    );
    expect(screen.getByText("Try “What should we prioritize next?”")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ask a question before sending."
    );
  });

  it("sends a question and renders the assistant response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => chatResult("Focus on the review queue."),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AIChatSidebar onBoardUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Open workspace assistant" }));

    const input = screen.getByRole("textbox", { name: "Your question" });
    await user.type(input, "What should we prioritize?");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByText("Focus on the review queue.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/chat", expect.objectContaining({
      body: JSON.stringify({ question: "What should we prioritize?", history: [] }),
    }));
    expect(screen.getByText("What should we prioritize?")).toBeInTheDocument();
  });

  it("sends prior messages and applies an updated board", async () => {
    const updatedBoard: BoardData = {
      ...testBoard,
      cards: {
        ...testBoard.cards,
        "card-1": {
          ...testBoard.cards["card-1"],
          title: "Updated roadmap themes",
        },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => chatResult("The review queue is next."),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => chatResult("I updated the roadmap.", updatedBoard, true),
      });
    vi.stubGlobal("fetch", fetchMock);
    const onBoardUpdate = vi.fn();
    const user = userEvent.setup();
    render(<AIChatSidebar onBoardUpdate={onBoardUpdate} />);
    await user.click(screen.getByRole("button", { name: "Open workspace assistant" }));

    const input = screen.getByRole("textbox", { name: "Your question" });
    await user.type(input, "Summarize the board.");
    await user.keyboard("{Enter}");
    await screen.findByText("The review queue is next.");

    await user.type(input, "Update the first task.");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onBoardUpdate).toHaveBeenCalledWith(updatedBoard));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/ai/chat",
      expect.objectContaining({
        body: JSON.stringify({
          question: "Update the first task.",
          history: [
            { role: "user", content: "Summarize the board." },
            { role: "assistant", content: "The review queue is next." },
          ],
        }),
      })
    );
  });

  it("disables chat controls while a request is in flight", async () => {
    let resolveRequest: (value: unknown) => void = () => undefined;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AIChatSidebar onBoardUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Open workspace assistant" }));

    const input = screen.getByRole("textbox", { name: "Your question" });
    await user.type(input, "Hold this request.");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    expect(input).toBeDisabled();
    resolveRequest({
      ok: true,
      json: async () => chatResult("Done."),
    });
    await screen.findByText("Done.");
  });

  it("reports a provider error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const user = userEvent.setup();
    render(<AIChatSidebar onBoardUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Open workspace assistant" }));

    await user.type(
      screen.getByRole("textbox", { name: "Your question" }),
      "Can you help?"
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to reach the AI assistant. Please try again."
    );
  });

  it("calls onSessionExpired instead of showing an error when the chat request returns 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ detail: "Authentication required" }),
      })
    );
    const onSessionExpired = vi.fn();
    const user = userEvent.setup();
    render(
      <AIChatSidebar onBoardUpdate={vi.fn()} onSessionExpired={onSessionExpired} />
    );
    await user.click(screen.getByRole("button", { name: "Open workspace assistant" }));

    await user.type(
      screen.getByRole("textbox", { name: "Your question" }),
      "Anything?"
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens as a dialog, focuses the question, and restores launcher focus on close", async () => {
    const user = userEvent.setup();
    render(<AIChatSidebar onBoardUpdate={vi.fn()} />);

    const launcher = screen.getByRole("button", {
      name: "Open workspace assistant",
    });
    await user.click(launcher);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Your question" })).toHaveFocus()
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Open workspace assistant" })).toHaveFocus());
  });

  it("supports pointer drag, pointer resize, keyboard resize, and viewport correction", async () => {
    const setPointerCapture = vi.fn();
    const hasPointerCapture = vi.fn().mockReturnValue(true);
    const releasePointerCapture = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: setPointerCapture,
    });
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      configurable: true,
      value: hasPointerCapture,
    });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      configurable: true,
      value: releasePointerCapture,
    });

    const user = userEvent.setup();
    render(<AIChatSidebar onBoardUpdate={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Open workspace assistant" }));

    const dialog = screen.getByRole("dialog");
    const dragHandle = screen.getByTestId("ai-chat-drag-handle");
    const resizeHandle = screen.getByTestId("ai-chat-resize-handle");
    const originalLeft = Number.parseFloat(dialog.style.left);
    const originalTop = Number.parseFloat(dialog.style.top);
    const originalWidth = Number.parseFloat(dialog.style.width);

    fireEvent.pointerDown(dragHandle, {
      button: 0,
      pointerId: 1,
      clientX: 800,
      clientY: 300,
    });
    fireEvent.pointerMove(dragHandle, {
      pointerId: 1,
      clientX: 700,
      clientY: 200,
    });
    fireEvent.pointerUp(dragHandle, { pointerId: 1 });
    expect(Number.parseFloat(dialog.style.left)).toBeLessThan(originalLeft);
    expect(Number.parseFloat(dialog.style.top)).toBeLessThan(originalTop);

    fireEvent.pointerDown(resizeHandle, {
      button: 0,
      pointerId: 2,
      clientX: 1000,
      clientY: 700,
    });
    fireEvent.pointerMove(resizeHandle, {
      pointerId: 2,
      clientX: 1050,
      clientY: 740,
    });
    fireEvent.pointerUp(resizeHandle, { pointerId: 2 });
    expect(Number.parseFloat(dialog.style.width)).toBeGreaterThan(originalWidth);

    fireEvent.keyDown(resizeHandle, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(resizeHandle, { key: "Unrelated" });

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 480,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 400,
    });
    fireEvent(window, new Event("resize"));
    await waitFor(() =>
      expect(Number.parseFloat(dialog.style.left)).toBeGreaterThanOrEqual(0)
    );
  });
});
