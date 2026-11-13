import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import {
  listOperationalAlerts,
  markOperationalAlertRead,
  scanOperationalAlerts,
} from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await listOperationalAlerts(), { headers: privateHeaders });
  } catch (e) {
    console.error("Falha ao listar alertas operacionais", e);
    return NextResponse.json({ error: "Falha ao carregar alertas." }, { status: 500 });
  }
}

// Manual re-analysis, explicitly triggered by the authenticated admin.
export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await scanOperationalAlerts(), { headers: privateHeaders });
  } catch (e) {
    console.error("Falha na análise de alertas", e);
    return NextResponse.json({ error: "Não foi possível analisar os alertas." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || body.id.length > 512 || !body.id) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }
  try {
    const ok = await markOperationalAlertRead(body.id);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404, headers: privateHeaders });
  } catch (e) {
    console.error("Falha ao registrar leitura", e);
    return NextResponse.json({ error: "Falha ao atualizar alerta." }, { status: 500 });
  }
}
