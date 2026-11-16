import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { listProjects } from "@/lib/db";
import { chatV41, getConversation, investigateV41, metricsV41 } from "@/lib/devcentral-v41";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {"Cache-Control":"private, no-store"};
const fail = (msg:string,status:number)=>NextResponse.json({error:msg},{status,headers});

export async function GET(req:NextRequest) {
  const denied = await requireAdmin(req); if (denied) return denied;
  try {
    const action = req.nextUrl.searchParams.get("action") || "projects";
    if (action === "projects") {
      const projects = await listProjects(false);
      return NextResponse.json({projects:projects.map(p=>({id:p.id,name:p.name,source:p.source,defaultBranch:p.default_branch,repoUrl:p.repo_url}))},{headers});
    }
    if (action === "history") {
      const projectId = req.nextUrl.searchParams.get("projectId") || "";
      return NextResponse.json({messages:await getConversation(projectId,50)},{headers});
    }
    if (action === "metrics") return NextResponse.json(await metricsV41(),{headers});
    return fail("Operação desconhecida.",400);
  } catch (e) { console.error("v41 GET",e); return fail("Falha na consulta do DevCentral 4.1.",500); }
}

export async function POST(req:NextRequest) {
  const denied=await requireAdmin(req); if (denied) return denied;
  let data: Record<string,unknown>;
  try { const body:unknown=await req.json(); if (!body || typeof body!=="object" || Array.isArray(body)) throw Error(); data=body as Record<string,unknown>; }
  catch { return fail("JSON inválido.",400); }
  const projectId = typeof data.projectId === "string" ? data.projectId : "";
  try {
    if (data.action === "chat") {
      if (typeof data.question!=="string" || typeof data.useAi!=="boolean") return fail("Pergunta inválida.",400);
      return NextResponse.json(await chatV41(projectId,data.question,data.useAi),{headers});
    }
    if (data.action === "investigate") return NextResponse.json(await investigateV41(projectId),{headers});
    return fail("Ação desconhecida.",400);
  } catch(e) {
    const reason = e instanceof Error ? e.message : "";
    if (["INVALID_PROJECT","INVALID_QUESTION"].includes(reason)) return fail("Dados inválidos.",400);
    if (reason === "PROJECT_NOT_FOUND") return fail("Projeto não encontrado.",404);
    if (reason === "AI_NOT_CONFIGURED") return fail("IA não configurada no servidor. Use análise por regras.",409);
    if (reason === "AI_UNAVAILABLE" || reason === "AI_EMPTY_RESPONSE" || (e instanceof Error && e.name==="AbortError")) return fail("Serviço de IA indisponível. Nenhuma conversa nova foi gravada.",502);
    console.error("v41 POST",e);return fail("Não foi possível realizar a operação.",500);
  }
}
