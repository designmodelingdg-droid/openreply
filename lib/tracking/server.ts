import { createHash, randomBytes } from "node:crypto";

export function generateTrackedLinkSlug() {
  return randomBytes(7).toString("base64url");
}

export function hashClickIp(ipAddress: string | null | undefined) {
  if (!ipAddress) return null;

  const salt = process.env.NEXTAUTH_SECRET ?? "campaigncue-click-salt";
  return createHash("sha256").update(`${salt}:${ipAddress}`).digest("hex");
}

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    null
  );
}

/**
 * Crawlers that fetch a tracked link without a human ever tapping it.
 *
 * Every messenger renders a link preview for URLs it finds in a message body,
 * and Meta's crawlers hit the URL the moment the DM is delivered — before the
 * recipient has opened the conversation. Those fetches went through the same
 * redirect handler as a real tap, so a campaign whose button template was
 * rejected (and fell back to inline URLs in the text) counted dozens of
 * "clicks" per DM sent: 16 sends produced 1069 clicks and a meaningless 100%
 * CTR.
 *
 * Every token here is one no real browser sends. In particular "instagram" is
 * NOT on the list: Instagram's in-app browser puts "Instagram <version>" in
 * its user-agent, and that is exactly where a real commenter taps the link
 * from. Filtering on it would discard the clicks that matter most. The same
 * caution applies to any messenger with an in-app browser, so those appear
 * only in their crawler form (a trailing slash before the version).
 *
 * A bot that lies about its user-agent still gets through. This is a metrics
 * fix, not a security boundary.
 */
const CRAWLER_USER_AGENT_TOKENS = [
  // Meta's own preview crawlers — the ones that inflated the count.
  "facebookexternalhit",
  "facebookcatalog",
  "meta-externalagent",
  "meta-externalfetcher",
  // Other messengers and networks, in crawler form only.
  "whatsapp/",
  "telegrambot",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "discordbot",
  "redditbot",
  "pinterest/",
  "quora link preview",
  "embedly",
  // Search engines.
  "googlebot",
  "bingbot",
  "applebot",
  "yandexbot",
  "duckduckbot",
  "baiduspider",
  // SEO and uptime scanners.
  "ahrefsbot",
  "semrushbot",
  "petalbot",
  // Scripted fetches and headless browsers.
  "curl/",
  "wget",
  "python-requests",
  "node-fetch",
  "go-http-client",
  "headlesschrome",
  // Generic self-declarations every well-behaved bot includes.
  "bot",
  "crawler",
  "spider",
  "scraper",
];

/**
 * True when a request to a tracked link came from a crawler rather than a
 * person. A missing user-agent counts as a crawler: every real browser sends
 * one, and automated fetches routinely omit it.
 */
export function isCrawlerRequest(userAgent: string | null | undefined) {
  if (!userAgent) return true;

  const normalized = userAgent.toLowerCase();
  return CRAWLER_USER_AGENT_TOKENS.some((token) => normalized.includes(token));
}
