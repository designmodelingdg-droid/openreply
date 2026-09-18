import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    apiKey: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));

import {
  bearerToken,
  createApiKey,
  hashApiKey,
  looksLikeApiKey,
  resolveApiKey,
} from "../lib/api-keys";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.apiKey.update.mockResolvedValue({});
});

describe("bearer token parsing", () => {
  it("reads the token out of a Bearer header and nothing else", () => {
    expect(bearerToken("Bearer or_abc")).toBe("or_abc");
    expect(bearerToken("bearer or_abc")).toBe("or_abc");
    expect(bearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("only treats the or_ prefix as a key", () => {
    expect(looksLikeApiKey("or_abc")).toBe(true);
    expect(looksLikeApiKey("sk_abc")).toBe(false);
    expect(looksLikeApiKey(null)).toBe(false);
  });
});

describe("createApiKey", () => {
  it("stores only the hash and returns the plaintext once", async () => {
    mockPrisma.apiKey.create.mockResolvedValue({ id: "key_1" });

    const created = await createApiKey({
      workspaceId: "ws_1",
      createdById: "user_1",
      name: "matriz",
    });

    expect(created.key.startsWith("or_")).toBe(true);
    expect(created.prefix).toBe(created.key.slice(0, 10));

    const stored = mockPrisma.apiKey.create.mock.calls[0][0].data;
    // A leaked table must not leak keys.
    expect(stored.keyHash).toBe(hashApiKey(created.key));
    expect(JSON.stringify(stored)).not.toContain(created.key);
  });
});

describe("resolveApiKey", () => {
  it("opens the workspace for a live key and stamps the use", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: "key_1",
      workspaceId: "ws_1",
      createdById: "user_1",
      revokedAt: null,
    });

    await expect(resolveApiKey("or_live")).resolves.toEqual({
      workspaceId: "ws_1",
      createdById: "user_1",
    });
    expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledWith({
      where: { keyHash: hashApiKey("or_live") },
      select: expect.any(Object),
    });
    expect(mockPrisma.apiKey.update).toHaveBeenCalledTimes(1);
  });

  it("refuses a revoked key, an unknown key and a non-key", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
      id: "key_1",
      workspaceId: "ws_1",
      createdById: "user_1",
      revokedAt: new Date(),
    });
    await expect(resolveApiKey("or_revoked")).resolves.toBeNull();

    mockPrisma.apiKey.findUnique.mockResolvedValueOnce(null);
    await expect(resolveApiKey("or_unknown")).resolves.toBeNull();

    await expect(resolveApiKey("not-a-key")).resolves.toBeNull();
    // No lookup at all for something that cannot be a key.
    expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledTimes(2);
  });

  // The timestamp is bookkeeping; the request it belongs to must go through.
  it("still resolves when recording last use fails", async () => {
    mockPrisma.apiKey.findUnique.mockResolvedValue({
      id: "key_1",
      workspaceId: "ws_1",
      createdById: "user_1",
      revokedAt: null,
    });
    mockPrisma.apiKey.update.mockRejectedValue(new Error("db down"));

    await expect(resolveApiKey("or_live")).resolves.toEqual({
      workspaceId: "ws_1",
      createdById: "user_1",
    });
  });
});
