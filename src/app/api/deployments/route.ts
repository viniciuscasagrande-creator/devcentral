import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { listProjects } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const projects = await listProjects(false);
    const deployments = projects.flatMap((p) => {
      const list = Array.isArray(p.deployments) ? [...p.deployments] : [];
      if (p.deploy_url && !list.some((d) => d.url === p.deploy_url)) {
        list.unshift({
          url: p.deploy_url,
          status: p.last_deploy_status || (p.state === "online" ? "READY" : "UNKNOWN"),
          account: p.vercel_accounts?.[0] || p.source,
          sourceKey: "vercel1",
          vercelProjectId: p.vercel_project_id || p.id,
        });
      }
      return list.map((d) => ({
        ...d,
        projectId: p.id,
        projectName: p.name,
        tech: p.tech,
        updatedAt: p.updated_at,
      }));
    });

    return NextResponse.json({ deployments });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro ao listar deploys." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const rawUrl = String(body.url || "").trim();
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
      return NextResponse.json(
        { error: "URL inválida para verificação." },
        { status: 400 }
      );
    }

    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(rawUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - start;
      return NextResponse.json({
        url: rawUrl,
        reachable: res.ok || res.status < 500,
        statusCode: res.status,
        latencyMs,
        checkedAt: new Date().toISOString(),
      });
    } catch (fetchErr: any) {
      clearTimeout(timeout);
      return NextResponse.json({
        url: rawUrl,
        reachable: false,
        statusCode: 0,
        latencyMs: Date.now() - start,
        error: fetchErr?.message || "Falha de conexão",
        checkedAt: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro ao verificar disponibilidade." },
      { status: 500 }
    );
  }
}
