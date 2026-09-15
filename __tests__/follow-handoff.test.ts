import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFollowHandoffUrl,
  sendFollowHandoff,
  signHandoffBody,
  verifyHandoffSignature,
  type FollowHandoffPayload,
} from "../lib/handoff/follow-handoff";

const payload: FollowHandoffPayload = {
  event: "follow_check",
  igsid: "17841400000000000",
  ig_username: "nila_brunetti",
  follows: true,
  campaign_id: "auto_789",
  campaign_name: "GUIA CHATGPT",
  link: "https://openreply.example/r/abc123",
  messages: {
    reprompt: "Veo que aun no me sigues",
    resource: "Aqui tienes tu guia",
    open_question: "¿Que buscas lograr?",
  },
  sent_at: 1_757_000_000,
};

const originalUrl = process.env.FOLLOW_HANDOFF_URL;
const originalSecret = process.env.FOLLOW_HANDOFF_SECRET;

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.FOLLOW_HANDOFF_URL;
  delete process.env.FOLLOW_HANDOFF_SECRET;
});

afterEach(() => {
  if (originalUrl === undefined) delete process.env.FOLLOW_HANDOFF_URL;
  else process.env.FOLLOW_HANDOFF_URL = originalUrl;
  if (originalSecret === undefined) delete process.env.FOLLOW_HANDOFF_SECRET;
  else process.env.FOLLOW_HANDOFF_SECRET = originalSecret;
});

describe("follow handoff signature", () => {
  it("verifies a signature it produced, with or without the sha256= prefix", () => {
    const body = JSON.stringify(payload);
    const signature = signHandoffBody(body, "s3cret");

    expect(verifyHandoffSignature(body, signature, "s3cret")).toBe(true);
    expect(verifyHandoffSignature(body, `sha256=${signature}`, "s3cret")).toBe(
      true
    );
  });

  it("rejects a tampered body, a wrong secret, and a missing signature", () => {
    const body = JSON.stringify(payload);
    const signature = signHandoffBody(body, "s3cret");

    expect(
      verifyHandoffSignature(body.replace("true", "false"), signature, "s3cret")
    ).toBe(false);
    expect(verifyHandoffSignature(body, signature, "other")).toBe(false);
    expect(verifyHandoffSignature(body, null, "s3cret")).toBe(false);
    expect(verifyHandoffSignature(body, "sha256=zz", "s3cret")).toBe(false);
  });
});

describe("sendFollowHandoff", () => {
  it("stays off until FOLLOW_HANDOFF_URL is set", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(getFollowHandoffUrl()).toBeNull();
    await expect(sendFollowHandoff(payload)).resolves.toEqual({
      ok: false,
      detail: "FOLLOW_HANDOFF_URL not set",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts the signed payload when configured", async () => {
    process.env.FOLLOW_HANDOFF_URL = "https://bot.example/webhook/openreply";
    process.env.FOLLOW_HANDOFF_SECRET = "s3cret";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await expect(sendFollowHandoff(payload)).resolves.toMatchObject({
      ok: true,
    });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://bot.example/webhook/openreply");
    const body = init.body as string;
    const headers = init.headers as Record<string, string>;
    // Signed over the exact bytes sent, so the receiver can verify the raw body.
    expect(
      verifyHandoffSignature(body, headers["X-OpenReply-Signature"], "s3cret")
    ).toBe(true);
    expect(JSON.parse(body)).toMatchObject({
      event: "follow_check",
      follows: true,
      ig_username: "nila_brunetti",
    });
  });

  // A handoff failure must never fail the postback job: retrying it would
  // re-verify the follow and hand off a second time.
  it("reports a non-2xx response without throwing", async () => {
    process.env.FOLLOW_HANDOFF_URL = "https://bot.example/webhook/openreply";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 502 })
    );

    await expect(sendFollowHandoff(payload)).resolves.toEqual({
      ok: false,
      detail: "HTTP 502",
    });
  });

  it("reports a network failure without throwing", async () => {
    process.env.FOLLOW_HANDOFF_URL = "https://bot.example/webhook/openreply";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(sendFollowHandoff(payload)).resolves.toEqual({
      ok: false,
      detail: "ECONNREFUSED",
    });
  });
});
