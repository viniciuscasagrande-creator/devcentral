import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { answerCopilot, getV4Overview, inspectCode, listPullRequests } from "@/lib/devcentral-v4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noCache = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const view = req.nextUrl.searchParams.get("view") || "overview";
  const projectId = req.nextUrl.searchParams.get("projectId") || "";
  if (projectId.length > 256) return NextResponse.json({ error: "Projeto inválido." }, { status: 400 });
  try {
    const value = view === "overview" ? await getV4Overview()
      : view === "code" ? await inspectCode(projectId)
      : view === "prs" ? await listPullRequests(projectId)
      : null;
    if (!value) return NextResponse.json({ error: "Consulta desconhecida." }, { status: 400 });
    return NextResponse.json(value, { headers: noCache });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "PROJECT_NOT_FOUND" || message === "PROJECT_INVALID")
      return NextResponse.json({ error: "Projeto inválido ou não encontrado." }, { status: 404 });
    console.error("DevCentral v4 GET", error);
    return NextResponse.json({ error: "Não foi possível consultar as integrações. Tente novamente." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  let body: { projectId?: unknown; question?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  if (typeof body.projectId !== "string" || body.projectId.length > 256 ||
      typeof body.question !== "string" || body.question.length > 500 || body.question.trim().length < 4) {
    return NextResponse.json({ error: "Informe um projeto e uma pergunta de 4 a 500 caracteres." }, { status: 400 });
  }
  try { return NextResponse.json(await answerCopilot(body.projectId, body.question), { headers: noCache }); }
  catch (error) {
    if (error instanceof Error && ["PROJECT_NOT_FOUND", "PROJECT_INVALID", "QUESTION_INVALID"].includes(error.message))
      return NextResponse.json({ error: "Projeto ou pergunta inválidos." }, { status: 400 });
    console.error("DevCentral v4 POST", error);
    return NextResponse.json({ error: "Falha ao consultar o copiloto." }, { status: 500 });
  }
}
