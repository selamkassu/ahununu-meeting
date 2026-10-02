/**
 * Email Test Script
 * Tests all 5 email types using the actual GMAIL_USER + GMAIL_APP_PASSWORD from .env
 * Run with: npx tsx src/scripts/test-email.ts
 */
import "dotenv/config";
import {
  sendMeetingInvitationEmail,
  sendMeetingCancellationEmail,
  sendActionItemAssignedEmail,
} from "../utils/email";

const DEMO_EMAIL = "selamkassu690@gmail.com";
const DEMO_NAME  = "Selam Kassu";
const MEETING_ID = "test-meeting-001";

async function runTests() {
  console.log("\n====================================================");
  console.log("  Ahununu Meeting Portal — Email Notification Test");
  console.log("====================================================");
  console.log(`Sending to: ${DEMO_EMAIL}`);
  console.log("----------------------------------------------------\n");

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // ── 1. Meeting Invitation ──────────────────────────────
  console.log("▶ [1/3] Meeting Invitation: Sending Invitation to invited participant...");
  await sendMeetingInvitationEmail({
    toEmail:      DEMO_EMAIL,
    toName:       DEMO_NAME,
    organizerName:"Abebe Girma",
    meetingTitle: "Q4 Strategic Review & Planning",
    meetingDate:  "Monday, October 6, 2026",
    startTime:    "09:00",
    endTime:      "10:30",
    location:     "Conference Room A, HQ",
    onlineLink:   "https://meet.google.com/abc-defg-hij",
    description:  "Quarterly strategic review covering logistical expansion, route optimizations, and executive budgets.",
    meetingId:    MEETING_ID,
  });
  console.log("   ✅ Sent (Meeting Invitation delivered to invited participant)\n");
  await sleep(1500);

  // ── 2. Meeting Cancellation ───────────────────────────
  console.log("▶ [2/3] Meeting Cancellation: Notifying invited participants...");
  await sendMeetingCancellationEmail({
    recipients: [
      { email: DEMO_EMAIL, name: DEMO_NAME },
    ],
    meetingTitle:    "Q4 Strategic Review & Planning",
    meetingDate:     "Monday, October 6, 2026",
    startTime:       "09:00",
    endTime:         "10:30",
    cancelledByName: "Abebe Girma",
    meetingId:       MEETING_ID,
  });
  console.log("   ✅ Sent (Cancellation notice delivered to all invited participants)\n");
  await sleep(1500);

  // ── 3. Action Item Assignment (Task Assignment) ───────
  console.log("▶ [3/3] Action Item Assignment: Sending strictly to assignee...");
  await sendActionItemAssignedEmail({
    assignees: [
      { email: DEMO_EMAIL, name: DEMO_NAME },
    ],
    taskTitle:      "Prepare Q4 Financial and Logistics Audit Report",
    taskCode:       "ACT-007",
    deadline:       "October 10, 2026",
    priority:       "HIGH",
    meetingTitle:   "Q4 Strategic Review & Planning",
    assignedByName: "Abebe Girma",
    meetingId:      MEETING_ID,
    description:    "Compile all department expenditure reports, audit logistics operational costs, and produce the slide deck for executive board review.",
  });
  console.log("   ✅ Sent (Task assignment with responsibilities & due date delivered strictly to assignee)\n");

  console.log("====================================================");
  console.log("  All 3 Workflow Emails Sent Successfully!");
  console.log(`  Recipient Inbox: ${DEMO_EMAIL}`);
  console.log("====================================================\n");
}

runTests().catch((err) => {
  console.error("\n❌ Email test failed:", err.message);
  process.exit(1);
});
