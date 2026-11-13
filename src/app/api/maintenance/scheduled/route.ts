import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runPreventiveMaintenance } from "@/lib/maintenance-operations";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
  const secret=process.env.MAINTENANCE_CRON_SECRET;
  const received=req.headers.get("x-devcentral-maintenance-key")||"";
  if(!secret||secret.length<32||received.length>1024||!received){
    return NextResponse.json({error:"Não autorizado"},{status:401});
  }
  const a=Buffer.from(secret),b=Buffer.from(received);
  if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:"Não autorizado"},{status:401});
  try{return NextResponse.json(await runPreventiveMaintenance("cloud-scheduler",10),{headers:{"Cache-Control":"no-store"}});}
  catch(e){console.error("Maintenance scheduled job",e);return NextResponse.json({error:"Falha na manutenção agendada."},{status:500});}
}
