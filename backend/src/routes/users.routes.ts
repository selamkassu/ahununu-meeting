import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthedRequest } from "../middleware/auth";
import { USER_STATUSES } from "../utils/enums";
import { logAuditEvent } from "../utils/audit";

const router = Router();
router.use(requireAuth);

/** Include block to return role with permissions */
const userInclude = {
  department: true,
  role: {
    include: {
      permissions: { select: { permission: true } },
    },
  },
};

/** Shape user for API response */
function safeUser(user: any) {
  const { passwordHash, role, ...rest } = user;
  return {
    ...rest,
    role: {
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map((p: any) => p.permission),
    },
  };
}

router.get("/", async (req, res) => {
  const { departmentId, roleId, status, q } = req.query;
  const users = await prisma.user.findMany({
    where: {
      departmentId: typeof departmentId === "string" ? departmentId : undefined,
      roleId: typeof roleId === "string" ? roleId : undefined,
      status: typeof status === "string" ? status : undefined,
      name: typeof q === "string" && q ? { contains: q, mode: "insensitive" } : undefined,
    },
    include: userInclude,
    orderBy: { name: "asc" },
  });
  res.json(users.map(safeUser));
});

router.get("/:id", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: userInclude,
  });
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json(safeUser(user));
});

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  password: z.string().min(6),
  roleId: z.string().min(1, "Role is required."),
  departmentId: z.string().min(1),
  jobTitle: z.string().optional().nullable(),
  status: z.enum(USER_STATUSES).optional().default("ACTIVE"),
  responsibilities: z.string().optional().nullable(),
});

router.post("/", requirePermission("users:create"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Check the full name, email, password (6+ chars), role, and department.",
      details: parsed.error.format(),
    });
  }
  const { password, status, ...rest } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);
  const userStatus = status || "ACTIVE";

  // Validate roleId exists
  const roleExists = await prisma.role.findUnique({ where: { id: rest.roleId } });
  if (!roleExists) {
    return res.status(400).json({ error: "Selected role does not exist." });
  }

  try {
    const user = await prisma.user.create({
      data: {
        ...rest,
        status: userStatus,
        isActive: userStatus === "ACTIVE",
        passwordHash,
      },
      include: userInclude,
    });
    res.status(201).json(safeUser(user));
  } catch (e: any) {
    res.status(409).json({ error: "A user with that email already exists." });
  }
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  password: z.string().min(6).optional(),
  roleId: z.string().optional(),
  departmentId: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  status: z.enum(USER_STATUSES).optional(),
  isActive: z.boolean().optional(),
  responsibilities: z.string().optional().nullable(),
});

router.put("/:id", requirePermission("users:edit"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid user update data.", details: parsed.error.format() });

  const { password, status, isActive, ...rest } = parsed.data;
  const dataToUpdate: any = { ...rest };

  if (password) {
    dataToUpdate.passwordHash = await bcrypt.hash(password, 10);
  }

  // Validate roleId if provided
  if (rest.roleId) {
    const roleExists = await prisma.role.findUnique({ where: { id: rest.roleId } });
    if (!roleExists) {
      return res.status(400).json({ error: "Selected role does not exist." });
    }
  }

  if (status !== undefined) {
    dataToUpdate.status = status;
    dataToUpdate.isActive = status === "ACTIVE";
  } else if (isActive !== undefined) {
    dataToUpdate.isActive = isActive;
    dataToUpdate.status = isActive ? "ACTIVE" : "SUSPENDED";
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: dataToUpdate,
      include: userInclude,
    });
    res.json(safeUser(user));
  } catch {
    res.status(404).json({ error: "User not found." });
  }
});

const statusSchema = z.object({
  status: z.enum(USER_STATUSES),
});

// Quick Lifecycle Route: Active | Suspended | Deactivated
router.patch("/:id/status", requirePermission("users:manage_status"), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid status. Must be ACTIVE, SUSPENDED, or DEACTIVATED." });
  }

  const { status } = parsed.data;
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        status,
        isActive: status === "ACTIVE",
      },
      include: userInclude,
    });
    res.json(safeUser(user));
  } catch {
    res.status(404).json({ error: "User not found." });
  }
});

// ---------- Delete User (with relationship safety checks & audit logging) ----------
router.delete("/:id", requirePermission("users:delete"), async (req: AuthedRequest, res) => {
  const targetId = req.params.id;
  if (req.user?.userId === targetId) {
    return res.status(400).json({ error: "You cannot delete your own account." });
  }

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    include: {
      _count: {
        select: {
          organizedMeetings: true,
          approvedMeetings: true,
          minutesAuthored: true,
          participantSignatures: true,
          headOfDepartments: true,
          assignedActions: true,
          actionAssignments: true,
          participations: true,
        },
      },
    },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found." });
  }

  const counts = user._count;
  const blockers: string[] = [];
  if (counts.organizedMeetings > 0) blockers.push(`${counts.organizedMeetings} organized meeting(s)`);
  if (counts.approvedMeetings > 0) blockers.push(`${counts.approvedMeetings} approved meeting(s)`);
  if (counts.minutesAuthored > 0) blockers.push(`${counts.minutesAuthored} authored meeting minutes`);
  if (counts.participantSignatures > 0) blockers.push(`${counts.participantSignatures} formal digital signature(s)`);
  if (counts.headOfDepartments > 0) blockers.push(`Department Head role`);

  if (blockers.length > 0) {
    return res.status(409).json({
      error: `Cannot permanently delete user because they are tied to historical corporate records (${blockers.join(", ")}). To preserve legal auditability, please change their status to DEACTIVATED or SUSPENDED instead.`,
      isHistoricalRecord: true,
    });
  }

  try {
    // Delete non-blocking relations in a transaction before removing user
    await prisma.$transaction(async (tx) => {
      // Clean up action assignments
      await tx.actionItemAssignee.deleteMany({ where: { userId: targetId } });
      // Clear assignedToId on pending action items
      await tx.actionItem.updateMany({
        where: { assignedToId: targetId },
        data: { assignedToId: null },
      });
      // Delete user's notifications
      await tx.notification.deleteMany({ where: { userId: targetId } });
      // Delete participations
      await tx.meetingParticipant.deleteMany({ where: { userId: targetId } });
      // Finally delete user record
      await tx.user.delete({ where: { id: targetId } });
    });

    logAuditEvent({
      level: "INFO",
      action: "USER_DELETED",
      actorId: req.user?.userId,
      resource: "User",
      resourceId: targetId,
      details: { name: user.name, email: user.email },
    });

    res.status(204).send();
  } catch (err: any) {
    console.error("Failed to delete user:", err);
    res.status(500).json({ error: "Failed to delete user account." });
  }
});

export default router;
