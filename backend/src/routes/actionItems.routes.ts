import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthedRequest } from "../middleware/auth";
import { ACTION_ITEM_STATUSES, PRIORITIES, isOverdue, isLockedMeetingStatus } from "../utils/enums";
import { checkOwnershipAccess, ensureUserPermissions } from "../utils/ownership";
import { makeCode } from "../utils/codes";
import { sendActionItemAssignedEmail } from "../utils/email";

const router = Router();
router.use(requireAuth);

const withMeta = {
  assignedTo: { select: { id: true, name: true, avatarColor: true, email: true } },
  assignees: {
    include: {
      user: { select: { id: true, name: true, avatarColor: true, email: true } },
    },
  },
  department: { select: { id: true, name: true } },
  meeting: { select: { id: true, title: true, code: true, status: true, organizerId: true } },
  decision: { select: { id: true, title: true, code: true } },
};

export function shapeActionItem(i: any) {
  const assigneesList = (i.assignees || []).map((a: any) => a.user).filter(Boolean);
  if (assigneesList.length === 0 && i.assignedTo) {
    assigneesList.push(i.assignedTo);
  }
  const primaryAssignee = i.assignedTo || assigneesList[0] || {
    id: "",
    name: "Unassigned",
    avatarColor: "#005f56",
    email: "",
  };

  return {
    ...i,
    assignedTo: primaryAssignee,
    assignees: assigneesList,
    overdue: isOverdue(i.status, i.deadline),
  };
}

// ---------- Global list (dashboard + Action & Accountability view) ----------
router.get("/", async (req: AuthedRequest, res) => {
  const { status, departmentId, assignedToId, overdue, priority, mine } = req.query;
  const andConditions: any[] = [];
  if (typeof status === "string" && status) andConditions.push({ status });
  if (typeof departmentId === "string" && departmentId) andConditions.push({ departmentId });
  if (typeof priority === "string" && priority) andConditions.push({ priority });

  if (typeof assignedToId === "string" && assignedToId) {
    andConditions.push({
      OR: [
        { assignedToId: assignedToId },
        { assignees: { some: { userId: assignedToId } } },
      ],
    });
  }

  if (mine === "true" && req.user) {
    andConditions.push({
      OR: [
        { assignedToId: req.user.userId },
        { assignees: { some: { userId: req.user.userId } } },
      ],
    });
  }

  // 3-Tier Ownership Access Filter
  if (req.user) {
    await ensureUserPermissions(req);
    const canViewAll = req.userPermissions?.includes("ADMIN_OVERRIDE") || req.userPermissions?.includes("action_items:view:all");
    const canViewDept = req.userPermissions?.includes("action_items:view:dept");

    if (!canViewAll) {
      if (canViewDept && req.user.departmentId && mine !== "true") {
        andConditions.push({ departmentId: req.user.departmentId });
      } else {
        andConditions.push({
          OR: [
            { assignedToId: req.user.userId },
            { assignees: { some: { userId: req.user.userId } } },
          ],
        });
      }
    }
  }

  const where = andConditions.length > 0 ? { AND: andConditions } : {};

  const items = (await prisma.actionItem.findMany({
    where,
    include: withMeta,
    orderBy: { deadline: "asc" },
  })) as any[];

  const shaped = items.map(shapeActionItem);
  const filtered = overdue === "true" ? shaped.filter((i) => i.overdue) : shaped;
  res.json(filtered);
});

// ---------- Create (supports single or multiple assignee assignment) ----------
// ---------- Create (supports single or multiple assignee assignment) ----------
const createSchema = z.object({
  meetingId: z.string().min(1),
  decisionId: z.string().optional(),
  title: z.string().min(2),
  description: z.string().optional(),
  assignedToId: z.string().optional(),
  assigneeIds: z.array(z.string()).optional(),
  departmentId: z.string().optional(),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  deadline: z.string(),
  assignmentMode: z.enum(["SHARED", "INDIVIDUAL"]).default("SHARED").optional(),
});

router.post("/", requirePermission("action_items:create"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Check title, assignees, department and deadline.", details: parsed.error.flatten() });
  }

  // Gather unique target user IDs (from assigneeIds or assignedToId)
  const rawAssignees = [
    ...(parsed.data.assigneeIds || []),
    ...(parsed.data.assignedToId ? [parsed.data.assignedToId] : []),
  ];
  const targetUserIds = Array.from(new Set(rawAssignees)).filter(Boolean);

  if (targetUserIds.length === 0) {
    return res.status(400).json({ error: "Please select at least one assignee for this action item." });
  }

  // Enforce meeting lock
  const meeting = await prisma.meeting.findUnique({
    where: { id: parsed.data.meetingId },
    select: { id: true, title: true, status: true, departmentId: true, organizerId: true },
  });
  await ensureUserPermissions(req);
  const hasOverride = req.userPermissions?.includes("ADMIN_OVERRIDE");
  if (meeting && isLockedMeetingStatus(meeting.status) && !hasOverride) {
    return res.status(403).json({
      error: `Meeting is locked (${meeting.status.replace("_", " ")}). Cannot assign new action items unless authorized with ADMIN_OVERRIDE permission.`,
    });
  }

  // Enforce that deadline cannot be in the past
  const deadlineDate = new Date(parsed.data.deadline);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (deadlineDate.getTime() < startOfToday.getTime()) {
    return res.status(400).json({ error: "Action item deadline cannot be in the past." });
  }

  // Resolve assigner name
  const assigner = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { name: true },
  });
  const assignerName = assigner?.name || "Meeting Organizer";
  const deadlineFormatted = deadlineDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Resolve departmentId
  let deptId = parsed.data.departmentId || meeting?.departmentId;
  if (!deptId) {
    const firstUser = await prisma.user.findUnique({
      where: { id: targetUserIds[0] },
      select: { departmentId: true },
    });
    deptId = firstUser?.departmentId || "";
  }
  if (!deptId) {
    const firstDept = await prisma.department.findFirst({ select: { id: true } });
    deptId = firstDept?.id || "";
  }

  const assignmentMode = parsed.data.assignmentMode || "SHARED";
  const count = await prisma.actionItem.count();

  // Mode: INDIVIDUAL -> create separate action item for each selected user
  if (assignmentMode === "INDIVIDUAL" && targetUserIds.length > 1) {
    const createdItems: any[] = [];
    let currentIdx = 0;

    for (const userId of targetUserIds) {
      currentIdx++;
      let userDeptId = deptId;
      const userObj = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
      if (userObj?.departmentId) userDeptId = userObj.departmentId;

      const item = await prisma.actionItem.create({
        data: {
          code: makeCode("ACT", count + currentIdx),
          meetingId: parsed.data.meetingId,
          decisionId: parsed.data.decisionId || undefined,
          title: parsed.data.title,
          description: parsed.data.description,
          assignedToId: userId,
          departmentId: userDeptId,
          priority: parsed.data.priority,
          deadline: deadlineDate,
          assignees: {
            create: [{ userId }],
          },
        },
        include: withMeta,
      });

      await prisma.notification.create({
        data: {
          userId,
          type: "ACTION_ASSIGNED",
          title: "New action item assigned",
          message: `"${item.title}" (${item.code}) is due ${new Date(item.deadline).toDateString()}.`,
          link: `/action-items/${item.id}`,
        },
      });

      // Send email strictly to this assigned individual
      if (item.assignedTo?.email) {
        sendActionItemAssignedEmail({
          assignees: [{ email: item.assignedTo.email, name: item.assignedTo.name || "Assignee" }],
          taskTitle: item.title,
          deadline: deadlineFormatted,
          priority: item.priority,
          meetingTitle: meeting?.title || "Meeting",
          assignedByName: assignerName,
          meetingId: parsed.data.meetingId,
          taskCode: item.code,
          description: item.description || undefined,
        }).catch(console.error);
      }

      createdItems.push(shapeActionItem(item));
    }

    return res.status(201).json({
      ...createdItems[0],
      createdItems,
      multipleCreated: true,
      count: createdItems.length,
    });
  }

  // Mode: SHARED (or single user) -> 1 action item with all assignees
  const item = await prisma.actionItem.create({
    data: {
      code: makeCode("ACT", count + 1),
      meetingId: parsed.data.meetingId,
      decisionId: parsed.data.decisionId || undefined,
      title: parsed.data.title,
      description: parsed.data.description,
      assignedToId: targetUserIds[0], // primary assignee for backward compat
      departmentId: deptId,
      priority: parsed.data.priority,
      deadline: deadlineDate,
      assignees: {
        create: targetUserIds.map((userId) => ({ userId })),
      },
    },
    include: withMeta,
  });

  // Notify ALL assigned users
  for (const uid of targetUserIds) {
    await prisma.notification.create({
      data: {
        userId: uid,
        type: "ACTION_ASSIGNED",
        title: "New action item assigned",
        message: `"${item.title}" (${item.code}) is due ${new Date(item.deadline).toDateString()}.`,
        link: `/action-items/${item.id}`,
      },
    });
  }

  // Send email strictly to each designated assignee
  const assigneesToSend = (item.assignees || []).map((a: any) => a.user).filter((u: any) => u && u.email);
  if (assigneesToSend.length === 0 && item.assignedTo?.email) {
    assigneesToSend.push(item.assignedTo);
  }
  for (const u of assigneesToSend) {
    sendActionItemAssignedEmail({
      assignees: [{ email: u.email, name: u.name || "Assignee" }],
      taskTitle: item.title,
      deadline: deadlineFormatted,
      priority: item.priority,
      meetingTitle: meeting?.title || "Meeting",
      assignedByName: assignerName,
      meetingId: parsed.data.meetingId,
      taskCode: item.code,
      description: item.description || undefined,
    }).catch(console.error);
  }

  res.status(201).json(shapeActionItem(item));
});

// ---------- Batch Create (Multiple action items to one user or multiple users) ----------
const batchItemSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  assigneeIds: z.array(z.string()).min(1),
  deadline: z.string(),
  priority: z.enum(PRIORITIES).default("MEDIUM").optional(),
  decisionId: z.string().optional(),
  assignmentMode: z.enum(["SHARED", "INDIVIDUAL"]).default("SHARED").optional(),
});

const batchCreateSchema = z.object({
  meetingId: z.string().min(1),
  items: z.array(batchItemSchema).min(1),
});

router.post("/batch", requirePermission("action_items:create"), async (req: AuthedRequest, res) => {
  const parsed = batchCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid batch action items payload.", details: parsed.error.flatten() });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: parsed.data.meetingId },
    select: { id: true, title: true, status: true, departmentId: true, organizerId: true },
  });
  if (!meeting) return res.status(404).json({ error: "Meeting not found." });

  await ensureUserPermissions(req);
  const hasOverride = req.userPermissions?.includes("ADMIN_OVERRIDE");
  if (isLockedMeetingStatus(meeting.status) && !hasOverride) {
    return res.status(403).json({
      error: `Meeting is locked (${meeting.status.replace("_", " ")}). Modifications require ADMIN_OVERRIDE.`,
    });
  }

  // Resolve assigner name
  const assigner = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { name: true },
  });
  const assignerName = assigner?.name || "Meeting Organizer";

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let currentCount = await prisma.actionItem.count();
  const createdList: any[] = [];

  for (const itemData of parsed.data.items) {
    const rawAssignees = Array.from(new Set(itemData.assigneeIds)).filter(Boolean);
    if (rawAssignees.length === 0) continue;

    const deadlineDate = new Date(itemData.deadline);
    if (deadlineDate.getTime() < startOfToday.getTime()) {
      return res.status(400).json({ error: `Deadline for "${itemData.title}" cannot be in the past.` });
    }

    const deadlineFormatted = deadlineDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const assignmentMode = itemData.assignmentMode || "SHARED";

    if (assignmentMode === "INDIVIDUAL" && rawAssignees.length > 1) {
      for (const uid of rawAssignees) {
        currentCount++;
        let uDeptId = meeting.departmentId;
        const u = await prisma.user.findUnique({ where: { id: uid }, select: { departmentId: true } });
        if (u?.departmentId) uDeptId = u.departmentId;

        const it = await prisma.actionItem.create({
          data: {
            code: makeCode("ACT", currentCount),
            meetingId: parsed.data.meetingId,
            decisionId: itemData.decisionId || undefined,
            title: itemData.title,
            description: itemData.description,
            assignedToId: uid,
            departmentId: uDeptId,
            priority: itemData.priority || "MEDIUM",
            deadline: deadlineDate,
            assignees: {
              create: [{ userId: uid }],
            },
          },
          include: withMeta,
        });

        await prisma.notification.create({
          data: {
            userId: uid,
            type: "ACTION_ASSIGNED",
            title: "New action item assigned",
            message: `"${it.title}" (${it.code}) is due ${new Date(it.deadline).toDateString()}.`,
            link: `/action-items/${it.id}`,
          },
        });

        // Send email strictly to this assigned individual
        if (it.assignedTo?.email) {
          sendActionItemAssignedEmail({
            assignees: [{ email: it.assignedTo.email, name: it.assignedTo.name || "Assignee" }],
            taskTitle: it.title,
            deadline: deadlineFormatted,
            priority: it.priority,
            meetingTitle: meeting.title || "Meeting",
            assignedByName: assignerName,
            meetingId: parsed.data.meetingId,
            taskCode: it.code,
            description: it.description || undefined,
          }).catch(console.error);
        }

        createdList.push(shapeActionItem(it));
      }
    } else {
      currentCount++;
      let uDeptId = meeting.departmentId;
      const u = await prisma.user.findUnique({ where: { id: rawAssignees[0] }, select: { departmentId: true } });
      if (u?.departmentId) uDeptId = u.departmentId;

      const it = await prisma.actionItem.create({
        data: {
          code: makeCode("ACT", currentCount),
          meetingId: parsed.data.meetingId,
          decisionId: itemData.decisionId || undefined,
          title: itemData.title,
          description: itemData.description,
          assignedToId: rawAssignees[0],
          departmentId: uDeptId,
          priority: itemData.priority || "MEDIUM",
          deadline: deadlineDate,
          assignees: {
            create: rawAssignees.map((userId) => ({ userId })),
          },
        },
        include: withMeta,
      });

      for (const uid of rawAssignees) {
        await prisma.notification.create({
          data: {
            userId: uid,
            type: "ACTION_ASSIGNED",
            title: "New action item assigned",
            message: `"${it.title}" (${it.code}) is due ${new Date(it.deadline).toDateString()}.`,
            link: `/action-items/${it.id}`,
          },
        });
      }

      // Send email strictly to each designated assignee
      const assigneesToSend = (it.assignees || []).map((a: any) => a.user).filter((u: any) => u && u.email);
      if (assigneesToSend.length === 0 && it.assignedTo?.email) {
        assigneesToSend.push(it.assignedTo);
      }
      for (const u of assigneesToSend) {
        sendActionItemAssignedEmail({
          assignees: [{ email: u.email, name: u.name || "Assignee" }],
          taskTitle: it.title,
          deadline: deadlineFormatted,
          priority: it.priority,
          meetingTitle: meeting.title || "Meeting",
          assignedByName: assignerName,
          meetingId: parsed.data.meetingId,
          taskCode: it.code,
          description: it.description || undefined,
        }).catch(console.error);
      }

      createdList.push(shapeActionItem(it));
    }
  }

  res.status(201).json({ createdItems: createdList, count: createdList.length });
});

router.get("/:id", async (req: AuthedRequest, res) => {
  const item = await prisma.actionItem.findUnique({
    where: { id: req.params.id },
    include: {
      ...withMeta,
      meeting: { select: { id: true, title: true, code: true, status: true, organizerId: true } },
    },
  });
  if (!item) return res.status(404).json({ error: "Action item not found." });

  await ensureUserPermissions(req);
  const isAssignee = item.assignedToId === req.user?.userId || item.assignees?.some((a) => a.userId === req.user?.userId);
  if (!checkOwnershipAccess(req, "action_items", "view", {
    departmentId: item.departmentId,
    ownerId: item.assignedToId || undefined,
    participantIds: [
      ...(item.meeting?.organizerId ? [item.meeting.organizerId] : []),
      ...item.assignees.map((a) => a.userId),
    ],
  }) && !isAssignee) {
    return res.status(403).json({ error: "You do not have permission to view this action item outside your ownership scope." });
  }

  res.json(shapeActionItem(item));
});

// ---------- Update status / progress / assignees ----------
const updateSchema = z.object({
  status: z.enum(ACTION_ITEM_STATUSES).optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  priority: z.enum(PRIORITIES).optional(),
  deadline: z.string().optional(),
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  assignedToId: z.string().optional(),
  assigneeIds: z.array(z.string()).optional(),
});

router.put("/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.actionItem.findUnique({
    where: { id: req.params.id },
    include: {
      assignees: true,
      meeting: { select: { status: true, organizerId: true, departmentId: true } },
    },
  });
  if (!existing) return res.status(404).json({ error: "Action item not found." });

  // 3-Tier Ownership Permission Check for editing action items
  await ensureUserPermissions(req);
  const hasOverride = req.userPermissions?.includes("ADMIN_OVERRIDE");
  const isAssignee = existing.assignedToId === req.user?.userId || existing.assignees.some((a) => a.userId === req.user?.userId);

  const isOrganizer = existing.meeting?.organizerId === req.user?.userId;

  if (!hasOverride) {
    const hasEditAll = req.userPermissions?.includes("action_items:edit:all") || req.userPermissions?.includes("meetings:edit:all");
    const hasEditDept = (req.userPermissions?.includes("action_items:edit:dept") || req.userPermissions?.includes("meetings:edit:dept")) && req.user?.departmentId === existing.departmentId;
    const hasEditOwn = (req.userPermissions?.includes("action_items:edit:own") || req.userPermissions?.includes("meetings:edit:own")) && (isAssignee || isOrganizer);

    if (!hasEditAll && !hasEditDept && !hasEditOwn && !isAssignee && !isOrganizer) {
      return res.status(403).json({ error: "You do not have permission to edit this action item." });
    }
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid action item update." });

  // Enforce meeting lock
  if (existing.meeting?.status === "CANCELLED") {
    return res.status(403).json({
      error: "This meeting is cancelled. All records, including action item status, are locked from editing.",
    });
  }

  if (existing.meeting && !hasOverride) {
    if (existing.meeting.status === "COMPLETED" || existing.meeting.status === "APPROVED") {
      const { priority, deadline, title, description, assignedToId, assigneeIds } = parsed.data;
      if (
        priority !== undefined ||
        deadline !== undefined ||
        title !== undefined ||
        description !== undefined ||
        assignedToId !== undefined ||
        assigneeIds !== undefined
      ) {
        return res.status(403).json({
          error: `Meeting is ${existing.meeting.status.toLowerCase()}. Action items run independently, but only their status can be updated.`,
        });
      }
    }
  }

  const { deadline, assigneeIds, ...rest } = parsed.data;
  const data: any = { ...rest };

  if (deadline) {
    const deadlineDate = new Date(deadline);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (deadlineDate.getTime() < startOfToday.getTime()) {
      return res.status(400).json({ error: "Action item deadline cannot be in the past." });
    }
    data.deadline = deadlineDate;
  }
  if (rest.status === "COMPLETED") {
    data.completedAt = new Date();
    data.progressPercent = 100;
  }
  if (rest.status && rest.status !== "COMPLETED") {
    data.completedAt = null;
  }

  // Handle multi-user assignee updates if assigneeIds is provided
  if (assigneeIds !== undefined) {
    const uniqueIds = Array.from(new Set(assigneeIds)).filter(Boolean);
    if (uniqueIds.length > 0) {
      data.assignedToId = uniqueIds[0];
      await prisma.actionItemAssignee.deleteMany({ where: { actionItemId: req.params.id } });
      data.assignees = {
        create: uniqueIds.map((userId) => ({ userId })),
      };
    }
  }

  try {
    const item = await prisma.actionItem.update({
      where: { id: req.params.id },
      data,
      include: withMeta,
    });
    res.json(shapeActionItem(item));
  } catch (err: any) {
    console.error("Action item update error:", err);
    res.status(500).json({ error: "Failed to update action item." });
  }
});

router.delete(
  "/:id",
  requirePermission(
    "action_items:delete:all",
    "action_items:delete:dept",
    "action_items:delete:own",
    "meetings:edit:all",
    "meetings:edit:dept",
    "meetings:edit:own"
  ),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.actionItem.findUnique({
      where: { id: req.params.id },
      include: {
        assignees: true,
        meeting: { select: { status: true, organizerId: true, departmentId: true } },
      },
    });
    if (!existing) return res.status(404).json({ error: "Action item not found." });

    await ensureUserPermissions(req);
    const hasDeleteOverride = req.userPermissions?.includes("ADMIN_OVERRIDE");
    const isOrganizer = existing.meeting?.organizerId === req.user?.userId;
    const isAssignee = existing.assignedToId === req.user?.userId || existing.assignees.some((a) => a.userId === req.user?.userId);

    const hasDeleteAll = req.userPermissions?.includes("action_items:delete:all") || req.userPermissions?.includes("meetings:edit:all");
    const hasDeleteDept = (req.userPermissions?.includes("action_items:delete:dept") || req.userPermissions?.includes("meetings:edit:dept")) && req.user?.departmentId === existing.departmentId;
    const hasDeleteOwn = (req.userPermissions?.includes("action_items:delete:own") || req.userPermissions?.includes("meetings:edit:own")) && (isAssignee || isOrganizer);

    if (!hasDeleteOverride && !hasDeleteAll && !hasDeleteDept && !hasDeleteOwn && !isAssignee && !isOrganizer) {
      return res.status(403).json({ error: "You do not have permission to delete this action item." });
    }

    // Enforce meeting lock
    if (existing.meeting?.status === "CANCELLED") {
      return res.status(403).json({
        error: "This meeting is cancelled. All records are locked from editing.",
      });
    }

    if (existing.meeting && isLockedMeetingStatus(existing.meeting.status) && !hasDeleteOverride) {
      return res.status(403).json({
        error: `Meeting is locked (${existing.meeting.status.replace("_", " ")}). Cannot delete action items unless authorized with ADMIN_OVERRIDE permission.`,
      });
    }

    try {
      await prisma.actionItem.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch {
      res.status(404).json({ error: "Action item not found." });
    }
  }
);

export default router;
