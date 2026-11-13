import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { scanOperationalAlerts } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSchedulerKey(req: NextRequest) {
  const expected = process.env.ALERTS_CRON_SECRET;
  const actual = req.headers.get("x-devcentral-job-key") || "";
  if (!expected || expected.length < 32 || !actual || actual.length > 1024) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// No GET handler: scans are POST-only and never public.
export async function POST(req: NextRequest) {
  if (!validSchedulerKey(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    return NextResponse.json(await scanOperationalAlerts(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("Falha no job agendado de alertas", e);
    return NextResponse.json({ error: "Falha na verificação agendada." }, { status: 500 });
  }
}
