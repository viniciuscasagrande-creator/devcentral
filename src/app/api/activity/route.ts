import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { listSyncLogs } from "@/lib/db";
import { getIntegrationStatus } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const logs = await listSyncLogs(30);
    const integrationStatus = getIntegrationStatus();

    return NextResponse.json({
      logs,
      integrationStatus,
    });
  } catch (err: any) {
    console.error("GET /api/activity error:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao consultar histórico de sincronização." },
      { status: 500 }
    );
  }
}
