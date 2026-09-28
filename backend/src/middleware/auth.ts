import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../utils/jwt";
import { prisma } from "../lib/prisma";

export interface AuthedRequest extends Request {
  user?: JwtPayload;
  /** Populated by requirePermission — cached role permissions for this request */
  userPermissions?: string[];
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  // Also accept ?token= query param (used for browser window.open URLs like /view)
  const queryToken = typeof req.query.token === "string" ? req.query.token : null;

  let rawToken: string | null = null;
  if (header && header.startsWith("Bearer ")) {
    rawToken = header.slice("Bearer ".length);
  } else if (queryToken) {
    rawToken = queryToken;
  }

  if (!rawToken) {
    return res.status(401).json({ error: "Missing or invalid Authorization header." });
  }
  try {
    req.user = verifyToken(rawToken);
    next();
  } catch {
    return res.status(401).json({ error: "Session expired or token invalid. Please sign in again." });
  }
}

/**
 * Permission-based authorization middleware.
 * Checks that the authenticated user's role includes at least ONE of the listed permissions.
 * Usage: requirePermission("meetings:create", "meetings:edit")
 */
export function requirePermission(...permissions: string[]) {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated." });

    try {
      // Load role permissions (cached on the request for repeated checks)
      if (!req.userPermissions) {
        const rolePerms = await prisma.rolePermission.findMany({
          where: { roleId: req.user.roleId },
          select: { permission: true },
        });
        req.userPermissions = rolePerms.map((rp) => rp.permission);
      }

      const isSuperAdmin = req.user.roleCode === "SYSTEM_ADMIN";
      const hasPermission = isSuperAdmin || permissions.some((p) => req.userPermissions!.includes(p));
      if (!hasPermission) {
        return res.status(403).json({ error: "You do not have permission to perform this action." });
      }
      next();
    } catch {
      return res.status(500).json({ error: "Failed to verify permissions." });
    }
  };
}

/**
 * @deprecated Use requirePermission() instead for fine-grained access control.
 * Kept for backward compatibility during migration.
 * Checks that the user's role CODE matches one of the provided role codes.
 */
export function requireRole(...roleCodes: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated." });
    if (!roleCodes.includes(req.user.roleCode)) {
      return res.status(403).json({ error: "You do not have permission to perform this action." });
    }
    next();
  };
}
