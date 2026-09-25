"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { CardLabel } from "@/components/CardLabel";
import { api, getApiErrorMessage, type AssignedCard } from "@/lib/api";

type MyWorkPanelProps = {
  today: string;
  /** Bumped by the board when cards change, so the list can reload. */
  refreshKey: number;
  onOpenTask: (boardId: string, cardId: string) => void;
  onError: (message: string) => void;
};

export const MyWorkPanel = ({
  today,
  refreshKey,
  onOpenTask,
  onError,
}: MyWorkPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tasks, setTasks] = useState<AssignedCard[]>([]);

  const load = useCallback(async () => {
    try {
      setTasks(await api.listMyTasks());
    } catch (error) {
      onError(getApiErrorMessage(error, "Unable to load your tasks."));
    }
  }, [onError]);

  useEffect(() => {
    if (isOpen) {
      void load();
    }
  }, [isOpen, load, refreshKey]);

  const overdue = tasks.filter(
    (task) => task.dueDate !== null && task.dueDate < today
  );

  return (
    <section
      aria-label="My work"
      className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4"
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="rounded-full border border-dashed border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
      >
        My work
        {isOpen && overdue.length > 0 && (
          <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] text-red-700">
            {overdue.length} overdue
          </span>
        )}
      </button>

      {isOpen &&
        (tasks.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--gray-text)]">
            Nothing is assigned to you right now.
          </p>
        ) : (
          <ul aria-label="Assigned cards" className="mt-3 space-y-2">
            {tasks.map((task) => {
              const isOverdue =
                task.dueDate !== null && task.dueDate < today;
              return (
                <li key={task.cardId}>
                  <button
                    type="button"
                    onClick={() => onOpenTask(task.boardId, task.cardId)}
                    className="flex w-full flex-wrap items-center gap-2 rounded-xl px-2 py-1 text-left text-sm text-[var(--navy-dark)] transition hover:bg-white"
                  >
                    <span className="font-semibold">{task.title}</span>
                    <span className="text-xs text-[var(--gray-text)]">
                      {task.boardTitle} / {task.columnTitle}
                    </span>
                    {task.labels.map((label) => (
                      <CardLabel key={label.id} label={label} />
                    ))}
                    {task.dueDate && (
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-[0.65rem] font-semibold",
                          isOverdue
                            ? "bg-red-100 text-red-700"
                            : "bg-white text-[var(--gray-text)]"
                        )}
                      >
                        {isOverdue ? "Overdue " : "Due "}
                        {task.dueDate}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </section>
  );
};
