import { prisma } from "../src/lib/prisma";

async function migrate() {
  console.log("Adding rejectionReason and respondedAt to MeetingParticipant in PostgreSQL...");
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "MeetingParticipant" ADD COLUMN IF NOT EXISTS "rejectionReason" text;'
  );
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "MeetingParticipant" ADD COLUMN IF NOT EXISTS "respondedAt" timestamp without time zone;'
  );
  console.log("Migration successful!");
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
