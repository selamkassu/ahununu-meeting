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
import { checkOwnershipAccess, ensureUserPermissions } from "../utils/ownership";
import { makeCode } from "../utils/codes";
import {
  sendMeetingInvitationEmail,
  sendMeetingCancellationEmail,
} from "../utils/email";

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
      assignedTo: { select: { id: true, name: true, avatarColor: true, email: true } },
      assignees: {
        include: {
          user: { select: { id: true, name: true, avatarColor: true, email: true } },
        },
      },
      department: { select: { id: true, name: true } },
    },
    orderBy: { deadline: "asc" as const },
  },
  documents: { include: { uploadedBy: { select: { id: true, name: true } } } },
  participantSignatures: {
    include: {
      user: { select: { id: true, name: true, avatarColor: true, jobTitle: true, role: { select: { name: true } } } },
    },
    orderBy: { signedAt: "asc" as const },
  },
};
/**
 * Check if a meeting is locked for editing.
 * APPROVED meetings are strictly read-only for all users unless unlocked with ADMIN_OVERRIDE.
 */
function checkMeetingLock(meeting: { status: string }, req: AuthedRequest): string | null {
  if (meeting.status === "APPROVED") {
    return "Meeting is approved and strictly read-only. An administrator with ADMIN_OVERRIDE permission must unlock the meeting before any changes can be made.";
  }
  if (isLockedMeetingStatus(meeting.status)) {
    const hasOverride = req.userPermissions?.includes("ADMIN_OVERRIDE");
    if (!hasOverride) {
      return `Meeting is locked (${meeting.status.replace("_", " ")}). Modifications are restricted.`;
    }
  }
  return null;
}

/**
 * Check if user is authorized to approve the meeting (Organizer or authorized role with meetings:approve / ADMIN_OVERRIDE)
 */
async function canApproveMeeting(organizerId: string, req: AuthedRequest): Promise<boolean> {
  if (!req.user) return false;
  await ensureUserPermissions(req);
  if (req.userPermissions?.includes("ADMIN_OVERRIDE")) return true;
  if (organizerId === req.user.userId) return true;

  return (
    req.userPermissions?.includes("meetings:approve") ||
    req.userPermissions?.includes("meetings:certify_lock") ||
    false
  );
}

/**
 * Check if a meeting has reached its conclusion (status is COMPLETED or current server time >= meeting end datetime)
 */
function hasMeetingEnded(meeting: { date: Date | string; endTime: string; status: string }): boolean {
  // If the meeting has progressed beyond SCHEDULED, attendance can be finalized
  if (
    [
      "IN_PROGRESS",
      "PENDING_SIGNATURES",
      "READY_FOR_APPROVAL",
      "APPROVED",
      "COMPLETED",
    ].includes(meeting.status)
  ) {
    return true;
  }
  if (meeting.status === "CANCELLED") return false;

  const dateObj = typeof meeting.date === "string" ? new Date(meeting.date) : meeting.date;
  const dateStr = dateObj.toISOString().split("T")[0];
  const [endHours, endMinutes] = (meeting.endTime || "00:00").split(":").map(Number);
  const [year, month, day] = dateStr.split("-").map(Number);

  // Accounts for East Africa Time (UTC+3, which is 3 hours ahead of UTC server time on Render)
  const utcEnd = Date.UTC(year, month - 1, day, endHours || 0, endMinutes || 0, 0);
  const eatEnd = utcEnd - 3 * 60 * 60 * 1000;

  return Date.now() >= Math.min(utcEnd, eatEnd);
}

/**
 * Check if a user is authorized to manage/finalize attendance for a meeting:
 * Meeting Secretary, System Admin, Meeting Organizer, or user with meetings:manage_participants / meetings:edit permission.
 */
async function canUserManageAttendance(meeting: { organizerId: string }, req: AuthedRequest): Promise<boolean> {
  if (!req.user) return false;
  await ensureUserPermissions(req);
  if (req.userPermissions?.includes("ADMIN_OVERRIDE")) return true;
  if (meeting.organizerId === req.user.userId) return true;

  return (
    req.userPermissions?.includes("meetings:manage_participants") ||
    req.userPermissions?.includes("meetings:edit:all") ||
    req.userPermissions?.includes("meetings:edit:dept") ||
    false
  );
}

/**
 * Check if user has permission to edit attendance after it has been finalized.
 * Users with ADMIN_OVERRIDE permission are permitted to override.
 */
function canEditFinalizedAttendance(req: AuthedRequest): boolean {
  return req.userPermissions?.includes("ADMIN_OVERRIDE") ?? false;
}

// ---------- List ----------
router.get("/", async (req: AuthedRequest, res) => {
  const { status, departmentId, priority, from, to, q, mine } = req.query;
  const conditions: any[] = [];

  if (typeof status === "string" && status) {
    if (status === "FORCE_APPROVED") {
      conditions.push({ forceApproved: true });
    } else {
      conditions.push({ status });
    }
  }
  if (typeof departmentId === "string" && departmentId)
    conditions.push({ departmentId });
  if (typeof priority === "string" && priority) conditions.push({ priority });

  if (from || to) {
    const dateCond: any = {};
    if (typeof from === "string" && from) dateCond.gte = new Date(from);
    if (typeof to === "string" && to) dateCond.lte = new Date(to);
    conditions.push({ date: dateCond });
  }

  if (mine === "true" && req.user) {
    conditions.push({
      OR: [
        { organizerId: req.user.userId },
        { participants: { some: { userId: req.user.userId } } },
      ],
    });
  }

  // 3-Tier Ownership Enforcement for Viewing Meetings
  if (req.user) {
    await ensureUserPermissions(req);
    const canViewAll = req.userPermissions?.includes("ADMIN_OVERRIDE") || req.userPermissions?.includes("meetings:view:all");
    const canViewDept = req.userPermissions?.includes("meetings:view:dept");
    const canViewOwn = req.userPermissions?.includes("meetings:view:own");

    if (!canViewAll) {
      if (canViewDept && req.user.departmentId && mine !== "true") {
        // Enforce user's department or meetings they are participating in
        for (let i = conditions.length - 1; i >= 0; i--) {
          if (conditions[i].departmentId) {
            conditions.splice(i, 1);
          }
        }
        conditions.push({
          OR: [
            { departmentId: req.user.departmentId },
            { organizerId: req.user.userId },
            { participants: { some: { userId: req.user.userId } } },
          ],
        });
      } else {
        conditions.push({
          OR: [
            { organizerId: req.user.userId },
            { participants: { some: { userId: req.user.userId } } },
          ],
        });
      }
    }
  }

  // Case-insensitive search across: Meeting title, Meeting description, and Participant name (and Organizer name, Approver, Bypass Reason)
  if (typeof q === "string" && q.trim()) {
    const searchTerm = q.trim();
    const searchConditions: any[] = [
      { title: { contains: searchTerm, mode: "insensitive" } },
      { description: { contains: searchTerm, mode: "insensitive" } },
      { code: { contains: searchTerm, mode: "insensitive" } },
      {
        participants: {
          some: {
            user: {
              name: { contains: searchTerm, mode: "insensitive" },
            },
          },
        },
      },
      {
        organizer: {
          name: { contains: searchTerm, mode: "insensitive" },
        },
      },
      {
        approvedBy: {
          name: { contains: searchTerm, mode: "insensitive" },
        },
      },
      { bypassReason: { contains: searchTerm, mode: "insensitive" } },
    ];
    if (searchTerm.toLowerCase().includes("force")) {
      searchConditions.push({ forceApproved: true });
    }
    conditions.push({
      OR: searchConditions,
    });
  }

  const where = conditions.length > 0 ? { AND: conditions } : {};

  const meetings = await prisma.meeting.findMany({
    where,
    include: {
      organizer: { select: { id: true, name: true, avatarColor: true } },
      approvedBy: { select: { id: true, name: true, avatarColor: true } },
      department: { select: { id: true, name: true } },
      participants: {
        select: {
          status: true,
          rejectionReason: true,
          user: { select: { id: true, name: true, avatarColor: true } },
        },
      },
      _count: {
        select: { participants: true, actionItems: true, agendaItems: true },
      },
    },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
  });
  res.json(meetings);
});

// Helper to parse HH:mm or HH:mm:ss string into components
function parseTimeString(timeStr: string): { hours: number; minutes: number; totalMinutes: number } | null {
  if (!timeStr) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.exec(timeStr.trim());
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return { hours, minutes, totalMinutes: hours * 60 + minutes };
}

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
  participantIds: z.array(z.string()).min(1, "Please select at least one participant to schedule the meeting."),
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
      const issues = parsed.error.issues;
      const participantIssue = issues.find((i) => i.path.includes("participantIds"));
      return res.status(400).json({
        error: participantIssue?.message || "Check the meeting title, date, time, department, and participants.",
        details: parsed.error.flatten(),
      });
    }
    const data = parsed.data;

    // Strict validation: At least one participant required to schedule the meeting
    if (!data.participantIds || data.participantIds.length === 0) {
      return res.status(400).json({
        error: "Please select at least one participant to schedule the meeting.",
      });
    }

    // Strict validation: Start time and End time format
    const startParsed = parseTimeString(data.startTime);
    const endParsed = parseTimeString(data.endTime);
    if (!startParsed || !endParsed) {
      return res.status(400).json({
        error: "Invalid time format. Please provide valid start and end times in HH:mm format.",
      });
    }

    // Strict validation: End time must be strictly after Start time
    if (endParsed.totalMinutes <= startParsed.totalMinutes) {
      return res.status(400).json({
        error: "Meeting end time must be strictly after the start time.",
      });
    }

    // Strict validation: Minimum meeting duration of at least 5 minutes
    if (endParsed.totalMinutes - startParsed.totalMinutes < 5) {
      return res.status(400).json({
        error: "Meeting duration must be at least 5 minutes.",
      });
    }

    // Strict validation: Prevent scheduling meetings in the past
    const dateParts = data.date.slice(0, 10).split("-").map(Number);
    if (dateParts.length !== 3 || dateParts.some(isNaN)) {
      return res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD." });
    }
    const [year, month, day] = dateParts;

    // Check against current time (allowing 5-minute grace period for network latency and clock drift)
    const scheduledStart = new Date(year, month - 1, day, startParsed.hours, startParsed.minutes, 0, 0);
    const nowWithGrace = new Date(Date.now() - 5 * 60 * 1000);

    if (scheduledStart.getTime() < nowWithGrace.getTime()) {
      return res.status(400).json({
        error: "Cannot schedule a meeting in the past. Please select a future date and time.",
      });
    }

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

    // Notify invited participants (in-app).
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

    // Send invitation emails strictly to invited attendees (excluding the organizer / creator)
    (async () => {
      try {
        const organizer = await prisma.user.findUnique({
          where: { id: req.user!.userId },
          select: { id: true, name: true, email: true },
        });
        const meetingDateStr = new Date(meeting.date).toLocaleDateString("en-US", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        });

        // Send Invitation email strictly to invited attendees (never to the organizer/creator)
        const invitedIds = (data.participantIds || []).filter(
          (id) => id !== req.user!.userId && id !== organizer?.id
        );

        if (invitedIds.length > 0) {
          const invitedUsers = await prisma.user.findMany({
            where: { id: { in: invitedIds } },
            select: { id: true, name: true, email: true },
          });

          console.log(`[Meeting Create] Initiating invitation emails for ${invitedUsers.length} attendee(s)...`);

          for (const u of invitedUsers) {
            if (
              !u.email ||
              u.id === req.user!.userId ||
              (organizer?.email && u.email.trim().toLowerCase() === organizer.email.trim().toLowerCase())
            ) {
              continue;
            }

            if (u.email.endsWith("@ahununulogistics.com")) {
              console.warn(
                `[Meeting Create] NOTICE: "${u.name}" has demo email "${u.email}". Gmail cannot deliver to non-existent domain ahununulogistics.com.`
              );
            }

            try {
              console.log(`[Meeting Create] Sending invitation to ${u.name} <${u.email}>...`);
              await sendMeetingInvitationEmail({
                toEmail: u.email,
                toName: u.name || "Participant",
                organizerName: organizer?.name || "Organizer",
                meetingTitle: meeting.title,
                meetingDate: meetingDateStr,
                startTime: meeting.startTime,
                endTime: meeting.endTime,
                location: meeting.location || undefined,
                meetingId: meeting.id,
              });
            } catch (partErr: any) {
              console.error(`[Meeting Create] Error sending invitation to ${u.email}:`, partErr?.message || partErr);
            }
          }
        }
      } catch (err: any) {
        console.error("[Meeting Create] Email invitation loop failed:", err?.message || err);
      }
    })();

    res.status(201).json(meeting);
  },
);

// ---------- Cross-meeting overviews ----------
router.get("/agenda-overview/upcoming", async (req: AuthedRequest, res) => {
  const meetingWhere: any = { date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } };
  if (req.user) {
    await ensureUserPermissions(req);
    const canAll = req.userPermissions?.includes("ADMIN_OVERRIDE") || req.userPermissions?.includes("meetings:view:all");
    const canDept = req.userPermissions?.includes("meetings:view:dept");
    if (!canAll) {
      if (canDept && req.user.departmentId) {
        meetingWhere.departmentId = req.user.departmentId;
      } else {
        meetingWhere.OR = [
          { organizerId: req.user.userId },
          { participants: { some: { userId: req.user.userId } } },
        ];
      }
    }
  }

  const items = await prisma.agendaItem.findMany({
    where: {
      meeting: meetingWhere,
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

router.get("/minutes-overview/recent", async (req: AuthedRequest, res) => {
  const where: any = {};
  if (req.user) {
    await ensureUserPermissions(req);
    const canAll = req.userPermissions?.includes("ADMIN_OVERRIDE") || req.userPermissions?.includes("minutes:view:all");
    const canDept = req.userPermissions?.includes("minutes:view:dept");
    if (!canAll) {
      if (canDept && req.user.departmentId) {
        where.meeting = { departmentId: req.user.departmentId };
      } else {
        where.OR = [
          { recordedById: req.user.userId },
          { meeting: { OR: [{ organizerId: req.user.userId }, { participants: { some: { userId: req.user.userId } } }] } },
        ];
      }
    }
  }

  const items = await prisma.meetingMinutes.findMany({
    where,
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

router.get("/decisions-overview/all", async (req: AuthedRequest, res) => {
  const { status } = req.query;
  const where: any = {};
  if (typeof status === "string" && status) where.status = status;

  if (req.user) {
    await ensureUserPermissions(req);
    const canAll = req.userPermissions?.includes("ADMIN_OVERRIDE") || req.userPermissions?.includes("decisions:view:all");
    const canDept = req.userPermissions?.includes("decisions:view:dept");
    if (!canAll) {
      if (canDept && req.user.departmentId) {
        where.meeting = { departmentId: req.user.departmentId };
      } else {
        where.meeting = {
          OR: [
            { organizerId: req.user.userId },
            { participants: { some: { userId: req.user.userId } } },
          ],
        };
      }
    }
  }

  const decisions = await prisma.decision.findMany({
    where,
    include: {
      meeting: {
        select: {
          id: true,
          title: true,
          code: true,
          date: true,
          status: true,
          departmentId: true,
          organizerId: true,
          department: { select: { id: true, name: true } },
        },
      },
      actionItems: { select: { id: true, status: true } },
    },
    orderBy: { decisionDate: "desc" },
    take: 100,
  });
  res.json(decisions);
});

router.get("/documents-overview/all", async (req: AuthedRequest, res) => {
  const where: any = {};
  if (req.user) {
    await ensureUserPermissions(req);
    const canAll = req.userPermissions?.includes("ADMIN_OVERRIDE") || req.userPermissions?.includes("documents:view:all");
    const canDept = req.userPermissions?.includes("documents:view:dept");
    if (!canAll) {
      if (canDept && req.user.departmentId) {
        where.meeting = { departmentId: req.user.departmentId };
      } else {
        where.OR = [
          { uploadedById: req.user.userId },
          { meeting: { OR: [{ organizerId: req.user.userId }, { participants: { some: { userId: req.user.userId } } }] } },
        ];
      }
    }
  }

  const documents = await prisma.document.findMany({
    where,
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

function resolveFilePath(storedName: string): string {
  const candidates = [
    path.join(__dirname, "../../uploads", storedName),
    path.join(process.cwd(), "uploads", storedName),
    path.join(process.cwd(), "backend", "uploads", storedName),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(uploadDir, storedName);
}

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
      select: {
        id: true,
        status: true,
        departmentId: true,
        organizerId: true,
        participants: { select: { userId: true } },
      },
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

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "meetings", "edit", {
      departmentId: meeting.departmentId,
      ownerId: meeting.organizerId,
      participantIds: meeting.participants.map((p) => p.userId),
    })) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: "You do not have permission to upload documents to this meeting outside your ownership scope." });
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
      include: {
        meeting: {
          select: {
            departmentId: true,
            organizerId: true,
            participants: { select: { userId: true } },
          },
        },
      },
    });
    if (!doc || !doc.storedName)
      return res.status(404).json({ error: "Document not found." });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "documents", "view", {
      departmentId: doc.meeting.departmentId,
      ownerId: doc.uploadedById,
      participantIds: [
        doc.meeting.organizerId,
        ...doc.meeting.participants.map((p) => p.userId),
      ],
    })) {
      return res.status(403).json({ error: "You do not have permission to download this document outside your ownership scope." });
    }

    const filePath = resolveFilePath(doc.storedName);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ error: "File is no longer available." });
    res.download(filePath, doc.fileName);
  },
);

router.get(
  "/:id/documents/:documentId/view",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.documentId, meetingId: req.params.id },
      include: {
        meeting: {
          select: {
            departmentId: true,
            organizerId: true,
            participants: { select: { userId: true } },
          },
        },
      },
    });
    if (!doc || !doc.storedName)
      return res.status(404).json({ error: "Document not found." });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "documents", "view", {
      departmentId: doc.meeting.departmentId,
      ownerId: doc.uploadedById,
      participantIds: [
        doc.meeting.organizerId,
        ...doc.meeting.participants.map((p) => p.userId),
      ],
    })) {
      return res.status(403).json({ error: "You do not have permission to view this document outside your ownership scope." });
    }

    const filePath = resolveFilePath(doc.storedName);
    if (!fs.existsSync(filePath))
      return res.status(404).json({ error: "File is no longer available." });
    // Serve inline so browser can preview PDFs, images, etc.
    res.setHeader("Content-Type", doc.fileType || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(doc.fileName)}"`,
    );
    res.sendFile(filePath);
  },
);


router.delete(
  "/:id/documents/:documentId",
  requirePermission("documents:delete:all", "documents:delete:dept", "documents:delete:own"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, departmentId: true, organizerId: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    const doc = await prisma.document.findFirst({
      where: { id: req.params.documentId, meetingId: req.params.id },
    });
    if (!doc) return res.status(404).json({ error: "Document not found." });

    if (!checkOwnershipAccess(req, "documents", "delete", {
      departmentId: meeting.departmentId,
      ownerId: doc.uploadedById,
    })) {
      return res.status(403).json({ error: "You do not have permission to delete this document outside your ownership scope." });
    }

    if (doc.storedName) {
      const filePath = resolveFilePath(doc.storedName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await prisma.document.delete({ where: { id: doc.id } });
    res.status(204).send();
  },
);

// ---------- Detail ----------
router.get("/:id", async (req: AuthedRequest, res) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: detailInclude,
  });
  if (!meeting) return res.status(404).json({ error: "Meeting not found." });

  await ensureUserPermissions(req);
  if (!checkOwnershipAccess(req, "meetings", "view", {
    departmentId: meeting.departmentId,
    ownerId: meeting.organizerId,
    participantIds: meeting.participants.map((p) => p.userId),
  })) {
    return res.status(403).json({ error: "You do not have permission to view this meeting outside your ownership scope." });
  }

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

router.put(
  "/:id",
  requirePermission("meetings:edit:all", "meetings:edit:dept", "meetings:edit:own"),
  async (req: AuthedRequest, res) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid meeting update.", details: parsed.error.flatten() });

    const existing = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, organizerId: true, approvedById: true, departmentId: true, startTime: true, endTime: true },
    });
    if (!existing) return res.status(404).json({ error: "Meeting not found." });

    if (!checkOwnershipAccess(req, "meetings", "edit", {
      departmentId: existing.departmentId,
      ownerId: existing.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to edit meetings outside your ownership scope." });
    }

  await ensureUserPermissions(req);
  const hasAdminOverride = req.userPermissions?.includes("ADMIN_OVERRIDE");

  // Once a meeting is APPROVED, it is strictly READ-ONLY for everyone until unlocked!
  if (existing.status === "APPROVED" && !hasAdminOverride) {
    return res.status(403).json({
      error: "Meeting is approved and strictly read-only. It must be unlocked first by an administrator with ADMIN_OVERRIDE permission before any edits can be made.",
    });
  }

  const wasLocked = isLockedMeetingStatus(existing.status);
  if (wasLocked && !hasAdminOverride) {
    return res.status(403).json({
      error: `Meeting is locked (${existing.status.replace("_", " ")}). Modifications require ADMIN_OVERRIDE permission.`,
    });
  }

  // Validate updated time constraints if startTime or endTime is modified
  if (parsed.data.startTime || parsed.data.endTime) {
    const checkStartTime = parsed.data.startTime || existing.startTime;
    const checkEndTime = parsed.data.endTime || existing.endTime;
    const sParsed = parseTimeString(checkStartTime);
    const eParsed = parseTimeString(checkEndTime);
    if (!sParsed || !eParsed) {
      return res.status(400).json({ error: "Invalid time format. Please provide time as HH:mm." });
    }
    if (eParsed.totalMinutes <= sParsed.totalMinutes) {
      return res.status(400).json({ error: "Meeting end time must be strictly after the start time." });
    }
    if (eParsed.totalMinutes - sParsed.totalMinutes < 5) {
      return res.status(400).json({ error: "Meeting duration must be at least 5 minutes." });
    }
  }

  const { date, status, ...rest } = parsed.data;
  const dataToUpdate: any = { ...rest };
  if (date) dataToUpdate.date = new Date(date);

  // Status transitions: APPROVED cannot be set via standard update dropdown
  if (status !== undefined) {
    if (status === "APPROVED") {
      return res.status(400).json({
        error: "Meetings cannot be set to APPROVED via status update. Approval must be performed using the 'Approve Meeting' workflow with digital certification.",
      });
    }

    if (status === "COMPLETED" && existing.status !== "COMPLETED") {
      const [minutes, decisionsCount, actionItemsCount] = await Promise.all([
        (prisma as any).meetingMinutes.findMany({
          where: { meetingId: req.params.id },
          select: { content: true },
        }),
        prisma.decision.count({ where: { meetingId: req.params.id } }),
        prisma.actionItem.count({ where: { meetingId: req.params.id } }),
      ]);

      const stripHtml = (html: string) =>
        (html || "")
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .trim();

      const hasSummary = minutes.some((m: any) => stripHtml(m.content).length > 0);
      const hasDecisions = decisionsCount > 0;
      const hasActionItems = actionItemsCount > 0;

      if (!hasSummary && !hasDecisions && !hasActionItems) {
        return res.status(400).json({
          error:
            "To complete the meeting, at least one of the three sections (Meeting Summary, Decision, or Action Item) must contain content. Completing the meeting is blocked only if all three are empty at the same time.",
        });
      }
    }

    dataToUpdate.status = status;
  }

  try {
    const meeting = await prisma.meeting.update({
      where: { id: req.params.id },
      data: dataToUpdate,
      include: detailInclude,
    });

    // Notify participants and organizer if meeting status was transitioned to CANCELLED
    if (existing.status !== "CANCELLED" && status === "CANCELLED") {
      try {
        const userIdsToNotify = new Set<string>();

        if (meeting.participants && Array.isArray(meeting.participants)) {
          for (const p of meeting.participants) {
            if (p.userId) userIdsToNotify.add(p.userId);
          }
        }

        if (meeting.organizerId) {
          userIdsToNotify.add(meeting.organizerId);
        }

        if (meeting.actionItems && Array.isArray(meeting.actionItems)) {
          for (const a of meeting.actionItems) {
            if (a.assignedToId) userIdsToNotify.add(a.assignedToId);
            if ((a as any).assignees && Array.isArray((a as any).assignees)) {
              for (const asg of (a as any).assignees) {
                if (asg.userId) userIdsToNotify.add(asg.userId);
              }
            }
          }
        }

        const meetingDate = new Date(meeting.date).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        });

        const timeRange =
          meeting.startTime && meeting.endTime
            ? ` from ${meeting.startTime} to ${meeting.endTime}`
            : "";

        const notifications = Array.from(userIdsToNotify).map((userId) => ({
          userId,
          meetingId: meeting.id,
          type: "MEETING_CANCELLED",
          title: "Meeting Cancelled",
          message: `The meeting "${meeting.title}" (${meeting.code}) scheduled for ${meetingDate}${timeRange} has been cancelled.`,
          link: `/meetings/${meeting.id}`,
          isRead: false,
        }));

        if (notifications.length > 0) {
          await prisma.notification.createMany({
            data: notifications,
          });
        }
      } catch (notifErr) {
        console.error("Failed to generate cancellation notifications:", notifErr);
      }
    }

    // ── Email: Cancellation — sent to participants (excluding the user cancelling) ──
    if (existing.status !== "CANCELLED" && status === "CANCELLED") {
      const cancelledByUser = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { name: true, email: true },
      });
      const allRecipientIds = new Set<string>();
      if (meeting.organizerId && meeting.organizerId !== req.user!.userId) allRecipientIds.add(meeting.organizerId);
      if (meeting.participants && Array.isArray(meeting.participants)) {
        for (const p of meeting.participants) {
          if (p.userId && p.userId !== req.user!.userId) allRecipientIds.add(p.userId);
        }
      }
      const cancelRecipients = await prisma.user.findMany({
        where: { id: { in: Array.from(allRecipientIds) } },
        select: { name: true, email: true },
      });
      const cancelDateStr = new Date(meeting.date).toLocaleDateString("en-US", {
        weekday: "long", year: "numeric", month: "long", day: "numeric",
      });
      sendMeetingCancellationEmail({
        recipients: cancelRecipients
          .filter(u => !!u.email && (!cancelledByUser?.email || u.email.trim().toLowerCase() !== cancelledByUser.email.trim().toLowerCase()))
          .map(u => ({ email: u.email!, name: u.name || "" })),
        meetingTitle: meeting.title,
        meetingDate: cancelDateStr,
        startTime: meeting.startTime,
        endTime: meeting.endTime,
        cancelledByName: cancelledByUser?.name || "Administrator",
        meetingId: meeting.id,
      }).catch(console.error);
    }

    res.json(meeting);
  } catch {
    res.status(404).json({ error: "Meeting not found." });
  }
});

// ---------- Delete Meeting ----------
router.delete(
  "/:id",
  requirePermission("meetings:delete:all", "meetings:delete:dept", "meetings:delete:own"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, departmentId: true, organizerId: true },
    });
    if (!existing) return res.status(404).json({ error: "Meeting not found." });

    if (!checkOwnershipAccess(req, "meetings", "delete", {
      departmentId: existing.departmentId,
      ownerId: existing.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to delete meetings outside your ownership scope." });
    }

    const lockError = checkMeetingLock(existing, req);
    if (lockError) return res.status(403).json({ error: lockError });

    try {
      await prisma.meeting.delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch {
      res.status(404).json({ error: "Meeting not found." });
    }
  },
);

// ---------- Signing Workflow ----------

// POST /:id/request-signatures  — move meeting to PENDING_SIGNATURES phase
router.post("/:id/request-signatures", async (req: AuthedRequest, res) => {
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, organizerId: true, title: true, participants: { select: { userId: true } } },
  });
  if (!meeting) return res.status(404).json({ error: "Meeting not found." });

  const authorized = await canApproveMeeting(meeting.organizerId, req);
  if (!authorized) return res.status(403).json({ error: "Only organizers or administrators can initiate the signing phase." });

  if (meeting.status === "APPROVED") return res.status(400).json({ error: "Meeting is already approved." });
  if (meeting.status === "CANCELLED") return res.status(400).json({ error: "Cannot request signatures for a cancelled meeting." });
  if (meeting.status === "PENDING_SIGNATURES") return res.status(400).json({ error: "Signatures already being collected." });
  if (meeting.status === "READY_FOR_APPROVAL") return res.status(400).json({ error: "All signatures already collected." });

  const updated = await (prisma.meeting as any).update({
    where: { id: req.params.id },
    data: { status: "PENDING_SIGNATURES", signaturesRequestedAt: new Date() },
    include: detailInclude,
  });

  // Notify all participants
  const notifData = meeting.participants
    .filter(p => p.userId !== req.user!.userId)
    .map(p => ({
      userId: p.userId,
      meetingId: meeting.id,
      type: "MEETING_SIGN_REQUEST",
      title: "Signature Requested",
      message: `Your digital signature is required for the meeting: "${meeting.title}".`,
      link: `/meetings/${meeting.id}?tab=overview`,
    }));
  if (notifData.length) await prisma.notification.createMany({ data: notifData });

  res.json(updated);
});

// POST /:id/participant-sign  — participant submits their digital signature
router.post("/:id/participant-sign", async (req: AuthedRequest, res) => {
  const meeting = await (prisma.meeting as any).findUnique({
    where: { id: req.params.id },
    include: {
      participants: { select: { userId: true } },
      participantSignatures: { select: { userId: true } },
    },
  });
  if (!meeting) return res.status(404).json({ error: "Meeting not found." });
  if (meeting.status === "APPROVED") return res.status(400).json({ error: "Meeting is already approved." });
  if (meeting.status === "CANCELLED") return res.status(400).json({ error: "Cannot sign a cancelled meeting." });

  if (meeting.status !== "PENDING_SIGNATURES") {
    if (["SCHEDULED", "IN_PROGRESS", "COMPLETED", "DRAFT"].includes(meeting.status)) {
      await (prisma.meeting as any).update({
        where: { id: req.params.id },
        data: { status: "PENDING_SIGNATURES", signaturesRequestedAt: new Date() },
      });
    } else {
      return res.status(400).json({ error: "Signatures are not being collected for this meeting right now." });
    }
  }

  // Nobody can sign for anybody else: strictly use authenticated userId
  const targetUserId = req.user!.userId;

  const isParticipant = meeting.participants.some((p: any) => p.userId === targetUserId);
  await ensureUserPermissions(req);
  const canSignByPermission =
    req.userPermissions?.includes("ADMIN_OVERRIDE") ||
    req.userPermissions?.includes("minutes:sign") ||
    req.userPermissions?.includes("meetings:approve");
  const isOrganizer = meeting.organizerId === targetUserId;

  if (!isParticipant && !isOrganizer && !canSignByPermission) {
    return res.status(403).json({ error: "Only confirmed attendees or authorized organizers can sign the minutes." });
  }

  const alreadySigned = meeting.participantSignatures.some((s: any) => s.userId === targetUserId);
  if (alreadySigned) return res.status(400).json({ error: "You have already signed this meeting." });

  const { signature } = req.body || {};
  if (!signature || typeof signature !== "string" || !signature.trim()) {
    return res.status(400).json({ error: "A valid digital signature is required." });
  }

  const userRecord = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { name: true, jobTitle: true, role: { select: { name: true } } },
  });
  const signerName = userRecord?.name || "Participant";
  const signerRole = userRecord?.jobTitle || userRecord?.role?.name || undefined;

  await (prisma.participantSignature as any).create({
    data: {
      meetingId: req.params.id,
      userId: targetUserId,
      signerName,
      signerRole,
      signatureDataUrl: signature.trim(),
      userAgent: req.headers["user-agent"] || null,
    },
  });

  // Check if all signers (participants + organizer/admin) have now signed
  const requiredSignerIds = new Set(meeting.participants.map((p: any) => p.userId));
  if (meeting.organizerId) requiredSignerIds.add(meeting.organizerId);
  const totalRequired = requiredSignerIds.size;
  const signedCount = meeting.participantSignatures.length + 1; // +1 for the one just added

  let newStatus = "PENDING_SIGNATURES";
  if (signedCount >= totalRequired && totalRequired > 0) {
    newStatus = "READY_FOR_APPROVAL";
  }

  const updated = await (prisma.meeting as any).update({
    where: { id: req.params.id },
    data: { status: newStatus },
    include: detailInclude,
  });

  res.json(updated);
});

// GET /:id/signatures  — get all participant signatures
router.get("/:id/signatures", async (req: AuthedRequest, res) => {
  const signatures = await (prisma.participantSignature as any).findMany({
    where: { meetingId: req.params.id },
    include: {
      user: { select: { id: true, name: true, avatarColor: true, jobTitle: true } },
    },
    orderBy: { signedAt: "asc" },
  });
  res.json(signatures);
});

// ---------- Approve Meeting Workflow ----------
router.post("/:id/approve", async (req: AuthedRequest, res) => {
  const meeting = await (prisma.meeting as any).findUnique({
    where: { id: req.params.id },
    include: {
      participants: { select: { userId: true } },
      participantSignatures: { select: { userId: true } },
    },
  });
  if (!meeting) return res.status(404).json({ error: "Meeting not found." });

  const authorized = await canApproveMeeting(meeting.organizerId, req);
  if (!authorized) {
    return res.status(403).json({
      error: "Only the meeting organizer or an authorized administrator can approve this meeting.",
    });
  }

  if (meeting.status === "APPROVED") return res.status(400).json({ error: "Meeting is already approved." });
  if (meeting.status === "CANCELLED") return res.status(400).json({ error: "Cannot approve a cancelled meeting." });

  const { signature, forceApprove, forceReason } = req.body || {};
  if (!signature || typeof signature !== "string" || !signature.trim()) {
    return res.status(400).json({
      error: "A valid digital signature is required to approve this meeting and formalize its minutes.",
    });
  }

  // Calculate if all required signers have completed their signatures
  const requiredSignerIds = new Set(meeting.participants.map((p: any) => p.userId));
  if (meeting.organizerId) requiredSignerIds.add(meeting.organizerId);
  const signedUserIds = new Set(meeting.participantSignatures.map((s: any) => s.userId));

  // Remaining signers who have not signed yet (excluding the approving user who signs now)
  const pendingSignerIds = Array.from(requiredSignerIds).filter(
    (uid) => !signedUserIds.has(uid) && uid !== req.user!.userId
  );
  const allSigned = pendingSignerIds.length === 0;

  // When some participants have not yet signed, admin must toggle force submit checkbox
  if (!allSigned && !forceApprove) {
    return res.status(400).json({
      error: `Some participants have not yet submitted their digital signatures (${pendingSignerIds.length} pending). Please toggle the Force Submit checkbox to confirm admin override.`,
      requiresForceApprove: true,
      pendingCount: pendingSignerIds.length,
    });
  }

  const isForceApproved = !allSigned && !!forceApprove;
  const recordedBypassReason = isForceApproved
    ? (typeof forceReason === "string" && forceReason.trim()
        ? forceReason.trim()
        : "Administrative override: approved before all attendee signatures collected")
    : null;

  // Also record the approving admin/reviewer signature in participantSignatures if not already present
  const alreadySignedParticipant = meeting.participantSignatures.some((s: any) => s.userId === req.user!.userId);
  if (!alreadySignedParticipant) {
    const userRecord = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { name: true, jobTitle: true, role: { select: { name: true } } },
    });
    try {
      await (prisma.participantSignature as any).create({
        data: {
          meetingId: req.params.id,
          userId: req.user!.userId,
          signerName: userRecord?.name || "Meeting Approver",
          signerRole: userRecord?.jobTitle || userRecord?.role?.name || "Approver",
          signatureDataUrl: signature.trim(),
          userAgent: req.headers["user-agent"] || null,
          bypassReason: recordedBypassReason,
        },
      });
    } catch {
      // ignore in case of race condition
    }
  } else if (isForceApproved) {
    // If the approver already had a signature record, update its bypassReason
    try {
      await (prisma.participantSignature as any).updateMany({
        where: { meetingId: req.params.id, userId: req.user!.userId },
        data: { bypassReason: recordedBypassReason },
      });
    } catch {
      // ignore
    }
  }

  const updated = await (prisma.meeting as any).update({
    where: { id: req.params.id },
    data: {
      status: "APPROVED",
      approvedById: req.user!.userId,
      approvedAt: new Date(),
      approvalSignature: signature.trim(),
      forceApproved: isForceApproved,
      bypassReason: recordedBypassReason,
    },
    include: detailInclude,
  });

  res.json(updated);
});

// ---------- Unlock / Override Meeting Lock (Exclusive to ADMIN_OVERRIDE) ----------
router.post("/:id/unlock", async (req: AuthedRequest, res) => {
  await ensureUserPermissions(req);
  const hasAdminOverride = req.userPermissions?.includes("ADMIN_OVERRIDE");
  if (!hasAdminOverride) {
    return res.status(403).json({
      error: "Access Denied: Only users with the ADMIN_OVERRIDE permission possess the authority to unlock an approved or locked meeting.",
    });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, title: true, code: true },
  });
  if (!meeting) return res.status(404).json({ error: "Meeting not found." });

  if (!isLockedMeetingStatus(meeting.status)) {
    return res.status(400).json({
      error: `Meeting is not currently locked (current status is ${meeting.status}).`,
    });
  }

  const { targetStatus = "IN_PROGRESS", reason } = req.body || {};
  const validTargetStatus = ["IN_PROGRESS", "COMPLETED", "DRAFT", "SCHEDULED"].includes(targetStatus)
    ? targetStatus
    : "IN_PROGRESS";

  if (validTargetStatus === "COMPLETED") {
    const [minutes, decisionsCount, actionItemsCount] = await Promise.all([
      (prisma as any).meetingMinutes.findMany({
        where: { meetingId: req.params.id },
        select: { content: true },
      }),
      prisma.decision.count({ where: { meetingId: req.params.id } }),
      prisma.actionItem.count({ where: { meetingId: req.params.id } }),
    ]);

    const stripHtml = (html: string) =>
      (html || "")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim();

    const hasSummary = minutes.some((m: any) => stripHtml(m.content).length > 0);
    const hasDecisions = decisionsCount > 0;
    const hasActionItems = actionItemsCount > 0;

    if (!hasSummary && !hasDecisions && !hasActionItems) {
      return res.status(400).json({
        error:
          "To complete the meeting, at least one of the three sections (Meeting Summary, Decision, or Action Item) must contain content. Completing the meeting is blocked only if all three are empty at the same time.",
      });
    }
  }

  const recordedReason =
    typeof reason === "string" && reason.trim()
      ? reason.trim()
      : "Administrative override: meeting unlocked for modification";

  const updated = await (prisma.meeting as any).update({
    where: { id: req.params.id },
    data: {
      status: validTargetStatus,
      bypassReason: `Unlocked by Administrator: ${recordedReason}`,
    },
    include: detailInclude,
  });

  res.json(updated);
});

// ---------- Complete Meeting (POST /:id/complete) ----------
router.post(
  "/:id/complete",
  requirePermission("meetings:edit:all", "meetings:edit:dept", "meetings:edit:own"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, organizerId: true, departmentId: true },
    });
    if (!existing) return res.status(404).json({ error: "Meeting not found." });

    if (!checkOwnershipAccess(req, "meetings", "edit", {
      departmentId: existing.departmentId,
      ownerId: existing.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to complete this meeting." });
    }

    await ensureUserPermissions(req);
    const hasAdminOverride = req.userPermissions?.includes("ADMIN_OVERRIDE");

    if (existing.status === "APPROVED" && !hasAdminOverride) {
      return res.status(403).json({
        error: "Meeting is approved and strictly read-only. Modifications require ADMIN_OVERRIDE permission.",
      });
    }

    const wasLocked = isLockedMeetingStatus(existing.status);
    if (wasLocked && existing.status !== "APPROVED" && !hasAdminOverride) {
      return res.status(403).json({
        error: `Meeting is locked (${existing.status.replace("_", " ")}). Modifications require ADMIN_OVERRIDE permission.`,
      });
    }

    const [minutes, decisionsCount, actionItemsCount] = await Promise.all([
      (prisma as any).meetingMinutes.findMany({
        where: { meetingId: req.params.id },
        select: { content: true },
      }),
      prisma.decision.count({ where: { meetingId: req.params.id } }),
      prisma.actionItem.count({ where: { meetingId: req.params.id } }),
    ]);

    const stripHtml = (html: string) =>
      (html || "")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim();

    const hasSummary = minutes.some((m: any) => stripHtml(m.content).length > 0);
    const hasDecisions = decisionsCount > 0;
    const hasActionItems = actionItemsCount > 0;

    if (!hasSummary && !hasDecisions && !hasActionItems) {
      return res.status(400).json({
        error:
          "To complete the meeting, at least one of the three sections (Meeting Summary, Decision, or Action Item) must contain content. Completing the meeting is blocked only if all three are empty at the same time.",
      });
    }

    const updated = await prisma.meeting.update({
      where: { id: req.params.id },
      data: { status: "COMPLETED" },
      include: detailInclude,
    });

    res.json(updated);
  }
);

// ---------- Participants Management ----------
router.post(
  "/:id/participants",
  requirePermission("meetings:manage_participants", "meetings:edit:all", "meetings:edit:dept", "meetings:edit:own"),
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
        departmentId: true,
        organizerId: true,
        organizer: { select: { id: true, name: true, email: true } },
      },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });

    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "meetings", "edit", {
      departmentId: meeting.departmentId,
      ownerId: meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to manage participants for this meeting outside your ownership scope." });
    }

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
    // The notification is sent ONLY to the invited participant — not to the
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
      await prisma.notification.createMany({
        data: notificationData,
        skipDuplicates: false,
      });
    }

    // Send invitation emails to newly added participants (excluding inviter / organizer)
    const newRecipientIds = (parsed.data.userIds || []).filter(
      (id) => id !== req.user!.userId && id !== meeting.organizerId
    );
    const newUsers = await prisma.user.findMany({
      where: { id: { in: newRecipientIds } },
      select: { id: true, name: true, email: true },
    });
    const meetingDateStrForEmail = new Date(meeting.date).toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    (async () => {
      for (const u of newUsers) {
        if (
          !u.email ||
          u.id === req.user!.userId ||
          (meeting.organizer?.email && u.email.trim().toLowerCase() === meeting.organizer.email.trim().toLowerCase())
        ) {
          continue;
        }
        try {
          await sendMeetingInvitationEmail({
            toEmail: u.email,
            toName: u.name || "Participant",
            organizerName: meeting.organizer.name || "Organizer",
            meetingTitle: meeting.title,
            meetingDate: meetingDateStrForEmail,
            startTime: meeting.startTime,
            endTime: meeting.endTime,
            meetingId: meeting.id,
          });
        } catch (err: any) {
          console.error(`[Add Participant] Error sending invitation email to ${u.email}:`, err?.message || err);
        }
      }
    })();

    const updated = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      include: detailInclude,
    });
    res.json(updated);
  },
);

router.delete(
  "/:id/participants/:participantId",
  requirePermission("meetings:manage_participants", "meetings:edit:all", "meetings:edit:dept", "meetings:edit:own"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, departmentId: true, organizerId: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });

    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "meetings", "edit", {
      departmentId: meeting.departmentId,
      ownerId: meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to manage participants for this meeting outside your ownership scope." });
    }

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

// ---------- Participant RSVP (Accept / Reject invitation with reason) ----------
const rsvpSchema = z.object({
  status: z.enum(["ACCEPTED", "REJECTED", "DECLINED", "INVITED"]),
  rejectionReason: z.string().optional().nullable(),
});

router.patch("/:id/rsvp", async (req: AuthedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    select: { id: true, title: true, organizerId: true, status: true },
  });
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });

  const participant = await prisma.meetingParticipant.findUnique({
    where: {
      meetingId_userId: {
        meetingId: req.params.id,
        userId: req.user.userId,
      },
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, avatarColor: true, role: true },
      },
    },
  });
  if (!participant) {
    return res.status(403).json({ error: "You are not an invited participant for this meeting." });
  }

  const parsed = rsvpSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid RSVP status or payload." });
  }

  const normalizedStatus =
    parsed.data.status === "DECLINED" || parsed.data.status === "REJECTED"
      ? "REJECTED"
      : parsed.data.status;

  const reason =
    normalizedStatus === "REJECTED"
      ? parsed.data.rejectionReason?.trim() || "Due to another meeting"
      : null;

  await prisma.meetingParticipant.update({
    where: { id: participant.id },
    data: {
      status: normalizedStatus,
      rejectionReason: reason,
      respondedAt: new Date(),
    },
  });

  // Notify meeting organizer (in-app)
  if (meeting.organizerId && meeting.organizerId !== req.user.userId) {
    const isRejected = normalizedStatus === "REJECTED";
    await prisma.notification.create({
      data: {
        userId: meeting.organizerId,
        meetingId: meeting.id,
        type: "MEETING_UPDATED",
        title: isRejected ? "Participant Rejected Invitation" : "Participant Accepted Invitation",
        message: isRejected
          ? `${participant.user.name} rejected the invitation to "${meeting.title}": '${reason}'`
          : `${participant.user.name} accepted the invitation to "${meeting.title}".`,
        link: `/meetings/${meeting.id}`,
      },
    });

    // Note: RSVP update uses in-app notification only; email notification omitted to avoid inbox clutter
  }

  const updatedMeeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: detailInclude,
  });
  res.json(updatedMeeting);
});

router.patch("/:id/participants/:participantId/rsvp", async (req: AuthedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    select: { id: true, title: true, organizerId: true, departmentId: true },
  });
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });

  await ensureUserPermissions(req);
  const isOrganizer = meeting.organizerId === req.user.userId;
  const hasAdminOverride = req.userPermissions?.includes("ADMIN_OVERRIDE");
  const canManage =
    isOrganizer ||
    hasAdminOverride ||
    req.userPermissions?.includes("meetings:manage_participants") ||
    req.userPermissions?.includes("meetings:edit:all");

  const participant = await prisma.meetingParticipant.findFirst({
    where: {
      meetingId: req.params.id,
      OR: [{ id: req.params.participantId }, { userId: req.params.participantId }],
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });
  if (!participant) return res.status(404).json({ error: "Participant not found in this meeting." });

  const isSelf = participant.userId === req.user.userId;
  if (!canManage && !isSelf) {
    return res.status(403).json({ error: "You are not authorized to update this participant's RSVP." });
  }

  const parsed = rsvpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid RSVP status or payload." });

  const normalizedStatus =
    parsed.data.status === "DECLINED" || parsed.data.status === "REJECTED"
      ? "REJECTED"
      : parsed.data.status;

  const reason =
    normalizedStatus === "REJECTED"
      ? parsed.data.rejectionReason?.trim() || "Due to another meeting"
      : null;

  await prisma.meetingParticipant.update({
    where: { id: participant.id },
    data: {
      status: normalizedStatus,
      rejectionReason: reason,
      respondedAt: new Date(),
    },
  });

  const updatedMeeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: detailInclude,
  });
  res.json(updatedMeeting);
});

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
      select: { id: true, status: true, departmentId: true, organizerId: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "meetings", "edit", {
      departmentId: meeting.departmentId,
      ownerId: meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to add agenda items to this meeting outside your ownership scope." });
    }

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
      include: { meeting: { select: { status: true, departmentId: true, organizerId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Agenda item not found." });

    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "meetings", "edit", {
      departmentId: existing.meeting.departmentId,
      ownerId: existing.meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to edit this agenda item outside your ownership scope." });
    }

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
      include: { meeting: { select: { status: true, departmentId: true, organizerId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Agenda item not found." });

    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "meetings", "edit", {
      departmentId: existing.meeting.departmentId,
      ownerId: existing.meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to delete this agenda item outside your ownership scope." });
    }

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
      select: { id: true, status: true, departmentId: true, organizerId: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "minutes", "edit", {
      departmentId: meeting.departmentId,
      ownerId: meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to record minutes for this meeting outside your ownership scope." });
    }

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
  requirePermission("minutes:create", "minutes:edit:all", "minutes:edit:dept", "minutes:edit:own"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, departmentId: true, organizerId: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "minutes", "edit", {
      departmentId: meeting.departmentId,
      ownerId: meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to update minutes summary for this meeting outside your ownership scope." });
    }

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
  requirePermission("minutes:create", "minutes:edit:all", "minutes:edit:dept", "minutes:edit:own"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, departmentId: true, organizerId: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    const isOwnAttendee = req.user?.userId === req.params.userId;
    const canManageMeeting = checkOwnershipAccess(req, "minutes", "edit", {
      departmentId: meeting.departmentId,
      ownerId: meeting.organizerId,
    });
    if (!isOwnAttendee && !canManageMeeting) {
      return res.status(403).json({ error: "You do not have permission to edit attendee minutes for this participant outside your ownership scope." });
    }

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
  requirePermission("minutes:edit:all", "minutes:edit:dept", "minutes:edit:own"),
  async (req: AuthedRequest, res) => {
    const meeting = await prisma.meeting.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, departmentId: true, organizerId: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    const isOwnAttendee = req.user?.userId === req.params.userId;
    const canManageMeeting = checkOwnershipAccess(req, "minutes", "edit", {
      departmentId: meeting.departmentId,
      ownerId: meeting.organizerId,
    });
    if (!isOwnAttendee && !canManageMeeting) {
      return res.status(403).json({ error: "You do not have permission to clear attendee minutes for this participant outside your ownership scope." });
    }

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
  requirePermission("minutes:edit:all", "minutes:edit:dept", "minutes:edit:own"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.meetingMinutes.findFirst({
      where: { id: req.params.minuteId, meetingId: req.params.id },
      include: { meeting: { select: { id: true, status: true, departmentId: true, organizerId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Minutes not found." });
    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "minutes", "edit", {
      departmentId: existing.meeting.departmentId,
      ownerId: existing.recordedById || existing.meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to edit these minutes outside your ownership scope." });
    }

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
  requirePermission("minutes:edit:all", "minutes:edit:dept", "minutes:edit:own"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.meetingMinutes.findUnique({
      where: { id: req.params.minuteId },
      include: { meeting: { select: { id: true, status: true, departmentId: true, organizerId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Minutes not found." });
    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "minutes", "edit", {
      departmentId: existing.meeting.departmentId,
      ownerId: existing.recordedById || existing.meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to edit these minutes outside your ownership scope." });
    }

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
  requirePermission("minutes:edit:all", "minutes:edit:dept", "minutes:edit:own"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.meetingMinutes.findFirst({
      where: { id: req.params.minuteId, meetingId: req.params.id },
      include: { meeting: { select: { id: true, status: true, departmentId: true, organizerId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Minutes not found." });
    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "minutes", "edit", {
      departmentId: existing.meeting.departmentId,
      ownerId: existing.recordedById || existing.meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to delete these minutes outside your ownership scope." });
    }

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
      select: { id: true, status: true, departmentId: true, organizerId: true },
    });
    if (!meeting) return res.status(404).json({ error: "Meeting not found." });
    const lockError = checkMeetingLock(meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (
      !checkOwnershipAccess(req, "decisions", "create", {
        departmentId: meeting.departmentId,
        ownerId: meeting.organizerId,
      }) &&
      !checkOwnershipAccess(req, "meetings", "edit", {
        departmentId: meeting.departmentId,
        ownerId: meeting.organizerId,
      })
    ) {
      return res.status(403).json({ error: "You do not have permission to record decisions for this meeting outside your ownership scope." });
    }

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
  requirePermission("decisions:edit:all", "decisions:edit:dept", "decisions:edit:own"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.decision.findUnique({
      where: { id: req.params.decisionId },
      include: { meeting: { select: { status: true, departmentId: true, organizerId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Decision not found." });
    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "decisions", "edit", {
      departmentId: existing.meeting.departmentId,
      ownerId: existing.meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to edit this decision outside your ownership scope." });
    }

    const schema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
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

router.put(
  "/:id/decisions/:decisionId",
  requirePermission("decisions:edit:all", "decisions:edit:dept", "decisions:edit:own"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.decision.findFirst({
      where: { id: req.params.decisionId, meetingId: req.params.id },
      include: { meeting: { select: { status: true, departmentId: true, organizerId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Decision not found." });
    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "decisions", "edit", {
      departmentId: existing.meeting.departmentId,
      ownerId: existing.meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to edit this decision outside your ownership scope." });
    }

    const schema = z.object({
      title: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      status: z.enum(DECISION_STATUSES).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "Invalid decision update." });
    try {
      const decision = await prisma.decision.update({
        where: { id: existing.id },
        data: parsed.data,
      });
      res.json(decision);
    } catch {
      res.status(404).json({ error: "Decision not found." });
    }
  },
);

router.delete(
  "/decisions/:decisionId",
  requirePermission("decisions:delete:all", "decisions:delete:dept", "decisions:delete:own"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.decision.findUnique({
      where: { id: req.params.decisionId },
      include: { meeting: { select: { id: true, status: true, departmentId: true, organizerId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Decision not found." });
    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "decisions", "delete", {
      departmentId: existing.meeting.departmentId,
      ownerId: existing.meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to delete this decision outside your ownership scope." });
    }

    // Disconnect action items from this decision before deleting
    await prisma.actionItem.updateMany({
      where: { decisionId: existing.id },
      data: { decisionId: null },
    });

    await prisma.decision.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  },
);

router.delete(
  "/:id/decisions/:decisionId",
  requirePermission("decisions:delete:all", "decisions:delete:dept", "decisions:delete:own"),
  async (req: AuthedRequest, res) => {
    const existing = await prisma.decision.findFirst({
      where: { id: req.params.decisionId, meetingId: req.params.id },
      include: { meeting: { select: { id: true, status: true, departmentId: true, organizerId: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Decision not found." });
    const lockError = checkMeetingLock(existing.meeting, req);
    if (lockError) return res.status(403).json({ error: lockError });

    await ensureUserPermissions(req);
    if (!checkOwnershipAccess(req, "decisions", "delete", {
      departmentId: existing.meeting.departmentId,
      ownerId: existing.meeting.organizerId,
    })) {
      return res.status(403).json({ error: "You do not have permission to delete this decision outside your ownership scope." });
    }

    await prisma.actionItem.updateMany({
      where: { decisionId: existing.id },
      data: { decisionId: null },
    });

    await prisma.decision.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  },
);

export default router;
