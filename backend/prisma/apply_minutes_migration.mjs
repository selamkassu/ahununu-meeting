import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Applying MeetingMinutes migration…");

  // 1. Add new columns to MeetingMinutes (idempotent using IF NOT EXISTS)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "MeetingMinutes"
    ADD COLUMN IF NOT EXISTS "type"         TEXT NOT NULL DEFAULT 'SUMMARY',
    ADD COLUMN IF NOT EXISTS "attendeeId"   TEXT,
    ADD COLUMN IF NOT EXISTS "attendeeName" TEXT;
  `);
  console.log("✓ Columns added (type, attendeeId, attendeeName)");

  // 2. Add FK constraint if not already present
  const fkExists = await prisma.$queryRawUnsafe(`
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'MeetingMinutes_attendeeId_fkey'
    AND table_name = 'MeetingMinutes';
  `);

  if (!Array.isArray(fkExists) || fkExists.length === 0) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "MeetingMinutes"
      ADD CONSTRAINT "MeetingMinutes_attendeeId_fkey"
      FOREIGN KEY ("attendeeId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
    `);
    console.log("✓ FK constraint added (attendeeId -> User.id)");
  } else {
    console.log("ℹ  FK constraint already exists, skipping.");
  }

  // 3. Add the unique constraint for (meetingId, attendeeId)
  const idxExists = await prisma.$queryRawUnsafe(`
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'MeetingMinutes_meetingId_attendeeId_key';
  `);

  if (!Array.isArray(idxExists) || idxExists.length === 0) {
    // Only NULLS are allowed to repeat — Postgres partial unique index trick
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX "MeetingMinutes_meetingId_attendeeId_key"
      ON "MeetingMinutes"("meetingId", "attendeeId")
      WHERE "attendeeId" IS NOT NULL;
    `);
    console.log("✓ Unique index (meetingId, attendeeId) created");
  } else {
    console.log("ℹ  Unique index already exists, skipping.");
  }

  console.log("✅ Migration complete.");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
