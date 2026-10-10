export interface AuditLogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "SECURITY";
  action: string;
  actorId?: string;
  actorEmail?: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ip?: string;
}

export function logAuditEvent(entry: Omit<AuditLogEntry, "timestamp">): void {
  const fullEntry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  const formatted = `[AUDIT] [${fullEntry.timestamp}] [${fullEntry.level}] Action=${fullEntry.action} Actor=${fullEntry.actorEmail || fullEntry.actorId || "System"} Resource=${fullEntry.resource}${fullEntry.resourceId ? `:${fullEntry.resourceId}` : ""} Details=${JSON.stringify(fullEntry.details || {})}`;

  if (fullEntry.level === "SECURITY") {
    console.warn(`\x1b[33m${formatted}\x1b[0m`);
  } else if (fullEntry.level === "WARN") {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}
