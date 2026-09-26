import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission } from "../middleware/auth";
import { USER_STATUSES } from "../utils/enums";

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

  const { password, status, isActive, ...rest } = parsed.data;
  const dataToUpdate: any = { ...rest };

  if (password) {
    dataToUpdate.passwordHash = await bcrypt.hash(password, 10);
  }

  // Validate roleId if provided
  if (rest.roleId) {
    const roleExists = await prisma.role.findUnique({ where: { id: rest.roleId } });
    if (!roleExists) {
      return res.status(400).json({ error: "Selected role does not exist." });
    }
  }

  if (status !== undefined) {
    dataToUpdate.status = status;
    dataToUpdate.isActive = status === "ACTIVE";
  } else if (isActive !== undefined) {
    dataToUpdate.isActive = isActive;
    dataToUpdate.status = isActive ? "ACTIVE" : "SUSPENDED";
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

export default router;
