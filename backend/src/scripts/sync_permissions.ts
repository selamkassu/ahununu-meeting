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

  console.log("Permission synchronization complete.");
}

main()
  .catch((e) => {
    console.error("Sync failed:", e);
  })
  .finally(() => prisma.$disconnect());
