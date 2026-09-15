import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Follow-gate handoff.
 *
 * Instagram's Handover Protocol gives one app ownership of a DM thread. When
 * another tool (here: GoHighLevel, driving the sales bot) owns it, OpenReply
 * can still send the FIRST message — a private reply addressed to a comment —
 * but every later message is rejected with error 100 / subcode 2534037,
 * "The action is invalid since it's not the thread owner".
 *
 * That kills the follow gate, whose whole shape is second and third messages:
 * re-prompt the non-follower, then deliver the resource once they follow. So
 * instead of sending those itself, OpenReply verifies the follow with Meta —
 * which it can always do — and hands the outcome to whoever owns the thread.
 *
 * Opt-in by design: with FOLLOW_HANDOFF_URL unset, nothing here runs and the
 * worker keeps its current behaviour untouched.
 */

export type FollowHandoffPayload = {
  event: "follow_check";
  /** Instagram-scoped ID of the person who tapped the button. */
  igsid: string;
  /** Their @username when known — how a CRM finds the conversation. */
  ig_username: string | null;
  /** true / false from Meta, or null when Meta would not say. */
  follows: boolean | null;
  campaign_id: string;
  campaign_name: string | null;
  /** Tracked URL of the resource, already click-counted. */
  link: string | null;
  messages: {
    /** Send when follows === false. */
    reprompt: string;
    /** Send when follows === true (or null: fail open). */
    resource: string;
    /** Send after the resource, to start the conversation. */
    open_question: string | null;
  };
  /** Unix seconds, so the receiver can reject a replayed request. */
  sent_at: number;
};

export function getFollowHandoffUrl(): string | null {
  const url = process.env.FOLLOW_HANDOFF_URL?.trim();
  return url ? url : null;
}

/**
 * Hex HMAC-SHA256 of the exact request body. The receiver recomputes it over
 * the raw bytes it read — not over a re-serialised object, which would differ
 * by key order or whitespace and never match.
 */
export function signHandoffBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Constant-time signature check, exported for the receiving side to reuse.
 * Returns false rather than throwing on a malformed signature.
 */
export function verifyHandoffSignature(
  body: string,
  signature: string | null | undefined,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = signHandoffBody(body, secret);
  const received = signature.startsWith("sha256=")
    ? signature.slice("sha256=".length)
    : signature;

  if (received.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * POST the follow outcome to the app that owns the thread.
 *
 * Never throws: a handoff that fails must not fail the postback job, because
 * retrying it would re-verify the follow and hand off again. The caller logs
 * the outcome and moves on.
 */
export async function sendFollowHandoff(
  payload: FollowHandoffPayload
): Promise<{ ok: boolean; detail: string }> {
  const url = getFollowHandoffUrl();
  if (!url) return { ok: false, detail: "FOLLOW_HANDOFF_URL not set" };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const secret = process.env.FOLLOW_HANDOFF_SECRET?.trim();
  if (secret) {
    headers["X-OpenReply-Signature"] = `sha256=${signHandoffBody(body, secret)}`;
  }

  // A hung receiver must not hold a worker slot: the follow status is already
  // known and the tap is not worth waiting on.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, detail: `HTTP ${response.status}` };
    }
    return { ok: true, detail: `HTTP ${response.status}` };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}
