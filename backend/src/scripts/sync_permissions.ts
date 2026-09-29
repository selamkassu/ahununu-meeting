import { prisma } from "../lib/prisma";
import { SYSTEM_ROLE_PERMISSIONS, PERMISSIONS } from "../utils/enums";

async function main() {
  console.log("Synchronizing 3-tier permissions for system roles...");

  for (const [roleCode, perms] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({
      where: { code: roleCode },
    });
    if (!role) {
      console.log(`Role ${roleCode} not found in DB, skipping.`);
      continue;
    }

    // Delete existing permissions for this role
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id },
    });

    // Insert new 3-tier permissions
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({
        roleId: role.id,
        permission: p,
      })),
      skipDuplicates: true,
    });

    console.log(`Updated ${role.name} (${roleCode}) with ${perms.length} permissions.`);
  }

  // Ensure any admin role in the DB has ADMIN_OVERRIDE
  const adminRoles = await prisma.role.findMany({
    where: {
      OR: [
        { code: "SYSTEM_ADMIN" },
        { name: { contains: "Admin", mode: "insensitive" } },
      ],
    },
  });
  for (const r of adminRoles) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permission: {
          roleId: r.id,
          permission: "ADMIN_OVERRIDE",
        },
      },
      create: {
        roleId: r.id,
        permission: "ADMIN_OVERRIDE",
      },
      update: {},
    });
    console.log(`Ensured ADMIN_OVERRIDE permission for role: ${r.name} (${r.code})`);
  }

  console.log("Permission synchronization complete.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
  })
  .finally(() => prisma.$disconnect());
