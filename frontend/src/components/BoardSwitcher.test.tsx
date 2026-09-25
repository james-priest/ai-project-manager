import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { testBoardSummaries } from "@/test/fixtures";

const renderSwitcher = (overrides: Partial<Parameters<typeof BoardSwitcher>[0]> = {}) => {
  const props = {
    boards: testBoardSummaries,
    activeBoardId: "board-1",
    onSelect: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(undefined),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<BoardSwitcher {...props} />);
  return props;
};

describe("BoardSwitcher", () => {
  it("lists boards with their card counts and marks the active one", () => {
    renderSwitcher();

    const active = screen.getByRole("button", { name: /^Kanban Studio/ });
    expect(active).toHaveAttribute("aria-current", "true");
    expect(active).toHaveTextContent("8");
    expect(
      screen.getByRole("button", { name: /^Launch plan/ })
    ).not.toHaveAttribute("aria-current");
  });

  it("selects another board", async () => {
    const { onSelect } = renderSwitcher();

    await userEvent.click(screen.getByRole("button", { name: /^Launch plan/ }));

    expect(onSelect).toHaveBeenCalledWith("board-2");
  });

  it("creates a board and clears the form", async () => {
    const { onCreate } = renderSwitcher();

    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("New board name"), "  Hiring  ");
    await userEvent.click(screen.getByRole("button", { name: "Add board" }));

    expect(onCreate).toHaveBeenCalledWith("Hiring");
    expect(screen.queryByLabelText("New board name")).not.toBeInTheDocument();
  });

  it("abandons board creation on Escape", async () => {
    const { onCreate } = renderSwitcher();

    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("New board name"), "Hiring{Escape}");

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("New board name")).not.toBeInTheDocument();
  });

  it("renames the active board", async () => {
    const { onRename } = renderSwitcher();

    await userEvent.click(
      screen.getByRole("button", { name: "Rename Kanban Studio" })
    );
    const input = screen.getByLabelText("New name for Kanban Studio");
    await userEvent.clear(input);
    await userEvent.type(input, "Studio");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onRename).toHaveBeenCalledWith("board-1", "Studio");
  });

  it("abandons a rename on Escape", async () => {
    const { onRename } = renderSwitcher();

    await userEvent.click(
      screen.getByRole("button", { name: "Rename Kanban Studio" })
    );
    await userEvent.type(
      screen.getByLabelText("New name for Kanban Studio"),
      "{Escape}"
    );

    expect(onRename).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Rename Kanban Studio" })
    ).toBeInTheDocument();
  });

  it("deletes the active board after a confirm step", async () => {
    const { onDelete } = renderSwitcher();

    await userEvent.click(
      screen.getByRole("button", { name: "Delete Kanban Studio" })
    );
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Confirm delete Kanban Studio" })
    );

    expect(onDelete).toHaveBeenCalledWith("board-1");
  });

  it("hides delete when only one board is left", () => {
    renderSwitcher({ boards: [testBoardSummaries[0]] });

    expect(
      screen.queryByRole("button", { name: "Delete Kanban Studio" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Rename Kanban Studio" })
    ).toBeInTheDocument();
  });

  it("only offers rename and delete for the active board", () => {
    renderSwitcher();

    expect(
      screen.queryByRole("button", { name: "Rename Launch plan" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete Launch plan" })
    ).not.toBeInTheDocument();
  });
});
