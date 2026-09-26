-- AddColumn: optional Department Head FK on Department table
ALTER TABLE "Department" ADD COLUMN "headId" TEXT;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_headId_fkey" FOREIGN KEY ("headId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

