import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MyWorkPanel } from "@/components/MyWorkPanel";

const tasks = [
  {
    cardId: "card-1",
    title: "Book the venue",
    boardId: "board-2",
    boardTitle: "Launch plan",
    columnTitle: "Backlog",
    dueDate: "2026-01-01",
    labels: [{ id: "label-urgent", name: "Urgent", color: "purple" as const }],
  },
  {
    cardId: "card-2",
    title: "Write the spec",
    boardId: "board-1",
    boardTitle: "Kanban Studio",
    columnTitle: "Discovery",
    dueDate: null,
    labels: [],
  },
];

const stubTasks = (payload: unknown = tasks) => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => payload });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const renderPanel = (refreshKey = 0) => {
  const props = {
    today: "2026-02-01",
    refreshKey,
    onOpenTask: vi.fn(),
    onError: vi.fn(),
  };
  const view = render(<MyWorkPanel {...props} />);
  return { ...props, view };
};

describe("MyWorkPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads nothing until it is opened", () => {
    const fetchMock = stubTasks();
    renderPanel();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists assigned cards with their board and due state", async () => {
    const fetchMock = stubTasks();
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /My work/ }));

    const list = await screen.findByRole("list", { name: "Assigned cards" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("Book the venue");
    expect(first).toHaveTextContent("Launch plan / Backlog");
    expect(first).toHaveTextContent("Urgent");
    expect(first).toHaveTextContent("Overdue 2026-01-01");
    expect(second).toHaveTextContent("Write the spec");
    expect(second).not.toHaveTextContent("Due");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/me/tasks",
      expect.objectContaining({ credentials: "same-origin" })
    );
  });

  it("counts overdue tasks on the toggle", async () => {
    stubTasks();
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /My work/ }));

    expect(await screen.findByText("1 overdue")).toBeInTheDocument();
  });

  it("opens a task", async () => {
    stubTasks();
    const { onOpenTask } = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /My work/ }));
    await userEvent.click(
      await screen.findByRole("button", { name: /Book the venue/ })
    );

    expect(onOpenTask).toHaveBeenCalledWith("board-2", "card-1");
  });

  it("shows an empty state", async () => {
    stubTasks([]);
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /My work/ }));

    expect(
      await screen.findByText("Nothing is assigned to you right now.")
    ).toBeInTheDocument();
  });

  it("reports a failed load", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    );
    const { onError } = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /My work/ }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("Unable to load your tasks.")
    );
  });

  it("reloads when the board changes", async () => {
    const fetchMock = stubTasks();
    const { view } = renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /My work/ }));
    await screen.findByRole("list", { name: "Assigned cards" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    view.rerender(
      <MyWorkPanel
        today="2026-02-01"
        refreshKey={1}
        onOpenTask={vi.fn()}
        onError={vi.fn()}
      />
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
