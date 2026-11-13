import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { listMaintenanceHistory } from "@/lib/maintenance-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const q = req.nextUrl.searchParams;
  const projectId = q.get("projectId") || "";
  const search = (q.get("search") || "").trim();
  const severity = q.get("severity") || "";
  const method = q.get("method") || "";
  const from = q.get("from") || "";
  const to = q.get("to") || "";
  const pageRaw = q.get("page") || "1";
  const pageSizeRaw = q.get("pageSize") || "10";
  const page = Number(pageRaw);
  const pageSize = Number(pageSizeRaw);

  if (projectId.length > 256 || search.length > 160 ||
      !["", "critical", "warning", "info"].includes(severity) ||
      !["", "rules", "ai"].includes(method) ||
      (from && !validDate(from)) || (to && !validDate(to)) ||
      (from && to && from > to) ||
      !/^\d+$/.test(pageRaw) || !Number.isSafeInteger(page) || page < 1 || page > 100000 ||
      !/^\d+$/.test(pageSizeRaw) || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return NextResponse.json({ error: "Filtros ou paginação inválidos." }, { status: 400 });
  }

  try {
    const result = await listMaintenanceHistory({
      projectId: projectId || undefined, search: search || undefined,
      severity: severity ? severity as "critical" | "warning" | "info" : undefined,
      method: method ? method as "rules" | "ai" : undefined,
      from: from || undefined, to: to || undefined, page, pageSize,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Falha ao consultar histórico de manutenção", error);
    return NextResponse.json({ error: "Não foi possível carregar o histórico." }, { status: 500 });
  }
}
