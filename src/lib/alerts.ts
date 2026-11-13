import "server-only";
import { getSql } from "@/lib/db";
import { getTelemetryPayload } from "@/lib/telemetry";

export type AlertSeverity = "critical" | "warning";
export interface DevCentralAlert {
  id: string;
  projectId: string | null;
  projectName: string;
  title: string;
  evidence: string;
  severity: AlertSeverity;
  state: "active" | "recovered";
  readAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  recoveredAt: string | null;
  occurrences: number;
}

let schemaPromise: Promise<void> | undefined;
export async function ensureAlertsSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS operational_alerts (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          project_name TEXT NOT NULL,
          title TEXT NOT NULL,
          evidence TEXT NOT NULL DEFAULT '',
          severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning')),
          state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'recovered')),
          read_at TIMESTAMPTZ,
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          recovered_at TIMESTAMPTZ,
          occurrences INTEGER NOT NULL DEFAULT 1
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS operational_alerts_state_idx ON operational_alerts (state, last_seen_at DESC)`;
    })().catch((e) => {
      schemaPromise = undefined;
      throw e;
    });
  }
  await schemaPromise;
}

function toAlert(r: Record<string, unknown>): DevCentralAlert {
  const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
  return {
    id: String(r.id),
    projectId: r.project_id == null ? null : String(r.project_id),
    projectName: String(r.project_name),
    title: String(r.title),
    evidence: String(r.evidence),
    severity: String(r.severity) as AlertSeverity,
    state: String(r.state) as DevCentralAlert["state"],
    readAt: iso(r.read_at),
    firstSeenAt: iso(r.first_seen_at)!,
    lastSeenAt: iso(r.last_seen_at)!,
    recoveredAt: iso(r.recovered_at),
    occurrences: Number(r.occurrences || 1),
  };
}

export async function listOperationalAlerts() {
  await ensureAlertsSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM operational_alerts
    ORDER BY CASE WHEN state = 'active' THEN 0 ELSE 1 END,
             CASE severity WHEN 'critical' THEN 0 ELSE 1 END,
             last_seen_at DESC
    LIMIT 100
  `;
  const alerts = rows.map(toAlert);
  return {
    alerts,
    unreadCount: alerts.filter((a) => a.state === "active" && !a.readAt).length,
    activeCount: alerts.filter((a) => a.state === "active").length,
  };
}

export async function markOperationalAlertRead(id: string) {
  await ensureAlertsSchema();
  const sql = getSql();
  const rows = await sql`
    UPDATE operational_alerts SET read_at = NOW()
    WHERE id = ${id} AND read_at IS NULL
    RETURNING id
  `;
  if (rows.length) return true;
  const exists = await sql`SELECT id FROM operational_alerts WHERE id = ${id} LIMIT 1`;
  return exists.length > 0;
}

// Called only from authenticated admin actions or an authenticated scheduler.
// Based on recorded telemetry; this job does NOT claim to perform a live HTTP check.
export async function scanOperationalAlerts() {
  await ensureAlertsSchema();
  const payload = await getTelemetryPayload();
  const active = payload.recommendations.filter(
    (r) =>
      r.kind === "confirmed_issue" &&
      (r.severity === "critical" || r.severity === "warning") &&
      r.status !== "resolved"
  );
  const sql = getSql();
  const scanStartedAt = new Date().toISOString();

  for (const r of active) {
    // IDs come from internally generated, deterministic recommendation IDs.
    // Reset 'read' only when an alert reappears after recovery.
    await sql`
      INSERT INTO operational_alerts
        (id, project_id, project_name, title, evidence, severity, first_seen_at, last_seen_at)
      VALUES
        (${r.id}, ${r.projectId}, ${r.projectName || "Sistema"}, ${r.title},
         ${r.evidence.slice(0, 2000)}, ${r.severity}, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        project_id = EXCLUDED.project_id,
        project_name = EXCLUDED.project_name,
        title = EXCLUDED.title,
        evidence = EXCLUDED.evidence,
        severity = EXCLUDED.severity,
        state = 'active',
        read_at = CASE WHEN operational_alerts.state = 'recovered' THEN NULL ELSE operational_alerts.read_at END,
        recovered_at = NULL,
        last_seen_at = NOW(),
        occurrences = operational_alerts.occurrences + 1
    `;
  }

  // Only recover previously active alerts that this scan no longer detected.
  // Use the scan start timestamp to protect against overlapping scans touching fresh alerts.
  await sql`
    UPDATE operational_alerts SET state = 'recovered', recovered_at = NOW()
    WHERE state = 'active' AND last_seen_at < ${scanStartedAt}::timestamptz
  `;
  const summary = await listOperationalAlerts();
  return {
    scannedAt: new Date().toISOString(),
    detected: active.length,
    activeCount: summary.activeCount,
    unreadCount: summary.unreadCount,
    source: "Neon / última sincronização do DevCentral",
  };
}
