// Public, browser-safe alert DTO. No server-only modules imported here.
export type DevCentralAlert = {
  id: string;
  projectId: string | null;
  projectName: string;
  title: string;
  evidence: string;
  severity: "critical" | "warning";
  state: "active" | "recovered";
  readAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  recoveredAt: string | null;
  occurrences: number;
};
