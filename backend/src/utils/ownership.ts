import { AuthedRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";

export type OwnershipScope = "all" | "dept" | "own" | null;

/**
 * Ensure userPermissions are loaded on the request.
 */
export async function ensureUserPermissions(req: AuthedRequest): Promise<string[]> {
  if (req.userPermissions) return req.userPermissions;
  if (!req.user?.roleId) return [];
  const rolePerms = await prisma.rolePermission.findMany({
    where: { roleId: req.user.roleId },
    select: { permission: true },
  });
  req.userPermissions = rolePerms.map((rp) => rp.permission);
  return req.userPermissions;
}

/**
 * Determine the highest ownership tier granted to the user for a resource and action.
 * Priority: "all" > "dept" > "own" > null.
 */
export function getOwnershipTier(
  userPermissions: string[] | undefined,
  resource: string,
  action: string,
  isSuperAdmin = false
): OwnershipScope {
  if (isSuperAdmin) return "all";
  if (!userPermissions) return null;
  if (userPermissions.includes(`${resource}:${action}:all`)) return "all";
  if (userPermissions.includes(`${resource}:${action}:dept`)) return "dept";
  if (userPermissions.includes(`${resource}:${action}:own`)) return "own";
  return null;
}

/**
 * Check if the user is authorized to perform an action on a record based on 3-tier ownership:
 * - "all": record can belong to any department or user
 * - "dept": record.departmentId must match user.departmentId
 * - "own": record was created by / assigned to user, or user is meeting organizer / participant
 */
export function checkOwnershipAccess(
  req: AuthedRequest,
  resource: string,
  action: string,
  record: {
    departmentId?: string | null;
    ownerId?: string | null;
    participantIds?: string[];
  }
): boolean {
  if (!req.user) return false;
  if (req.user.roleCode === "SYSTEM_ADMIN") return true;

  const tier = getOwnershipTier(req.userPermissions, resource, action, false);
  if (!tier) return false;
  if (tier === "all") return true;

  if (tier === "dept") {
    return !!(req.user.departmentId && record.departmentId === req.user.departmentId);
  }

  if (tier === "own") {
    if (record.ownerId && record.ownerId === req.user.userId) return true;
    if (record.participantIds && record.participantIds.includes(req.user.userId)) return true;
    return false;
  }

  return false;
}
