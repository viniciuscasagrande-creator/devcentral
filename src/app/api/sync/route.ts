import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireAdmin } from "@/lib/auth-admin";
import { getIntegrationStatus, runFullSync } from "@/lib/integrations";
import { getLastSyncLog, listProjects, listSyncLogs } from "@/lib/db";
import { scanOperationalAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

let isSyncInProgress = false;
let syncStartedAt: number | null = null;

function validKey(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const hasAuthHeader = Boolean(req.headers.get("authorization"));
  if (hasAuthHeader) {
    const denied = await requireAdmin(req);
    if (denied) return denied;
  }
  try {
    const [logs, lastSync] = await Promise.all([
      listSyncLogs(15),
      getLastSyncLog(),
    ]);
    return NextResponse.json({
      isSyncInProgress,
      syncStartedAt,
      lastSync,
      logs,
      integrationStatus: getIntegrationStatus(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro ao consultar histórico de sincronização." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  if (isSyncInProgress && syncStartedAt && Date.now() - syncStartedAt < 120_000) {
    return NextResponse.json(
      {
        error:
          "Uma sincronização já está em andamento. Aguarde a conclusão para evitar execuções duplicadas.",
        duplicatePrevented: true,
        syncStartedAt: new Date(syncStartedAt).toISOString(),
      },
      { status: 409 }
    );
  }

  try {
    const expectedKey = process.env.DASHBOARD_SYNC_KEY?.trim() || "";
    let bodyKey = "";
    let isScheduled = false;
    try {
      const body = await req.json();
      bodyKey = body?.syncKey || "";
      isScheduled = Boolean(body?.scheduled);
    } catch {
      // ignore empty body
    }

    if (expectedKey && !isScheduled) {
      const provided = bodyKey;
      if (provided && !validKey(provided, expectedKey)) {
        return NextResponse.json(
          {
            error:
              "Senha de sincronização (DASHBOARD_SYNC_KEY) incorreta.",
            requiresSyncKey: true,
          },
          { status: 401 }
        );
      }
    }

    const status = getIntegrationStatus();
    const anyConfigured =
      status.github.configured ||
      status.gitlab.configured ||
      status.vercel1.configured ||
      status.vercel2.configured;

    if (!anyConfigured) {
      return NextResponse.json(
        {
          error:
            "Nenhuma integração configurada no servidor (.env.local). Defina GITHUB_TOKEN, GITLAB_TOKEN, VERCEL_TOKEN_1 ou VERCEL_TOKEN_2 para sincronizar automaticamente.",
          integrationStatus: status,
        },
        { status: 400 }
      );
    }

    isSyncInProgress = true;
    syncStartedAt = Date.now();
    try {
      const syncResult = await runFullSync();
      await scanOperationalAlerts().catch(() => null);
      const [projects, lastSync, logs] = await Promise.all([
        listProjects(true),
        getLastSyncLog(),
        listSyncLogs(15),
      ]);

      return NextResponse.json({
        syncResult,
        projects,
        lastSync,
        logs,
        integrationStatus: status,
      });
    } finally {
      isSyncInProgress = false;
      syncStartedAt = null;
    }
  } catch (err: any) {
    isSyncInProgress = false;
    syncStartedAt = null;
    console.error("POST /api/sync error:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao sincronizar integrações." },
      { status: 500 }
    );
  }
}

