import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { getHealthReport } from "@/lib/health-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const value = Number(req.nextUrl.searchParams.get("days") || "30");
  if (![7,30,90].includes(value)) return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  try {
    const data = await getHealthReport(value as 7 | 30 | 90);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("Erro ao montar relatório", err);
    return NextResponse.json({ error: "Falha ao obter relatório de saúde" }, { status: 500 });
  }
}
