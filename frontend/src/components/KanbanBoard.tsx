"use client";

import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { BoardToolbar } from "@/components/BoardToolbar";
import { CardDetailDialog } from "@/components/CardDetailDialog";
import { CollaborationPanel } from "@/components/CollaborationPanel";
import { MyWorkPanel } from "@/components/MyWorkPanel";
import { NewColumnForm } from "@/components/NewColumnForm";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { AIChatSidebar } from "@/components/AIChatSidebar";
import {
  api,
  newCardDefaults,
  getApiErrorMessage,
  isSessionExpiredError,
  type BoardSummary,
  type BoardTemplate,
  type CardFields,
} from "@/lib/api";
import {
  countVisibleCards,
  emptyFilters,
  filterBoard,
  findCardColumn,
  insertCard,
  resolveCardDrop,
  moveCardToPosition,
  removeCard,
  setCard,
  setColumnTitle,
  type BoardData,
  type BoardFilters,
  type LabelColor,
} from "@/lib/kanban";

type KanbanBoardProps = {
  boardId: string;
  initialBoard: BoardData;
  /** Set when arriving from "My work", so that card opens straight away. */
  initialOpenCardId?: string | null;
  onOpenTask?: (boardId: string, cardId: string) => void;
  boards?: BoardSummary[];
  onSelectBoard?: (boardId: string) => Promise<void>;
  onCreateBoard?: (title: string, template: BoardTemplate) => Promise<void>;
  onRenameBoard?: (boardId: string, title: string) => Promise<void>;
  onDeleteBoard?: (boardId: string) => Promise<void>;
  onArchiveBoard?: (boardId: string, archived: boolean) => Promise<void>;
  showArchivedBoards?: boolean;
  onShowArchivedBoardsChange?: (showArchived: boolean) => void;
  onLogout?: () => Promise<void> | void;
  isLoggingOut?: boolean;
  onSessionExpired?: () => void;
};

// Keyboard drags have no pointer coordinates, which pointerWithin needs.
const collisionDetection: CollisionDetection = (args) =>
  args.pointerCoordinates ? pointerWithin(args) : closestCorners(args);

export const KanbanBoard = ({
  boardId,
  initialBoard,
  initialOpenCardId = null,
  onOpenTask,
  boards = [],
  onSelectBoard,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
  onArchiveBoard,
  showArchivedBoards = false,
  onShowArchivedBoardsChange,
  onLogout,
  isLoggingOut = false,
  onSessionExpired,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData>(() => initialBoard);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [filters, setFilters] = useState<BoardFilters>(emptyFilters);
  const [openCardId, setOpenCardId] = useState<string | null>(initialOpenCardId);
  // Bumped whenever the board changes, so "My work" reloads with it.
  const [boardVersion, setBoardVersion] = useState(0);
  // Compared against card due dates, so it only needs day precision.
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const pendingMutations = useRef(new Set<Promise<unknown>>());
  const mutationCount = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const trackMutation = <T,>(request: Promise<T>): Promise<T> => {
    mutationCount.current += 1;
    noteBoardChanged();
    pendingMutations.current.add(request);
    const forget = () => {
      pendingMutations.current.delete(request);
    };
    request.then(forget, forget);
    return request;
  };

  const noteBoardChanged = () => setBoardVersion((version) => version + 1);

  const handleMutationError = (error: unknown, fallback: string) => {
    if (isSessionExpiredError(error)) {
      onSessionExpired?.();
      return;
    }
    setMutationError(getApiErrorMessage(error, fallback));
  };

  // The assistant's board snapshot can predate edits made while it was
  // thinking, so reload from the server once local mutations have settled.
  const refreshBoard = async () => {
    try {
      for (;;) {
        await Promise.allSettled(pendingMutations.current);
        const countBeforeLoad = mutationCount.current;
        const latestBoard = await api.getBoard(boardId);
        if (mutationCount.current === countBeforeLoad) {
          setBoard(latestBoard);
          return;
        }
      }
    } catch (error) {
      handleMutationError(
        error,
        "Unable to refresh the board. Please reload the page."
      );
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta, activatorEvent } = event;
    setActiveCardId(null);
    if (!over) {
      return;
    }

    const initialRect = active.rect.current.initial;
    const drop = resolveCardDrop(board, {
      activeId: String(active.id),
      overId: String(over.id),
      isKeyboardDrag: activatorEvent instanceof KeyboardEvent,
      activeRect: initialRect
        ? { top: initialRect.top + delta.y, height: initialRect.height }
        : (active.rect.current.translated ?? undefined),
      overRect: over.rect,
    });
    if (!drop) {
      return;
    }

    setMutationError(null);
    setBoard((prev) => ({
      ...prev,
      columns: moveCardToPosition(
        prev.columns,
        drop.activeId,
        drop.toColumnId,
        drop.toPosition
      ),
    }));

    void trackMutation(
      api.moveCard(drop.activeId, drop.toColumnId, drop.toPosition)
    ).catch((error: unknown) => {
      setBoard((prev) => ({
        ...prev,
        columns: moveCardToPosition(
          prev.columns,
          drop.activeId,
          drop.fromColumnId,
          drop.fromPosition
        ),
      }));
      handleMutationError(error, "Unable to move card. Please try again.");
    });
  };

  const handleRenameColumn = async (columnId: string, title: string) => {
    const previousTitle = findCardColumn(board.columns, columnId)?.title ?? title;
    setMutationError(null);
    setBoard((prev) => setColumnTitle(prev, columnId, title));

    try {
      await trackMutation(api.renameColumn(columnId, title));
    } catch (error) {
      setBoard((prev) => setColumnTitle(prev, columnId, previousTitle));
      handleMutationError(error, "Unable to rename column. Please try again.");
    }
  };

  const handleAddCard = async (
    columnId: string,
    title: string,
    details: string
  ) => {
    setMutationError(null);
    try {
      const { id } = await trackMutation(
        api.createCard(columnId, title, details)
      );
      setBoard((prev) =>
        insertCard(
          prev,
          columnId,
          { id, title, details, ...newCardDefaults },
          Infinity
        )
      );
    } catch (error) {
      // The form shows its own message; only session expiry needs the board.
      if (isSessionExpiredError(error)) {
        onSessionExpired?.();
      }
      throw error;
    }
  };

  const handleEditCard = async (
    cardId: string,
    title: string,
    details: string,
    fields: CardFields
  ) => {
    const previousCard = board.cards[cardId];
    setMutationError(null);
    setBoard((prev) =>
      setCard(prev, {
        ...prev.cards[cardId],
        id: cardId,
        title,
        details,
        ...fields,
      })
    );

    try {
      await trackMutation(api.updateCard(cardId, title, details, fields));
    } catch (error) {
      setBoard((prev) => setCard(prev, previousCard));
      // The card's edit form shows its own message.
      if (isSessionExpiredError(error)) {
        onSessionExpired?.();
      }
      throw error;
    }
  };

  const handleDeleteCard = async (columnId: string, cardId: string) => {
    const previousCard = board.cards[cardId];
    const previousPosition =
      findCardColumn(board.columns, columnId)?.cardIds.indexOf(cardId) ?? 0;
    setMutationError(null);
    setBoard((prev) => removeCard(prev, cardId));

    try {
      await trackMutation(api.deleteCard(cardId));
    } catch (error) {
      setBoard((prev) =>
        insertCard(prev, columnId, previousCard, previousPosition)
      );
      handleMutationError(error, "Unable to remove card. Please try again.");
    }
  };

  const handleAddColumn = async (title: string) => {
    setMutationError(null);
    try {
      await trackMutation(api.createColumn(boardId, title));
      await refreshBoard();
    } catch (error) {
      handleMutationError(error, "Unable to add that column. Please try again.");
    }
  };

  const handleMoveColumn = async (columnId: string, position: number) => {
    setMutationError(null);
    try {
      await trackMutation(api.moveColumn(columnId, position));
      await refreshBoard();
    } catch (error) {
      handleMutationError(error, "Unable to move that column. Please try again.");
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    setMutationError(null);
    try {
      await trackMutation(api.deleteColumn(columnId));
      await refreshBoard();
    } catch (error) {
      handleMutationError(
        error,
        "Unable to delete that column. Please try again."
      );
    }
  };

  const handleCreateLabel = async (name: string, color: LabelColor) => {
    setMutationError(null);
    try {
      await trackMutation(api.createLabel(boardId, name, color));
      await refreshBoard();
    } catch (error) {
      handleMutationError(error, "Unable to add that label. Please try again.");
    }
  };

  const handleDeleteLabel = async (labelId: string) => {
    setMutationError(null);
    setFilters((current) => ({
      ...current,
      labelIds: current.labelIds.filter((id) => id !== labelId),
    }));
    try {
      await trackMutation(api.deleteLabel(boardId, labelId));
      await refreshBoard();
    } catch (error) {
      handleMutationError(
        error,
        "Unable to remove that label. Please try again."
      );
    }
  };

  const activeBoardRole =
    boards.find((summary) => summary.id === boardId)?.role ?? "owner";
  const boardLabels = Object.values(board.labels);
  const openCard = openCardId ? board.cards[openCardId] : null;
  const visibleBoard = filterBoard(board, filters, today);
  const activeCard = activeCardId ? board.cards[activeCardId] : null;

  return (
    <div className="relative overflow-hidden">
      {mutationError && (
        <p
          role="alert"
          className="fixed right-6 top-6 z-10 rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-800 shadow-lg"
        >
          {mutationError}
        </p>
      )}
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                {boards.find((summary) => summary.id === boardId)?.title ??
                  "Kanban Studio"}
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
              {onLogout && (
                <button
                  type="button"
                  onClick={() => void onLogout()}
                  disabled={isLoggingOut}
                  className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:border-[var(--primary-blue)] hover:text-[var(--navy-dark)] disabled:cursor-wait disabled:opacity-60"
                >
                  {isLoggingOut ? "Signing out..." : "Log out"}
                </button>
              )}
            </div>
          </div>
          {onSelectBoard &&
            onCreateBoard &&
            onRenameBoard &&
            onDeleteBoard &&
            onArchiveBoard &&
            onShowArchivedBoardsChange && (
              <BoardSwitcher
                boards={boards}
                activeBoardId={boardId}
                onSelect={(nextBoardId) => void onSelectBoard(nextBoardId)}
                onCreate={onCreateBoard}
                onRename={onRenameBoard}
                onDelete={onDeleteBoard}
                onArchive={onArchiveBoard}
                showArchived={showArchivedBoards}
                onShowArchivedChange={onShowArchivedBoardsChange}
              />
            )}
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <MyWorkPanel
          today={today}
          refreshKey={boardVersion}
          onOpenTask={(taskBoardId, cardId) => {
            if (taskBoardId === boardId) {
              setOpenCardId(cardId);
              return;
            }
            onOpenTask?.(taskBoardId, cardId);
          }}
          onError={setMutationError}
        />

        <CollaborationPanel
          boardId={boardId}
          canManageMembers={activeBoardRole === "owner"}
          onError={setMutationError}
        />

        <BoardToolbar
          labels={boardLabels}
          filters={filters}
          visibleCount={countVisibleCards(visibleBoard)}
          totalCount={Object.keys(board.cards).length}
          onFiltersChange={setFilters}
          onCreateLabel={handleCreateLabel}
          onDeleteLabel={handleDeleteLabel}
        />

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {visibleBoard.columns.map((column, index) => (
              <KanbanColumn
                key={column.id}
                column={column}
                index={index}
                columnCount={visibleBoard.columns.length}
                onMoveColumn={handleMoveColumn}
                onDeleteColumn={handleDeleteColumn}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                labels={boardLabels}
                today={today}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onOpenCard={setOpenCardId}
                onDeleteCard={handleDeleteCard}
              />
            ))}
            <NewColumnForm onAdd={handleAddColumn} />
          </section>

          {board.columns.length > 0 &&
            countVisibleCards(visibleBoard) === 0 &&
            Object.keys(board.cards).length > 0 && (
              <p
                role="status"
                className="rounded-2xl border border-dashed border-[var(--stroke)] px-4 py-6 text-center text-sm text-[var(--gray-text)]"
              >
                No cards match these filters.
              </p>
            )}

          {board.columns.length === 0 && (
            <p
              role="status"
              className="rounded-2xl border border-dashed border-[var(--stroke)] px-4 py-6 text-center text-sm text-[var(--gray-text)]"
            >
              This board has no columns yet. Add one to start planning.
            </p>
          )}
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        {openCard && (
          <CardDetailDialog
            card={openCard}
            labels={boardLabels}
            today={today}
            boardId={boardId}
            onSave={handleEditCard}
            onDelete={async (cardId) => {
              const column = findCardColumn(board.columns, cardId);
              setOpenCardId(null);
              if (column) {
                await handleDeleteCard(column.id, cardId);
              }
            }}
            onCommentsChanged={() => void refreshBoard()}
            onClose={() => setOpenCardId(null)}
          />
        )}

        <AIChatSidebar
          boardId={boardId}
          onBoardChanged={() => void refreshBoard()}
          onSessionExpired={onSessionExpired}
        />
      </main>
    </div>
  );
};
