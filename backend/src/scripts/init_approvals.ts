import { ensureAdminWorkflowInfrastructure } from "../lib/adminNotifications";
import { prisma } from "../lib/prisma";

async function run() {
  console.log("Initializing admin approvals infrastructure...");
  await ensureAdminWorkflowInfrastructure();
  console.log("Done!");
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
