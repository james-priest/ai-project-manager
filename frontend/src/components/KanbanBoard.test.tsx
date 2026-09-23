import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { testBoard } from "@/test/fixtures";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderBoard = () => render(<KanbanBoard initialBoard={testBoard} />);

  it("renders five columns", () => {
    renderBoard();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renders compact accessible card action icons beside the title", () => {
    renderBoard();

    const card = screen.getByTestId("card-card-1");
    const editButton = within(card).getByRole("button", {
      name: "Edit Align roadmap themes",
    });
    const deleteButton = within(card).getByRole("button", {
      name: "Delete Align roadmap themes",
    });

    expect(editButton).toHaveAttribute("title", "Edit Align roadmap themes");
    expect(deleteButton).toHaveAttribute("title", "Delete Align roadmap themes");
    expect(editButton.querySelector("svg")).toBeInTheDocument();
    expect(deleteButton.querySelector("svg")).toBeInTheDocument();
    expect(within(card).queryByText("Remove")).not.toBeInTheDocument();
  });

  it("renames a column", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ updated: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText(/Column title/);
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    await userEvent.tab();
    expect(input).toHaveValue("New Name");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it("cancels a column rename on Escape without saving", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();
    const column = getFirstColumn();
    const input = within(column).getByLabelText(/Column title/);
    const originalTitle = (input as HTMLInputElement).value;
    await userEvent.clear(input);
    await userEvent.type(input, "New Name{Escape}");
    expect(input).toHaveValue(originalTitle);
    expect(input).not.toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.click(input);
    await userEvent.tab();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("adds and removes a card", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "card-new" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deleted: true }),
      });
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await within(column).findByText("New card")).toBeInTheDocument();

    await userEvent.click(
      within(column).getByRole("button", { name: "Delete New card" })
    );
    await userEvent.click(
      within(column).getByRole("button", { name: "Confirm delete New card" })
    );

    await waitFor(() =>
      expect(within(column).queryByText("New card")).not.toBeInTheDocument()
    );
  });

  it("edits a card through the board API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ updated: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    const card = screen.getByTestId("card-card-1");
    await userEvent.click(within(card).getByRole("button", { name: /edit/i }));
    const titleInput = within(card).getByLabelText(
      "Title for Align roadmap themes"
    );
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated roadmap");
    await userEvent.click(within(card).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(within(card).getByText("Updated roadmap")).toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board/cards/card-1",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("restores a card when a delete fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: "Delete Align roadmap themes" })
    );
    await userEvent.click(
      within(card).getByRole("button", {
        name: "Confirm delete Align roadmap themes",
      })
    );

    expect(await screen.findByText("Align roadmap themes")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to remove card. Please try again."
    );
  });

  it("stores empty details as empty and shows a placeholder", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "card-new" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();
    const column = getFirstColumn();

    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "Detail free"
    );
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    await within(column).findByText("Detail free");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      column_id: "col-backlog",
      title: "Detail free",
      details: "",
    });
    expect(
      within(screen.getByTestId("card-card-new")).getByText("No details yet.")
    ).toBeInTheDocument();
  });

  it("cancels a delete when the confirm button is dismissed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: "Delete Align roadmap themes" })
    );
    await userEvent.keyboard("{Escape}");

    expect(
      within(card).getByRole("button", { name: "Delete Align roadmap themes" })
    ).toBeInTheDocument();
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rolls back only the failed change when mutations overlap", async () => {
    let rejectDelete: (error: Error) => void = () => {};
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return new Promise((_, reject) => {
          rejectDelete = reject;
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ updated: true }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: "Delete Align roadmap themes" })
    );
    await userEvent.click(
      within(card).getByRole("button", {
        name: "Confirm delete Align roadmap themes",
      })
    );
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();

    const input = within(getFirstColumn()).getByLabelText(/Column title/);
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed{Enter}");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/board/columns/col-backlog",
        expect.objectContaining({ method: "PATCH" })
      )
    );

    rejectDelete(new Error("offline"));

    expect(await screen.findByText("Align roadmap themes")).toBeInTheDocument();
    expect(
      within(getFirstColumn()).getAllByTestId(/card-/).map((node) => node.dataset.testid)
    ).toEqual(["card-card-1", "card-card-2"]);
    // Column titles render from board state, so the rename must survive.
    expect(screen.getAllByText("Renamed").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Backlog")).toHaveLength(0);
  });

  it("reloads the board after an assistant update once pending edits settle", async () => {
    let resolveDelete: () => void = () => {};
    const serverBoard = {
      ...testBoard,
      cards: {
        ...testBoard.cards,
        "card-2": { ...testBoard.cards["card-2"], title: "Edited by assistant" },
      },
      columns: testBoard.columns.map((column) =>
        column.id === "col-backlog" ? { ...column, cardIds: ["card-2"] } : column
      ),
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        return new Promise((resolve) => {
          resolveDelete = () =>
            resolve({ ok: true, json: async () => ({ deleted: true }) });
        });
      }
      if (url === "/api/ai/chat") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ response: "Done.", board: testBoard, updated: true }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => serverBoard });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderBoard();

    const card = screen.getByTestId("card-card-1");
    await user.click(
      within(card).getByRole("button", { name: "Delete Align roadmap themes" })
    );
    await user.click(
      within(card).getByRole("button", {
        name: "Confirm delete Align roadmap themes",
      })
    );

    await user.click(screen.getByRole("button", { name: "Open workspace assistant" }));
    await user.type(screen.getByRole("textbox", { name: "Your question" }), "Edit card 2{Enter}");
    await screen.findByText("Done.");

    const boardRequests = () =>
      fetchMock.mock.calls.filter(([url]) => url === "/api/board");
    expect(boardRequests()).toHaveLength(0);
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();

    resolveDelete();

    expect(await screen.findByText("Edited by assistant")).toBeInTheDocument();
    expect(boardRequests()).toHaveLength(1);
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("calls onSessionExpired instead of showing an error when a mutation returns 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Authentication required" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSessionExpired = vi.fn();
    render(
      <KanbanBoard
        initialBoard={testBoard}
        onSessionExpired={onSessionExpired}
      />
    );

    const card = screen.getByTestId("card-card-1");
    await userEvent.click(
      within(card).getByRole("button", { name: "Delete Align roadmap themes" })
    );
    await userEvent.click(
      within(card).getByRole("button", {
        name: "Confirm delete Align roadmap themes",
      })
    );

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
