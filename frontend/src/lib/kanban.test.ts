import {
  countVisibleCards,
  emptyFilters,
  filterBoard,
  getCardDropPosition,
  hasActiveFilters,
  isOverdue,
  getKeyboardDropPosition,
  insertCard,
  moveCardToPosition,
  removeCard,
  setCard,
  setColumnTitle,
  type BoardData,
  type Card,
  type Column,
} from "@/lib/kanban";

describe("pointer drops", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("calculates a position after the last target card", () => {
    const position = getCardDropPosition(
      ["card-3"],
      "card-2",
      "card-3",
      false,
      { top: 200, height: 80 },
      { top: 100, height: 80 }
    );

    expect(position).toBe(1);
  });

  it("moves a card to the last position in another column", () => {
    const result = moveCardToPosition(baseColumns, "card-2", "col-b", 1);

    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-2"]);
  });

  it("moves a card within its own column", () => {
    const result = moveCardToPosition(baseColumns, "card-2", "col-a", 0);

    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });
});

describe("getKeyboardDropPosition", () => {
  const cardIds = ["card-1", "card-2", "card-3"];

  it("takes the index of the card it lands on within the same column", () => {
    expect(getKeyboardDropPosition(cardIds, "card-1", "card-2", false)).toBe(1);
    expect(getKeyboardDropPosition(cardIds, "card-3", "card-1", false)).toBe(0);
  });

  it("inserts before the card it lands on in another column", () => {
    expect(getKeyboardDropPosition(cardIds, "card-9", "card-2", false)).toBe(1);
  });

  it("appends when dropped on the column itself", () => {
    expect(getKeyboardDropPosition(cardIds, "card-9", "col-a", true)).toBe(3);
    expect(getKeyboardDropPosition(cardIds, "card-1", "col-a", true)).toBe(2);
  });
});

const card = (id: string, title: string): Card => ({
  id,
  title,
  details: "",
  dueDate: null,
  assignee: "",
  labelIds: [],
  commentCount: 0,
});

describe("board entity transforms", () => {
  const board: BoardData = {
    columns: [
      { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
      { id: "col-b", title: "B", cardIds: [] },
    ],
    cards: {
      "card-1": card("card-1", "One"),
      "card-2": card("card-2", "Two"),
    },
    labels: {},
  };

  it("sets a column title without touching other columns", () => {
    const result = setColumnTitle(board, "col-b", "Renamed");
    expect(result.columns.map((column) => column.title)).toEqual(["A", "Renamed"]);
  });

  it("replaces a card", () => {
    const replacement = { ...card("card-2", "New"), details: "x" };
    const result = setCard(board, replacement);
    expect(result.cards["card-2"]).toEqual(replacement);
    expect(result.cards["card-1"]).toBe(board.cards["card-1"]);
  });

  it("removes and re-inserts a card at its original position", () => {
    const removed = removeCard(board, "card-1");
    expect(removed.columns[0].cardIds).toEqual(["card-2"]);
    expect(removed.cards["card-1"]).toBeUndefined();

    const restored = insertCard(removed, "col-a", board.cards["card-1"], 0);
    expect(restored.columns[0].cardIds).toEqual(["card-1", "card-2"]);
    expect(restored.cards["card-1"]).toEqual(board.cards["card-1"]);
  });

  it("clamps an insert past the end of the column", () => {
    const result = insertCard(board, "col-a", card("card-3", "Three"), 99);
    expect(result.columns[0].cardIds).toEqual(["card-1", "card-2", "card-3"]);
  });
});

describe("board filters", () => {
  const labelled = (id: string, title: string, overrides: Partial<Card>): Card => ({
    ...card(id, title),
    ...overrides,
  });

  const board: BoardData = {
    columns: [
      { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
      { id: "col-b", title: "B", cardIds: ["card-3"] },
    ],
    cards: {
      "card-1": labelled("card-1", "Ship release", {
        details: "Cut the tag",
        labelIds: ["label-urgent"],
        assignee: "Ada",
      }),
      "card-2": labelled("card-2", "Write docs", { labelIds: ["label-chore"] }),
      "card-3": labelled("card-3", "Fix crash", {
        labelIds: ["label-urgent", "label-chore"],
      }),
    },
    labels: {
      "label-urgent": { id: "label-urgent", name: "Urgent", color: "purple" },
      "label-chore": { id: "label-chore", name: "Chore", color: "gray" },
    },
  };

  it("returns the same board when no filter is active", () => {
    expect(filterBoard(board, emptyFilters)).toBe(board);
    expect(hasActiveFilters(emptyFilters)).toBe(false);
    expect(hasActiveFilters({ query: "  ", labelIds: [] })).toBe(false);
  });

  it("matches the query against title, details, and assignee", () => {
    const byTitle = filterBoard(board, { query: "ship", labelIds: [] });
    expect(byTitle.columns[0].cardIds).toEqual(["card-1"]);

    const byDetails = filterBoard(board, { query: "cut the tag", labelIds: [] });
    expect(byDetails.columns[0].cardIds).toEqual(["card-1"]);

    const byAssignee = filterBoard(board, { query: "ada", labelIds: [] });
    expect(byAssignee.columns[0].cardIds).toEqual(["card-1"]);
  });

  it("requires every selected label", () => {
    const single = filterBoard(board, { query: "", labelIds: ["label-urgent"] });
    expect(single.columns[0].cardIds).toEqual(["card-1"]);
    expect(single.columns[1].cardIds).toEqual(["card-3"]);

    const both = filterBoard(board, {
      query: "",
      labelIds: ["label-urgent", "label-chore"],
    });
    expect(both.columns[0].cardIds).toEqual([]);
    expect(both.columns[1].cardIds).toEqual(["card-3"]);
  });

  it("combines the query with label filters and keeps every column", () => {
    const result = filterBoard(board, {
      query: "fix",
      labelIds: ["label-urgent"],
    });

    expect(result.columns).toHaveLength(2);
    expect(countVisibleCards(result)).toBe(1);
    expect(result.columns[1].cardIds).toEqual(["card-3"]);
  });

  it("flags cards past their due date", () => {
    const due = labelled("card-4", "Overdue", { dueDate: "2026-01-01" });
    expect(isOverdue(due, "2026-02-01")).toBe(true);
    expect(isOverdue(due, "2026-01-01")).toBe(false);
    expect(isOverdue(card("card-5", "No date"), "2026-02-01")).toBe(false);
  });
});
