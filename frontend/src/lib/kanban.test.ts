import {
  getCardDropPosition,
  getKeyboardDropPosition,
  insertCard,
  moveCard,
  moveCardToPosition,
  removeCard,
  setCard,
  setColumnTitle,
  type BoardData,
  type Column,
} from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

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

describe("board entity transforms", () => {
  const board: BoardData = {
    columns: [
      { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
      { id: "col-b", title: "B", cardIds: [] },
    ],
    cards: {
      "card-1": { id: "card-1", title: "One", details: "" },
      "card-2": { id: "card-2", title: "Two", details: "" },
    },
  };

  it("sets a column title without touching other columns", () => {
    const result = setColumnTitle(board, "col-b", "Renamed");
    expect(result.columns.map((column) => column.title)).toEqual(["A", "Renamed"]);
  });

  it("replaces a card", () => {
    const result = setCard(board, { id: "card-2", title: "New", details: "x" });
    expect(result.cards["card-2"]).toEqual({ id: "card-2", title: "New", details: "x" });
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
    const result = insertCard(board, "col-a", { id: "card-3", title: "Three", details: "" }, 99);
    expect(result.columns[0].cardIds).toEqual(["card-1", "card-2", "card-3"]);
  });
});
