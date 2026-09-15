import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma, mockHeaders, mockRedirect, mockFollowStatus } = vi.hoisted(
  () => ({
    mockPrisma: {
      followGate: {
        findUnique: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
      },
      operationalEvent: { create: vi.fn() },
    },
    mockHeaders: vi.fn(),
    mockRedirect: vi.fn(),
    mockFollowStatus: vi.fn(),
  })
);

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("next/headers", () => ({ headers: mockHeaders }));
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("@/lib/instagram/provider", () => ({
  createInstagramContext: vi.fn().mockResolvedValue({
    provider: "META",
    accessToken: "token",
  }),
  getUserFollowStatusDetailed: mockFollowStatus,
  hasInstagramCredentials: () => true,
}));

import FollowGatePage from "../app/g/[token]/page";
import { buildFollowGateUrl, issueFollowGate } from "../lib/follow-gate/gate";

const INSTAGRAM_IN_APP_BROWSER =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Mobile/15E148 Instagram 334.0.0.32.98 (iPhone15,2; iOS 17_5; es_EC)";

function gateRow(
  overrides: {
    passedAt?: Date | null;
    trackedLinks?: { slug: string; label: string | null }[];
  } = {}
) {
  return {
    id: "gate_1",
    igsid: "17841400000000000",
    passedAt: overrides.passedAt ?? null,
    automation: {
      id: "auto_1",
      isActive: true,
      linkButtonLabel: "Descargar la guía",
      followRepromptMessage: null,
      trackedLinks: overrides.trackedLinks ?? [
        { slug: "abc123", label: "Guía" },
      ],
      instagramAccount: {
        provider: "META",
        workspaceId: "ws_1",
        zernioAccountId: null,
        instagramId: "17841400000000001",
        accessToken: "encrypted",
        username: "design_modeling_dg",
      },
    },
  };
}

async function render(userAgent: string) {
  mockHeaders.mockResolvedValue({ get: () => userAgent });
  return (await FollowGatePage({
    params: Promise.resolve({ token: "tok_1" }),
    searchParams: Promise.resolve({}),
  })) as { props: Record<string, unknown> } | undefined;
}

type Action = { label: string; href: string; variant: string };

function actionsOf(result: { props: Record<string, unknown> } | undefined) {
  return (result?.props.actions ?? []) as Action[];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = "https://openreply.example";
  mockPrisma.followGate.update.mockResolvedValue({});
  mockPrisma.operationalEvent.create.mockResolvedValue({});
});

describe("follow gate links", () => {
  it("builds a gate URL on the deployment's own origin", () => {
    expect(buildFollowGateUrl("tok_1")).toBe(
      "https://openreply.example/g/tok_1"
    );
    expect(buildFollowGateUrl("tok_1", "https://custom.example/")).toBe(
      "https://custom.example/g/tok_1"
    );
  });

  // Re-issuing would break the link already sitting in an earlier DM.
  it("reuses the token of someone who comments twice", async () => {
    mockPrisma.followGate.upsert.mockResolvedValue({ token: "existing" });

    await expect(
      issueFollowGate({
        automationId: "auto_1",
        igsid: "igsid_1",
        commenterName: "nila",
      })
    ).resolves.toBe("existing");

    const call = mockPrisma.followGate.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      automationId_igsid: { automationId: "auto_1", igsid: "igsid_1" },
    });
    expect(call.update).toEqual({ commenterName: "nila" });
    expect(call.update).not.toHaveProperty("token");
  });
});

describe("follow gate page", () => {
  it("shows a preview to a crawler without asking Meta or recording a check", async () => {
    mockPrisma.followGate.findUnique.mockResolvedValue(gateRow());

    const result = await render("facebookexternalhit/1.1");

    expect(mockFollowStatus).not.toHaveBeenCalled();
    expect(mockPrisma.followGate.update).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result?.props.title).toBe("Tu recurso te está esperando");
  });

  it("blocks a non-follower with a follow button and a re-check button", async () => {
    mockPrisma.followGate.findUnique.mockResolvedValue(gateRow());
    mockFollowStatus.mockResolvedValue({ follows: false, detail: "ok: false" });

    const result = await render(INSTAGRAM_IN_APP_BROWSER);

    expect(mockRedirect).not.toHaveBeenCalled();
    const actions = actionsOf(result);
    expect(actions[0].href).toBe(
      "https://www.instagram.com/design_modeling_dg/"
    );
    expect(actions[1].label).toBe("Ya te sigo, verificar");
    // Still gated: a later visit has to ask Meta again.
    expect(
      mockPrisma.followGate.update.mock.calls[0][0].data
    ).not.toHaveProperty("passedAt");
  });

  it("sends a follower straight to the tracked link", async () => {
    mockPrisma.followGate.findUnique.mockResolvedValue(gateRow());
    mockFollowStatus.mockResolvedValue({ follows: true, detail: "ok: true" });

    await render(INSTAGRAM_IN_APP_BROWSER);

    expect(mockRedirect).toHaveBeenCalledWith(
      "https://openreply.example/r/abc123"
    );
    expect(mockPrisma.followGate.update.mock.calls[0][0].data.passedAt).toBeInstanceOf(
      Date
    );
  });

  // Meta not answering must not trap a real follower — but an unverified pass
  // has to leave a trail, or a gate that never verifies anyone is invisible.
  it("lets someone through when Instagram will not say, and says so", async () => {
    mockPrisma.followGate.findUnique.mockResolvedValue(gateRow());
    mockFollowStatus.mockResolvedValue({
      follows: null,
      detail: "HTTP 400: Unsupported get request",
    });

    await render(INSTAGRAM_IN_APP_BROWSER);

    expect(mockRedirect).toHaveBeenCalledWith(
      "https://openreply.example/r/abc123"
    );

    const saved = mockPrisma.followGate.update.mock.calls[0][0].data;
    expect(saved.lastFollows).toBeNull();
    expect(saved.lastDetail).toBe("HTTP 400: Unsupported get request");

    const event = mockPrisma.operationalEvent.create.mock.calls[0][0].data;
    expect(event.level).toBe("WARNING");
    expect(event.message).toContain("Unsupported get request");
    expect(event.payload.igsid).toBe("17841400000000000");
  });

  it("records a verified answer without raising an alert", async () => {
    mockPrisma.followGate.findUnique.mockResolvedValue(gateRow());
    mockFollowStatus.mockResolvedValue({ follows: false, detail: "ok: false" });

    await render(INSTAGRAM_IN_APP_BROWSER);

    expect(mockPrisma.followGate.update.mock.calls[0][0].data.lastFollows).toBe(
      false
    );
    expect(mockPrisma.operationalEvent.create).not.toHaveBeenCalled();
  });

  it("offers a button per resource when a campaign has more than one", async () => {
    mockPrisma.followGate.findUnique.mockResolvedValue(
      gateRow({
        trackedLinks: [
          { slug: "abc123", label: "Guía" },
          { slug: "def456", label: "Entrar a comunidad" },
        ],
      })
    );
    mockFollowStatus.mockResolvedValue({ follows: true, detail: "ok: true" });

    const result = await render(INSTAGRAM_IN_APP_BROWSER);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(actionsOf(result).map((a) => a.label)).toEqual([
      "Descargar la guía",
      "Entrar a comunidad",
    ]);
  });

  it("does not re-verify someone who already passed the gate", async () => {
    mockPrisma.followGate.findUnique.mockResolvedValue(
      gateRow({ passedAt: new Date("2026-09-15T00:00:00Z") })
    );

    await render(INSTAGRAM_IN_APP_BROWSER);

    expect(mockFollowStatus).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith(
      "https://openreply.example/r/abc123"
    );
  });

  it("explains an unknown token instead of failing", async () => {
    mockPrisma.followGate.findUnique.mockResolvedValue(null);

    const result = await render(INSTAGRAM_IN_APP_BROWSER);

    expect(result?.props.title).toBe("Este enlace ya no es válido");
    expect(mockFollowStatus).not.toHaveBeenCalled();
  });
});
