import { prisma } from "../src/lib/prisma";

async function main() {
  const meetings = await prisma.meeting.findMany({
    include: {
      participants: {
        include: {
          user: true,
        },
      },
    },
    take: 5,
  });

  console.log(`Found ${meetings.length} meetings:`);
  for (const m of meetings) {
    console.log(`Meeting: ${m.id} | ${m.code} | ${m.title} | Participants: ${m.participants.length}`);
    for (const p of m.participants) {
      console.log(`  - Participant ID: ${p.id} | User: ${p.user.name} (${p.user.email}) | status: ${p.status} | participated: ${p.participated}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
