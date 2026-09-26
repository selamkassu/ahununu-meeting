import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "headId" TEXT');
    console.log("Column headId added (or already existed).");
  } catch (e) {
    console.error("Column error:", e.message);
  }
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "Department" ADD CONSTRAINT "Department_headId_fkey" FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE');
    console.log("Foreign key added.");
  } catch (e) {
    if (e.message.includes("already exists")) {
      console.log("FK already exists, skipping.");
    } else {
      console.error("FK error:", e.message);
    }
  }
  console.log("Done.");
  await prisma.$disconnect();
})();
