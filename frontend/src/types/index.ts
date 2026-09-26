// ------------------------------------------------------------
// STATIC PERMISSIONS CATALOG (mirrors backend)
// ------------------------------------------------------------

export const PERMISSIONS = [
  "users:view", "users:create", "users:edit", "users:delete", "users:manage_status",
  "roles:view", "roles:create", "roles:edit", "roles:delete",
  "departments:view", "departments:create", "departments:edit", "departments:delete",
  "meetings:view", "meetings:create", "meetings:edit", "meetings:delete", "meetings:manage_participants",
  "agenda:view", "agenda:create", "agenda:edit",
  "minutes:view", "minutes:create", "minutes:edit",
  "decisions:view", "decisions:create", "decisions:edit",
  "action_items:view", "action_items:create", "action_items:edit", "action_items:update_own",
  "documents:view", "documents:upload", "documents:delete",
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
  "meetings:view": "View Meetings",
  "meetings:create": "Create Meetings",
  "meetings:edit": "Edit Meetings",
  "meetings:delete": "Delete Meetings",
  "meetings:manage_participants": "Manage Participants",
  "agenda:view": "View Agenda",
  "agenda:create": "Create Agenda Items",
  "agenda:edit": "Edit Agenda Items",
  "minutes:view": "View Minutes",
  "minutes:create": "Record Minutes",
  "minutes:edit": "Edit Minutes",
  "decisions:view": "View Decisions",
  "decisions:create": "Log Decisions",
  "decisions:edit": "Edit Decisions",
  "action_items:view": "View Action Items",
  "action_items:create": "Create Action Items",
  "action_items:edit": "Edit Action Items",
  "action_items:update_own": "Update Own Action Items",
  "documents:view": "View Documents",
  "documents:upload": "Upload Documents",
  "documents:delete": "Delete Documents",
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
  { label: "Meeting Management", permissions: ["meetings:view", "meetings:create", "meetings:edit", "meetings:delete", "meetings:manage_participants"] },
  { label: "Agenda", permissions: ["agenda:view", "agenda:create", "agenda:edit"] },
  { label: "Minutes", permissions: ["minutes:view", "minutes:create", "minutes:edit"] },
  { label: "Decisions", permissions: ["decisions:view", "decisions:create", "decisions:edit"] },
  { label: "Action Items", permissions: ["action_items:view", "action_items:create", "action_items:edit", "action_items:update_own"] },
  { label: "Documents", permissions: ["documents:view", "documents:upload", "documents:delete"] },
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

export type MeetingStatus = "SCHEDULED" | "IN_PROGRESS" | "APPROVED" | "COMPLETED" | "CANCELLED";
export const LOCKED_MEETING_STATUSES: MeetingStatus[] = ["APPROVED", "COMPLETED", "CANCELLED"];
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
  approvedById?: string | null;
  approvedAt?: string | null;
  approvedBy?: UserLite | null;
  approvalSignature?: string | null;
  attendanceFinalized?: boolean;
  attendanceFinalizedAt?: string | null;
  department: { id: string; name: string };
  _count: { participants: number; actionItems: number; agendaItems: number };
}

export interface MeetingDetail extends Omit<MeetingListItem, "_count"> {
  participants: MeetingParticipant[];
  agendaItems: AgendaItem[];
  minutes: MeetingMinutes[];
  decisions: Decision[];
  actionItems: ActionItem[];
  documents: { id: string; fileName: string; fileType: string; fileSize: number; filePath?: string | null; uploadedBy: { id: string; name: string } }[];
}

export interface AgendaOverviewItem extends AgendaItem {
  meeting: { id: string; title: string; code: string; date: string; department: { name: string } };
}

export interface MinutesOverviewItem extends MeetingMinutes {
  meeting: { id: string; title: string; code: string; date: string; department: { name: string } };
}

export interface DecisionOverviewItem extends Decision {
  meeting: { id: string; title: string; code: string; date: string; department: { name: string } };
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