// Ahununu Logistics - Meeting Management Portal
// Central allowed-value lists and static permissions catalog.
// Roles are now dynamic (stored in the database), but permissions
// are a fixed catalog defined here.

// ──────────────────────────────────────────────────────────────
// STATIC PERMISSIONS CATALOG
// ──────────────────────────────────────────────────────────────

export const PERMISSIONS = [
  // User management
  "users:view",
  "users:create",
  "users:edit",
  "users:delete",
  "users:manage_status",

  // Role management
  "roles:view",
  "roles:create",
  "roles:edit",
  "roles:delete",

  // Department management
  "departments:view",
  "departments:create",
  "departments:edit",
  "departments:delete",

  // Meeting management
  "meetings:view",
  "meetings:create",
  "meetings:edit",
  "meetings:delete",
  "meetings:manage_participants",
  "meetings:approve",

  // Agenda
  "agenda:view",
  "agenda:create",
  "agenda:edit",

  // Minutes
  "minutes:view",
  "minutes:create",
  "minutes:edit",

  // Decisions
  "decisions:view",
  "decisions:create",
  "decisions:edit",

  // Action items
  "action_items:view",
  "action_items:create",
  "action_items:edit",
  "action_items:update_own",

  // Documents
  "documents:view",
  "documents:upload",
  "documents:delete",

  // Notifications
  "notifications:view",

  // Reports
  "reports:view",
  "reports:export",

  // Settings
  "settings:view",
  "settings:edit",

  // Dashboard
  "dashboard:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Permission groups for UI display — labels and members
 */
export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  {
    label: "User Management",
    permissions: ["users:view", "users:create", "users:edit", "users:delete", "users:manage_status"],
  },
  {
    label: "Role Management",
    permissions: ["roles:view", "roles:create", "roles:edit", "roles:delete"],
  },
  {
    label: "Department Management",
    permissions: ["departments:view", "departments:create", "departments:edit", "departments:delete"],
  },
  {
    label: "Meeting Management",
    permissions: ["meetings:view", "meetings:create", "meetings:edit", "meetings:delete", "meetings:manage_participants", "meetings:approve"],
  },
  {
    label: "Agenda",
    permissions: ["agenda:view", "agenda:create", "agenda:edit"],
  },
  {
    label: "Minutes",
    permissions: ["minutes:view", "minutes:create", "minutes:edit"],
  },
  {
    label: "Decisions",
    permissions: ["decisions:view", "decisions:create", "decisions:edit"],
  },
  {
    label: "Action Items",
    permissions: ["action_items:view", "action_items:create", "action_items:edit", "action_items:update_own"],
  },
  {
    label: "Documents",
    permissions: ["documents:view", "documents:upload", "documents:delete"],
  },
  {
    label: "Notifications",
    permissions: ["notifications:view"],
  },
  {
    label: "Reports & Analytics",
    permissions: ["reports:view", "reports:export"],
  },
  {
    label: "Settings",
    permissions: ["settings:view", "settings:edit"],
  },
  {
    label: "Dashboard",
    permissions: ["dashboard:view"],
  },
];

/**
 * Permission labels for human-readable display
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
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
  "meetings:approve": "Approve Meetings",
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

// ──────────────────────────────────────────────────────────────
// DEFAULT PERMISSIONS FOR BUILT-IN SYSTEM ROLES
// These are used during seeding/migration to create the initial
// 4 system roles. Admins can customize them later.
// ──────────────────────────────────────────────────────────────

export const SYSTEM_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SYSTEM_ADMIN: [...PERMISSIONS], // all permissions
  MEETING_SECRETARY: [
    "meetings:view", "meetings:create", "meetings:edit", "meetings:delete",
    "meetings:manage_participants", "meetings:approve",
    "agenda:view", "agenda:create", "agenda:edit",
    "minutes:view", "minutes:create", "minutes:edit",
    "decisions:view", "decisions:create", "decisions:edit",
    "action_items:view", "action_items:create", "action_items:edit",
    "documents:view", "documents:upload", "documents:delete",
    "notifications:view",
    "reports:view",
    "dashboard:view",
  ],
  DEPARTMENT_HEAD: [
    "meetings:view", "meetings:create", "meetings:edit",
    "meetings:manage_participants", "meetings:approve",
    "agenda:view", "agenda:create", "agenda:edit",
    "minutes:view", "minutes:create", "minutes:edit",
    "decisions:view", "decisions:create", "decisions:edit",
    "action_items:view", "action_items:create", "action_items:edit",
    "documents:view", "documents:upload",
    "notifications:view",
    "reports:view",
    "dashboard:view",
    "departments:view",
  ],
  PARTICIPANT: [
    "meetings:view",
    "agenda:view",
    "minutes:view",
    "decisions:view",
    "action_items:view", "action_items:update_own",
    "documents:view",
    "notifications:view",
    "dashboard:view",
  ],
};

// ──────────────────────────────────────────────────────────────
// ENUM-LIKE VALUE LISTS (statuses, priorities, etc.)
// ──────────────────────────────────────────────────────────────

export const USER_STATUSES = ["ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const MEETING_STATUSES = ["SCHEDULED", "IN_PROGRESS", "APPROVED", "COMPLETED", "CANCELLED"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const LOCKED_STATUSES = ["APPROVED", "COMPLETED", "CANCELLED"] as const;
export type LockedStatus = (typeof LOCKED_STATUSES)[number];

export function isLockedMeetingStatus(status?: string | null): boolean {
  return !!status && LOCKED_STATUSES.includes(status as any);
}

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PARTICIPANT_STATUSES = ["INVITED", "ACCEPTED", "DECLINED", "ATTENDED", "ABSENT"] as const;

export const AGENDA_STATUSES = ["PENDING", "DISCUSSED", "DEFERRED"] as const;

export const DECISION_STATUSES = ["OPEN", "IMPLEMENTED", "REVERSED"] as const;

export const ACTION_ITEM_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "MEETING_INVITE",
  "ACTION_ASSIGNED",
  "ACTION_DUE_SOON",
  "ACTION_OVERDUE",
  "DECISION_LOGGED",
  "MEETING_REMINDER",
] as const;

export function isOverdue(status: string, deadline: Date): boolean {
  return status !== "COMPLETED" && status !== "CANCELLED" && new Date(deadline).getTime() < Date.now();
}
