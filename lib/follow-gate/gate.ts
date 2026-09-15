import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";

/**
 * Web follow gate.
 *
 * Instagram's Handover Protocol gives one app ownership of a DM thread. When
 * another tool owns it, OpenReply can still send the FIRST message — a private
 * reply addressed to a comment — but every later message is rejected with
 * error 100 / subcode 2534037.
 *
 * The in-thread follow gate is made of those later messages: re-prompt the
 * non-follower, then deliver the resource. So instead of asking in the thread,
 * the one message we are allowed to send carries a button pointing at a page
 * on this deployment. The token in that URL identifies the person who received
 * it, so the page can ask Meta whether they follow — a read, which works even
 * when no write does — and answer on the page: through to the resource, or a
 * "follow first" screen with the two buttons that unblock them.
 *
 * The token is a bearer credential for one resource link, nothing more. Anyone
 * who gets hold of it can open that campaign's resource, the same as anyone
 * who is forwarded the resource URL itself.
 */

/** 16 URL-safe characters — short enough to sit in a DM button, unguessable. */
export function generateFollowGateToken() {
  return randomBytes(12).toString("base64url");
}

export function buildFollowGateUrl(token: string, baseUrl?: string) {
  const resolvedBaseUrl =
    baseUrl ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  return `${resolvedBaseUrl.replace(/\/$/, "")}/g/${token}`;
}

/**
 * The gate link for one person on one campaign, created on first use and
 * reused afterwards. Someone who comments the keyword twice gets the same URL,
 * so an older DM they scroll back to keeps working.
 */
export async function issueFollowGate({
  automationId,
  igsid,
  commenterName,
}: {
  automationId: string;
  igsid: string;
  commenterName?: string | null;
}): Promise<string> {
  const gate = await prisma.followGate.upsert({
    where: { automationId_igsid: { automationId, igsid } },
    create: {
      token: generateFollowGateToken(),
      automationId,
      igsid,
      commenterName: commenterName ?? null,
    },
    // Only refresh the name: re-issuing the token would break links already
    // sitting in someone's inbox.
    update: commenterName ? { commenterName } : {},
    select: { token: true },
  });

  return gate.token;
}
