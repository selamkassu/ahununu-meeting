import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission } from "../middleware/auth";
import { PERMISSIONS, PERMISSION_GROUPS, PERMISSION_LABELS } from "../utils/enums";

const router = Router();
router.use(requireAuth);

// ---------- Get static permissions catalog ----------
router.get("/permissions", async (_req, res) => {
  res.json({
    permissions: PERMISSIONS,
    groups: PERMISSION_GROUPS,
    labels: PERMISSION_LABELS,
  });
});

// ---------- List all roles ----------
router.get("/", async (_req, res) => {
  const roles = await prisma.role.findMany({
    include: {
      permissions: { select: { permission: true } },
      _count: { select: { users: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  const shaped = roles.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    description: r.description,
    isSystem: r.isSystem,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    permissions: r.permissions.map((p) => p.permission),
    userCount: r._count.users,
  }));

  res.json(shaped);
});

// ---------- Get single role ----------
router.get("/:id", async (req, res) => {
  const role = await prisma.role.findUnique({
    where: { id: req.params.id },
    include: {
      permissions: { select: { permission: true } },
      _count: { select: { users: true } },
    },
  });
  if (!role) return res.status(404).json({ error: "Role not found." });

  res.json({
    id: role.id,
    name: role.name,
    code: role.code,
    description: role.description,
    isSystem: role.isSystem,
    isActive: role.isActive,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
    permissions: role.permissions.map((p) => p.permission),
    userCount: role._count.users,
  });
});

// ---------- Create role ----------
const createSchema = z.object({
  name: z.string().min(2, "Role name must be at least 2 characters."),
  code: z.string().min(2).max(30).regex(/^[A-Z][A-Z0-9_]*$/, "Code must be uppercase alphanumeric with underscores, e.g. DISPATCHER"),
  description: z.string().optional().nullable(),
  permissions: z.array(z.string()).min(1, "At least one permission is required."),
});

router.post("/", requirePermission("roles:create"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Check the role name, code (uppercase), and select at least one permission.",
      details: parsed.error.format(),
    });
  }

  const { name, code, description, permissions } = parsed.data;

  // Validate permissions are from the catalog
  const invalidPerms = permissions.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
  if (invalidPerms.length > 0) {
    return res.status(400).json({ error: `Invalid permissions: ${invalidPerms.join(", ")}` });
  }

  try {
    const role = await prisma.role.create({
      data: {
        name,
        code,
        description: description || null,
        isSystem: false,
        permissions: {
          create: permissions.map((p) => ({ permission: p })),
        },
      },
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { users: true } },
      },
    });

    res.status(201).json({
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      isSystem: role.isSystem,
      isActive: role.isActive,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: role.permissions.map((p) => p.permission),
      userCount: role._count.users,
    });
  } catch (e: any) {
    if (e.code === "P2002") {
      return res.status(409).json({ error: "A role with that name or code already exists." });
    }
    throw e;
  }
});

// ---------- Update role ----------
const updateSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  permissions: z.array(z.string()).min(1, "At least one permission is required.").optional(),
  isActive: z.boolean().optional(),
});

router.put("/:id", requirePermission("roles:edit"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid role update data.", details: parsed.error.format() });
  }

  const { name, description, permissions, isActive } = parsed.data;

  // Validate permissions if provided
  if (permissions) {
    const invalidPerms = permissions.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
    if (invalidPerms.length > 0) {
      return res.status(400).json({ error: `Invalid permissions: ${invalidPerms.join(", ")}` });
    }
  }

  try {
    const existing = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: "Role not found." });

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    // If permissions provided, delete-and-recreate
    if (permissions) {
      await prisma.rolePermission.deleteMany({ where: { roleId: req.params.id } });
      await prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId: req.params.id, permission: p })),
      });
    }

    const role = await prisma.role.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { users: true } },
      },
    });

    res.json({
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      isSystem: role.isSystem,
      isActive: role.isActive,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: role.permissions.map((p) => p.permission),
      userCount: role._count.users,
    });
  } catch (e: any) {
    if (e.code === "P2002") {
      return res.status(409).json({ error: "A role with that name already exists." });
    }
    res.status(404).json({ error: "Role not found." });
  }
});

// ---------- Delete role ----------
router.delete("/:id", requirePermission("roles:delete"), async (req, res) => {
  const role = await prisma.role.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return res.status(404).json({ error: "Role not found." });
  if (role._count.users > 0) {
    return res.status(409).json({
      error: `This role is assigned to ${role._count.users} user(s). Reassign them to a different role first.`,
    });
  }

  await prisma.role.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
