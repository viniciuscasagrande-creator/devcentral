import "server-only";
import { getSql } from "@/lib/db";
import { ensureMaintenanceSchema } from "@/lib/maintenance";
import type { MaintenanceAnalysis, MaintenanceFinding } from "@/types/maintenance";

/** Histórico paginado no servidor; as análises nunca são apagadas pela paginação. */
export async function listMaintenanceHistory(options: {
  projectId?: string;
  search?: string;
  severity?: "critical" | "warning" | "info";
  method?: "rules" | "ai";
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}): Promise<{ reports: MaintenanceAnalysis[]; total: number; page: number; pageSize: number; totalPages: number }> {
  await ensureMaintenanceSchema();
  const sql = getSql();
  const projectId = options.projectId || null;
  const search = options.search ? `%${options.search}%` : null;
  const severity = options.severity || null;
  const method = options.method || null;
  const from = options.from || null;
  const to = options.to || null;
  const pageSize = Math.min(50, Math.max(1, options.pageSize));
  const page = Math.max(1, options.page);
  const offset = (page - 1) * pageSize;

  // Explicitly parameterized SQL; no text from the browser is interpolated into SQL syntax.
  const [counts, rows] = await Promise.all([
    sql`
      SELECT COUNT(*)::int AS total FROM maintenance_analyses
      WHERE (${projectId}::text IS NULL OR project_id = ${projectId})
        AND (${search}::text IS NULL OR project_name ILIKE ${search} OR summary ILIKE ${search} OR findings::text ILIKE ${search})
        AND (${severity}::text IS NULL OR findings @> jsonb_build_array(jsonb_build_object('severity', ${severity}::text)))
        AND (${method}::text IS NULL OR method = ${method})
        AND (${from}::text IS NULL OR created_at >= ${from}::date)
        AND (${to}::text IS NULL OR created_at < (${to}::date + INTERVAL '1 day'))
    `,
    sql`
      SELECT id, project_id, project_name, method, summary, findings,
             ai_advice, source_note, created_at
      FROM maintenance_analyses
      WHERE (${projectId}::text IS NULL OR project_id = ${projectId})
        AND (${search}::text IS NULL OR project_name ILIKE ${search} OR summary ILIKE ${search} OR findings::text ILIKE ${search})
        AND (${severity}::text IS NULL OR findings @> jsonb_build_array(jsonb_build_object('severity', ${severity}::text)))
        AND (${method}::text IS NULL OR method = ${method})
        AND (${from}::text IS NULL OR created_at >= ${from}::date)
        AND (${to}::text IS NULL OR created_at < (${to}::date + INTERVAL '1 day'))
      ORDER BY created_at DESC, id DESC LIMIT ${pageSize} OFFSET ${offset}
    `,
  ]);
  const total = Number(counts[0]?.total || 0);
  return {
    reports: rows.map(r => ({
      id: String(r.id), projectId: String(r.project_id), projectName: String(r.project_name),
      createdAt: new Date(String(r.created_at)).toISOString(),
      method: r.method === "ai" ? "ai" : "rules", summary: String(r.summary),
      findings: Array.isArray(r.findings) ? r.findings as MaintenanceFinding[] : [],
      aiAdvice: r.ai_advice ? String(r.ai_advice) : null, sourceNote: String(r.source_note),
    })),
    total, page, pageSize, totalPages: Math.ceil(total / pageSize),
  };
}
