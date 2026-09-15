import { beforeEach, describe, expect, it, vi } from "vitest";
import { isCrawlerRequest } from "../lib/tracking/server";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    trackedLink: {
      findUnique: vi.fn(),
    },
    linkClick: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/client", () => ({
  prisma: mockPrisma,
}));

import { GET } from "../app/r/[slug]/route";

const INSTAGRAM_IN_APP_BROWSER =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Mobile/15E148 Instagram 334.0.0.32.98 (iPhone15,2; iOS 17_5; es_EC)";

describe("isCrawlerRequest", () => {
  it("flags the Meta crawlers that preview links inside a DM", () => {
    expect(
      isCrawlerRequest(
        "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
      )
    ).toBe(true);
    expect(isCrawlerRequest("meta-externalagent/1.1")).toBe(true);
    expect(isCrawlerRequest("WhatsApp/2.23.20.0")).toBe(true);
  });

  it("flags scripted fetches and a missing user-agent", () => {
    expect(isCrawlerRequest("curl/8.4.0")).toBe(true);
    expect(isCrawlerRequest("python-requests/2.31.0")).toBe(true);
    expect(isCrawlerRequest(null)).toBe(true);
    expect(isCrawlerRequest("")).toBe(true);
  });

  // The regression that matters: "instagram" appears in the in-app browser's
  // user-agent, and that browser is where a real commenter taps the link.
  it("does not flag the Instagram in-app browser", () => {
    expect(isCrawlerRequest(INSTAGRAM_IN_APP_BROWSER)).toBe(false);
  });

  it("does not flag ordinary mobile and desktop browsers", () => {
    expect(
      isCrawlerRequest(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 " +
          "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
      )
    ).toBe(false);
    expect(
      isCrawlerRequest(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/126.0.0.0 Safari/537.36"
      )
    ).toBe(false);
  });
});

describe("tracked link redirect click counting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.trackedLink.findUnique.mockResolvedValue({
      id: "link_123",
      workspaceId: "workspace_123",
      automationId: "automation_123",
      destinationUrl: "https://example.com/offer",
      automation: { instagramAccountId: "instagram_account_123" },
    });
    mockPrisma.linkClick.create.mockResolvedValue({});
  });

  async function hit(userAgent: string | undefined) {
    return GET(
      new Request("https://openreply.example/r/abc123", {
        headers: userAgent ? { "user-agent": userAgent } : {},
      }) as Parameters<typeof GET>[0],
      { params: Promise.resolve({ slug: "abc123" }) }
    );
  }

  it("redirects a crawler without counting a click", async () => {
    const response = await hit("facebookexternalhit/1.1");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/offer");
    expect(mockPrisma.linkClick.create).not.toHaveBeenCalled();
  });

  it("counts a click from the Instagram in-app browser", async () => {
    const response = await hit(INSTAGRAM_IN_APP_BROWSER);

    expect(response.status).toBe(302);
    expect(mockPrisma.linkClick.create).toHaveBeenCalledTimes(1);
  });
});
