import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Creating ActionItemAssignee table...");

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ActionItemAssignee" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "actionItemId" TEXT NOT NULL REFERENCES "ActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ActionItemAssignee_actionItemId_userId_key" 
    ON "ActionItemAssignee"("actionItemId", "userId");
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ActionItem" ALTER COLUMN "assignedToId" DROP NOT NULL;
  `);

  console.log("Backfilling existing assignees into ActionItemAssignee...");
  const result = await prisma.$executeRawUnsafe(`
    INSERT INTO "ActionItemAssignee" ("id", "actionItemId", "userId", "createdAt")
    SELECT 'aia_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), "id", "assignedToId", "createdAt"
    FROM "ActionItem"
    WHERE "assignedToId" IS NOT NULL
    ON CONFLICT ("actionItemId", "userId") DO NOTHING;
  `);

  console.log(`Migration complete. Backfilled rows affected: ${result}`);

  const count = await prisma.$queryRawUnsafe<any[]>(`SELECT count(*) FROM "ActionItemAssignee"`);
  console.log("Total ActionItemAssignee rows:", count);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
