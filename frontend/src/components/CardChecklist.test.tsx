import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CardChecklist } from "@/components/CardChecklist";

const existing = [
  { id: "check-1", text: "Cut the tag", done: false },
  { id: "check-2", text: "Publish notes", done: true },
];

const stubApi = (overrides: { patch?: unknown } = {}) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: "check-3", text: "Tell the team", done: false }),
      });
    }
    if (init?.method === "PATCH") {
      return Promise.resolve(
        overrides.patch ?? { ok: true, json: async () => ({ updated: true }) }
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

const renderChecklist = () => {
  const onChecklistChanged = vi.fn();
  render(
    <CardChecklist
      cardId="card-1"
      cardTitle="Ship release"
      onChecklistChanged={onChecklistChanged}
    />
  );
  return onChecklistChanged;
};

describe("CardChecklist", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads steps and shows progress", async () => {
    stubApi();
    renderChecklist();

    expect(await screen.findByLabelText("Cut the tag")).not.toBeChecked();
    expect(screen.getByLabelText("Publish notes")).toBeChecked();
    expect(screen.getByText("1/2")).toBeInTheDocument();
  });

  it("adds a step", async () => {
    const fetchMock = stubApi();
    const onChecklistChanged = renderChecklist();
    await screen.findByLabelText("Cut the tag");

    await userEvent.type(
      screen.getByLabelText("New checklist step for Ship release"),
      "Tell the team"
    );
    await userEvent.click(screen.getByRole("button", { name: "Add step" }));

    expect(await screen.findByLabelText("Tell the team")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board/cards/card-1/checklist",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "Tell the team" }),
      })
    );
    expect(onChecklistChanged).toHaveBeenCalledTimes(1);
  });

  it("ignores a blank step", async () => {
    const fetchMock = stubApi();
    renderChecklist();
    await screen.findByLabelText("Cut the tag");
    fetchMock.mockClear();

    await userEvent.type(
      screen.getByLabelText("New checklist step for Ship release"),
      "   "
    );
    await userEvent.click(screen.getByRole("button", { name: "Add step" }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ticks a step", async () => {
    const fetchMock = stubApi();
    const onChecklistChanged = renderChecklist();

    await userEvent.click(await screen.findByLabelText("Cut the tag"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/board/checklist/check-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ done: true }),
        })
      )
    );
    expect(screen.getByLabelText("Cut the tag")).toBeChecked();
    expect(screen.getByText("2/2")).toBeInTheDocument();
    expect(onChecklistChanged).toHaveBeenCalledTimes(1);
  });

  it("puts a step back when the server rejects the tick", async () => {
    stubApi({
      patch: { ok: false, status: 500, json: async () => ({}) },
    });
    renderChecklist();

    await userEvent.click(await screen.findByLabelText("Cut the tag"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to update that step."
    );
    expect(screen.getByLabelText("Cut the tag")).not.toBeChecked();
  });

  it("removes a step", async () => {
    const fetchMock = stubApi();
    renderChecklist();
    await screen.findByLabelText("Cut the tag");

    await userEvent.click(
      screen.getByRole("button", { name: "Remove step Cut the tag" })
    );

    await waitFor(() =>
      expect(screen.queryByLabelText("Cut the tag")).not.toBeInTheDocument()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/board/checklist/check-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("shows an empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    );
    renderChecklist();

    expect(await screen.findByText("No steps yet.")).toBeInTheDocument();
  });
});
