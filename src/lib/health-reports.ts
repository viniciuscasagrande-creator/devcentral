import "server-only";
import { getSql, listProjectTasks, listProjects } from "@/lib/db";
import { ensureAlertsSchema } from "@/lib/alerts";

let ready: Promise<void> | undefined;
async function ensureReportsSchema() {
  if (!ready) ready = (async () => {
    const sql = getSql();
    await sql`CREATE TABLE IF NOT EXISTS operational_health_daily (
      day DATE PRIMARY KEY,
      projects INTEGER NOT NULL,
      deploy_failures INTEGER NOT NULL,
      critical_alerts INTEGER NOT NULL,
      active_alerts INTEGER NOT NULL,
      pending_tasks INTEGER NOT NULL,
      last_sync_at TIMESTAMPTZ,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
  })().catch(err => { ready = undefined; throw err; });
  await ready;
}

async function collectHealth() {
  await ensureAlertsSchema();
  const sql = getSql();
  const [projects, tasks, alertRows, syncRows] = await Promise.all([
    listProjects(false), listProjectTasks(),
    sql`SELECT severity, COUNT(*)::int AS total FROM operational_alerts WHERE state = 'active' GROUP BY severity`,
    sql`SELECT MAX(synced_at) AS last_sync_at FROM sync_logs`,
  ]);
  const activeAlerts = alertRows.reduce((n, r) => n + Number(r.total), 0);
  const criticalAlerts = alertRows.filter(r => r.severity === "critical").reduce((n, r) => n + Number(r.total), 0);
  return {
    projects: projects.length,
    deployFailures: projects.filter(p => /ERROR|FAILED|FAILURE|CANCELED|CANCELLED/i.test(p.last_deploy_status || "")).length,
    activeAlerts, criticalAlerts,
    pendingTasks: tasks.filter(t => t.status !== "done").length,
    lastSyncAt: syncRows[0]?.last_sync_at ? new Date(String(syncRows[0].last_sync_at)).toISOString() : null,
  };
}

export async function recordDailyHealth() {
  await ensureReportsSchema();
  const current = await collectHealth();
  const sql = getSql();
  await sql`INSERT INTO operational_health_daily
    (day, projects, deploy_failures, critical_alerts, active_alerts, pending_tasks, last_sync_at, recorded_at)
    VALUES (CURRENT_DATE, ${current.projects}, ${current.deployFailures}, ${current.criticalAlerts},
    ${current.activeAlerts}, ${current.pendingTasks}, ${current.lastSyncAt}, NOW())
    ON CONFLICT(day) DO UPDATE SET projects=EXCLUDED.projects,
      deploy_failures=EXCLUDED.deploy_failures, critical_alerts=EXCLUDED.critical_alerts,
      active_alerts=EXCLUDED.active_alerts, pending_tasks=EXCLUDED.pending_tasks,
      last_sync_at=EXCLUDED.last_sync_at, recorded_at=NOW()`;
  return current;
}

export async function getHealthReport(days: 7 | 30 | 90) {
  await ensureReportsSchema();
  const current = await collectHealth();
  const sql = getSql();
  const history = await sql`SELECT day::text AS day, projects, deploy_failures,
    critical_alerts, active_alerts, pending_tasks, recorded_at
    FROM operational_health_daily WHERE day >= CURRENT_DATE - ${days - 1}::int
    ORDER BY day ASC`;
  const alerts = await sql`SELECT id, project_name, title, severity, last_seen_at FROM operational_alerts
    WHERE state = 'active' ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END,
    last_seen_at DESC LIMIT 12`;
  const tasks = await listProjectTasks();
  return {
    generatedAt: new Date().toISOString(),
    source: "Neon PostgreSQL — última sincronização e varreduras registradas",
    days, current,
    history: history.map(r => ({ day: String(r.day), projects: Number(r.projects),
      deployFailures: Number(r.deploy_failures), criticalAlerts: Number(r.critical_alerts),
      activeAlerts: Number(r.active_alerts), pendingTasks: Number(r.pending_tasks) })),
    alerts: alerts.map(r => ({ id: String(r.id), projectName: String(r.project_name),
      title: String(r.title), severity: String(r.severity), lastSeenAt: new Date(String(r.last_seen_at)).toISOString() })),
    tasks: tasks.filter(t => t.status !== "done").slice(0, 12).map(t => ({
      id: t.id, title: t.title, projectName: t.projectName, priority: t.priority, status: t.status,
    })),
  };
}
