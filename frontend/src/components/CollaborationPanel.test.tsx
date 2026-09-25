import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollaborationPanel } from "@/components/CollaborationPanel";

const members = [
  { username: "ada", role: "owner" as const },
  { username: "grace", role: "editor" as const },
];

const activity = [
  {
    id: "activity-1",
    actor: "ada",
    summary: "shared the board with grace",
    createdAt: "2026-02-01T10:00:00+00:00",
  },
];

const stubApi = (overrides: Record<string, unknown> = {}) => {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith("/members") && init?.method === "POST") {
      return Promise.resolve(
        (overrides.addMember as { ok: boolean; json: () => Promise<unknown> }) ?? {
          ok: true,
          json: async () => ({ username: "mallory", role: "editor" }),
        }
      );
    }
    if (url.includes("/members/")) {
      return Promise.resolve({ ok: true, json: async () => ({ removed: true }) });
    }
    if (url.endsWith("/members")) {
      return Promise.resolve({ ok: true, json: async () => members });
    }
    return Promise.resolve({ ok: true, json: async () => activity });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const openPanel = async (canManageMembers = true) => {
  const onError = vi.fn();
  render(
    <CollaborationPanel
      boardId="board-1"
      canManageMembers={canManageMembers}
      onError={onError}
    />
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Sharing and activity" })
  );
  return onError;
};

describe("CollaborationPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads nothing until it is opened", () => {
    const fetchMock = stubApi();
    render(
      <CollaborationPanel
        boardId="board-1"
        canManageMembers
        onError={vi.fn()}
      />
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Members")).not.toBeInTheDocument();
  });

  it("shows members and activity once opened", async () => {
    stubApi();
    await openPanel();

    // "ada" appears both as a member and as an activity actor.
    const memberList = await screen.findByRole("list", { name: "Members" });
    expect(within(memberList).getByText(/ada/)).toBeInTheDocument();
    expect(within(memberList).getByText(/grace/)).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByText("editor")).toBeInTheDocument();
    const activityList = screen.getByRole("list", { name: "Recent activity" });
    expect(
      within(activityList).getByText(/shared the board with grace/)
    ).toBeInTheDocument();
  });

  it("shares the board with another user", async () => {
    const fetchMock = stubApi();
    await openPanel();
    await screen.findByText("grace");

    await userEvent.type(screen.getByLabelText("Username to invite"), "mallory");
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/boards/board-1/members",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ username: "mallory" }),
        })
      )
    );
    expect(screen.getByLabelText("Username to invite")).toHaveValue("");
  });

  it("reports a failed share", async () => {
    stubApi({
      addMember: {
        ok: false,
        status: 409,
        json: async () => ({ detail: "That user does not exist." }),
      },
    });
    const onError = await openPanel();
    await screen.findByText("grace");

    await userEvent.type(screen.getByLabelText("Username to invite"), "nobody");
    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("That user does not exist.")
    );
  });

  it("removes a member", async () => {
    const fetchMock = stubApi();
    await openPanel();
    await screen.findByText("grace");

    await userEvent.click(screen.getByRole("button", { name: "Remove grace" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/boards/board-1/members/grace",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });

  it("hides member management from editors", async () => {
    stubApi();
    await openPanel(false);
    await screen.findByText("grace");

    expect(
      screen.queryByLabelText("Username to invite")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove grace" })
    ).not.toBeInTheDocument();
  });
});
