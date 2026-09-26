import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  console.log("Checking and applying signature column to Meeting...");

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Meeting"
    ADD COLUMN IF NOT EXISTS "approvalSignature" TEXT;
  `);

  console.log("✓ Column approvalSignature ensured on Meeting table.");

  const cols = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'Meeting' AND column_name = 'approvalSignature';
  `);
  console.log("Column verification:", cols);
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
