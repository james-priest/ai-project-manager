"use client";

import { useEffect, useState, type FormEvent } from "react";
import clsx from "clsx";
import { api, getApiErrorMessage, type ChecklistItem } from "@/lib/api";

type CardChecklistProps = {
  cardId: string;
  cardTitle: string;
  onChecklistChanged: () => void;
};

export const CardChecklist = ({
  cardId,
  cardTitle,
  onChecklistChanged,
}: CardChecklistProps) => {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [text, setText] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .listChecklist(cardId)
      .then((loaded) => {
        if (active) {
          setItems(loaded);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getApiErrorMessage(loadError, "Unable to load the checklist."));
        }
      });
    return () => {
      active = false;
    };
  }, [cardId]);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextText = text.trim();
    if (!nextText || isBusy) {
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const item = await api.addChecklistItem(cardId, nextText);
      setItems((current) => [...current, item]);
      setText("");
      onChecklistChanged();
    } catch (addError) {
      setError(getApiErrorMessage(addError, "Unable to add that step."));
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggle = async (item: ChecklistItem) => {
    setError(null);
    // Tick straight away; put it back if the server disagrees.
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, done: !entry.done } : entry
      )
    );
    try {
      await api.setChecklistItemDone(item.id, !item.done);
      onChecklistChanged();
    } catch (toggleError) {
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, done: item.done } : entry
        )
      );
      setError(getApiErrorMessage(toggleError, "Unable to update that step."));
    }
  };

  const handleDelete = async (itemId: string) => {
    setIsBusy(true);
    setError(null);
    try {
      await api.deleteChecklistItem(itemId);
      setItems((current) => current.filter((entry) => entry.id !== itemId));
      onChecklistChanged();
    } catch (deleteError) {
      setError(getApiErrorMessage(deleteError, "Unable to remove that step."));
    } finally {
      setIsBusy(false);
    }
  };

  const done = items.filter((item) => item.done).length;

  return (
    <section
      aria-label={`Checklist for ${cardTitle}`}
      className="space-y-2 border-t border-[var(--stroke)] pt-3"
    >
      <h4 className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
        Checklist
        {items.length > 0 && (
          <span className="ml-2 normal-case tracking-normal">
            {done}/{items.length}
          </span>
        )}
      </h4>

      {items.length === 0 ? (
        <p className="text-xs text-[var(--gray-text)]">No steps yet.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-xs">
              <label className="flex flex-1 items-center gap-2 text-[var(--navy-dark)]">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => void handleToggle(item)}
                  aria-label={item.text}
                />
                <span className={clsx(item.done && "line-through opacity-60")}>
                  {item.text}
                </span>
              </label>
              <button
                type="button"
                onClick={() => void handleDelete(item.id)}
                disabled={isBusy}
                aria-label={`Remove step ${item.text}`}
                className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-red-700 disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add a step"
          aria-label={`New checklist step for ${cardTitle}`}
          disabled={isBusy}
          className="min-w-0 flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-xs text-[var(--navy-dark)] outline-none"
        />
        <button
          type="submit"
          disabled={isBusy}
          className="rounded-full border border-[var(--stroke)] px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] disabled:opacity-60"
        >
          Add step
        </button>
      </form>

      {error && (
        <p role="alert" className="text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
    </section>
  );
};
