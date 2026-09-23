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

export const findCardColumn = (columns: Column[], id: string) =>
  columns.find((column) => column.id === id || column.cardIds.includes(id));

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
  const activeColumnId = findCardColumn(columns, activeId)?.id;
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

// Keyboard drags land exactly on a card, so use sortable (arrayMove) semantics:
// the card takes the index of the card it was dropped on.
export const getKeyboardDropPosition = (
  cardIds: string[],
  activeId: string,
  overId: string,
  isOverColumn: boolean
): number => {
  const overIndex = cardIds.indexOf(overId);
  if (isOverColumn || overIndex === -1) {
    return cardIds.filter((cardId) => cardId !== activeId).length;
  }
  return overIndex;
};

export const setColumnTitle = (
  board: BoardData,
  columnId: string,
  title: string
): BoardData => ({
  ...board,
  columns: board.columns.map((column) =>
    column.id === columnId ? { ...column, title } : column
  ),
});

export const setCard = (board: BoardData, card: Card): BoardData => ({
  ...board,
  cards: { ...board.cards, [card.id]: card },
});

export const removeCard = (board: BoardData, cardId: string): BoardData => ({
  cards: Object.fromEntries(
    Object.entries(board.cards).filter(([id]) => id !== cardId)
  ),
  columns: board.columns.map((column) => ({
    ...column,
    cardIds: column.cardIds.filter((id) => id !== cardId),
  })),
});

export const insertCard = (
  board: BoardData,
  columnId: string,
  card: Card,
  position: number
): BoardData => ({
  cards: { ...board.cards, [card.id]: card },
  columns: board.columns.map((column) => {
    if (column.id !== columnId) {
      return column;
    }
    const cardIds = column.cardIds.filter((id) => id !== card.id);
    cardIds.splice(Math.min(position, cardIds.length), 0, card.id);
    return { ...column, cardIds };
  }),
});
