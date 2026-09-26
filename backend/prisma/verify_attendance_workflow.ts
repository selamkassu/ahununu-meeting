import { prisma } from "../src/lib/prisma";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this-in-production";

function createToken(userId: string, roleCode: string, roleId: string) {
  return jwt.sign(
    { userId, roleCode, roleId },
    JWT_SECRET,
    { expiresIn: "1h" }
  );
}

async function run() {
  console.log("=== Starting Attendance Workflow & Participant Removal Verification ===");

  // 1. Get Admin user & Secretary user
  const adminUser = await prisma.user.findFirst({
    where: { role: { code: "SYSTEM_ADMIN" } },
    include: { role: true },
  });
  if (!adminUser) throw new Error("Admin user not found");

  const secretaryUser = await prisma.user.findFirst({
    where: { role: { code: "MEETING_SECRETARY" } },
    include: { role: true },
  });
  if (!secretaryUser) throw new Error("Secretary user not found");

  const participantUser = await prisma.user.findFirst({
    where: { role: { code: "PARTICIPANT" } },
    include: { role: true },
  });
  if (!participantUser) throw new Error("Participant user not found");

  const adminToken = createToken(adminUser.id, adminUser.role.code, adminUser.roleId);
  const secretaryToken = createToken(secretaryUser.id, secretaryUser.role.code, secretaryUser.roleId);
  const participantToken = createToken(participantUser.id, participantUser.role.code, participantUser.roleId);

  const API_PORT = process.env.PORT || 4010;
  const BASE_URL = `http://localhost:${API_PORT}/api`;

  // 2. Create a test meeting scheduled for tomorrow (Future meeting)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 2);
  const dept = await prisma.department.findFirst();
  if (!dept) throw new Error("No department found");

  const futureMeeting = await prisma.meeting.create({
    data: {
      code: `TEST-${Date.now()}`,
      title: "Automated Test Future Meeting",
      date: tomorrow,
      startTime: "14:00",
      endTime: "15:00",
      status: "SCHEDULED",
      organizerId: secretaryUser.id,
      departmentId: dept.id,
      participants: {
        create: [
          { userId: participantUser.id, status: "INVITED" },
          { userId: adminUser.id, status: "INVITED" },
        ],
      },
    },
    include: { participants: true },
  });

  console.log(`Created test future meeting: ${futureMeeting.code} (Status: ${futureMeeting.status}, EndTime: ${futureMeeting.endTime})`);

  // Test 1: Try to finalize attendance while meeting has not ended
  console.log("\n--- Test 1: Attempting to finalize attendance on future meeting (should fail with 400) ---");
  const res1 = await fetch(`${BASE_URL}/meetings/${futureMeeting.id}/attendance/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secretaryToken}`,
    },
    body: JSON.stringify({}),
  });
  const body1: any = await res1.json();
  console.log(`Status code: ${res1.status}, Response:`, body1);
  if (res1.status !== 400 || !body1.error?.includes("ended")) {
    throw new Error(`Expected 400 error about meeting not ended, got ${res1.status}: ${JSON.stringify(body1)}`);
  }
  console.log("PASS: Backend correctly rejected finalizing attendance before meeting has ended!");

  // Test 2: Create or use an ended meeting (status: COMPLETED)
  console.log("\n--- Test 2: Finalizing attendance on an ended meeting ---");
  const endedMeeting = await prisma.meeting.create({
    data: {
      code: `TEST-ENDED-${Date.now()}`,
      title: "Automated Test Ended Meeting",
      date: new Date(Date.now() - 86400000), // Yesterday
      startTime: "09:00",
      endTime: "10:00",
      status: "COMPLETED",
      organizerId: secretaryUser.id,
      departmentId: dept.id,
      participants: {
        create: [
          { userId: participantUser.id, status: "INVITED", participated: false },
          { userId: adminUser.id, status: "INVITED", participated: false },
        ],
      },
    },
    include: { participants: true },
  });

  const p1 = endedMeeting.participants[0];
  const p2 = endedMeeting.participants[1];

  // Finalize attendance with p1: ATTENDED, p2: NOT ATTENDED
  const res2 = await fetch(`${BASE_URL}/meetings/${endedMeeting.id}/attendance/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secretaryToken}`,
    },
    body: JSON.stringify({
      records: [
        { participantId: p1.id, status: "ATTENDED" },
        { participantId: p2.id, status: "NOT ATTENDED" },
      ],
    }),
  });
  const body2: any = await res2.json();
  console.log(`Status code: ${res2.status}`);
  if (res2.status !== 200) {
    throw new Error(`Failed to finalize attendance: ${JSON.stringify(body2)}`);
  }

  // Verify in database!
  const dbMeeting = await prisma.meeting.findUnique({
    where: { id: endedMeeting.id },
    include: { participants: true },
  });
  console.log("Database meeting attendanceFinalized:", (dbMeeting as any)?.attendanceFinalized);
  console.log("Database meeting attendanceFinalizedAt:", (dbMeeting as any)?.attendanceFinalizedAt);

  if (!(dbMeeting as any)?.attendanceFinalized) {
    throw new Error("Meeting attendanceFinalized flag was not set to true in the database!");
  }

  const dbP1 = dbMeeting?.participants.find((p) => p.id === p1.id);
  const dbP2 = dbMeeting?.participants.find((p) => p.id === p2.id);

  console.log(`Participant 1 in DB: participated=${dbP1?.participated}, status=${dbP1?.status}`);
  console.log(`Participant 2 in DB: participated=${dbP2?.participated}, status=${dbP2?.status}`);

  if (dbP1?.participated !== true || dbP1?.status !== "ATTENDED") {
    throw new Error("Participant 1 was not recorded as ATTENDED in the database!");
  }
  if (dbP2?.participated !== false || dbP2?.status !== "ABSENT") {
    throw new Error("Participant 2 was not recorded as ABSENT / NOT ATTENDED in the database!");
  }
  console.log("PASS: Meeting attendance correctly finalized and verified in the database!");

  // Test 3: Attempting to edit attendance after finalization by non-admin should be rejected
  console.log("\n--- Test 3: Attempting to edit finalized attendance as non-admin ---");
  const res3 = await fetch(`${BASE_URL}/meetings/${endedMeeting.id}/participants/${p1.id}/attendance`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secretaryToken}`,
    },
    body: JSON.stringify({ participated: false }),
  });
  const body3: any = await res3.json();
  console.log(`Status code: ${res3.status}, Response:`, body3);
  if (res3.status !== 403) {
    throw new Error(`Expected 403 when modifying finalized attendance as secretary, got ${res3.status}`);
  }
  console.log("PASS: Modification of finalized attendance blocked for non-admin!");

  // Test 4: Participant Removal and Database Deletion
  console.log("\n--- Test 4: Participant Removal and Database Verification ---");
  // Add a participant to test removal
  const tempUser = await prisma.user.findFirst({
    where: { id: { notIn: [participantUser.id, adminUser.id, secretaryUser.id] } },
  });
  if (!tempUser) throw new Error("No third user found for removal test");

  const newPart = await prisma.meetingParticipant.create({
    data: {
      meetingId: futureMeeting.id,
      userId: tempUser.id,
      status: "INVITED",
    },
  });

  // Confirm row exists in database
  const existsBefore = await prisma.meetingParticipant.findUnique({
    where: { id: newPart.id },
  });
  if (!existsBefore) throw new Error("Participant was not created in database!");
  console.log(`Created participant ${newPart.id} in DB. Now calling DELETE API...`);

  const deleteRes = await fetch(`${BASE_URL}/meetings/${futureMeeting.id}/participants/${newPart.id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });
  console.log(`Delete API status: ${deleteRes.status}`);
  if (deleteRes.status !== 200) {
    throw new Error(`Delete participant API failed with status ${deleteRes.status}`);
  }

  // Check database directly
  const existsAfter = await prisma.meetingParticipant.findUnique({
    where: { id: newPart.id },
  });
  if (existsAfter) {
    throw new Error("Participant still exists in the database table MeetingParticipant!");
  }
  console.log("PASS: Participant record was permanently deleted from the database!");

  // Cleanup test meetings
  await prisma.meetingParticipant.deleteMany({
    where: { meetingId: { in: [futureMeeting.id, endedMeeting.id] } },
  });
  await prisma.meeting.deleteMany({
    where: { id: { in: [futureMeeting.id, endedMeeting.id] } },
  });

  console.log("\n=== ALL VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
}

run()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
