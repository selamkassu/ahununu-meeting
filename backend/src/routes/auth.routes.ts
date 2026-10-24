import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import jwt from "jsonwebtoken";
import { signToken } from "../utils/jwt";
import { sendPasswordResetEmail, getAppUrl } from "../utils/email";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();

/** Include block to always return role + permissions with user data */
const userInclude = {
  department: true,
  role: {
    include: {
      permissions: { select: { permission: true } },
    },
  },
};

/** Shape a user record for the API response (omit passwordHash, flatten role permissions) */
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

const loginSchema = z.object({
  email: z.string().optional(),
  username: z.string().optional(),
  password: z.string().min(1, "Password is required"),
});

router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Enter a valid work email and password." });
    }
    const { password } = parsed.data;
    const identifier = (parsed.data.email || parsed.data.username || "").trim();

    if (!identifier) {
      return res.status(400).json({ error: "Enter a valid work email and password." });
    }

    const user = await prisma.user.findFirst({
      where: identifier.includes("@")
        ? { email: { equals: identifier.toLowerCase(), mode: "insensitive" } }
        : {
            OR: [
              { email: { equals: identifier.toLowerCase(), mode: "insensitive" } },
              { name: { equals: identifier, mode: "insensitive" } },
            ],
          },
      include: userInclude,
    });

    if (!user) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    if (user.status === "SUSPENDED") {
      return res.status(403).json({
        error: "Your account has been temporarily suspended. Please contact your System Administrator.",
      });
    }

    if (user.status === "DEACTIVATED") {
      return res.status(403).json({
        error: "Your account has been deactivated. Please contact your System Administrator.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        error: "Your account is not active. Please contact your System Administrator.",
      });
    }

    const token = signToken({
      userId: user.id,
      roleId: user.roleId,
      roleCode: user.role.code,
      departmentId: user.departmentId,
    });
    return res.json({ token, user: safeUser(user) });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "An unexpected error occurred during authentication." });
  }
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: userInclude,
  });
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json(safeUser(user));
});

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").optional(),
  phone: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  avatarColor: z.string().optional(),
});

router.put("/profile", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid profile data." });
    }

    const userId = req.user!.userId;
    const { name, phone, jobTitle, avatarColor } = parsed.data;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(phone !== undefined && { phone: phone ? phone.trim() : null }),
        ...(jobTitle !== undefined && { jobTitle: jobTitle ? jobTitle.trim() : null }),
        ...(avatarColor !== undefined && { avatarColor: avatarColor.trim() }),
      },
      include: userInclude,
    });

    return res.json({ user: safeUser(updated), message: "Profile updated successfully." });
  } catch (error: any) {
    console.error("Profile update error:", error);
    return res.status(500).json({ error: "Failed to update profile." });
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string().min(6, "New password must be at least 6 characters long."),
});

router.put("/change-password", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input." });
    }

    const userId = req.user!.userId;
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: "User not found." });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return res.json({ message: "Password updated successfully." });
  } catch (error: any) {
    console.error("Change password error:", error);
    return res.status(500).json({ error: "Failed to change password." });
  }
});


const forgotPasswordSchema = z.object({
  email: z.string().email("Enter a valid work email address."),
});

router.post("/forgot-password", async (req, res) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Enter a valid work email address." });
    }

    const { email } = parsed.data;
    const user = await prisma.user.findFirst({
      where: {
        email: { equals: email.trim().toLowerCase(), mode: "insensitive" },
      },
    });

    if (!user || !user.isActive || user.status !== "ACTIVE") {
      return res.json({
        message: "If an active account is associated with that email, a password reset link has been dispatched.",
      });
    }

    const secret = process.env.JWT_SECRET || "your-secret-key-change-this-in-production";
    const resetToken = jwt.sign(
      { userId: user.id, email: user.email, type: "password_reset" },
      secret,
      { expiresIn: "1h" }
    );

    const resetUrl = `${getAppUrl()}/reset-password?token=${encodeURIComponent(resetToken)}`;

    sendPasswordResetEmail({
      toEmail: user.email,
      userName: user.name,
      resetUrl,
    }).catch((err) => {
      console.error("[Email:ForgotPassword] Failed to dispatch reset email:", err);
    });

    return res.json({
      message: "A password reset link has been sent to your work email. Please check your inbox.",
    });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ error: "Failed to process password reset request." });
  }
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required."),
  newPassword: z.string().min(6, "Password must be at least 6 characters long."),
});

router.post("/reset-password", async (req, res) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid input." });
    }

    const { token, newPassword } = parsed.data;
    const secret = process.env.JWT_SECRET || "your-secret-key-change-this-in-production";

    let payload: any;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      return res.status(400).json({ error: "The password reset link is invalid or has expired. Please request a new one." });
    }

    if (payload.type !== "password_reset" || !payload.userId) {
      return res.status(400).json({ error: "Invalid password reset token." });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return res.json({ message: "Your password has been successfully reset. You can now sign in." });
  } catch (error: any) {
    console.error("Reset password error:", error);
    return res.status(500).json({ error: "Failed to reset password." });
  }
});

export default router;
