// ------------------------------------------------------------
// STATIC PERMISSIONS CATALOG (mirrors backend)
// ------------------------------------------------------------

export const PERMISSIONS = [
  "users:view", "users:create", "users:edit", "users:delete", "users:manage_status",
  "roles:view", "roles:create", "roles:edit", "roles:delete",
  "departments:view", "departments:create", "departments:edit", "departments:delete",
  "meetings:view:all", "meetings:view:dept", "meetings:view:own", "meetings:create",
  "meetings:edit:all", "meetings:edit:dept", "meetings:edit:own",
  "meetings:delete:all", "meetings:delete:dept", "meetings:delete:own",
  "meetings:manage_participants", "meetings:approve", "meetings:certify_lock",
  "agenda:view", "agenda:create", "agenda:edit",
  "minutes:view:all", "minutes:view:dept", "minutes:view:own", "minutes:create",
  "minutes:edit:all", "minutes:edit:dept", "minutes:edit:own", "minutes:sign",
  "decisions:view:all", "decisions:view:dept", "decisions:view:own", "decisions:create",
  "decisions:edit:all", "decisions:edit:dept", "decisions:edit:own",
  "decisions:delete:all", "decisions:delete:dept", "decisions:delete:own",
  "action_items:view:all", "action_items:view:dept", "action_items:view:own", "action_items:create",
  "action_items:edit:all", "action_items:edit:dept", "action_items:edit:own",
  "action_items:delete:all", "action_items:delete:dept", "action_items:delete:own",
  "documents:view:all", "documents:view:dept", "documents:view:own", "documents:upload",
  "documents:delete:all", "documents:delete:dept", "documents:delete:own", "documents:download",
  "notifications:view",
  "reports:view", "reports:export",
  "settings:view", "settings:edit",
  "dashboard:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<string, string> = {
  "users:view": "View Users",
  "users:create": "Create Users",
  "users:edit": "Edit Users",
  "users:delete": "Delete Users",
  "users:manage_status": "Manage User Status",
  "roles:view": "View Roles",
  "roles:create": "Create Roles",
  "roles:edit": "Edit Roles",
  "roles:delete": "Delete Roles",
  "departments:view": "View Departments",
  "departments:create": "Create Departments",
  "departments:edit": "Edit Departments",
  "departments:delete": "Delete Departments",
  "meetings:view:all": "View All Meetings (Organization-wide)",
  "meetings:view:dept": "View Department Meetings",
  "meetings:view:own": "View Own Meetings (Organized / Attending)",
  "meetings:create": "Create Meetings",
  "meetings:edit:all": "Edit All Meetings",
  "meetings:edit:dept": "Edit Department Meetings",
  "meetings:edit:own": "Edit Own Meetings",
  "meetings:delete:all": "Delete All Meetings",
  "meetings:delete:dept": "Delete Department Meetings",
  "meetings:delete:own": "Delete Own Meetings",
  "meetings:manage_participants": "Manage Participants",
  "meetings:approve": "Approve Meetings (or Approve Meeting & Minutes)",
  "meetings:certify_lock": "Certify / Lock Meetings",
  "agenda:view": "View Agenda",
  "agenda:create": "Create Agenda Items",
  "agenda:edit": "Edit Agenda Items",
  "minutes:view:all": "View All Minutes",
  "minutes:view:dept": "View Department Minutes",
  "minutes:view:own": "View Own Minutes",
  "minutes:create": "Record Minutes",
  "minutes:edit:all": "Edit All Minutes",
  "minutes:edit:dept": "Edit Department Minutes",
  "minutes:edit:own": "Edit Own Minutes",
  "minutes:sign": "Sign Minutes (to apply digital signature)",
  "decisions:view:all": "View All Decisions",
  "decisions:view:dept": "View Department Decisions",
  "decisions:view:own": "View Own Decisions",
  "decisions:create": "Log Decisions",
  "decisions:edit:all": "Edit All Decisions",
  "decisions:edit:dept": "Edit Department Decisions",
  "decisions:edit:own": "Edit Own Decisions",
  "decisions:delete:all": "Delete All Decisions",
  "decisions:delete:dept": "Delete Department Decisions",
  "decisions:delete:own": "Delete Own Decisions",
  "action_items:view:all": "View All Action Items",
  "action_items:view:dept": "View Department Action Items",
  "action_items:view:own": "View Own Action Items",
  "action_items:create": "Create Action Items",
  "action_items:edit:all": "Edit All Action Items",
  "action_items:edit:dept": "Edit Department Action Items",
  "action_items:edit:own": "Edit Own Action Items",
  "action_items:delete:all": "Delete All Action Items",
  "action_items:delete:dept": "Delete Department Action Items",
  "action_items:delete:own": "Delete Own Action Items",
  "documents:view:all": "View All Documents",
  "documents:view:dept": "View Department Documents",
  "documents:view:own": "View Own Documents",
  "documents:upload": "Upload Documents",
  "documents:delete:all": "Delete All Documents",
  "documents:delete:dept": "Delete Department Documents",
  "documents:delete:own": "Delete Own Documents",
  "documents:download": "Export / Download Documents",
  "notifications:view": "View Notifications",
  "reports:view": "View Reports",
  "reports:export": "Export Reports",
  "settings:view": "View Settings",
  "settings:edit": "Edit Settings",
  "dashboard:view": "View Dashboard",
};

export const PERMISSION_GROUPS: { label: string; permissions: string[] }[] = [
  { label: "User Management", permissions: ["users:view", "users:create", "users:edit", "users:delete", "users:manage_status"] },
  { label: "Role Management", permissions: ["roles:view", "roles:create", "roles:edit", "roles:delete"] },
  { label: "Department Management", permissions: ["departments:view", "departments:create", "departments:edit", "departments:delete"] },
  {
    label: "Meeting Management",
    permissions: [
      "meetings:view:all",
      "meetings:view:dept",
      "meetings:view:own",
      "meetings:create",
      "meetings:edit:all",
      "meetings:edit:dept",
      "meetings:edit:own",
      "meetings:delete:all",
      "meetings:delete:dept",
      "meetings:delete:own",
      "meetings:manage_participants",
      "meetings:approve",
      "meetings:certify_lock",
    ],
  },
  { label: "Agenda", permissions: ["agenda:view", "agenda:create", "agenda:edit"] },
  {
    label: "Minutes",
    permissions: [
      "minutes:view:all",
      "minutes:view:dept",
      "minutes:view:own",
      "minutes:create",
      "minutes:edit:all",
      "minutes:edit:dept",
      "minutes:edit:own",
      "minutes:sign",
    ],
  },
  {
    label: "Decisions",
    permissions: [
      "decisions:view:all",
      "decisions:view:dept",
      "decisions:view:own",
      "decisions:create",
      "decisions:edit:all",
      "decisions:edit:dept",
      "decisions:edit:own",
      "decisions:delete:all",
      "decisions:delete:dept",
      "decisions:delete:own",
    ],
  },
  {
    label: "Action Items",
    permissions: [
      "action_items:view:all",
      "action_items:view:dept",
      "action_items:view:own",
      "action_items:create",
      "action_items:edit:all",
      "action_items:edit:dept",
      "action_items:edit:own",
      "action_items:delete:all",
      "action_items:delete:dept",
      "action_items:delete:own",
    ],
  },
  {
    label: "Document Management",
    permissions: [
      "documents:view:all",
      "documents:view:dept",
      "documents:view:own",
      "documents:upload",
      "documents:delete:all",
      "documents:delete:dept",
      "documents:delete:own",
      "documents:download",
    ],
  },
  { label: "Notifications", permissions: ["notifications:view"] },
  { label: "Reports & Analytics", permissions: ["reports:view", "reports:export"] },
  { label: "Settings", permissions: ["settings:view", "settings:edit"] },
  { label: "Dashboard", permissions: ["dashboard:view"] },
];

// ------------------------------------------------------------
// ROLE TYPES
// ------------------------------------------------------------

export interface RoleDetail {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  isSystem: boolean;
  permissions: string[];
}

export interface RoleListItem extends RoleDetail {
  isActive: boolean;
  userCount: number;
  createdAt: string;
  updatedAt: string;
}

// ------------------------------------------------------------
// OTHER TYPES
// ------------------------------------------------------------

export type UserStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  DEACTIVATED: "Deactivated",
};

export type MeetingStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "PENDING_SIGNATURES"
  | "READY_FOR_APPROVAL"
  | "APPROVED"
  | "COMPLETED"
  | "CANCELLED";
export const LOCKED_MEETING_STATUSES: MeetingStatus[] = [
  "PENDING_SIGNATURES",
  "READY_FOR_APPROVAL",
  "APPROVED",
  "COMPLETED",
  "CANCELLED",
];
export function isLockedMeeting(status?: MeetingStatus | string | null): boolean {
  return !!status && LOCKED_MEETING_STATUSES.includes(status as MeetingStatus);
}
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ActionItemStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type AgendaStatus = "PENDING" | "DISCUSSED" | "DEFERRED";
export type DecisionStatus = "OPEN" | "IMPLEMENTED" | "REVERSED";

export interface DepartmentHeadUser {
  id: string;
  name: string;
  email?: string;
  jobTitle?: string | null;
  avatarColor: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  isActive: boolean;
  headId?: string | null;
  head?: DepartmentHeadUser | null;
  createdAt: string;
  _count?: { users: number; meetings: number };
}

export interface UserLite {
  id: string;
  name: string;
  email?: string;
  avatarColor: string;
  role?: RoleDetail;
  jobTitle?: string | null;
  department?: { id: string; name: string } | null;
}

export interface User extends UserLite {
  jobTitle?: string | null;
  phone?: string | null;
  isActive: boolean;
  status?: UserStatus;
  roleId: string;
  role: RoleDetail;
  responsibilities?: string | null;
  departmentId: string | null;
  department?: Department | null;
}

export interface AgendaItem {
  id: string;
  meetingId: string;
  order: number;
  title: string;
  description?: string | null;
  presenter?: string | null;
  durationMin: number;
  status: AgendaStatus;
}


export interface MeetingMinutes {
  id: string;
  meetingId: string;
  type: "SUMMARY" | "ATTENDEE";
  attendeeId?: string | null;
  attendeeName?: string | null;
  content: string;
  recordedBy: { id: string; name: string };
  attendee?: {
    id: string;
    name: string;
    avatarColor: string;
    jobTitle?: string | null;
    department?: { id: string; name: string } | null;
  } | null;
  createdAt: string;
  updatedAt?: string;
}
export interface Decision {
  id: string;
  code: string;
  meetingId: string;
  title: string;
  description?: string | null;
  decisionDate: string;
  status: DecisionStatus;
}

export interface ActionItem {
  id: string;
  code: string;
  meetingId: string;
  decisionId?: string | null;
  title: string;
  description?: string | null;
  assignedTo: UserLite;
  department: { id: string; name: string };
  meeting?: { id: string; title: string; code: string };
  decision?: { id: string; title: string; code: string } | null;
  priority: Priority;
  status: ActionItemStatus;
  progressPercent: number;
  deadline: string;
  completedAt?: string | null;
  overdue: boolean;
}

export interface MeetingParticipant {
  id: string;
  meetingId: string;
  status: string;
  isRequired: boolean;
  participated: boolean;
  user: UserLite;
}

export interface MeetingListItem {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  location?: string | null;
  onlineLink?: string | null;
  priority: Priority;
  status: MeetingStatus;
  organizer: UserLite;
  participants?: { user: UserLite }[];
  approvedById?: string | null;
  approvedAt?: string | null;
  approvedBy?: UserLite | null;
  approvalSignature?: string | null;
  attendanceFinalized?: boolean;
  attendanceFinalizedAt?: string | null;
  forceApproved?: boolean;
  bypassReason?: string | null;
  department: { id: string; name: string };
  _count: { participants: number; actionItems: number; agendaItems: number };
}

export interface ParticipantSignature {
  id: string;
  meetingId: string;
  userId: string;
  signerName: string;
  signerRole?: string | null;
  signatureDataUrl: string;
  signedAt: string;
  userAgent?: string | null;
  bypassReason?: string | null;
  user: {
    id: string;
    name: string;
    avatarColor: string;
    jobTitle?: string | null;
    role?: { name: string } | null;
  };
}

export interface MeetingDetail extends Omit<MeetingListItem, "_count"> {
  participants: MeetingParticipant[];
  agendaItems: AgendaItem[];
  minutes: MeetingMinutes[];
  decisions: Decision[];
  actionItems: ActionItem[];
  documents: { id: string; fileName: string; fileType: string; fileSize: number; filePath?: string | null; uploadedBy: { id: string; name: string } }[];
  participantSignatures: ParticipantSignature[];
  signaturesRequestedAt?: string | null;
}

export interface AgendaOverviewItem extends AgendaItem {
  meeting: { id: string; title: string; code: string; date: string; department: { name: string } };
}

export interface MinutesOverviewItem extends MeetingMinutes {
  meeting: { id: string; title: string; code: string; date: string; department: { name: string } };
}

export interface DecisionOverviewItem extends Decision {
  meeting: {
    id: string;
    title: string;
    code: string;
    date: string;
    status?: MeetingStatus;
    departmentId?: string;
    organizerId?: string;
    department: { id?: string; name: string };
  };
  actionItems: { id: string; status: ActionItemStatus }[];
}

export interface DocumentItem {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy: { id: string; name: string };
  meeting: { id: string; title: string; code: string; department: { name: string } };
  createdAt: string;
}

export interface DashboardCards {
  totalMeetings: number;
  todaysMeetings: number;
  upcomingMeetings: number;
  completedMeetings: number;
  pendingActionItems: number;
  overdueActionItems: number;
  completedActionItems: number;
  pendingDecisions: number;
}

export interface DashboardResponse {
  cards: DashboardCards;
  charts: {
    monthlyMeetings: { month: string; count: number; completed: number }[];
    actionItemStatus: { status: ActionItemStatus; count: number }[];
    departmentPerformance: { department: string; total: number; completed: number; overdue: number; completionRate: number }[];
    meetingCompletionRate: number;
  };
  accountability: ActionItem[];
}

export interface Notification {
  id: string;
  userId: string;
  meetingId?: string | null;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}