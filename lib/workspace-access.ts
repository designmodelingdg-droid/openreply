import { headers } from "next/headers";
import type { Workspace, WorkspaceRole } from "@/app/generated/prisma/client";
import { bearerToken, resolveApiKey } from "@/lib/api-keys";
import { getCurrentUserId } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { ensureWorkspaceForUser } from "@/lib/workspace";

export type WorkspaceContext = {
  userId: string;
  workspaceId: string;
  workspace: Workspace;
  role: WorkspaceRole;
};

const ROLE_ORDER: Record<WorkspaceRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function hasWorkspaceRole(
  role: WorkspaceRole,
  minimumRole: WorkspaceRole
) {
  return ROLE_ORDER[role] >= ROLE_ORDER[minimumRole];
}

export function canManageWorkspace(role: WorkspaceRole) {
  return hasWorkspaceRole(role, "ADMIN");
}

export function canManageBilling(role: WorkspaceRole) {
  return role === "OWNER";
}

/**
 * The workspace a bearer API key opens, when the request carries one. Reads
 * the headers of the request being served, so it only means anything inside a
 * route handler or a server component.
 */
async function getApiKeyWorkspaceContext(): Promise<WorkspaceContext | null> {
  let authorization: string | null = null;
  try {
    authorization = (await headers()).get("authorization");
  } catch {
    // Outside a request (a worker, a script): there is no header to read.
    return null;
  }

  const token = bearerToken(authorization);
  if (!token) return null;

  const resolved = await resolveApiKey(token);
  if (!resolved) return null;

  const workspace = await prisma.workspace.findUnique({
    where: { id: resolved.workspaceId },
  });
  if (!workspace) return null;

  // A key does what an admin does: campaigns and members, never billing.
  return {
    userId: resolved.createdById,
    workspaceId: workspace.id,
    workspace,
    role: "ADMIN",
  };
}

export async function getCurrentWorkspaceContext(): Promise<WorkspaceContext | null> {
  const viaKey = await getApiKeyWorkspaceContext();
  if (viaKey) return viaKey;

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });

  if (membership) {
    return {
      userId,
      workspaceId: membership.workspaceId,
      workspace: membership.workspace,
      role: membership.role,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const workspace = await ensureWorkspaceForUser(userId, user?.email);
  const createdMembership = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId,
      },
    },
  });

  return {
    userId,
    workspaceId: workspace.id,
    workspace,
    role: createdMembership?.role ?? "OWNER",
  };
}

