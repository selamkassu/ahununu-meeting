import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requirePermission } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const HEAD_INCLUDE = {
  head: {
    select: { id: true, name: true, email: true, jobTitle: true, avatarColor: true },
  },
  _count: { select: { users: true, meetings: true } },
} as const;

router.get("/", async (_req, res) => {
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    include: HEAD_INCLUDE,
  });
  res.json(departments);
});

const upsertSchema = z.object({
  name: z.string().min(2, "Department name must be at least 2 characters"),
  code: z.string().min(2).max(10),
  description: z.string().optional().nullable(),
  headId: z.string().optional().nullable(),
});

const updateSchema = z.object({
  name: z.string().min(2, "Department name must be at least 2 characters").optional(),
  code: z.string().min(2).max(10).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  isActive: z.boolean().optional(),
  headId: z.string().optional().nullable(),
});

router.post("/", requirePermission("departments:create"), async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide a department name and short code." });
  try {
    const data: any = {
      name: parsed.data.name,
      code: parsed.data.code,
      description: parsed.data.description ?? null,
    };
    if (req.body.status) {
      data.isActive = req.body.status === "ACTIVE";
    }
    if (parsed.data.headId) {
      data.headId = parsed.data.headId;
    }
    const dept = await prisma.department.create({
      data,
      include: HEAD_INCLUDE,
    });
    res.status(201).json(dept);
  } catch {
    res.status(409).json({ error: "A department with that name or code already exists." });
  }
});

router.put("/:id", requirePermission("departments:edit"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues?.[0]?.message || "Invalid department data.";
    return res.status(400).json({ error: errorMsg });
  }

  const updateData: {
    name?: string;
    code?: string;
    description?: string | null;
    isActive?: boolean;
    headId?: string | null;
  } = {};

  if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
  if (parsed.data.code !== undefined) updateData.code = parsed.data.code.trim().toUpperCase();
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.status !== undefined) {
    updateData.isActive = parsed.data.status === "ACTIVE";
  } else if (parsed.data.isActive !== undefined) {
    updateData.isActive = parsed.data.isActive;
  }
  // headId: explicit null clears the head; a string sets it
  if ("headId" in req.body) {
    updateData.headId = req.body.headId ?? null;
  }

  try {
    const dept = await prisma.department.update({
      where: { id: req.params.id },
      data: updateData,
      include: HEAD_INCLUDE,
    });
    res.json(dept);
  } catch (err: any) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: "A department with that name or code already exists." });
    }
    res.status(404).json({ error: "Department not found." });
  }
});

router.patch("/:id/toggle-active", requirePermission("departments:edit"), async (req, res) => {
  const dept = await prisma.department.findUnique({ where: { id: req.params.id } });
  if (!dept) return res.status(404).json({ error: "Department not found." });
  const updated = await prisma.department.update({
    where: { id: req.params.id },
    data: { isActive: !dept.isActive },
  });
  res.json(updated);
});

router.delete("/:id", requirePermission("departments:delete"), async (req, res) => {
  try {
    await prisma.department.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(409).json({ error: "This department is in use and cannot be deleted. Deactivate it instead." });
  }
});

export default router;
