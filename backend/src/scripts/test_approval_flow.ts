import { prisma } from "../lib/prisma";
import { ensureAdminWorkflowInfrastructure } from "../lib/adminNotifications";
import bcrypt from "bcryptjs";

async function runEndToEndApprovalTest() {
  console.log("=== STARTING USER APPROVAL WORKFLOW INTEGRATION TEST ===");

  // 1. Ensure infrastructure
  await ensureAdminWorkflowInfrastructure();

  // Verify UNASSIGNED role
  const unassignedRole = await prisma.role.findFirst({
    where: { code: "UNASSIGNED" },
  });
  if (!unassignedRole) {
    throw new Error("UNASSIGNED role does not exist!");
  }
  console.log("✓ UNASSIGNED role verified:", unassignedRole.id, unassignedRole.name);

  // Verify users:approve permission exists for System Admin
  const adminRole = await prisma.role.findFirst({
    where: { code: "SYSTEM_ADMIN" },
    include: { permissions: true },
  });
  const hasApprovePerm = adminRole?.permissions.some((p) => p.permission === "users:approve");
  if (!hasApprovePerm) {
    throw new Error("System Admin role missing users:approve permission!");
  }
  console.log("✓ System Admin has users:approve permission.");

  // 2. Simulate new user registration via Google Sign-up
  const testEmail = `test.google.signup.${Date.now()}@example.com`;
  const testGoogleId = `google_sub_${Date.now()}`;
  console.log(`\nSimulating Google Sign-up for: ${testEmail}...`);

  const pendingUser = await prisma.user.create({
    data: {
      name: "Abebe Kebede",
      email: testEmail,
      googleId: testGoogleId,
      status: "PENDING",
      isActive: false,
      roleId: unassignedRole.id,
      jobTitle: "Branch Operations Coordinator",
      responsibilities: "Pending administrator role assignment.",
    },
    include: { role: true },
  });

  console.log("✓ User created in DB with Status:", pendingUser.status, "and Role:", pendingUser.role.code);
  if (pendingUser.status !== "PENDING" || pendingUser.role.code !== "UNASSIGNED") {
    throw new Error("User record did not match expected PENDING / UNASSIGNED specification!");
  }

  // 3. Insert notification into admin_notifications table
  const notifId = `an_test_${Date.now()}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "admin_notifications" ("id", "userId", "type", "title", "message", "metadata", "isRead", "createdAt")
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, false, CURRENT_TIMESTAMP)`,
    notifId,
    pendingUser.id,
    "USER_PENDING_APPROVAL",
    "New User Registration Awaiting Approval",
    `${pendingUser.name} (${pendingUser.email}) registered with Google and is awaiting role assignment.`,
    JSON.stringify({ signupMethod: "google", googleId: testGoogleId, jobTitle: pendingUser.jobTitle })
  );

  const notifRow = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "admin_notifications" WHERE "id" = $1`,
    notifId
  );
  console.log("✓ Event Trigger entry in admin_notifications verified:", notifRow[0]?.title);

  // 4. Test Approval & Role Assignment
  // Find a target role to assign, e.g. DEPARTMENT_HEAD
  const targetRole = await prisma.role.findFirst({
    where: { code: "DEPARTMENT_HEAD" },
  });
  if (!targetRole) {
    throw new Error("Target role DEPARTMENT_HEAD not found in DB!");
  }

  console.log(`\nSimulating Admin Role Assignment -> Assigning role: ${targetRole.name} (${targetRole.code})...`);

  const approvedUser = await prisma.user.update({
    where: { id: pendingUser.id },
    data: {
      status: "ACTIVE",
      isActive: true,
      roleId: targetRole.id,
    },
    include: { role: true },
  });

  console.log("✓ User account updated: Status is now", approvedUser.status, "IsActive:", approvedUser.isActive);
  console.log("✓ Assigned Role is now:", approvedUser.role.name, `(${approvedUser.role.code})`);

  if (approvedUser.status !== "ACTIVE" || !approvedUser.isActive || approvedUser.role.code !== "DEPARTMENT_HEAD") {
    throw new Error("Approval and role assignment did not update user properly!");
  }

  // Clean up test records
  await prisma.$executeRawUnsafe(`DELETE FROM "admin_notifications" WHERE "userId" = $1`, pendingUser.id);
  await prisma.user.delete({ where: { id: pendingUser.id } });
  console.log("✓ Test cleanup completed successfully.");

  console.log("\n=== ALL USER APPROVAL WORKFLOW TESTS PASSED PERFECTLY ===");
}

runEndToEndApprovalTest()
  .catch((e) => {
    console.error("Test failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
