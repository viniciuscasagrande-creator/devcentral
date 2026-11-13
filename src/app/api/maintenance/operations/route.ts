import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import {
  createApprovedPullRequest, createProposal, decideProposal, getOperationsDashboard,
  runPreventiveMaintenance,
} from "@/lib/maintenance-operations";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noCache={"Cache-Control":"private, no-store"};

export async function GET(req:NextRequest){
  const denied=await requireAdmin(req);if(denied)return denied;
  try{return NextResponse.json(await getOperationsDashboard(),{headers:noCache});}
  catch(e){console.error("Maintenance operations GET",e);return NextResponse.json({error:"Falha ao consultar operações."},{status:500});}
}
export async function POST(req:NextRequest){
  const denied=await requireAdmin(req);if(denied)return denied;
  let input:Record<string,unknown>;
  try{const body:unknown=await req.json();if(!body||typeof body!=="object"||Array.isArray(body))throw Error();input=body as Record<string,unknown>;}
  catch{return NextResponse.json({error:"JSON inválido."},{status:400});}
  const action=input.action;
  const actor="admin autenticado";
  try{
    if(action==="propose"){
      for(const k of ["projectId","title","body","head","base"]){if(typeof input[k]!=="string")return NextResponse.json({error:`Campo inválido: ${k}`},{status:400});}
      const id=await createProposal({projectId:String(input.projectId),title:String(input.title),body:String(input.body),head:String(input.head),base:String(input.base)},actor);
      return NextResponse.json({ok:true,id},{headers:noCache});
    }
    if(action==="approve"||action==="reject"){
      if(typeof input.id!=="string"||input.id.length>100)return NextResponse.json({error:"ID inválido."},{status:400});
      await decideProposal(input.id,action,actor);return NextResponse.json({ok:true},{headers:noCache});
    }
    if(action==="create_pr"){
      if(typeof input.id!=="string"||input.id.length>100||input.confirm!=="CRIAR PR")return NextResponse.json({error:"Confirmação explícita obrigatória."},{status:400});
      const url=await createApprovedPullRequest(input.id,actor);
      return NextResponse.json({ok:true,url},{headers:noCache});
    }
    if(action==="run_preventive"){
      const result=await runPreventiveMaintenance(actor,10);
      return NextResponse.json({ok:true,...result},{headers:noCache});
    }
    return NextResponse.json({error:"Operação desconhecida."},{status:400});
  }catch(e){
    const reason=e instanceof Error?e.message:"UNKNOWN";
    const known=["PROJECT_NOT_FOUND","GITHUB_ONLY","INVALID_BRANCH","BASE_MISMATCH","INVALID_TEXT","INVALID_PROPOSAL_STATE","PROJECT_CHANGED","GITHUB_TOKEN_MISSING"];
    const status=known.includes(reason)?409:reason.startsWith("GITHUB_HTTP_")?502:500;
    if(status===500)console.error("Maintenance operations POST",e);
    return NextResponse.json({error:known.includes(reason)?reason:status===502?"GitHub recusou a criação do PR. Confira a branch e o token.":"Falha ao executar a operação."},{status});
  }
}
