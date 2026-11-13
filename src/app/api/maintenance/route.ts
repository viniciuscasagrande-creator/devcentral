import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import {
  analyzeMaintenance, getOptionalAiAdvice, listMaintenanceReports, saveMaintenanceReport,
} from "@/lib/maintenance";
import { listProjects } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noCache = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  try {
    const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
    const limit = Math.min(Math.max(1, Number(req.nextUrl.searchParams.get("limit") || "12")), 50);
    const offset = Math.max(0, Number(req.nextUrl.searchParams.get("offset") || "0"));
    if (projectId && projectId.length > 256) return NextResponse.json({error:"Projeto inválido."},{status:400});
    const [projects, historyPage] = await Promise.all([
      listProjects(false),
      listMaintenanceReports(projectId, limit, offset),
    ]);
    return NextResponse.json({
      projects: projects.map(p => ({ id: p.id, name: p.name, source: p.source })),
      reports: historyPage.reports,
      total: historyPage.total,
      hasMore: historyPage.hasMore,
      aiAvailable: Boolean(process.env.OPENAI_API_KEY?.trim()),
    }, {headers:noCache});
  } catch (error) {
    console.error("Falha ao listar relatórios de manutenção", error);
    return NextResponse.json({error:"Não foi possível consultar a manutenção."},{status:500});
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  let body: {projectId?:unknown; useAi?:unknown};
  try { body = await req.json(); }
  catch { return NextResponse.json({error:"JSON inválido."},{status:400}); }
  if (typeof body.projectId !== "string" || !body.projectId.trim() || body.projectId.length > 256 || typeof body.useAi !== "boolean") {
    return NextResponse.json({error:"Informe um projeto válido e a opção de IA."},{status:400});
  }
  try {
    const report = await analyzeMaintenance(body.projectId);
    if (body.useAi) {
      if (!process.env.OPENAI_API_KEY) return NextResponse.json({error:"Configure OPENAI_API_KEY no servidor para habilitar a IA."},{status:409});
      report.aiAdvice = await getOptionalAiAdvice(report);
      report.method = "ai";
      report.sourceNote += " Conselhos complementares gerados por IA a partir de evidências resumidas; precisam de revisão humana.";
    }
    await saveMaintenanceReport(report);
    return NextResponse.json({report},{headers:noCache});
  } catch (error) {
    if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") return NextResponse.json({error:"Projeto não encontrado."},{status:404});
    if (error instanceof Error && ["AI_NOT_CONFIGURED","AI_PROVIDER_UNAVAILABLE","AI_EMPTY_RESPONSE"].includes(error.message)) {
      return NextResponse.json({error:"A IA não respondeu. Nenhuma análise foi gravada; tente novamente sem IA."},{status:502});
    }
    console.error("Falha na análise de manutenção", error);
    return NextResponse.json({error:"Não foi possível executar a análise."},{status:500});
  }
}
