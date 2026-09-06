export type Card = {
  id: string;
  title: string;
  details: string;
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

export const initialData: BoardData = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    {
      id: "col-progress",
      title: "In Progress",
      cardIds: ["card-4", "card-5"],
    },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback.",
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs.",
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board.",
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists.",
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states.",
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered.",
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally.",
    },
  },
};

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export type DropRect = {
  top: number;
  height: number;
};

export const getCardDropPosition = (
  cardIds: string[],
  activeId: string,
  overId: string,
  isOverColumn: boolean,
  activeRect?: DropRect,
  overRect?: DropRect
): number => {
  const remainingCardIds = cardIds.filter((cardId) => cardId !== activeId);
  if (isOverColumn) {
    return remainingCardIds.length;
  }

  const overIndex = remainingCardIds.indexOf(overId);
  if (overIndex === -1) {
    return remainingCardIds.length;
  }

  if (!activeRect || !overRect) {
    return overIndex;
  }

  const activeCenter = activeRect.top + activeRect.height / 2;
  const overCenter = overRect.top + overRect.height / 2;
  return overIndex + (activeCenter > overCenter ? 1 : 0);
};

export const moveCardToPosition = (
  columns: Column[],
  activeId: string,
  targetColumnId: string,
  position: number
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const targetColumn = columns.find((column) => column.id === targetColumnId);

  if (!activeColumnId || !targetColumn) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  if (!activeColumn) {
    return columns;
  }

  const nextActiveCardIds = activeColumn.cardIds.filter(
    (cardId) => cardId !== activeId
  );
  const nextTargetCardIds = targetColumn.cardIds.filter(
    (cardId) => cardId !== activeId
  );
  const insertIndex = Math.max(
    0,
    Math.min(position, nextTargetCardIds.length)
  );
  nextTargetCardIds.splice(insertIndex, 0, activeId);

  return columns.map((column) => {
    if (column.id === activeColumnId && column.id === targetColumnId) {
      return { ...column, cardIds: nextTargetCardIds };
    }
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === targetColumnId) {
      return { ...column, cardIds: nextTargetCardIds };
    }
    return column;
  });
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);
  const position = getCardDropPosition(
    overColumn.cardIds,
    activeId,
    overId,
    isOverColumn
  );
  return moveCardToPosition(columns, activeId, overColumnId, position);
};

export const createId = (prefix: string) => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}-${randomPart}${timePart}`;
};
