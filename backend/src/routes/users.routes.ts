import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthedRequest } from "../middleware/auth";
import { USER_STATUSES } from "../utils/enums";
import { logAuditEvent } from "../utils/audit";

import { markAdminNotificationsForUserRead } from "../lib/adminNotifications";
import { sendAccountApprovedEmail } from "../utils/email";

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

// ---------- GET /users/approvals/count — count pending users awaiting approval ----------
router.get("/approvals/count", requirePermission("users:approve"), async (_req, res) => {
  try {
    const count = await prisma.user.count({
      where: {
        OR: [
          { status: "PENDING" },
          { role: { code: "UNASSIGNED" } },
        ],
      },
    });
    res.json({ count });
  } catch {
    res.status(500).json({ error: "Failed to fetch pending approvals count." });
  }
});

// ---------- GET /users/approvals — list all pending user registrations ----------
router.get("/approvals", requirePermission("users:approve"), async (_req, res) => {
  try {
    const pendingUsers = await prisma.user.findMany({
      where: {
        OR: [
          { status: "PENDING" },
          { role: { code: "UNASSIGNED" } },
        ],
      },
      include: userInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json(pendingUsers.map(safeUser));
  } catch {
    res.status(500).json({ error: "Failed to fetch pending user approvals." });
  }
});

// ---------- POST /users/:id/approve — assign role and activate user account ----------
const approveSchema = z.object({
  roleId: z.string().min(1, "Please select an assigned role."),
  departmentId: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
});

router.post("/:id/approve", requirePermission("users:approve"), async (req: AuthedRequest, res) => {
  const parsed = approveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Please select an operational role from the dropdown menu.",
      details: parsed.error.format(),
    });
  }

  const { roleId, departmentId, jobTitle } = parsed.data;

  const targetUser = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: userInclude,
  });

  if (!targetUser) {
    return res.status(404).json({ error: "User not found." });
  }

  const isAwaitingApproval = targetUser.status === "PENDING" || targetUser.role?.code === "UNASSIGNED";
  if (!isAwaitingApproval) {
    return res.status(400).json({ error: "This user account is already approved and assigned an operational role." });
  }

  // Validate role
  const selectedRole = await prisma.role.findUnique({
    where: { id: roleId },
  });

  if (!selectedRole || !selectedRole.isActive) {
    return res.status(400).json({ error: "Selected role is invalid or inactive." });
  }

  if (selectedRole.code === "UNASSIGNED") {
    return res.status(400).json({ error: "Cannot assign UNASSIGNED role upon approval. Please select a valid role." });
  }

  let validatedDeptId: string | null = targetUser.departmentId;
  if (departmentId !== undefined) {
    if (departmentId === null || departmentId === "") {
      validatedDeptId = null;
    } else {
      const dept = await prisma.department.findUnique({ where: { id: departmentId } });
      if (dept) validatedDeptId = dept.id;
    }
  }

  try {
    // 1. Immediately activate user and assign role
    const updatedUser = await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        status: "ACTIVE",
        isActive: true,
        roleId: selectedRole.id,
        departmentId: validatedDeptId,
        jobTitle: jobTitle !== undefined ? (jobTitle?.trim() || null) : targetUser.jobTitle,
      },
      include: userInclude,
    });

    // 2. Mark any admin_notifications and in-app admin notifications as read
    await markAdminNotificationsForUserRead(targetUser.id).catch(() => {});
    await prisma.notification.updateMany({
      where: {
        type: "USER_PENDING_APPROVAL",
        message: { contains: targetUser.email },
        isRead: false,
      },
      data: { isRead: true },
    }).catch(() => {});

    // 3. User in-app notification
    await prisma.notification.create({
      data: {
        userId: targetUser.id,
        type: "ACCOUNT_APPROVED",
        title: "Account Approved & Role Assigned",
        message: `Your account has been approved and assigned the role "${selectedRole.name}". You now have full access to Ahununu Logistics Portal.`,
        link: "/",
      },
    }).catch(() => {});

    // 4. Send approval email
    const approverName = req.user?.roleCode === "SYSTEM_ADMIN" ? "System Administrator" : "Administrator";
    sendAccountApprovedEmail({
      userName: updatedUser.name,
      userEmail: updatedUser.email,
      roleName: selectedRole.name,
      departmentName: (updatedUser as any).department?.name ?? null,
      approvedByName: approverName,
    }).catch((e) => console.error("[UserApprove] Failed to send email:", e?.message || e));

    // 5. Audit event
    logAuditEvent({
      level: "INFO",
      action: "USER_APPROVED_AND_ROLE_ASSIGNED",
      actorId: req.user?.userId,
      actorEmail: (req as any).user?.email,
      resource: "User",
      resourceId: targetUser.id,
      details: {
        assignedRoleId: selectedRole.id,
        assignedRoleName: selectedRole.name,
        assignedRoleCode: selectedRole.code,
        departmentId: validatedDeptId,
      },
    });

    return res.json({
      message: `User ${updatedUser.name} has been approved with role ${selectedRole.name}. Account is now Active!`,
      user: safeUser(updatedUser),
    });
  } catch (err: any) {
    console.error("Failed to approve user:", err);
    return res.status(500).json({ error: "Failed to approve user account and assign role." });
  }
});

// ---------- POST /users/:id/reject — decline pending user registration ----------
const rejectSchema = z.object({
  reason: z.string().optional(),
});

router.post("/:id/reject", requirePermission("users:approve"), async (req: AuthedRequest, res) => {
  const parsed = rejectSchema.safeParse(req.body || {});
  const reason = parsed.success ? parsed.data.reason : undefined;

  const targetUser = await prisma.user.findUnique({
    where: { id: req.params.id },
  });

  if (!targetUser) {
    return res.status(404).json({ error: "User not found." });
  }

  try {
    await prisma.user.update({
      where: { id: targetUser.id },
      data: {
        status: "DEACTIVATED",
        isActive: false,
      },
    });

    await markAdminNotificationsForUserRead(targetUser.id).catch(() => {});

    logAuditEvent({
      level: "WARN",
      action: "USER_APPROVAL_REJECTED",
      actorId: req.user?.userId,
      resource: "User",
      resourceId: targetUser.id,
      details: { reason: reason || "Declined by administrator" },
    });

    return res.json({ message: `Registration for ${targetUser.name} has been declined.` });
  } catch (err: any) {
    console.error("Failed to reject user:", err);
    return res.status(500).json({ error: "Failed to decline user registration." });
  }
});

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

  const existingUser = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { role: true },
  });
  if (!existingUser) return res.status(404).json({ error: "User not found." });

  const { password, status, isActive, ...rest } = parsed.data;
  const dataToUpdate: any = { ...rest };

  if (password) {
    dataToUpdate.passwordHash = await bcrypt.hash(password, 10);
  }

  let assigningNewOperationalRole = false;

  // Validate roleId if provided
  if (rest.roleId) {
    const roleExists = await prisma.role.findUnique({ where: { id: rest.roleId } });
    if (!roleExists) {
      return res.status(400).json({ error: "Selected role does not exist." });
    }
    if (roleExists.code === "UNASSIGNED") {
      return res.status(400).json({ error: "Cannot assign UNASSIGNED role. Please select an operational role (e.g. Participant, Admin)." });
    }
    if (existingUser.role?.code === "UNASSIGNED") {
      assigningNewOperationalRole = true;
    }
  } else if (existingUser.role?.code === "UNASSIGNED" && (status === "ACTIVE" || isActive === true)) {
    return res.status(400).json({ error: "Please select an operational role before activating this user account." });
  }

  if (status !== undefined) {
    dataToUpdate.status = status;
    dataToUpdate.isActive = status === "ACTIVE";
  } else if (isActive !== undefined) {
    dataToUpdate.isActive = isActive;
    dataToUpdate.status = isActive ? "ACTIVE" : "SUSPENDED";
  }

  if (assigningNewOperationalRole) {
    if (dataToUpdate.status === undefined && existingUser.status === "PENDING") {
      dataToUpdate.status = "ACTIVE";
      dataToUpdate.isActive = true;
    }
    await markAdminNotificationsForUserRead(existingUser.id).catch(() => {});
    await prisma.notification.updateMany({
      where: {
        type: "USER_PENDING_APPROVAL",
        message: { contains: existingUser.email },
        isRead: false,
      },
      data: { isRead: true },
    }).catch(() => {});
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
    // Clean up action assignments
    await prisma.actionItemAssignee.deleteMany({ where: { userId: targetId } });
    // Clear assignedToId on pending action items
    await prisma.actionItem.updateMany({
      where: { assignedToId: targetId },
      data: { assignedToId: null },
    });
    // Delete user's notifications
    await prisma.notification.deleteMany({ where: { userId: targetId } });
    // Delete participations
    await prisma.meetingParticipant.deleteMany({ where: { userId: targetId } });
    // Finally delete user record
    await prisma.user.delete({ where: { id: targetId } });

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
