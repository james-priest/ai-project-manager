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

