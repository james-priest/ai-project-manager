import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardToolbar } from "@/components/BoardToolbar";
import { emptyFilters, type Label } from "@/lib/kanban";

const labels: Label[] = [
  { id: "label-urgent", name: "Urgent", color: "purple" },
  { id: "label-chore", name: "Chore", color: "gray" },
];

const renderToolbar = (
  overrides: Partial<Parameters<typeof BoardToolbar>[0]> = {}
) => {
  const props = {
    labels,
    filters: emptyFilters,
    visibleCount: 8,
    totalCount: 8,
    onFiltersChange: vi.fn(),
    onCreateLabel: vi.fn().mockResolvedValue(undefined),
    onDeleteLabel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<BoardToolbar {...props} />);
  return props;
};

describe("BoardToolbar", () => {
  it("reports the card count and hides the clear action when idle", () => {
    renderToolbar();

    expect(screen.getByText("8 cards")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear filters" })
    ).not.toBeInTheDocument();
  });

  it("reports how many cards a filter leaves visible", () => {
    renderToolbar({
      filters: { query: "ship", labelIds: [] },
      visibleCount: 2,
    });

    expect(screen.getByText("2 of 8 cards")).toBeInTheDocument();
  });

  it("sends query changes", async () => {
    const { onFiltersChange } = renderToolbar();

    await userEvent.type(screen.getByLabelText("Search cards"), "s");

    expect(onFiltersChange).toHaveBeenCalledWith({ query: "s", labelIds: [] });
  });

  it("adds a label to the filter", async () => {
    const { onFiltersChange } = renderToolbar();

    const urgent = screen.getByRole("button", { name: "Urgent" });
    expect(urgent).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(urgent);

    expect(onFiltersChange).toHaveBeenCalledWith({
      query: "",
      labelIds: ["label-urgent"],
    });
  });

  it("removes a label that is already filtered", async () => {
    const { onFiltersChange } = renderToolbar({
      filters: { query: "", labelIds: ["label-urgent"] },
    });

    const urgent = screen.getByRole("button", { name: "Urgent" });
    expect(urgent).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(urgent);

    expect(onFiltersChange).toHaveBeenCalledWith({ query: "", labelIds: [] });
  });

  it("clears every filter", async () => {
    const { onFiltersChange } = renderToolbar({
      filters: { query: "ship", labelIds: ["label-urgent"] },
    });

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(onFiltersChange).toHaveBeenCalledWith({ query: "", labelIds: [] });
  });

  it("creates a label with the chosen color", async () => {
    const { onCreateLabel } = renderToolbar();

    await userEvent.click(screen.getByRole("button", { name: "Labels" }));
    await userEvent.type(screen.getByLabelText("New label name"), "Blocked");
    await userEvent.selectOptions(
      screen.getByLabelText("New label color"),
      "yellow"
    );
    await userEvent.click(screen.getByRole("button", { name: "Add label" }));

    expect(onCreateLabel).toHaveBeenCalledWith("Blocked", "yellow");
    expect(screen.getByLabelText("New label name")).toHaveValue("");
  });

  it("deletes a label from the manager", async () => {
    const { onDeleteLabel } = renderToolbar();

    await userEvent.click(screen.getByRole("button", { name: "Labels" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Delete label Chore" })
    );

    expect(onDeleteLabel).toHaveBeenCalledWith("label-chore");
  });

  it("keeps the label manager closed until asked", async () => {
    renderToolbar();

    expect(screen.queryByLabelText("New label name")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Labels" }));
    expect(screen.getByLabelText("New label name")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Labels" }));
    expect(screen.queryByLabelText("New label name")).not.toBeInTheDocument();
  });
});
