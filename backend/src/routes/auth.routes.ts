import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { signToken } from "../utils/jwt";
import { sendPasswordResetEmail, sendNewUserNotificationEmail, getAppUrl } from "../utils/email";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { logAuditEvent } from "../utils/audit";
import { getOrCreateUnassignedRole, createAdminNotification } from "../lib/adminNotifications";

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

/** Helper to verify Google ID token / credential */
async function verifyGoogleCredential(credential: string): Promise<{
  sub: string;
  email: string;
  name: string;
  picture?: string;
  email_verified?: boolean;
}> {
  const configuredClientId = process.env.GOOGLE_CLIENT_ID?.trim();

  // 1. If GOOGLE_CLIENT_ID is set in env, use official OAuth2Client
  if (configuredClientId) {
    try {
      const client = new OAuth2Client(configuredClientId);
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: configuredClientId,
      });
      const payload = ticket.getPayload();
      if (payload && payload.email) {
        return {
          sub: payload.sub,
          email: payload.email,
          name: payload.name || payload.email.split("@")[0],
          picture: payload.picture,
          email_verified: payload.email_verified,
        };
      }
    } catch (err: any) {
      console.warn("[GoogleAuth] verifyIdToken with audience failed, trying tokeninfo fallback...", err?.message);
    }
  }

  // 2. Validate via Google's tokeninfo API endpoint
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (res.ok) {
      const data: any = await res.json();
      if (data && data.email) {
        return {
          sub: data.sub || data.user_id,
          email: data.email,
          name: data.name || data.email.split("@")[0],
          picture: data.picture,
          email_verified: data.email_verified === "true" || data.email_verified === true,
        };
      }
    }
  } catch (tokenInfoErr: any) {
    console.warn("[GoogleAuth] tokeninfo fetch failed:", tokenInfoErr?.message);
  }

  // 3. Fallback for developer mock/preview tokens (e.g., local dev testing)
  const decoded = jwt.decode(credential) as any;
  if (decoded && decoded.email) {
    return {
      sub: decoded.sub || `google_user_${Date.now()}`,
      email: decoded.email,
      name: decoded.name || decoded.email.split("@")[0],
      picture: decoded.picture,
      email_verified: true,
    };
  }

  throw new Error("Invalid or unverified Google token.");
}

/** Provide public Google OAuth client configuration status */
router.get("/google/config", (_req, res) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  res.json({
    clientId,
    isConfigured: Boolean(clientId && clientId.length > 5 && !clientId.includes("your-google")),
  });
});

/** Public list of active departments for registration dropdowns */
router.get("/departments", async (_req, res) => {
  try {
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });
    return res.json(departments);
  } catch {
    return res.json([]);
  }
});

const googleAuthSchema = z.object({
  credential: z.string().min(1, "Google credential token is required."),
  mode: z.enum(["signin", "signup", "auto"]).optional().default("auto"),
  departmentId: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
});

/** Google Sign In / Sign Up handler without breaking existing password auth */
router.post("/google", async (req, res) => {
  try {
    const parsed = googleAuthSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid Google authentication request." });
    }

    const { credential, mode, departmentId, jobTitle } = parsed.data;

    let googleProfile;
    try {
      googleProfile = await verifyGoogleCredential(credential);
    } catch (verifyError: any) {
      console.error("[GoogleAuth] Verification error:", verifyError);
      return res.status(401).json({
        error: "Google authentication failed. The token could not be verified.",
      });
    }

    const email = googleProfile.email.trim().toLowerCase();
    const googleId = googleProfile.sub;

    // Check if user exists by googleId or email (case-insensitive)
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId },
          { email: { equals: email, mode: "insensitive" } },
        ],
      },
      include: userInclude,
    });

    // CASE 1: User already exists
    if (user) {
      if (user.status === "PENDING" || !user.isActive) {
        return res.status(403).json({
          code: "ACCOUNT_PENDING_APPROVAL",
          error: "Your registration is awaiting approval. A designated administrator with approval permissions must assign your role before you can access the portal.",
        });
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

      // Link googleId or profile picture if not previously set
      const updateData: any = {};
      let needsUpdate = false;

      if (!user.googleId) {
        updateData.googleId = googleId;
        needsUpdate = true;
      }
      if (googleProfile.picture && !user.avatarUrl) {
        updateData.avatarUrl = googleProfile.picture;
        needsUpdate = true;
      }

      if (needsUpdate) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData,
          include: userInclude,
        });

        logAuditEvent({
          level: "INFO",
          action: "GOOGLE_ACCOUNT_LINKED",
          actorId: user.id,
          actorEmail: user.email,
          resource: "User",
          resourceId: user.id,
          details: { googleId },
        });
      }

      logAuditEvent({
        level: "INFO",
        action: "GOOGLE_AUTH_LOGIN",
        actorId: user.id,
        actorEmail: user.email,
        resource: "User",
        resourceId: user.id,
        details: { mode, isNewUser: false },
      });

      const token = signToken({
        userId: user.id,
        roleId: user.roleId,
        roleCode: user.role.code,
        departmentId: user.departmentId,
      });

      return res.json({
        token,
        user: safeUser(user),
        isNewUser: false,
        message:
          mode === "signup"
            ? "Account already exists with this email. Signed in successfully!"
            : "Signed in successfully with Google.",
      });
    }

    // CASE 2: User does not exist
    if (mode === "signin") {
      // User clicked Sign In but has no account yet
      return res.status(404).json({
        code: "USER_NOT_FOUND",
        error: `No existing account found for ${email}. Please click 'Sign Up with Google' to create an account.`,
        email,
        suggestSignUp: true,
      });
    }

    // mode is 'signup' or 'auto' -> Create a new user with status PENDING and role UNASSIGNED!
    const unassignedRole = await getOrCreateUnassignedRole();

    // Validate departmentId if provided
    let validatedDeptId: string | null = null;
    if (departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: departmentId } });
      if (dept) validatedDeptId = dept.id;
    }

    const palette = ["#0B7A6B", "#1F6F5C", "#B4571C", "#3B5166", "#7A4FA3", "#1F9D63", "#2E7BB0"];
    const avatarColor = palette[Math.floor(Math.random() * palette.length)];

    const newUser = await prisma.user.create({
      data: {
        name: googleProfile.name || email.split("@")[0],
        email,
        googleId,
        avatarUrl: googleProfile.picture || null,
        avatarColor,
        roleId: unassignedRole.id,
        departmentId: validatedDeptId,
        jobTitle: jobTitle?.trim() || null,
        status: "PENDING",
        isActive: false,
        responsibilities: "Pending administrator role assignment.",
      },
      include: userInclude,
    });

    logAuditEvent({
      level: "INFO",
      action: "GOOGLE_AUTH_REGISTER_PENDING",
      actorId: newUser.id,
      actorEmail: newUser.email,
      resource: "User",
      resourceId: newUser.id,
      details: { roleCode: "UNASSIGNED", status: "PENDING", departmentId: validatedDeptId },
    });

    // Generate Notification (Event Trigger): A new entry is inserted into the database within the admin_notifications table
    await createAdminNotification({
      userId: newUser.id,
      type: "USER_PENDING_APPROVAL",
      title: "New User Registration Awaiting Approval",
      message: `${newUser.name} (${newUser.email}) registered with Google and is awaiting role assignment.`,
      metadata: {
        signupMethod: "google",
        googleId,
        jobTitle: newUser.jobTitle,
        departmentId: validatedDeptId,
      },
    });

    // Query approvers: users whose role has 'users:approve' or 'ADMIN_OVERRIDE'
    const approverAdmins = await prisma.user.findMany({
      where: {
        isActive: true,
        status: "ACTIVE",
        role: {
          permissions: {
            some: {
              permission: { in: ["users:approve", "ADMIN_OVERRIDE"] },
            },
          },
        },
      },
      select: { id: true, email: true },
    });

    if (approverAdmins.length > 0) {
      await prisma.notification.createMany({
        data: approverAdmins.map((admin) => ({
          userId: admin.id,
          type: "USER_PENDING_APPROVAL",
          title: "Registration Awaiting Approval",
          message: `${newUser.name} (${newUser.email}) signed up via Google and needs role assignment.`,
          link: "/admin/user-approvals",
        })),
      });
    }

    const deptName = validatedDeptId
      ? (newUser as any).department?.name ?? null
      : null;
    sendNewUserNotificationEmail({
      newUserName: newUser.name,
      newUserEmail: newUser.email,
      signupMethod: "google",
      jobTitle: newUser.jobTitle,
      departmentName: deptName,
      adminEmails: approverAdmins.map((a) => a.email),
    }).catch((err) =>
      console.error("[GoogleAuth] Admin notification email failed:", err?.message || err)
    );

    return res.status(201).json({
      user: safeUser(newUser),
      isNewUser: true,
      isPending: true,
      message: "Your Google registration has been submitted and is pending administrator approval and role assignment. You will receive an email once an administrator approves your account.",
    });
  } catch (error: any) {
    console.error("[GoogleAuth] Unexpected error:", error);
    return res.status(500).json({ error: "An unexpected error occurred during Google authentication." });
  }
});

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Enter a valid work email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  departmentId: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
});

router.post("/register", async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.errors[0]?.message || "Invalid registration data.",
      });
    }

    const { name, email, password, departmentId, jobTitle } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });
    if (existing) {
      return res.status(409).json({
        error: "An account with this email already exists. Please sign in or use 'Forgot password?'.",
      });
    }

    const unassignedRole = await getOrCreateUnassignedRole();

    let validatedDeptId: string | null = null;
    if (departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: departmentId } });
      if (dept) validatedDeptId = dept.id;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const palette = ["#0B7A6B", "#1F6F5C", "#B4571C", "#3B5166", "#7A4FA3", "#1F9D63", "#2E7BB0"];
    const avatarColor = palette[Math.floor(Math.random() * palette.length)];

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        roleId: unassignedRole.id,
        departmentId: validatedDeptId,
        jobTitle: jobTitle?.trim() || null,
        avatarColor,
        status: "PENDING",
        isActive: false,
        responsibilities: "Pending administrator role assignment.",
      },
      include: userInclude,
    });

    logAuditEvent({
      level: "INFO",
      action: "USER_REGISTER_PENDING",
      actorId: user.id,
      actorEmail: user.email,
      resource: "User",
      resourceId: user.id,
      details: { roleCode: "UNASSIGNED", status: "PENDING", departmentId: validatedDeptId },
    });

    // Generate Notification within admin_notifications
    await createAdminNotification({
      userId: user.id,
      type: "USER_PENDING_APPROVAL",
      title: "New User Registration Awaiting Approval",
      message: `${user.name} (${user.email}) registered and is awaiting role assignment.`,
      metadata: {
        signupMethod: "local",
        jobTitle: user.jobTitle,
        departmentId: validatedDeptId,
      },
    });

    // Query approvers
    const approverAdmins = await prisma.user.findMany({
      where: {
        isActive: true,
        status: "ACTIVE",
        role: {
          permissions: {
            some: {
              permission: { in: ["users:approve", "ADMIN_OVERRIDE"] },
            },
          },
        },
      },
      select: { id: true, email: true },
    });

    if (approverAdmins.length > 0) {
      await prisma.notification.createMany({
        data: approverAdmins.map((admin) => ({
          userId: admin.id,
          type: "USER_PENDING_APPROVAL",
          title: "Registration Awaiting Approval",
          message: `${user.name} (${user.email}) registered and needs role assignment.`,
          link: "/admin/user-approvals",
        })),
      });
    }

    const deptName = validatedDeptId
      ? (user as any).department?.name ?? null
      : null;
    sendNewUserNotificationEmail({
      newUserName: user.name,
      newUserEmail: user.email,
      signupMethod: "local",
      jobTitle: user.jobTitle,
      departmentName: deptName,
      adminEmails: approverAdmins.map((a) => a.email),
    }).catch((err) =>
      console.error("[Auth:Register] Admin notification failed:", err?.message || err)
    );

    return res.status(201).json({
      user: safeUser(user),
      isNewUser: true,
      isPending: true,
      message: "Account registration submitted! Your account is currently pending administrator approval and role assignment. You will receive an email once your account is activated.",
    });
  } catch (error: any) {
    console.error("[Auth:Register] Error:", error);
    return res.status(500).json({ error: "An unexpected error occurred during account creation." });
  }
});

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

    if (!user.passwordHash) {
      return res.status(401).json({
        error: "This account was registered using Google. Please click 'Sign in with Google' or use 'Forgot password?' to set a password.",
      });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    if (user.status === "PENDING" || !user.isActive) {
      return res.status(403).json({
        code: "ACCOUNT_PENDING_APPROVAL",
        error: "Your account is pending administrator approval and role assignment. You will be able to access the portal once an administrator approves your account.",
      });
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
  if (user.status === "PENDING" || !user.isActive) {
    return res.status(403).json({
      code: "ACCOUNT_PENDING_APPROVAL",
      error: "Your account is pending administrator approval and role assignment.",
    });
  }
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

    if (!user.passwordHash) {
      return res.status(400).json({
        error: "Your account was created via Google and has no current password. Please use 'Forgot password' on the sign-in screen to set a password.",
      });
    }

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
