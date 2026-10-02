import { prisma } from "../src/lib/prisma";

async function check() {
  const cols: any = await prisma.$queryRawUnsafe(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'MeetingParticipant'"
  );
  console.log("COLUMNS:", cols);
}

check()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
