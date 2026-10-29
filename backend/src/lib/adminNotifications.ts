import { prisma } from "./prisma";

export interface AdminNotificationRecord {
  id: string;
  userId: string | null;
  type: string;
  title: string;
  message: string;
  metadata: any | null;
  isRead: boolean;
  createdAt: Date;
}

let tableEnsured = false;

/**
 * Ensures the admin_notifications table exists in PostgreSQL,
 * the UNASSIGNED system role exists, and admins have the users:approve permission.
 */
export async function ensureAdminWorkflowInfrastructure() {
  if (tableEnsured) return;
  try {
    // 1. Create admin_notifications table if not exists
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "admin_notifications" (
        "id" TEXT PRIMARY KEY,
        "userId" TEXT,
        "type" TEXT NOT NULL DEFAULT 'USER_PENDING_APPROVAL',
        "title" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "metadata" JSONB,
        "isRead" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "admin_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    // Create index on isRead
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "admin_notifications_isRead_idx" ON "admin_notifications"("isRead")
    `);

    // Create index on createdAt
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "admin_notifications_createdAt_idx" ON "admin_notifications"("createdAt")
    `);

    // 2. Ensure UNASSIGNED role exists
    let unassignedRole = await prisma.role.findFirst({
      where: { code: "UNASSIGNED" },
    });
    if (!unassignedRole) {
      unassignedRole = await prisma.role.create({
        data: {
          name: "Unassigned",
          code: "UNASSIGNED",
          description: "Default holding role for newly registered users awaiting administrative approval.",
          isSystem: true,
          isActive: true,
        },
      });
      console.log("[WorkflowInit] Created UNASSIGNED system role.");
    }

    // 3. Ensure SYSTEM_ADMIN and any admin roles have 'users:approve' permission
    const adminRoles = await prisma.role.findMany({
      where: {
        OR: [
          { code: "SYSTEM_ADMIN" },
          { name: { contains: "Admin", mode: "insensitive" } },
        ],
      },
    });

    for (const r of adminRoles) {
      const hasPerm = await prisma.rolePermission.findFirst({
        where: { roleId: r.id, permission: "users:approve" },
      });
      if (!hasPerm) {
        await prisma.rolePermission.create({
          data: {
            roleId: r.id,
            permission: "users:approve",
          },
        });
        console.log(`[WorkflowInit] Granted 'users:approve' to role ${r.name} (${r.code})`);
      }
    }

    tableEnsured = true;
    console.log("[WorkflowInit] Admin approvals infrastructure verified successfully.");
  } catch (err: any) {
    console.error("[WorkflowInit] Error verifying infrastructure:", err?.message || err);
  }
}

/**
 * Get or create the UNASSIGNED system role
 */
export async function getOrCreateUnassignedRole() {
  await ensureAdminWorkflowInfrastructure();
  let role = await prisma.role.findFirst({
    where: { code: "UNASSIGNED" },
  });
  if (!role) {
    role = await prisma.role.create({
      data: {
        name: "Unassigned",
        code: "UNASSIGNED",
        description: "Default holding role for newly registered users awaiting administrative approval.",
        isSystem: true,
        isActive: true,
      },
    });
  }
  return role;
}

/**
 * Create a new notification entry in the admin_notifications table
 */
export async function createAdminNotification(data: {
  userId?: string | null;
  type?: string;
  title: string;
  message: string;
  metadata?: any;
}) {
  await ensureAdminWorkflowInfrastructure();
  const id = `an_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const type = data.type || "USER_PENDING_APPROVAL";
  const metadataJson = data.metadata ? JSON.stringify(data.metadata) : null;

  await prisma.$executeRawUnsafe(
    `INSERT INTO "admin_notifications" ("id", "userId", "type", "title", "message", "metadata", "isRead", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, false, CURRENT_TIMESTAMP)`,
    id,
    data.userId || null,
    type,
    data.title,
    data.message,
    metadataJson
  );

  return { id, ...data };
}

/**
 * Fetch all admin notifications
 */
export async function getAdminNotifications(limit = 50): Promise<AdminNotificationRecord[]> {
  await ensureAdminWorkflowInfrastructure();
  const rows = await prisma.$queryRawUnsafe<AdminNotificationRecord[]>(
    `SELECT "id", "userId", "type", "title", "message", "metadata", "isRead", "createdAt"
     FROM "admin_notifications"
     ORDER BY "createdAt" DESC
     LIMIT $1`,
    limit
  );
  return rows;
}

/**
 * Mark an admin notification as read
 */
export async function markAdminNotificationRead(id: string) {
  await ensureAdminWorkflowInfrastructure();
  await prisma.$executeRawUnsafe(
    `UPDATE "admin_notifications" SET "isRead" = true WHERE "id" = $1`,
    id
  );
}

/**
 * Mark all admin notifications for a specific user as read
 */
export async function markAdminNotificationsForUserRead(userId: string) {
  await ensureAdminWorkflowInfrastructure();
  await prisma.$executeRawUnsafe(
    `UPDATE "admin_notifications" SET "isRead" = true WHERE "userId" = $1`,
    userId
  );
}

/**
 * Delete a specific admin notification
 */
export async function deleteAdminNotification(id: string) {
  await ensureAdminWorkflowInfrastructure();
  await prisma.$executeRawUnsafe(
    `DELETE FROM "admin_notifications" WHERE "id" = $1`,
    id
  );
}

/**
 * Clear all processed (isRead = true) notifications
 */
export async function clearProcessedAdminNotifications() {
  await ensureAdminWorkflowInfrastructure();
  await prisma.$executeRawUnsafe(
    `DELETE FROM "admin_notifications" WHERE "isRead" = true`
  );
}
