import { prisma } from "../src/lib/prisma";

const API_BASE = "http://localhost:4010/api";

async function main() {
  console.log("=== Testing E2E Portal Workflow ===");

  // 1. Authenticate using direct token generation
  const adminUser = await prisma.user.findFirst({
    where: { role: { code: "SYSTEM_ADMIN" } },
    include: { role: true },
  });
  if (!adminUser) throw new Error("Admin user not found");

  const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this-in-production";
  const jwt = await import("jsonwebtoken");
  const token = jwt.default.sign(
    {
      userId: adminUser.id,
      roleId: adminUser.roleId,
      roleCode: adminUser.role.code,
      departmentId: adminUser.departmentId,
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
  console.log("1. Authenticated successfully as:", adminUser.name, `(${adminUser.role.name})`);

  // 2. Fetch meetings list
  const meetingsRes = await fetch(`${API_BASE}/meetings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meetings: any = await meetingsRes.json();
  console.log(`2. Fetched ${meetings.length} meetings.`);

  // Pick an ended meeting
  const endedMeetingSummary = meetings.find((m: any) => m.status === "COMPLETED" || new Date(m.date) < new Date());
  if (!endedMeetingSummary) throw new Error("No ended meeting found");

  // 3. Fetch meeting details
  const detailRes = await fetch(`${API_BASE}/meetings/${endedMeetingSummary.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const detail: any = await detailRes.json();
  console.log(`3. Meeting: "${detail.title}" (${detail.code})`);
  console.log(`   Initial participants: ${detail.participants.length}`);
  console.log(`   attendanceFinalized: ${detail.attendanceFinalized}`);

  // 4. Test adding a participant
  const allUsersRes = await fetch(`${API_BASE}/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const allUsers: any = await allUsersRes.json();
  const existingUserIds = new Set(detail.participants.map((p: any) => p.user.id));
  const candidateUser = allUsers.find((u: any) => !existingUserIds.has(u.id));

  if (candidateUser) {
    console.log(`4. Adding user: ${candidateUser.name} (${candidateUser.email})...`);
    const addRes = await fetch(`${API_BASE}/meetings/${detail.id}/participants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ userIds: [candidateUser.id] }),
    });
    const addData: any = await addRes.json();
    console.log(`   Participants after adding: ${addData.participants.length}`);

    const addedPart = addData.participants.find((p: any) => p.user.id === candidateUser.id);
    if (!addedPart) throw new Error("Added participant not found in meeting");

    // 5. Test updating attendance
    console.log(`5. Marking participant ${candidateUser.name} as ATTENDED...`);
    const patchRes = await fetch(`${API_BASE}/meetings/${detail.id}/participants/${addedPart.id}/attendance`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ participated: true }),
    });
    const patchData: any = await patchRes.json();
    console.log(`   Updated status: ${patchData.status}, participated: ${patchData.participated}`);

    // 6. Test finalization
    console.log("6. Finalizing attendance...");
    const finRes = await fetch(`${API_BASE}/meetings/${detail.id}/attendance/finalize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        records: addData.participants.map((p: any) => ({
          participantId: p.id,
          status: p.id === addedPart.id ? "ATTENDED" : (p.participated ? "ATTENDED" : "NOT ATTENDED"),
        })),
      }),
    });
    const finData: any = await finRes.json();
    console.log(`   Finalized: ${finData.attendanceFinalized} at ${finData.attendanceFinalizedAt}`);

    // Check count and percentage
    const attendedCount = finData.participants.filter((p: any) => p.participated).length;
    const totalCount = finData.participants.length;
    const pct = Math.round((attendedCount / totalCount) * 100);
    console.log(`   Attendance summary: ${totalCount} invited · ${attendedCount} attended (${pct}% attendance)`);

    // 7. Test removing participant
    console.log(`7. Removing participant ${candidateUser.name} (${addedPart.id})...`);
    const delRes = await fetch(`${API_BASE}/meetings/${detail.id}/participants/${addedPart.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const delData: any = await delRes.json();
    console.log(`   Participants after removal: ${delData.participants.length}`);

    // Verify in database directly
    const dbPart = await prisma.meetingParticipant.findUnique({
      where: { id: addedPart.id },
    });
    if (dbPart) {
      throw new Error("Participant still exists in database table!");
    }
    console.log("   Confirmed participant removed from database table MeetingParticipant!");
  }

  console.log("\n=== E2E Portal Workflow completed successfully! ===");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
