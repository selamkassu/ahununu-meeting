import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { isOverdue } from "../utils/enums";
import { ensureUserPermissions, getOwnershipTier } from "../utils/ownership";

const router = Router();
router.use(requireAuth);

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

router.get("/stats", async (req: AuthedRequest, res) => {
  try {
    const now = new Date();
    const today0 = startOfDay(now);
    const today1 = endOfDay(now);

    await ensureUserPermissions(req);
    const hasAdminOverride = req.userPermissions?.includes("ADMIN_OVERRIDE") ?? false;

    // 3-Tier Meeting Scope
    const meetingTier = getOwnershipTier(req.userPermissions, "meetings", "view", hasAdminOverride);
    const baseMeetingWhere: any = {};
    if (meetingTier === "dept" && req.user?.departmentId) {
      baseMeetingWhere.departmentId = req.user.departmentId;
    } else if (meetingTier === "own" && req.user) {
      baseMeetingWhere.OR = [
        { organizerId: req.user.userId },
        { participants: { some: { userId: req.user.userId } } },
      ];
    }

    // 3-Tier Action Item Scope
    const actionTier = getOwnershipTier(req.userPermissions, "action_items", "view", hasAdminOverride);
    const baseActionWhere: any = {};
    if (actionTier === "dept" && req.user?.departmentId) {
      baseActionWhere.departmentId = req.user.departmentId;
    } else if (actionTier === "own" && req.user) {
      baseActionWhere.OR = [
        { assignedToId: req.user.userId },
        { assignees: { some: { userId: req.user.userId } } },
      ];
    }

    // 3-Tier Decision Scope
    const decisionTier = getOwnershipTier(req.userPermissions, "decisions", "view", hasAdminOverride);
    const baseDecisionWhere: any = { status: "OPEN" };
    if (decisionTier === "dept" && req.user?.departmentId) {
      baseDecisionWhere.meeting = { departmentId: req.user.departmentId };
    } else if (decisionTier === "own" && req.user) {
      baseDecisionWhere.meeting = {
        OR: [
          { organizerId: req.user.userId },
          { participants: { some: { userId: req.user.userId } } },
        ],
      };
    }

    const [
      totalMeetings,
      todaysMeetings,
      upcomingMeetings,
      completedMeetings,
      allActionItems,
      pendingDecisions,
      departments,
      meetingsForMonthly,
    ] = await Promise.all([
      prisma.meeting.count({ where: baseMeetingWhere }),
      prisma.meeting.count({ where: { ...baseMeetingWhere, date: { gte: today0, lte: today1 } } }),
      prisma.meeting.count({ where: { ...baseMeetingWhere, date: { gt: today1 }, status: "SCHEDULED" } }),
      prisma.meeting.count({ where: { ...baseMeetingWhere, status: "COMPLETED" } }),
      prisma.actionItem.findMany({
        where: baseActionWhere,
        include: {
          assignedTo: { select: { id: true, name: true, avatarColor: true } },
          assignees: {
            include: {
              user: { select: { id: true, name: true, avatarColor: true, email: true } },
            },
          },
          department: { select: { id: true, name: true } },
          meeting: { select: { id: true, title: true, code: true } },
        },
      }),
      prisma.decision.count({ where: baseDecisionWhere }),
      prisma.department.findMany({ where: { isActive: true } }),
      prisma.meeting.findMany({ where: baseMeetingWhere, select: { date: true, status: true } }),
    ]);

  const actionItemsTyped = allActionItems as any[];
  const departmentsTyped = departments as any[];
  const meetingsTyped = meetingsForMonthly as any[];

  const shapedActions = actionItemsTyped.map((a) => {
    const assigneesList = (a.assignees || []).map((x: any) => x.user).filter(Boolean);
    if (assigneesList.length === 0 && a.assignedTo) assigneesList.push(a.assignedTo);
    return {
      ...a,
      assignedTo: a.assignedTo || assigneesList[0] || { id: "", name: "Unassigned", avatarColor: "#005f56" },
      assignees: assigneesList,
      overdue: isOverdue(a.status, a.deadline),
    };
  });
  const pendingActionItems = shapedActions.filter((a) => a.status === "PENDING" || a.status === "IN_PROGRESS").length;
  const overdueActionItems = shapedActions.filter((a) => a.overdue).length;
  const completedActionItems = shapedActions.filter((a) => a.status === "COMPLETED").length;

  // Monthly meetings — trailing 6 months
  const monthly: { month: string; count: number; completed: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = ref.toLocaleString("en-US", { month: "short" });
    const inMonth = meetingsTyped.filter(
      (m) => m.date.getFullYear() === ref.getFullYear() && m.date.getMonth() === ref.getMonth()
    );
    monthly.push({ month: label, count: inMonth.length, completed: inMonth.filter((m) => m.status === "COMPLETED").length });
  }

  // Action item status distribution
  const statusBuckets = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((status) => ({
    status,
    count: shapedActions.filter((a) => a.status === status).length,
  }));

  // Department performance: completion rate of action items per department
  const departmentPerformance = departmentsTyped.map((d) => {
    const items = shapedActions.filter((a) => a.departmentId === d.id);
    const completed = items.filter((a) => a.status === "COMPLETED").length;
    return {
      department: d.name,
      total: items.length,
      completed,
      overdue: items.filter((a) => a.overdue).length,
      completionRate: items.length ? Math.round((completed / items.length) * 100) : 0,
    };
  });

  // Meeting completion rate overall
  const meetingCompletionRate = totalMeetings ? Math.round((completedMeetings / totalMeetings) * 100) : 0;

  // Action & Accountability feed — sorted so overdue + due-soonest float to top
  const accountability = shapedActions
    .filter((a) => a.status !== "CANCELLED")
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    })
    .slice(0, 25);

    res.json({
      cards: {
        totalMeetings,
        todaysMeetings,
        upcomingMeetings,
        completedMeetings,
        pendingActionItems,
        overdueActionItems,
        completedActionItems,
        pendingDecisions,
      },
      charts: {
        monthlyMeetings: monthly,
        actionItemStatus: statusBuckets,
        departmentPerformance,
        meetingCompletionRate,
      },
      accountability,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ error: "Failed to load dashboard stats." });
  }
});

export default router;
