import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireAdmin } from "@/lib/auth-admin";
import { getIntegrationStatus, runFullSync } from "@/lib/integrations";
import { getLastSyncLog, listProjects } from "@/lib/db";

export const dynamic = "force-dynamic";

function validKey(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const expectedKey = process.env.DASHBOARD_SYNC_KEY?.trim() || "";
    if (!expectedKey) {
      return NextResponse.json(
        { error: "DASHBOARD_SYNC_KEY nao configurada" },
        { status: 503 }
      );
    }
    if (expectedKey) {
      const authHeader = ""; // Authorization agora e reservado para o ID token Firebase.
      let bodyKey = "";
      try {
        const body = await req.json();
        bodyKey = body?.syncKey || "";
      } catch {
        // ignore empty body
      }
      const provided = authHeader || bodyKey;
      if (!validKey(provided, expectedKey)) {
        return NextResponse.json(
          {
            error:
              "Senha de sincronização (DASHBOARD_SYNC_KEY) incorreta ou não informada.",
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

    const syncResult = await runFullSync();
    const [projects, lastSync] = await Promise.all([
      listProjects(true),
      getLastSyncLog(),
    ]);

    return NextResponse.json({
      syncResult,
      projects,
      lastSync,
      integrationStatus: status,
    });
  } catch (err: any) {
    console.error("POST /api/sync error:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao sincronizar integrações." },
      { status: 500 }
    );
  }
}
