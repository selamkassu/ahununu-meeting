import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission, AuthedRequest } from "../middleware/auth";
import {
  MEETING_STATUSES,
  PRIORITIES,
  AGENDA_STATUSES,
  DECISION_STATUSES,
  isLockedMeetingStatus,
} from "../utils/enums";
import { makeCode } from "../utils/codes";

const router = Router();
router.use(requireAuth);

/**
 * Common include object for single meeting retrieval
 */
const detailInclude = {
  organizer: {
    select: { id: true, name: true, email: true, avatarColor: true },
  },
  approvedBy: {
    select: { id: true, name: true, email: true, avatarColor: true },
  },
  department: true,
  participants: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarColor: true,
          role: true,
          jobTitle: true,
          department: { select: { id: true, name: true } },
        },
      },
    },
  },
  agendaItems: { orderBy: { order: "asc" as const } },
  minutes: {
    include: {
      recordedBy: { select: { id: true, name: true } },
      attendee: {
        select: {
          id: true,
          name: true,
          avatarColor: true,
          jobTitle: true,
          department: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ type: "asc" as const }, { createdAt: "asc" as const }],
  },
  decisions: { orderBy: { decisionDate: "desc" as const } },
  actionItems: {
    include: {
      assignedTo: { select: { id: true, name: true, avatarColor: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: { deadline: "asc" as const },
  },
  documents: { include: { uploadedBy: { select: { id: true, name: true } } } },
};
/**
 * Check if a meeting is locked for editing.
 * Designated Super Admins (role code "SYSTEM_ADMIN") are permitted to override the lock.
 */
function checkMeetingLock(meeting: { status: string }, req: AuthedRequest): string | null {
  const isSuperAdmin = req.user?.roleCode === "SYSTEM_ADMIN";
  if (isLockedMeetingStatus(meeting.status) && !isSuperAdmin) {
    return `Meeting is locked (${meeting.status.replace("_", " ")}). Modifications are restricted to Super Admin override.`;
  }
  return null;
}

/**
 * Check if user is authorized to approve the meeting (Organizer or Admin)
 */
async function canApproveMeeting(organizerId: string, req: AuthedRequest): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.roleCode === "SYSTEM_ADMIN") return true;
  if (organizerId === req.user.userId) return true;

  if (!req.userPermissions) {
    const rolePerms = await prisma.rolePermission.findMany({
      where: { roleId: req.user.roleId },
      select: { permission: true },
    });
    req.userPermissions = rolePerms.map((rp) => rp.permission);
  }
  return req.userPermissions.includes("meetings:approve");
}

/**
 * Check if a meeting has reached its conclusion (status is COMPLETED or current server time >= meeting end datetime)
 */
function hasMeetingEnded(meeting: { date: Date | string; endTime: string; status: string }): boolean {
  if (meeting.status === "COMPLETED") return true;
  if (meeting.status === "CANCELLED") return false;

  const dateObj = typeof meeting.date === "string" ? new Date(meeting.date) : meeting.date;
  const dateStr = dateObj.toISOString().split("T")[0];
  const [endHours, endMinutes] = (meeting.endTime || "00:00").split(":").map(Number);
  const [year, month, day] = dateStr.split("-").map(Number);
  const endDateTime = new Date(year, month - 1, day, endHours || 0, endMinutes || 0, 0);

  return Date.now() >= endDateTime.getTime();
}

/**
 * Check if a user is authorized to manage/finalize attendance for a meeting:
 * Meeting Secretary, System Admin, Meeting Organizer, or user with meetings:manage_participants / meetings:edit permission.
 */
async function canUserManageAttendance(meeting: { organizerId: string }, req: AuthedRequest): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.roleCode === "SYSTEM_ADMIN") return true;
  if (req.user.roleCode === "MEETING_SECRETARY") return true;
  if (meeting.organizerId === req.user.userId) return true;

  if (!req.userPermissions) {
    const rolePerms = await prisma.rolePermission.findMany({
      where: { roleId: req.user.roleId },
      select: { permission: true },
    });
    req.userPermissions = rolePerms.map((rp) => rp.permission);
  }
  return (
    req.userPermissions.includes("meetings:manage_participants") ||
    req.userPermissions.includes("meetings:edit")
  );
}

/**
 * Check if user has permission to edit attendance after it has been finalized.
 * System Admins are permitted to override.
 */
function canEditFinalizedAttendance(req: AuthedRequest): boolean {
  return req.user?.roleCode === "SYSTEM_ADMIN";
}

// ---------- List ----------
router.get("/", async (req: AuthedRequest, res) => {
  const { status, departmentId, priority, from, to, q, mine } = req.query;
  const where: any = {};
  if (typeof status === "string" && status) where.status = status;
  if (typeof departmentId === "string" && departmentId)
    where.departmentId = departmentId;
  if (typeof priority === "string" && priority) where.priority = priority;
  if (from || to) {
    where.date = {};
    if (typeof from === "string" && from) where.date.gte = new Date(from);
    if (typeof to === "string" && to) where.date.lte = new Date(to);
  }
  if (typeof q === "string" && q) where.title = { contains: q };
  if (mine === "true") {
    where.OR = [
      { organizerId: req.user!.userId },
      { participants: { some: { userId: req.user!.userId } } },
    ];
  }

  const meetings = await prisma.meeting.findMany({
    where,
    include: {
      organizer: { select: { id: true, name: true, avatarColor: true } },
      approvedBy: { select: { id: true, name: true, avatarColor: true } },
      department: { select: { id: true, name: true } },
      _count: {
        select: { participants: true, actionItems: true, agendaItems: true },
      },
    },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
  });
  res.json(meetings);
});

// ---------- Create ----------
const createSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  location: z.string().optional(),
  onlineLink: z.string().optional(),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
  departmentId: z.string().min(1),
  participantIds: z.array(z.string()).default([]),
  agendaItems: z
    .array(
      z.object({
        title: z.string().min(2),
        description: z.string().nullable().optional(),
        presenter: z.string().nullable().optional(),
        durationMin: z.number().optional(),
      }),
    )
    .default([]),
});

router.post(
  "/",
  requirePermission("meetings:create"),
  async (req: AuthedRequest, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Check the meeting title, date, time and department.",
        details: parsed.error.flatten(),
      });
    }
    const data = parsed.data;
    const count = await prisma.meeting.count();

    const meeting = await prisma.meeting.create({
      data: {
        code: makeCode("MTG", count + 1),
        title: data.title,
        description: data.description,
        date: new Date(data.date),
        startTime: data.startTime,
        endTime: data.endTime,
        location: data.location,
        onlineLink: data.onlineLink,
        priority: data.priority,
        departmentId: data.departmentId,
        organizerId: req.user!.userId,
        participants: {
          create: data.participantIds.map((userId) => ({ userId })),
        },
        agendaItems: {
          create: data.agendaItems.map((a, idx) => ({
            order: idx,
            title: a.title,
            description: a.description?.trim() || null,
            presenter: a.presenter?.trim() || null,
            durationMin: a.durationMin ?? 15,
          })),
        },
      },
      include: detailInclude,
    });

    // Notify invited participants.
    if (data.participantIds.length) {
      await prisma.notification.createMany({
        data: data.participantIds.map((userId) => ({
          userId,
          type: "MEETING_INVITE",
          title: "New meeting invitation",
          message: `You've been invited to "${meeting.title}" (${meeting.code}) on ${new Date(meeting.date).toDateString()}.`,
          link: `/meetings/${meeting.id}`,
        })),
      });
    }

    res.status(201).json(meeting);
  },
);

// ---------- Cross-meeting overviews ----------
router.get("/agenda-overview/upcoming", async (_req, res) => {
  const items = await prisma.agendaItem.findMany({
    where: {
      meeting: { date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    },
    include: {
      meeting: {
        select: {
          id: true,
          title: true,
          code: true,
          date: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ meeting: { date: "asc" } }, { order: "asc" }],
    take: 100,
  });
  res.json(items);
});

router.get("/minutes-overview/recent", async (_req, res) => {
  const items = await prisma.meetingMinutes.findMany({
    include: {
      recordedBy: { select: { id: true, name: true } },
      meeting: {
        select: {
          id: true,
          title: true,
          code: true,
          date: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(items);
});

router.get("/decisions-overview/all", async (req, res) => {
  const { status } = req.query;
  const decisions = await prisma.decision.findMany({
    where: typeof status === "string" && status ? { status } : undefined,
    include: {
      meeting: {
        select: {
          id: true,
          title: true,
          code: true,
          date: true,
          department: { select: { name: true } },
        },
      },
      actionItems: { select: { id: true, status: true } },
    },
    orderBy: { decisionDate: "desc" },
    take: 100,
  });
  res.json(decisions);
});

router.get("/documents-overview/all", async (_req, res) => {
  const documents = await prisma.document.findMany({
    include: {
      uploadedBy: { select: { id: true, name: true } },
      meeting: {
        select: {
          id: true,
          title: true,
          code: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(documents);
});

// ---------- Documents (real file upload) ----------
const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
  },
});
const upload = multer({
  storage,
});

router.post(
  "/:id/documents",
  requirePermission("documents:upload"),
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "No file selected." });
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!meeting) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Meeting not found." });
    }
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: lockError });
    }

    const doc = await prisma.document.create({
      data: {
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        storedName: req.file.filename,
        filePath: `/uploads/${encodeURIComponent(req.file.filename)}`,
        meetingId: req.params.id,
        uploadedById: req.user!.userId,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    res.status(201).json(doc);
  },
);

router.get(
  "/:id/documents/:documentId/download",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.documentId, meetingId: req.params.id },
    });
    if (!doc || !doc.storedName)
      return res.status(404).json({ error: "Document not found." });
    const filePath = path.join(uploadDir, doc.storedName);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ error: "File is no longer available." });
    res.download(filePath, doc.fileName);
  },
);

router.delete(
  "/:id/documents/:documentId",
  requirePermission("documents:delete"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const doc = await prisma.document.findFirst({
      where: { id: req.params.documentId, meetingId: req.params.id },
    });
    if (!doc) return res.status(404).json({ error: "Document not found." });
    if (doc.storedName) {
      const filePath = path.join(uploadDir, doc.storedName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await prisma.document.delete({ where: { id: doc.id } });
    res.status(204).send();
  },
);

// ---------- Detail ----------
router.get("/:id", async (req, res) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: detailInclude,
  });
  if (!meeting) return res.status(404).json({ error: "Meeting not found." });
  res.json(meeting);
});

// ---------- Update ----------
const updateSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  date: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  location: z.string().optional(),
  onlineLink: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(MEETING_STATUSES).optional(),
  departmentId: z.string().optional(),
});

router.put("/:id", requirePermission("meetings:edit"), async (req: AuthedRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Invalid meeting update.", details: parsed.error.flatten() });

  const existing = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, organizerId: true, approvedById: true },
  });
  if (!existing) return res.status(404).json({ error: "Meeting not found." });

  const isSuperAdmin = req.user?.roleCode === "SYSTEM_ADMIN";
  const wasLocked = isLockedMeetingStatus(existing.status);

  // If already locked, only Super Admin can edit or alter the status
  if (wasLocked && !isSuperAdmin) {
    return res.status(403).json({
      error: `Meeting is locked (${existing.status.replace("_", " ")}). Only Super Admins can override and modify locked meetings.`,
    });
  }

  const { date, status, ...rest } = parsed.data;
  const dataToUpdate: any = { ...rest };
  if (date) dataToUpdate.date = new Date(date);

  // Handle status transitions
  if (status !== undefined) {
    if (status === "APPROVED" && existing.status !== "APPROVED") {
      const authorized = await canApproveMeeting(existing.organizerId, req);
      if (!authorized) {
        return res.status(403).json({
          error: "Only the meeting organizer or an authorized administrator can approve this meeting.",
        });
      }
      dataToUpdate.status = "APPROVED";
      dataToUpdate.approvedById = req.user!.userId;
      dataToUpdate.approvedAt = new Date();
      if (req.body.signature && typeof req.body.signature === "string") {
        dataToUpdate.approvalSignature = req.body.signature.trim();
      }
    } else {
      dataToUpdate.status = status;
    }
  }

  try {
    const meeting = await prisma.meeting.update({
      where: { id: req.params.id },
      data: dataToUpdate,
      include: detailInclude,
    });
    res.json(meeting);
  } catch {
    res.status(404).json({ error: "Meeting not found." });
  }
});

// ---------- Delete Meeting ----------
router.delete("/:id", requirePermission("meetings:delete"), async (req: AuthedRequest, res) => {
  const existing = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true },
  });
  if (!existing) return res.status(404).json({ error: "Meeting not found." });

  const lockError = checkMeetingLock(existing, req);
  if (lockError) return res.status(403).json({ error: lockError });

  try {
    await prisma.meeting.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Meeting not found." });
  }
});

// ---------- Approve Meeting Workflow ----------
router.post("/:id/approve", async (req: AuthedRequest, res) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, organizerId: true },
  });
  if (!meeting) return res.status(404).json({ error: "Meeting not found." });

  const authorized = await canApproveMeeting(meeting.organizerId, req);
  if (!authorized) {
    return res.status(403).json({
      error: "Only the meeting organizer or an authorized administrator can approve this meeting.",
    });
  }

  if (meeting.status === "APPROVED") {
    return res.status(400).json({ error: "Meeting is already approved." });
  }
  if (meeting.status === "CANCELLED") {
    return res.status(400).json({ error: "Cannot approve a cancelled meeting." });
  }

  const { signature } = req.body || {};
  if (!signature || typeof signature !== "string" || !signature.trim()) {
    return res.status(400).json({
      error: "A valid digital signature is required to approve this meeting and formalize its minutes.",
    });
  }

  const updated = await (prisma.meeting as any).update({
    where: { id: req.params.id },
    data: {
      status: "APPROVED",
      approvedById: req.user!.userId,
      approvedAt: new Date(),
      approvalSignature: signature.trim(),
    },
    include: detailInclude,
  });

  res.json(updated);
});

// ---------- Participants Management ----------
router.post(
  "/:id/participants",
  requirePermission("meetings:manage_participants"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        status: true,
        title: true,
        date: true,
        startTime: true,
        endTime: true,
        organizer: { select: { id: true, name: true } },
      },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });

    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const schema = z.object({ userIds: z.array(z.string()).min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ error: "Provide at least one participant." });

    await prisma.meetingParticipant.createMany({
      data: parsed.data.userIds.map((userId) => ({
        meetingId: req.params.id,
        userId,
      })),
      skipDuplicates: true,
    });

    // Create MEETING_INVITATION notifications for each invited user.
    // The notification is sent ONLY to the invited participant Ã¢â‚¬â€ not to the
    // organizer or whoever made the request.
    const meetingDate = new Date(meeting.date).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const notificationData = parsed.data.userIds
      .filter((userId) => userId !== req.user!.userId) // exclude the requester
      .map((userId) => ({
        userId,
        meetingId: meeting.id,
        type: "MEETING_INVITATION",
        title: "New Meeting Invitation",
        message: `You have been invited to: "${meeting.title}" on ${meetingDate} from ${meeting.startTime} to ${meeting.endTime}. Organized by ${meeting.organizer.name}.`,
        link: `/meetings/${meeting.id}`,
        isRead: false,
      }));

    if (notificationData.length > 0) {
      // Use createMany and skip if the record already exists for idempotency
      await prisma.notification.createMany({
        data: notificationData,
        skipDuplicates: false,
      });
    }

    const updated = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      include: detailInclude,
    });
    res.json(updated);
  },
);

router.delete(
  "/:id/participants/:participantId",
  requirePermission("meetings:manage_participants"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });

    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    // Look for participant record either by participant ID or user ID
    const participant = await prisma.meetingParticipant.findFirst({
      where: {
        meetingId: req.params.id,
        OR: [
          { id: req.params.participantId },
          { userId: req.params.participantId },
        ],
      },
    });

    if (!participant) {
      return res.status(404).json({ error: "Participant not found in this meeting." });
    }

    await prisma.meetingParticipant.delete({
      where: { id: participant.id },
    });

    const updated = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      include: detailInclude,
    });
    res.json(updated);
  },
);

router.patch(
  "/:id/participants/:participantId/attendance",
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        status: true,
        date: true,
        endTime: true,
        organizerId: true,
        attendanceFinalized: true,
      },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });

    const authorized = await canUserManageAttendance(meeting, req);
    if (!authorized) {
      return res.status(403).json({ error: "You are not authorized to update participant attendance." });
    }

    // If attendance is already finalized, only users with edit permission (System Admin) can modify
    if (meeting.attendanceFinalized && !canEditFinalizedAttendance(req)) {
      return res.status(403).json({
        error: "Attendance has already been finalized. Editing requires authorized permission.",
      });
    }

    const schema = z.object({ participated: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid attendance parameter." });
    }

    const participant = await prisma.meetingParticipant.findFirst({
      where: {
        meetingId: req.params.id,
        OR: [
          { id: req.params.participantId },
          { userId: req.params.participantId },
        ],
      },
    });

    if (!participant) {
      return res.status(404).json({ error: "Participant not found." });
    }

    const updated = await prisma.meetingParticipant.update({
      where: { id: participant.id },
      data: {
        participated: parsed.data.participated,
        status: parsed.data.participated ? "ATTENDED" : "ABSENT",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarColor: true,
            role: true,
          },
        },
      },
    });

    res.json(updated);
  },
);

router.post(
  "/:id/attendance/finalize",
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });

    const authorized = await canUserManageAttendance(meeting, req);
    if (!authorized) {
      return res.status(403).json({
        error: "You are not authorized to finalize attendance for this meeting.",
      });
    }

    // 1. Validate that the meeting has reached its conclusion
    if (!hasMeetingEnded(meeting)) {
      return res.status(400).json({
        error: `Attendance can only be finalized after the meeting has ended (Scheduled end time: ${meeting.endTime}).`,
      });
    }

    // 2. Validate if already finalized
    if (meeting.attendanceFinalized && !canEditFinalizedAttendance(req)) {
      return res.status(403).json({
        error: "Attendance has already been finalized for this meeting.",
      });
    }

    // 3. Optional status list payload: validate that every participant has an attendance status
    const schema = z.object({
      records: z
        .array(
          z.object({
            participantId: z.string(),
            status: z.enum(["ATTENDED", "NOT ATTENDED"]),
          }),
        )
        .optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid attendance payload format." });
    }

    // If records are provided, ensure every invited participant is accounted for
    if (parsed.data.records && parsed.data.records.length > 0) {
      const recordMap = new Map(parsed.data.records.map((r) => [r.participantId, r.status]));
      const missing = meeting.participants.filter(
        (p) => !recordMap.has(p.id) && !recordMap.has(p.userId),
      );
      if (missing.length > 0) {
        return res.status(400).json({
          error: `Please confirm attendance status for all participants (${missing.length} missing).`,
        });
      }

      // Update participant records in database
      await prisma.$transaction(
        parsed.data.records.map((r) => {
          const isAttended = r.status === "ATTENDED";
          return prisma.meetingParticipant.updateMany({
            where: {
              meetingId: req.params.id,
              OR: [{ id: r.participantId }, { userId: r.participantId }],
            },
            data: {
              participated: isAttended,
              status: isAttended ? "ATTENDED" : "ABSENT",
            },
          });
        }),
      );
    } else {
      // If no records explicitly passed, synchronize each existing participant status
      await prisma.$transaction(
        meeting.participants.map((p) =>
          prisma.meetingParticipant.update({
            where: { id: p.id },
            data: {
              status: p.participated ? "ATTENDED" : "ABSENT",
            },
          }),
        ),
      );
    }

    // Mark meeting attendance as finalized
    await (prisma.meeting as any).update({
      where: { id: req.params.id },
      data: {
        attendanceFinalized: true,
        attendanceFinalizedAt: new Date(),
      },
    });

    const updated = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      include: detailInclude,
    });

    res.json(updated);
  },
);

// ---------- Agenda ----------
router.post(
  "/:id/agenda",
  requirePermission("agenda:create"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const schema = z.object({
      title: z.string().min(2),
      description: z.string().nullable().optional(),
      presenter: z.string().nullable().optional(),
      durationMin: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Give the agenda item a title." });
    const count = await prisma.agendaItem.count({
      where: { meetingId: req.params.id },
    });
    const item = await prisma.agendaItem.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description?.trim() || null,
        presenter: parsed.data.presenter?.trim() || null,
        durationMin: parsed.data.durationMin ?? 15,
        order: count,
        meetingId: req.params.id,
      },
    });
    res.status(201).json(item);
  },
);

router.put(
  "/agenda/:agendaId",
  requirePermission("agenda:edit"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.agendaItem.findUnique({
      where: { id: req.params.agendaId },
      include: { meeting: { select: { status: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Agenda item not found." });

    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const schema = z.object({
      title: z.string().min(2).optional(),
      description: z.string().nullable().optional(),
      presenter: z.string().nullable().optional(),
      durationMin: z.number().optional(),
      status: z.enum(AGENDA_STATUSES).optional(),
      order: z.number().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid agenda update." });
    try {
      const dataToUpdate: any = {};
      if (parsed.data.title !== undefined) dataToUpdate.title = parsed.data.title;
      if (parsed.data.description !== undefined) {
        dataToUpdate.description = parsed.data.description?.trim() || null;
      }
      if (parsed.data.presenter !== undefined) {
        dataToUpdate.presenter = parsed.data.presenter?.trim() || null;
      }
      if (parsed.data.durationMin !== undefined) dataToUpdate.durationMin = parsed.data.durationMin;
      if (parsed.data.status !== undefined) dataToUpdate.status = parsed.data.status;
      if (parsed.data.order !== undefined) dataToUpdate.order = parsed.data.order;

      const item = await prisma.agendaItem.update({
        where: { id: req.params.agendaId },
        data: dataToUpdate,
      });
      res.json(item);
    } catch {
      res.status(404).json({ error: "Agenda item not found." });
    }
  },
);

router.delete(
  "/agenda/:agendaId",
  requirePermission("agenda:edit"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.agendaItem.findUnique({
      where: { id: req.params.agendaId },
      include: { meeting: { select: { status: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Agenda item not found." });

    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    try {
      await prisma.agendaItem.delete({ where: { id: req.params.agendaId } });
      res.status(204).send();
    } catch {
      res.status(404).json({ error: "Agenda item not found." });
    }
  },
);

// ---------- Minutes ----------
router.post(
  "/:id/minutes",
  requirePermission("minutes:create"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const schema = z.object({ content: z.string().min(3) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Minutes cannot be empty." });
    const minutes = await prisma.meetingMinutes.create({
      data: {
        content: parsed.data.content,
        meetingId: req.params.id,
        recordedById: req.user!.userId,
      },
      include: { recordedBy: { select: { id: true, name: true } } },
    });
    res.status(201).json(minutes);
  },
);

// ---------- Minutes: Summary upsert (PUT /:id/minutes/summary) ----------
router.put(
  "/:id/minutes/summary",
  requirePermission("minutes:create", "minutes:edit"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const schema = z.object({ content: z.string() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid content." });

    const minutesInclude = {
      recordedBy: { select: { id: true, name: true } },
      attendee: { select: { id: true, name: true, avatarColor: true, jobTitle: true, department: { select: { id: true, name: true } } } },
    };

    // Upsert: one SUMMARY record per meeting (matched by type SUMMARY or attendeeId null)
    const existing = await (prisma as any).meetingMinutes.findFirst({
      where: {
        meetingId: req.params.id,
        OR: [{ type: "SUMMARY" }, { attendeeId: null }],
      },
    });

    if (existing) {
      const updated = await (prisma as any).meetingMinutes.update({
        where: { id: existing.id },
        data: { content: parsed.data.content, type: "SUMMARY" },
        include: minutesInclude,
      });
      return res.json(updated);
    }

    const created = await (prisma as any).meetingMinutes.create({
      data: {
        meetingId: req.params.id,
        type: "SUMMARY",
        content: parsed.data.content,
        recordedById: req.user!.userId,
      },
      include: minutesInclude,
    });
    res.status(201).json(created);
  },
);

// ---------- Minutes: Per-attendee upsert (PUT /:id/minutes/attendee/:userId) ----------
router.put(
  "/:id/minutes/attendee/:userId",
  requirePermission("minutes:create", "minutes:edit"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const schema = z.object({
      content: z.string(),
      attendeeName: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid content." });

    const minutesInclude = {
      recordedBy: { select: { id: true, name: true } },
      attendee: { select: { id: true, name: true, avatarColor: true, jobTitle: true, department: { select: { id: true, name: true } } } },
    };

    // Try to find the attendee's existing minutes for this meeting
    const existing = await (prisma as any).meetingMinutes.findFirst({
      where: { meetingId: req.params.id, attendeeId: req.params.userId, type: "ATTENDEE" },
    });

    if (existing) {
      const updated = await (prisma as any).meetingMinutes.update({
        where: { id: existing.id },
        data: { content: parsed.data.content, attendeeName: parsed.data.attendeeName },
        include: minutesInclude,
      });
      return res.json(updated);
    }

    try {
      const created = await (prisma as any).meetingMinutes.create({
        data: {
          meetingId: req.params.id,
          type: "ATTENDEE",
          attendeeId: req.params.userId,
          attendeeName: parsed.data.attendeeName,
          content: parsed.data.content,
          recordedById: req.user!.userId,
        },
        include: minutesInclude,
      });
      res.status(201).json(created);
    } catch (err: any) {
      if (err.code === "P2002") {
        const race = await (prisma as any).meetingMinutes.findFirst({
          where: { meetingId: req.params.id, attendeeId: req.params.userId },
        });
        if (race) {
          const updated = await (prisma as any).meetingMinutes.update({
            where: { id: race.id },
            data: { content: parsed.data.content },
            include: minutesInclude,
          });
          return res.json(updated);
        }
      }
      throw err;
    }
  },
);

// ---------- Minutes: Clear attendee minutes (DELETE /:id/minutes/attendee/:userId) ----------
router.delete(
  "/:id/minutes/attendee/:userId",
  requirePermission("minutes:edit"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const existing = await (prisma as any).meetingMinutes.findFirst({
      where: { meetingId: req.params.id, attendeeId: req.params.userId, type: "ATTENDEE" },
    });
    if (!existing) return res.status(404).json({ error: "Attendee minutes not found." });

    await prisma.meetingMinutes.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  },
);

// ---------- Minutes: Wildcard by minuteId ----------
router.put(
  "/:id/minutes/:minuteId",
  requirePermission("minutes:edit"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.meetingMinutes.findFirst({
      where: { id: req.params.minuteId, meetingId: req.params.id },
      include: { meeting: { select: { id: true, status: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Minutes not found." });
    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const schema = z.object({ content: z.string().min(3) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Minutes cannot be empty." });

    const updated = await prisma.meetingMinutes.update({
      where: { id: existing.id },
      data: { content: parsed.data.content },
      include: { recordedBy: { select: { id: true, name: true } } },
    });
    res.json(updated);
  },
);

router.put(
  "/minutes/:minuteId",
  requirePermission("minutes:edit"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.meetingMinutes.findUnique({
      where: { id: req.params.minuteId },
      include: { meeting: { select: { id: true, status: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Minutes not found." });
    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const schema = z.object({ content: z.string().min(3) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Minutes cannot be empty." });

    const updated = await prisma.meetingMinutes.update({
      where: { id: existing.id },
      data: { content: parsed.data.content },
      include: { recordedBy: { select: { id: true, name: true } } },
    });
    res.json(updated);
  },
);

router.delete(
  "/:id/minutes/:minuteId",
  requirePermission("minutes:edit"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.meetingMinutes.findFirst({
      where: { id: req.params.minuteId, meetingId: req.params.id },
      include: { meeting: { select: { id: true, status: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Minutes not found." });
    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await prisma.meetingMinutes.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  },
);
// ---------- Decisions ----------
router.post(
  "/:id/decisions",
  requirePermission("decisions:create"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const schema = z.object({
      title: z.string().min(3),
      description: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Give the decision a title." });
    const count = await prisma.decision.count();
    const decision = await prisma.decision.create({
      data: {
        ...parsed.data,
        code: makeCode("DEC", count + 1),
        meetingId: req.params.id,
      },
    });
    res.status(201).json(decision);
  },
);

router.put(
  "/decisions/:decisionId",
  requirePermission("decisions:edit"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.decision.findUnique({
      where: { id: req.params.decisionId },
      include: { meeting: { select: { status: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Decision not found." });
    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const schema = z.object({
      title: z.string().min(3).optional(),
      description: z.string().optional(),
      status: z.enum(DECISION_STATUSES).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid decision update." });
    try {
      const decision = await prisma.decision.update({
        where: { id: req.params.decisionId },
        data: parsed.data,
      });
      res.json(decision);
    } catch {
      res.status(404).json({ error: "Decision not found." });
    }
  },
);

export default router;
