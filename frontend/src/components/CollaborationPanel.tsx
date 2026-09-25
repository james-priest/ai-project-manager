"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  api,
  getApiErrorMessage,
  type ActivityEntry,
  type BoardMember,
} from "@/lib/api";

type CollaborationPanelProps = {
  boardId: string;
  canManageMembers: boolean;
  onError: (message: string) => void;
};

const formatTimestamp = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

export const CollaborationPanel = ({
  boardId,
  canManageMembers,
  onError,
}: CollaborationPanelProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [newMember, setNewMember] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [nextMembers, nextActivity] = await Promise.all([
        api.listMembers(boardId),
        api.listActivity(boardId),
      ]);
      setMembers(nextMembers);
      setActivity(nextActivity);
    } catch (error) {
      onError(
        getApiErrorMessage(error, "Unable to load sharing details.")
      );
    }
  }, [boardId, onError]);

  useEffect(() => {
    if (isOpen) {
      void load();
    }
  }, [isOpen, load]);

  const handleAddMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = newMember.trim();
    if (!username || isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      await api.addMember(boardId, username);
      setNewMember("");
      await load();
    } catch (error) {
      onError(getApiErrorMessage(error, "Unable to share this board."));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveMember = async (username: string) => {
    setIsBusy(true);
    try {
      await api.removeMember(boardId, username);
      await load();
    } catch (error) {
      onError(getApiErrorMessage(error, "Unable to remove that member."));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section
      aria-label="Sharing and activity"
      className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] p-4"
    >
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="rounded-full border border-dashed border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)]"
      >
        Sharing and activity
      </button>

      {isOpen && (
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              Members
            </h2>
            <ul aria-label="Members" className="mt-3 space-y-2">
              {members.map((member) => (
                <li
                  key={member.username}
                  className="flex items-center justify-between gap-3 text-sm text-[var(--navy-dark)]"
                >
                  <span>
                    {member.username}
                    <span className="ml-2 text-xs uppercase tracking-wide text-[var(--gray-text)]">
                      {member.role}
                    </span>
                  </span>
                  {member.role !== "owner" && canManageMembers && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveMember(member.username)}
                      disabled={isBusy}
                      aria-label={`Remove ${member.username}`}
                      className="rounded-full px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-red-700 disabled:opacity-60"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {canManageMembers && (
              <form onSubmit={handleAddMember} className="mt-4 flex items-center gap-2">
                <input
                  value={newMember}
                  onChange={(event) => setNewMember(event.target.value)}
                  placeholder="Username"
                  aria-label="Username to invite"
                  disabled={isBusy}
                  required
                  className="min-w-0 flex-1 rounded-full border border-[var(--stroke)] bg-white px-3 py-2 text-xs font-medium text-[var(--navy-dark)] outline-none"
                />
                <button
                  type="submit"
                  disabled={isBusy}
                  className="rounded-full bg-[var(--secondary-purple)] px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
                >
                  Share
                </button>
              </form>
            )}
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              Recent activity
            </h2>
            {activity.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--gray-text)]">
                Nothing has happened on this board yet.
              </p>
            ) : (
              <ul
                aria-label="Recent activity"
                className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-2"
              >
                {activity.map((entry) => (
                  <li key={entry.id} className="text-sm text-[var(--navy-dark)]">
                    <span className="font-semibold">{entry.actor}</span>{" "}
                    {entry.summary}
                    <span className="ml-2 text-xs text-[var(--gray-text)]">
                      {formatTimestamp(entry.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
