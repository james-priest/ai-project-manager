import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardComments } from "@/components/CardComments";

const existing = [
  {
    id: "comment-1",
    author: "ada",
    body: "Looks good",
    createdAt: "2026-02-01T10:00:00+00:00",
  },
];

const stubApi = (postResponse?: unknown) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return Promise.resolve(
        postResponse ?? {
          ok: true,
          json: async () => ({
            id: "comment-2",
            author: "grace",
            body: "Agreed",
            createdAt: "2026-02-01T11:00:00+00:00",
          }),
        }
      );
    }
    if (init?.method === "DELETE") {
      return Promise.resolve({ ok: true, json: async () => ({ deleted: true }) });
    }
    return Promise.resolve({ ok: true, json: async () => existing });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const renderComments = () => {
  const onCommentsChanged = vi.fn();
  render(
    <CardComments
      cardId="card-1"
      cardTitle="Ship release"
      onCommentsChanged={onCommentsChanged}
    />
  );
  return onCommentsChanged;
};

describe("CardComments", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads existing comments", async () => {
    const fetchMock = stubApi();
    renderComments();

    expect(await screen.findByText(/Looks good/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board/cards/card-1/comments",
      expect.objectContaining({ credentials: "same-origin" })
    );
  });

  it("adds a comment and tells the board", async () => {
    const fetchMock = stubApi();
    const onCommentsChanged = renderComments();
    await screen.findByText(/Looks good/);

    await userEvent.type(
      screen.getByLabelText("New comment on Ship release"),
      "Agreed"
    );
    await userEvent.click(screen.getByRole("button", { name: "Comment" }));

    expect(await screen.findByText(/Agreed/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board/cards/card-1/comments",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ body: "Agreed" }),
      })
    );
    expect(onCommentsChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("New comment on Ship release")).toHaveValue("");
  });

  it("ignores a blank comment", async () => {
    const fetchMock = stubApi();
    renderComments();
    await screen.findByText(/Looks good/);
    fetchMock.mockClear();

    await userEvent.type(
      screen.getByLabelText("New comment on Ship release"),
      "   "
    );
    await userEvent.click(screen.getByRole("button", { name: "Comment" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes a comment", async () => {
    const fetchMock = stubApi();
    const onCommentsChanged = renderComments();
    await screen.findByText(/Looks good/);

    await userEvent.click(
      screen.getByRole("button", { name: "Delete comment by ada" })
    );

    await waitFor(() =>
      expect(screen.queryByText(/Looks good/)).not.toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board/comments/comment-1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(onCommentsChanged).toHaveBeenCalledTimes(1);
  });

  it("reports a failed comment", async () => {
    stubApi({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Card not found" }),
    });
    renderComments();
    await screen.findByText(/Looks good/);

    await userEvent.type(
      screen.getByLabelText("New comment on Ship release"),
      "Hello"
    );
    await userEvent.click(screen.getByRole("button", { name: "Comment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Card not found");
  });

  it("shows an empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    );
    renderComments();

    expect(await screen.findByText("No comments yet.")).toBeInTheDocument();
  });
});
