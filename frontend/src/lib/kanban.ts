export type Card = {
  id: string;
  title: string;
  details: string;
  dueDate: string | null;
  assignee: string;
  labelIds: string[];
  commentCount: number;
};

export type Label = {
  id: string;
  name: string;
  color: LabelColor;
};

export const LABEL_COLORS = [
  "yellow",
  "blue",
  "purple",
  "navy",
  "gray",
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
  labels: Record<string, Label>;
};

export type BoardFilters = {
  query: string;
  labelIds: string[];
};

export const emptyFilters: BoardFilters = { query: "", labelIds: [] };

export const hasActiveFilters = (filters: BoardFilters) =>
  filters.query.trim().length > 0 || filters.labelIds.length > 0;

const matchesFilters = (card: Card, filters: BoardFilters) => {
  const query = filters.query.trim().toLowerCase();
  const matchesQuery =
    !query ||
    [card.title, card.details, card.assignee].some((field) =>
      field.toLowerCase().includes(query)
    );
  const matchesLabels =
    filters.labelIds.length === 0 ||
    filters.labelIds.every((labelId) => card.labelIds.includes(labelId));

  return matchesQuery && matchesLabels;
};

// Hides cards that do not match, leaving columns in place so the board keeps
// its shape (and drop targets) while a filter is active.
export const filterBoard = (
  board: BoardData,
  filters: BoardFilters
): BoardData => {
  if (!hasActiveFilters(filters)) {
    return board;
  }

  return {
    ...board,
    columns: board.columns.map((column) => ({
      ...column,
      cardIds: column.cardIds.filter((cardId) =>
        matchesFilters(board.cards[cardId], filters)
      ),
    })),
  };
};

export const countVisibleCards = (board: BoardData) =>
  board.columns.reduce((total, column) => total + column.cardIds.length, 0);

export const isOverdue = (card: Card, today: string) =>
  card.dueDate !== null && card.dueDate < today;

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
  ...board,
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
  ...board,
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
