import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import {
  getEmailProviderStatus,
  sendDiagnosticTestEmail,
} from "../utils/email";

const router = Router();
router.use(requireAuth);

// ---------- GET /notifications/email-status — diagnostic info on active email provider ----------
router.get("/email-status", async (_req: AuthedRequest, res) => {
  try {
    const status = getEmailProviderStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to determine email service status." });
  }
});

// ---------- POST /notifications/test-email — dispatch a live test notification ----------
router.post("/test-email", async (req: AuthedRequest, res) => {
  try {
    let toEmail = req.body?.toEmail?.trim();

    if (!toEmail) {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { email: true },
      });
      toEmail = user?.email;
    }

    if (!toEmail) {
      return res.status(400).json({ error: "No recipient email address provided." });
    }

    // Basic email format validation
    if (!toEmail.includes("@") || !toEmail.includes(".")) {
      return res.status(400).json({ error: "Please provide a valid recipient email address." });
    }

    const result = await sendDiagnosticTestEmail(toEmail);
    const status = getEmailProviderStatus();

    if (!result.success) {
      return res.status(502).json({
        ok: false,
        error: result.error || "Failed to deliver test email.",
        provider: result.provider,
        status,
      });
    }

    return res.json({
      ok: true,
      message: `Test email successfully delivered to ${toEmail}!`,
      provider: result.provider,
      messageId: result.messageId,
      status,
    });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Internal server error while dispatching test email.",
    });
  }
});

// ---------- GET /notifications — fetch the current user's notifications ----------
router.get("/", async (req: AuthedRequest, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        userId: true,
        type: true,
        title: true,
        message: true,
        link: true,
        isRead: true,
        meetingId: true,
        createdAt: true,
      },
    });
    res.json(notifications);
  } catch {
    res.status(500).json({ error: "Failed to fetch notifications." });
  }
});

// ---------- GET /notifications/unread-count — lightweight badge polling ----------
router.get("/unread-count", async (req: AuthedRequest, res) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.userId, isRead: false },
    });
    res.json({ count });
  } catch {
    res.status(500).json({ error: "Failed to fetch unread count." });
  }
});

// ---------- PATCH /notifications/read-all — mark ALL unread as read ----------
// IMPORTANT: This route MUST be declared before /:id/read, otherwise Express
// matches the literal "read-all" string as the :id parameter.
router.patch("/read-all", async (req: AuthedRequest, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to mark all notifications as read." });
  }
});

// ---------- PATCH /notifications/:id/read — mark a single notification as read ----------
router.patch("/:id/read", async (req: AuthedRequest, res) => {
  try {
    // Ownership check: only the recipient can mark their own notification as read
    const existing = await prisma.notification.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Notification not found." });
    }

    if (existing.userId !== req.user!.userId) {
      return res.status(403).json({ error: "You can only mark your own notifications as read." });
    }

    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json(updated);
  } catch {
    res.status(404).json({ error: "Notification not found." });
  }
});

// ---------- DELETE /notifications — clear all read notifications ----------
router.delete("/", async (req: AuthedRequest, res) => {
  try {
    await prisma.notification.deleteMany({
      where: { userId: req.user!.userId, isRead: true },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to clear notifications." });
  }
});

// ---------- DELETE /notifications/:id — delete a single notification ----------
router.delete("/:id", async (req: AuthedRequest, res) => {
  try {
    const existing = await prisma.notification.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true },
    });

    if (!existing) {
      return res.status(404).json({ error: "Notification not found." });
    }

    if (existing.userId !== req.user!.userId) {
      return res.status(403).json({ error: "You can only delete your own notifications." });
    }

    await prisma.notification.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete notification." });
  }
});

export default router;
