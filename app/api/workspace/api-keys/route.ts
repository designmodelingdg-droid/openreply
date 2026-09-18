import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createApiKey } from "@/lib/api-keys";
import { prisma } from "@/lib/db/client";
import {
  canManageWorkspace,
  getCurrentWorkspaceContext,
} from "@/lib/workspace-access";

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

const revokeSchema = z.object({
  id: z.string().min(1),
});

async function listKeys(workspaceId: string) {
  return prisma.apiKey.findMany({
    where: { workspaceId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      createdBy: { select: { email: true } },
    },
  });
}

export async function GET() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can see API keys" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    success: true,
    data: { keys: await listKeys(context.workspaceId) },
  });
}

/**
 * Mint a key. The plaintext is in this response and nowhere else — the
 * dashboard shows it once and the database keeps only its hash.
 */
export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can create API keys" },
      { status: 403 }
    );
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Give the key a name" },
      { status: 400 }
    );
  }

  const created = await createApiKey({
    workspaceId: context.workspaceId,
    createdById: context.userId,
    name: parsed.data.name,
  });

  return NextResponse.json({
    success: true,
    data: { key: created.key, keys: await listKeys(context.workspaceId) },
  });
}

/**
 * Revoke a key. Revoked rather than deleted, so the list of what existed
 * survives — a key that went missing is worth being able to see.
 */
export async function DELETE(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageWorkspace(context.role)) {
    return NextResponse.json(
      { success: false, error: "Only owners and admins can revoke API keys" },
      { status: 403 }
    );
  }

  const parsed = revokeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Invalid key" }, { status: 400 });
  }

  // Scoped to this workspace: a key id from another workspace is a no-op.
  await prisma.apiKey.updateMany({
    where: { id: parsed.data.id, workspaceId: context.workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({
    success: true,
    data: { keys: await listKeys(context.workspaceId) },
  });
}
