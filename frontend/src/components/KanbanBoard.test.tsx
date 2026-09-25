import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { testBoard } from "@/test/fixtures";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderBoard = () => render(<KanbanBoard boardId="board-1" initialBoard={testBoard} />);

  it("renders five columns", () => {
    renderBoard();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renders compact accessible card action icons beside the title", () => {
    renderBoard();

    const card = screen.getByTestId("card-card-1");
    const openButton = within(card).getByRole("button", {
      name: "Open Align roadmap themes",
    });
    const deleteButton = within(card).getByRole("button", {
      name: "Delete Align roadmap themes",
    });

    expect(openButton).toHaveTextContent("Align roadmap themes");
    expect(deleteButton).toHaveAttribute("title", "Delete Align roadmap themes");
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
    // The open editor also loads comments, so answer by URL.
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          (url.endsWith("/comments") || url.endsWith("/checklist")) &&
          init?.method !== "POST"
            ? []
            : { updated: true },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    await userEvent.click(
      screen.getByRole("button", { name: "Open Align roadmap themes" })
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Edit card" }));
    const titleInput = within(dialog).getByLabelText(
      "Title for Align roadmap themes"
    );
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated roadmap");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(
        within(screen.getByTestId("card-card-1")).getByText("Updated roadmap")
      ).toBeInTheDocument()
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
      due_date: null,
      assignee: "",
      label_ids: [],
    });
    // An empty description shows nothing on the card face; the placeholder
    // lives in the detail dialog.
    expect(
      within(screen.getByTestId("card-card-new")).queryByText("No details yet.")
    ).not.toBeInTheDocument();
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

  it("shows labels, due dates, and assignees on a card", () => {
    renderBoard();

    const card = screen.getByTestId("card-card-1");
    expect(within(card).getByText("Urgent")).toBeInTheDocument();
    expect(within(card).getByText("Ada")).toBeInTheDocument();
    // The fixture date is in the past, so it reads as overdue.
    expect(within(card).getByText(/Overdue 2026-01-15/)).toBeInTheDocument();
  });

  it("saves due date, assignee, and labels from the card editor", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          (url.endsWith("/comments") || url.endsWith("/checklist")) &&
          init?.method !== "POST"
            ? []
            : { updated: true },
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    await userEvent.click(
      screen.getByRole("button", { name: "Open Gather customer signals" })
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Edit card" }));
    await userEvent.type(
      within(dialog).getByLabelText("Assignee for Gather customer signals"),
      "Grace"
    );
    await userEvent.click(
      within(dialog).getByLabelText("Chore label for Gather customer signals")
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    const patchCall = await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === "PATCH"
      );
      expect(call).toBeDefined();
      return call!;
    });
    expect(JSON.parse((patchCall[1] as RequestInit).body as string)).toMatchObject({
      assignee: "Grace",
      label_ids: ["label-chore"],
      due_date: null,
    });
  });

  it("shows a comment count on a card with no other details", () => {
    const boardWithComments = {
      ...testBoard,
      cards: {
        ...testBoard.cards,
        "card-2": { ...testBoard.cards["card-2"], commentCount: 1 },
      },
    };
    render(<KanbanBoard boardId="board-1" initialBoard={boardWithComments} />);

    const card = screen.getByTestId("card-card-2");
    expect(within(card).getByText(/1 comment/)).toBeInTheDocument();
    // The metadata row stays hidden for a card with nothing to show.
    expect(
      within(screen.getByTestId("card-card-3")).queryByText(/comment/)
    ).not.toBeInTheDocument();
  });

  it("filters cards by text and by label", async () => {
    renderBoard();

    await userEvent.type(screen.getByLabelText("Search cards"), "roadmap");
    expect(screen.getByTestId("card-card-1")).toBeInTheDocument();
    expect(screen.queryByTestId("card-card-2")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 8 cards")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByTestId("card-card-2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Urgent" }));
    expect(screen.getByTestId("card-card-1")).toBeInTheDocument();
    expect(screen.queryByTestId("card-card-3")).not.toBeInTheDocument();
  });

  it("creates a label and reloads the board", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: "label-new",
            name: "Blocked",
            color: "blue",
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => testBoard });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    await userEvent.click(screen.getByRole("button", { name: "Labels" }));
    await userEvent.type(screen.getByLabelText("New label name"), "Blocked");
    await userEvent.click(screen.getByRole("button", { name: "Add label" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/boards/board-1/labels",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Blocked", color: "blue" }),
        })
      )
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => url === "/api/boards/board-1")
      ).toBe(true)
    );
  });

  it("adds a column", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          init?.method === "POST"
            ? { id: "col-new", title: "Blocked", cardIds: [] }
            : testBoard,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    await userEvent.click(screen.getByRole("button", { name: "Add a column" }));
    await userEvent.type(screen.getByLabelText("New column name"), "Blocked");
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/boards/board-1/columns",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ title: "Blocked" }),
        })
      )
    );
  });

  it("moves a column and disables the ends", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          init?.method === "POST" ? { moved: true } : testBoard,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    expect(
      screen.getByRole("button", { name: "Move Backlog left" })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Move Done right" })
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Move Discovery left" })
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/board/columns/col-discovery/move",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ position: 0 }),
        })
      )
    );
  });

  it("warns how many cards a column delete takes with it", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          init?.method === "DELETE" ? { deleted: true } : testBoard,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    await userEvent.click(
      screen.getByRole("button", { name: "Delete Backlog" })
    );
    const confirm = screen.getByRole("button", {
      name: "Confirm delete Backlog",
    });
    expect(confirm).toHaveTextContent("Delete 2 cards?");

    await userEvent.click(confirm);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/board/columns/col-backlog",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });

  it("reports a failed column change", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "DELETE"
          ? {
              ok: false,
              status: 409,
              json: async () => ({ detail: "A board needs at least one column." }),
            }
          : { ok: true, json: async () => testBoard }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    await userEvent.click(
      screen.getByRole("button", { name: "Delete Backlog" })
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm delete Backlog" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A board needs at least one column."
    );
  });

  it("explains when filters match nothing", async () => {
    renderBoard();

    await userEvent.type(screen.getByLabelText("Search cards"), "nothing here");

    expect(
      await screen.findByText("No cards match these filters.")
    ).toBeInTheDocument();
  });

  it("invites a first column on an empty board", () => {
    render(
      <KanbanBoard
        boardId="board-1"
        initialBoard={{ columns: [], cards: {}, labels: {} }}
      />
    );

    expect(
      screen.getByText("This board has no columns yet. Add one to start planning.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add a column" })
    ).toBeInTheDocument();
  });

  it("shows checklist progress on a card", () => {
    const boardWithChecklist = {
      ...testBoard,
      cards: {
        ...testBoard.cards,
        "card-2": {
          ...testBoard.cards["card-2"],
          checklistDone: 1,
          checklistTotal: 3,
        },
      },
    };
    render(
      <KanbanBoard boardId="board-1" initialBoard={boardWithChecklist} />
    );

    expect(
      within(screen.getByTestId("card-card-2")).getByText("1/3 done")
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("card-card-3")).queryByText(/done/)
    ).not.toBeInTheDocument();
  });

  it("lets a drag start on the card title", () => {
    renderBoard();

    const title = within(screen.getByTestId("card-card-1")).getByRole("button", {
      name: "Open Align roadmap themes",
    });

    // dnd-kit needs the pointerdown to reach the card, so the title must not
    // stop propagation; a plain click still opens the detail dialog.
    const pointerDown = new MouseEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
    });
    let reachedCard = false;
    screen
      .getByTestId("card-card-1")
      .addEventListener("pointerdown", () => {
        reachedCard = true;
      });
    title.dispatchEvent(pointerDown);

    expect(reachedCard).toBe(true);
  });

  it("deletes a label and drops it from the active filter", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({
        ok: true,
        json: async () =>
          init?.method === "DELETE" ? { deleted: true } : testBoard,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    // Filter by the label first, so deleting it must also clear the filter.
    await userEvent.click(screen.getByRole("button", { name: "Urgent" }));
    expect(screen.queryByTestId("card-card-2")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Labels" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete label Urgent" })
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/boards/board-1/labels/label-urgent",
        expect.objectContaining({ method: "DELETE" })
      )
    );
    expect(await screen.findByTestId("card-card-2")).toBeInTheDocument();
  });

  it("reports a failed label delete", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(
        init?.method === "DELETE"
          ? { ok: false, status: 500, json: async () => ({}) }
          : { ok: true, json: async () => testBoard }
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    renderBoard();

    await userEvent.click(screen.getByRole("button", { name: "Labels" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete label Chore" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to remove that label. Please try again."
    );
  });

  it("reports a board refresh that fails after an assistant update", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/ai/chat") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            response: "Done.",
            board: testBoard,
            updated: true,
          }),
        });
      }
      if (url === "/api/boards/board-1") {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderBoard();

    await user.click(
      screen.getByRole("button", { name: "Open workspace assistant" })
    );
    await user.type(
      screen.getByRole("textbox", { name: "Your question" }),
      "Tidy up{Enter}"
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to refresh the board. Please reload the page."
    );
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
      fetchMock.mock.calls.filter(([url]) => url === "/api/boards/board-1");
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
        boardId="board-1"
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
