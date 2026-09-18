import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";

/**
 * API keys.
 *
 * Everything in the dashboard runs behind the magic-link session, which is
 * fine for a person at a browser and useless for a script: nothing can log in
 * by reading an inbox. A key is the second door. It is created by an admin,
 * shown once, and from then on only its hash exists here — a leaked database
 * does not leak the keys.
 *
 * A key acts as an ADMIN of its workspace: enough to create and edit
 * campaigns, not enough to touch billing.
 */

const KEY_PREFIX = "or_";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function looksLikeApiKey(
  value: string | null | undefined
): value is string {
  return typeof value === "string" && value.startsWith(KEY_PREFIX);
}

/** The bearer token from an Authorization header, or null when there is none. */
export function bearerToken(
  authorization: string | null | undefined
): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token.trim() : null;
}

/**
 * Mint a key for a workspace. Returns the plaintext exactly once; the caller
 * shows it and forgets it.
 */
export async function createApiKey({
  workspaceId,
  createdById,
  name,
}: {
  workspaceId: string;
  createdById: string;
  name: string;
}): Promise<{ id: string; key: string; prefix: string }> {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  // Enough of the key to tell them apart in a list, not enough to guess.
  const prefix = key.slice(0, 10);

  const record = await prisma.apiKey.create({
    data: {
      workspaceId,
      createdById,
      name,
      keyHash: hashApiKey(key),
      prefix,
    },
    select: { id: true },
  });

  return { id: record.id, key, prefix };
}

/**
 * Resolve a presented key to the workspace it opens, or null. Revoked keys
 * resolve to nothing; a valid one records when it was last used, so a key
 * nobody has touched in months is visible as such.
 */
export async function resolveApiKey(
  key: string
): Promise<{ workspaceId: string; createdById: string } | null> {
  if (!looksLikeApiKey(key)) return null;

  const record = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(key) },
    select: { id: true, workspaceId: true, createdById: true, revokedAt: true },
  });
  if (!record || record.revokedAt) return null;

  // Best effort: a failed timestamp must not fail the request.
  await prisma.apiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { workspaceId: record.workspaceId, createdById: record.createdById };
}
