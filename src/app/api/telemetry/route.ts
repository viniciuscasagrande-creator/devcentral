import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { changeRecommendationStatus, getTelemetryPayload } from "@/lib/telemetry";
import type { RecommendationStatus, TelemetryRecommendation } from "@/types/telemetry";

export type { TelemetryRecommendation };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const hasAuthHeader = Boolean(req.headers.get("authorization"));
  if (hasAuthHeader) {
    const denied = await requireAdmin(req);
    if (denied) return denied;
  }
  try {
    return NextResponse.json(await getTelemetryPayload(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Falha ao consultar telemetria", error);
    return NextResponse.json(
      { error: "Não foi possível consultar a telemetria." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  let body: { id?: unknown; status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const status = body.status;
  if (
    !id ||
    id.length > 512 ||
    !["open", "investigating", "resolved"].includes(String(status))
  ) {
    return NextResponse.json(
      { error: "ID ou status inválido" },
      { status: 400 }
    );
  }
  try {
    const found = await changeRecommendationStatus(
      id,
      status as RecommendationStatus
    );
    if (!found) {
      return NextResponse.json(
        { error: "Recomendação não encontrada" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Falha ao alterar status da recomendação", error);
    return NextResponse.json(
      { error: "Falha ao salvar alteração." },
      { status: 500 }
    );
  }
}
