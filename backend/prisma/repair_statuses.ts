import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixCorruptedStatuses() {
  console.log("Fixing corrupted participant statuses in the database...");
  
  // Find all participants with status 'ATTENDED' or 'ABSENT'
  const corruptedParticipants = await prisma.meetingParticipant.findMany({
    where: {
      status: {
        in: ["ATTENDED", "ABSENT", "NOT ATTENDED"]
      }
    }
  });

  console.log(`Found ${corruptedParticipants.length} corrupted participant records.`);

  for (const p of corruptedParticipants) {
    let restoredStatus = "INVITED";
    if (p.rejectionReason) {
      restoredStatus = "DECLINED";
    } else if (p.respondedAt) {
      restoredStatus = "ACCEPTED";
    }

    await prisma.meetingParticipant.update({
      where: { id: p.id },
      data: {
        status: restoredStatus
      }
    });
    console.log(`Restored participant ${p.id} to status ${restoredStatus}`);
  }

  console.log("Database repair complete.");
}

fixCorruptedStatuses()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
