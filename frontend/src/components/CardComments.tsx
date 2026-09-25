"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, getApiErrorMessage, type Comment } from "@/lib/api";

type CardCommentsProps = {
  cardId: string;
  cardTitle: string;
  onCommentsChanged: () => void;
};

export const CardComments = ({
  cardId,
  cardTitle,
  onCommentsChanged,
}: CardCommentsProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .listComments(cardId)
      .then((loaded) => {
        if (active) {
          setComments(loaded);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getApiErrorMessage(loadError, "Unable to load comments."));
        }
      });
    return () => {
      active = false;
    };
  }, [cardId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextBody = body.trim();
    if (!nextBody || isBusy) {
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const comment = await api.addComment(cardId, nextBody);
      setComments((current) => [...current, comment]);
      setBody("");
      onCommentsChanged();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Unable to add that comment."));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    setIsBusy(true);
    setError(null);
    try {
      await api.deleteComment(commentId);
      setComments((current) =>
        current.filter((comment) => comment.id !== commentId)
      );
      onCommentsChanged();
    } catch (deleteError) {
      setError(
        getApiErrorMessage(deleteError, "Unable to remove that comment.")
      );
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section
      aria-label={`Comments on ${cardTitle}`}
      className="space-y-2 border-t border-[var(--stroke)] pt-3"
    >
      <h4 className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
        Comments
      </h4>

      {comments.length === 0 ? (
        <p className="text-xs text-[var(--gray-text)]">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <li key={comment.id} className="text-xs text-[var(--navy-dark)]">
              <span className="font-semibold">{comment.author}</span>{" "}
              {comment.body}
              <button
                type="button"
                onClick={() => void handleDelete(comment.id)}
                disabled={isBusy}
                aria-label={`Delete comment by ${comment.author}`}
                className="ml-2 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-red-700 disabled:opacity-60"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Add a comment"
          aria-label={`New comment on ${cardTitle}`}
          disabled={isBusy}
          className="min-w-0 flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-xs text-[var(--navy-dark)] outline-none"
        />
        <button
          type="submit"
          disabled={isBusy}
          className="rounded-full border border-[var(--stroke)] px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] disabled:opacity-60"
        >
          Comment
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
