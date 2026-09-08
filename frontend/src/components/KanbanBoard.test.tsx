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
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    await userEvent.tab();
    expect(input).toHaveValue("New Name");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
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

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

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
    await userEvent.click(within(card).getByRole("button", { name: /delete/i }));

    expect(await screen.findByText("Align roadmap themes")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to remove card. Please try again."
    );
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
    await userEvent.click(within(card).getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
