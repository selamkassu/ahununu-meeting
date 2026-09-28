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

  // Meeting management (3-Tier Ownership)
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

  // Agenda
  "agenda:view",
  "agenda:create",
  "agenda:edit",

  // Minutes (3-Tier Ownership)
  "minutes:view:all",
  "minutes:view:dept",
  "minutes:view:own",
  "minutes:create",
  "minutes:edit:all",
  "minutes:edit:dept",
  "minutes:edit:own",
  "minutes:sign",

  // Decisions (3-Tier Ownership)
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

  // Action items (3-Tier Ownership)
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

  // Documents (3-Tier Ownership)
  "documents:view:all",
  "documents:view:dept",
  "documents:view:own",
  "documents:upload",
  "documents:delete:all",
  "documents:delete:dept",
  "documents:delete:own",
  "documents:download",

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
  {
    label: "Agenda",
    permissions: ["agenda:view", "agenda:create", "agenda:edit"],
  },
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

// ──────────────────────────────────────────────────────────────
// DEFAULT PERMISSIONS FOR BUILT-IN SYSTEM ROLES
// These are used during seeding/migration to create the initial
// system roles. Admins can customize them later.
// ──────────────────────────────────────────────────────────────

export const SYSTEM_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  SYSTEM_ADMIN: [...PERMISSIONS], // all permissions
  MEETING_APPROVER: [
    "meetings:view:all",
    "meetings:approve",
    "meetings:certify_lock",
    "minutes:view:all",
    "minutes:sign",
    "decisions:view:all",
    "action_items:view:all",
    "documents:view:all",
    "documents:download",
    "notifications:view",
    "dashboard:view",
  ],
  MEETING_SECRETARY: [
    "meetings:view:all", "meetings:create", "meetings:edit:all", "meetings:delete:all",
    "meetings:manage_participants", "meetings:approve", "meetings:certify_lock",
    "agenda:view", "agenda:create", "agenda:edit",
    "minutes:view:all", "minutes:create", "minutes:edit:all", "minutes:sign",
    "decisions:view:all", "decisions:create", "decisions:edit:all", "decisions:delete:all",
    "action_items:view:all", "action_items:create", "action_items:edit:all", "action_items:delete:all",
    "documents:view:all", "documents:upload", "documents:delete:all", "documents:download",
    "notifications:view",
    "reports:view",
    "dashboard:view",
  ],
  DEPARTMENT_HEAD: [
    "meetings:view:dept", "meetings:create", "meetings:edit:dept",
    "meetings:manage_participants", "meetings:approve",
    "agenda:view", "agenda:create", "agenda:edit",
    "minutes:view:dept", "minutes:create", "minutes:edit:dept",
    "decisions:view:dept", "decisions:create", "decisions:edit:dept",
    "action_items:view:dept", "action_items:create", "action_items:edit:dept",
    "documents:view:dept", "documents:upload", "documents:delete:dept", "documents:download",
    "notifications:view",
    "reports:view",
    "dashboard:view",
    "departments:view",
  ],
  PARTICIPANT: [
    "meetings:view:own",
    "agenda:view",
    "minutes:view:own",
    "decisions:view:own",
    "action_items:view:own", "action_items:edit:own",
    "documents:view:own", "documents:download",
    "notifications:view",
    "dashboard:view",
  ],
};

// ──────────────────────────────────────────────────────────────
// ENUM-LIKE VALUE LISTS (statuses, priorities, etc.)
// ──────────────────────────────────────────────────────────────

export const USER_STATUSES = ["ACTIVE", "SUSPENDED", "DEACTIVATED"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const MEETING_STATUSES = ["SCHEDULED", "IN_PROGRESS", "PENDING_SIGNATURES", "READY_FOR_APPROVAL", "APPROVED", "COMPLETED", "CANCELLED"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const LOCKED_STATUSES = ["PENDING_SIGNATURES", "READY_FOR_APPROVAL", "APPROVED", "COMPLETED", "CANCELLED"] as const;
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
