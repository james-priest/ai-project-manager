import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardDetailDialog } from "@/components/CardDetailDialog";
import type { Card, Label } from "@/lib/kanban";

const labels: Label[] = [
  { id: "label-urgent", name: "Urgent", color: "purple" },
  { id: "label-chore", name: "Chore", color: "gray" },
];

const baseCard: Card = {
  id: "card-1",
  title: "Ship the release",
  details: "# Plan\n\n- cut the tag\n- write the notes\n\nSee `CHANGELOG.md`.",
  dueDate: "2026-03-01",
  assignee: "Ada",
  labelIds: ["label-urgent"],
  commentCount: 0,
  checklistDone: 0,
  checklistTotal: 0,
};

const renderDialog = (overrides: Partial<Card> = {}) => {
  // The dialog loads comments on mount.
  // The dialog loads both the checklist and the comments on mount.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
  );
  const props = {
    card: { ...baseCard, ...overrides },
    boardId: "board-1",
    labels,
    today: "2026-02-01",
    onSave: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
    onCommentsChanged: vi.fn(),
    onClose: vi.fn(),
  };
  render(<CardDetailDialog {...props} />);
  return props;
};

describe("CardDetailDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the description as markdown", async () => {
    renderDialog();
    await screen.findByText("No comments yet.");

    const description = screen.getByTestId("card-description");
    expect(
      within(description).getByRole("heading", { name: "Plan" })
    ).toBeInTheDocument();
    expect(within(description).getAllByRole("listitem")).toHaveLength(2);
    expect(within(description).getByText("CHANGELOG.md").tagName).toBe("CODE");
  });

  it("does not render raw HTML from a description", async () => {
    renderDialog({ details: "<img src=x onerror=alert(1)>Safe text" });
    await screen.findByText("No comments yet.");

    const description = screen.getByTestId("card-description");
    expect(description.querySelector("img")).toBeNull();
    expect(description).toHaveTextContent("Safe text");
  });

  it("shows a placeholder when there is no description", async () => {
    renderDialog({ details: "" });
    await screen.findByText("No comments yet.");

    expect(screen.getByText("No details yet.")).toBeInTheDocument();
  });

  it("shows labels, due date, and assignee", async () => {
    renderDialog();
    await screen.findByText("No comments yet.");

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Urgent")).toBeInTheDocument();
    expect(within(dialog).getByText("Ada")).toBeInTheDocument();
    // "today" is before the due date, so it reads as upcoming.
    expect(within(dialog).getByText(/Due 2026-03-01/)).toBeInTheDocument();
  });

  it("focuses the close button and closes on Escape", async () => {
    const { onClose } = renderDialog();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus()
    );

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked but not the dialog itself", async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    // The backdrop is the dialog's parent element.
    await userEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab inside the dialog", async () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus()
    );
    await userEvent.tab({ shift: true });

    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("saves an edited card", async () => {
    const { onSave } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Edit card" }));
    const details = screen.getByLabelText("Details for Ship the release");
    await userEvent.clear(details);
    await userEvent.type(details, "## Updated");
    await userEvent.click(
      screen.getByLabelText("Chore label for Ship the release")
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        "card-1",
        "Ship the release",
        "## Updated",
        {
          dueDate: "2026-03-01",
          assignee: "Ada",
          labelIds: ["label-urgent", "label-chore"],
        }
      )
    );
  });

  it("refuses a blank title", async () => {
    const { onSave } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Edit card" }));
    const title = screen.getByLabelText("Title for Ship the release");
    await userEvent.clear(title);
    await userEvent.type(title, "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Card title is required."
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("abandons an edit on cancel", async () => {
    const { onSave } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Edit card" }));
    await userEvent.type(
      screen.getByLabelText("Title for Ship the release"),
      " v2"
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId("card-description")).toBeInTheDocument();
  });

  it("deletes the card", async () => {
    const { onDelete } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Delete card" }));

    expect(onDelete).toHaveBeenCalledWith("card-1");
  });

  it("reports a failed save", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    );
    render(
      <CardDetailDialog
        card={baseCard}
        boardId="board-1"
        labels={labels}
        today="2026-02-01"
        onSave={onSave}
        onDelete={vi.fn()}
        onCommentsChanged={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit card" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to save card. Please try again."
    );
  });
});

describe("CardDetailDialog overdue state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks a past due date as overdue", async () => {
    renderDialog({ dueDate: "2020-01-01" });
    await screen.findByText("No comments yet.");

    expect(screen.getByText(/Overdue 2020-01-01/)).toBeInTheDocument();
  });
});
