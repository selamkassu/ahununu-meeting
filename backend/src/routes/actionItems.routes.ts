import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthedRequest } from "../middleware/auth";
import { ACTION_ITEM_STATUSES, PRIORITIES, isOverdue, isLockedMeetingStatus } from "../utils/enums";
import { makeCode } from "../utils/codes";

const router = Router();
router.use(requireAuth);

const withMeta = {
  assignedTo: { select: { id: true, name: true, avatarColor: true, email: true } },
  department: { select: { id: true, name: true } },
  meeting: { select: { id: true, title: true, code: true, status: true } },
  decision: { select: { id: true, title: true, code: true } },
};

// ---------- Global list (dashboard + Action & Accountability view) ----------
router.get("/", async (req: AuthedRequest, res) => {
  const { status, departmentId, assignedToId, overdue, priority, mine } = req.query;
  const where: any = {};
  if (typeof status === "string" && status) where.status = status;
  if (typeof departmentId === "string" && departmentId) where.departmentId = departmentId;
  if (typeof assignedToId === "string" && assignedToId) where.assignedToId = assignedToId;
  if (typeof priority === "string" && priority) where.priority = priority;
  if (mine === "true") where.assignedToId = req.user!.userId;

  let items = (await prisma.actionItem.findMany({ where, include: withMeta, orderBy: { deadline: "asc" } })) as any[];

  const shaped = items.map((i) => ({ ...i, overdue: isOverdue(i.status, i.deadline) }));
  const filtered = overdue === "true" ? shaped.filter((i) => i.overdue) : shaped;
  res.json(filtered);
});

// ---------- Create (usually tied to a meeting/decision) ----------
const createSchema = z.object({
  meetingId: z.string().min(1),
  decisionId: z.string().optional(),
  title: z.string().min(3),
  description: z.string().optional(),
  assignedToId: z.string().min(1),
  departmentId: z.string().min(1),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  deadline: z.string(),
});

router.post("/", requirePermission("action_items:create"), async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Check title, assignee, department and deadline.", details: parsed.error.flatten() });

  // Enforce meeting lock
  const meeting = await prisma.meeting.findUnique({
    where: { id: parsed.data.meetingId },
    select: { status: true },
  });
  if (meeting && isLockedMeetingStatus(meeting.status) && req.user?.roleCode !== "SYSTEM_ADMIN") {
    return res.status(403).json({
      error: `Meeting is locked (${meeting.status.replace("_", " ")}). Cannot assign new action items unless authorized by Super Admin.`,
    });
  }

  const count = await prisma.actionItem.count();
  const item = await prisma.actionItem.create({
    data: { ...parsed.data, code: makeCode("ACT", count + 1), deadline: new Date(parsed.data.deadline) },
    include: withMeta,
  });

  await prisma.notification.create({
    data: {
      userId: item.assignedToId,
      type: "ACTION_ASSIGNED",
      title: "New action item assigned",
      message: `"${item.title}" (${item.code}) is due ${new Date(item.deadline).toDateString()}.`,
      link: `/action-items/${item.id}`,
    },
  });

  res.status(201).json({ ...item, overdue: isOverdue(item.status, item.deadline) });
});

router.get("/:id", async (req, res) => {
  const item = await prisma.actionItem.findUnique({ where: { id: req.params.id }, include: withMeta });
  if (!item) return res.status(404).json({ error: "Action item not found." });
  res.json({ ...item, overdue: isOverdue(item.status, item.deadline) });
});

// ---------- Update status / progress ----------
const updateSchema = z.object({
  status: z.enum(ACTION_ITEM_STATUSES).optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  priority: z.enum(PRIORITIES).optional(),
  deadline: z.string().optional(),
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  assignedToId: z.string().optional(),
});

router.put("/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.actionItem.findUnique({
    where: { id: req.params.id },
    include: { meeting: { select: { status: true } } },
  });
  if (!existing) return res.status(404).json({ error: "Action item not found." });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid action item update." });

  // Enforce meeting lock
  if (existing.meeting?.status === "CANCELLED") {
    return res.status(403).json({
      error: "This meeting is cancelled. All records, including action item status, are locked from editing.",
    });
  }

  if (existing.meeting && req.user?.roleCode !== "SYSTEM_ADMIN") {
    if (existing.meeting.status === "COMPLETED" || existing.meeting.status === "APPROVED") {
      const { priority, deadline, title, description, assignedToId } = parsed.data;
      if (
        priority !== undefined ||
        deadline !== undefined ||
        title !== undefined ||
        description !== undefined ||
        assignedToId !== undefined
      ) {
        return res.status(403).json({
          error: `Meeting is ${existing.meeting.status.toLowerCase()}. Action items run independently, but only their status can be updated.`,
        });
      }
    }
  }
  const { deadline, ...rest } = parsed.data;

  const data: any = { ...rest };
  if (deadline) data.deadline = new Date(deadline);
  if (rest.status === "COMPLETED") {
    data.completedAt = new Date();
    data.progressPercent = 100;
  }
  if (rest.status && rest.status !== "COMPLETED") {
    data.completedAt = null;
  }

  try {
    const item = await prisma.actionItem.update({ where: { id: req.params.id }, data, include: withMeta });
    res.json({ ...item, overdue: isOverdue(item.status, item.deadline) });
  } catch {
    res.status(404).json({ error: "Action item not found." });
  }
});

router.delete("/:id", requirePermission("action_items:edit"), async (req: AuthedRequest, res) => {
  const existing = await prisma.actionItem.findUnique({
    where: { id: req.params.id },
    include: { meeting: { select: { status: true } } },
  });
  if (!existing) return res.status(404).json({ error: "Action item not found." });

  // Enforce meeting lock
  if (existing.meeting?.status === "CANCELLED") {
    return res.status(403).json({
      error: "This meeting is cancelled. All records are locked from editing.",
    });
  }

  if (existing.meeting && isLockedMeetingStatus(existing.meeting.status) && req.user?.roleCode !== "SYSTEM_ADMIN") {
    return res.status(403).json({
      error: `Meeting is locked (${existing.meeting.status.replace("_", " ")}). Cannot delete action items unless authorized by Super Admin.`,
    });
  }

  try {
    await prisma.actionItem.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Action item not found." });
  }
});

export default router;
