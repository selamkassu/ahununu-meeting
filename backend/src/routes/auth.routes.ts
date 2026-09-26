import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signToken } from "../utils/jwt";
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

export default router;
