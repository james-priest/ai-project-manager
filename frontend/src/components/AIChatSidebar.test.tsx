import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import { initialData, type BoardData } from "@/lib/kanban";

const chatResult = (response: string, board: BoardData = initialData, updated = false) => ({
  response,
  board,
  updated,
});

describe("AIChatSidebar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty conversation and validates a blank question", async () => {
    render(<AIChatSidebar onBoardUpdate={vi.fn()} />);

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
      ...initialData,
      cards: {
        ...initialData.cards,
        "card-1": {
          ...initialData.cards["card-1"],
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

    await user.type(
      screen.getByRole("textbox", { name: "Your question" }),
      "Can you help?"
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to reach the AI assistant. Please try again."
    );
  });
});
