import "server-only";
import { randomUUID } from "node:crypto";
import { getSql, getProjectById, listProjects } from "@/lib/db";
import { getTelemetryPayload } from "@/lib/telemetry";
import { listOperationalAlerts } from "@/lib/alerts";
import { analyzeMaintenance, saveMaintenanceReport } from "@/lib/maintenance";

export type ProposalState = "proposed" | "approved" | "creating" | "rejected" | "created";
export type MaintenanceProposal = {
  id: string; projectId: string; projectName: string; title: string;
  body: string; head: string; base: string; state: ProposalState;
  prUrl: string | null; createdAt: string; updatedAt: string;
};
export type Correlation = {
  projectId: string; projectName: string; title: string; severity: string;
  occurrences: number; openTasks: number; evidence: string; recommendation: string;
};

let schema: Promise<void> | undefined;
export async function ensureOperationsSchema() {
  if (!schema) schema = (async () => {
    const sql = getSql();
    await sql`CREATE TABLE IF NOT EXISTS maintenance_proposals (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, project_name TEXT NOT NULL,
      title TEXT NOT NULL, body TEXT NOT NULL, head TEXT NOT NULL, base TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','approved','creating','rejected','created')),
      pr_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS maintenance_audit (
      id TEXT PRIMARY KEY, event TEXT NOT NULL, actor TEXT NOT NULL,
      target_id TEXT, details TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS maintenance_audit_date_idx ON maintenance_audit (created_at DESC)`;
    await sql`CREATE TABLE IF NOT EXISTS maintenance_scheduled_runs (
      day DATE NOT NULL, project_id TEXT NOT NULL, report_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(day,project_id)
    )`;
  })().catch(e => { schema=undefined; throw e; });
  return schema;
}

export async function audit(event: string, actor: string, targetId: string | null, details: string) {
  await ensureOperationsSchema();
  const sql=getSql();
  await sql`INSERT INTO maintenance_audit (id,event,actor,target_id,details)
    VALUES (${randomUUID()},${event},${actor.slice(0,160)},${targetId},${details.slice(0,800)})`;
}

export async function getCorrelations(): Promise<Correlation[]> {
  const [telemetry,alerts]=await Promise.all([getTelemetryPayload(),listOperationalAlerts()]);
  const active=alerts.alerts.filter(a=>a.state==="active");
  const tasks=(telemetry.tasks || []).filter(t=>t.status!=="done");
  return telemetry.recommendations.filter(r=>r.status!=="resolved").map(r=>{
    const matches=active.filter(a=>a.projectId===r.projectId && (a.title===r.title || a.id.includes(r.id)));
    const occurrences=matches.length?Math.max(...matches.map(a=>a.occurrences)):0;
    const openTasks=tasks.filter(t=>t.projectId===r.projectId && (t.recommendationId===r.id || t.title===r.title)).length;
    return {
      projectId:r.projectId||"", projectName:r.projectName||"Sistema", title:r.title,
      severity:r.severity, occurrences,openTasks,
      evidence:r.evidence.slice(0,500),
      recommendation:occurrences>=3?"Falha recorrente: comparar alterações e deploys recentes antes de nova tentativa.":openTasks?"Já existe plano em aberto: conferir checklist e resultados antes de duplicar tarefas.":r.action,
    };
  }).filter(c=>c.occurrences>=2 || c.openTasks>0)
    .sort((a,b)=>b.occurrences-a.occurrences || b.openTasks-a.openTasks).slice(0,60);
}

function proposalFromRow(r: Record<string,any>): MaintenanceProposal {
  return {id:String(r.id),projectId:String(r.project_id),projectName:String(r.project_name),
    title:String(r.title),body:String(r.body),head:String(r.head),base:String(r.base),
    state:r.state as ProposalState,prUrl:r.pr_url?String(r.pr_url):null,
    createdAt:new Date(r.created_at).toISOString(),updatedAt:new Date(r.updated_at).toISOString()};
}
export async function getOperationsDashboard() {
  await ensureOperationsSchema();
  const sql=getSql();
  const [projects,proposals,auditRows,correlations]=await Promise.all([
    listProjects(false),
    sql`SELECT * FROM maintenance_proposals ORDER BY created_at DESC LIMIT 40`,
    sql`SELECT event,actor,target_id,details,created_at FROM maintenance_audit ORDER BY created_at DESC LIMIT 60`,
    getCorrelations(),
  ]);
  return {
    projects:projects.map(p=>({id:p.id,name:p.name,repoUrl:p.repo_url,defaultBranch:p.default_branch})),
    proposals:proposals.map(proposalFromRow),correlations,
    audit:auditRows.map(r=>({event:String(r.event),actor:String(r.actor),targetId:r.target_id?String(r.target_id):null,
      details:String(r.details),createdAt:new Date(r.created_at).toISOString()})),
  };
}

export async function createProposal(input: {projectId:string;title:string;body:string;head:string;base:string},actor:string) {
  await ensureOperationsSchema();
  const project=await getProjectById(input.projectId);
  if(!project || project.is_hidden) throw new Error("PROJECT_NOT_FOUND");
  if(!parseGitHubRepository(project.repo_url)) throw new Error("GITHUB_ONLY");
  const branch=/^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,120}$/;
  if(!branch.test(input.head)||!branch.test(input.base)||input.head===input.base || input.head.includes("..") || input.base.includes("..")) throw new Error("INVALID_BRANCH");
  if(input.base!==project.default_branch) throw new Error("BASE_MISMATCH");
  if(!input.title.trim() || input.title.length>180 || input.body.length>6000) throw new Error("INVALID_TEXT");
  const sql=getSql();const id=randomUUID();
  await sql`INSERT INTO maintenance_proposals(id,project_id,project_name,title,body,head,base)
   VALUES (${id},${project.id},${project.name},${input.title.trim()},${input.body.trim()},${input.head},${input.base})`;
  await audit("proposal.created",actor,id,`${project.name} · ${input.head} → ${input.base}`);
  return id;
}

export function parseGitHubRepository(value:string): {owner:string;repo:string}|null {
  try {
    const u=new URL(value);
    if(u.protocol!=="https:" || u.hostname!=="github.com" || u.username || u.password || u.port) return null;
    const parts=u.pathname.replace(/\.git$/i,"").split("/").filter(Boolean);
    if(parts.length!==2 || !parts.every(x=>/^[a-zA-Z0-9_.-]{1,100}$/.test(x))) return null;
    return {owner:parts[0],repo:parts[1]};
  }catch{return null;}
}

export async function decideProposal(id:string,action:"approve"|"reject",actor:string) {
  await ensureOperationsSchema();const sql=getSql();
  const state=action==="approve"?"approved":"rejected";
  const updated=await sql`UPDATE maintenance_proposals SET state=${state},updated_at=NOW()
    WHERE id=${id} AND state='proposed' RETURNING id`;
  if(!updated.length) throw new Error("INVALID_PROPOSAL_STATE");
  await audit(`proposal.${action}`,actor,id,"Decisão explícita do administrador; nenhuma alteração de código executada.");
}

export async function createApprovedPullRequest(id:string,actor:string):Promise<string> {
  await ensureOperationsSchema();const sql=getSql();
  const rows=await sql`UPDATE maintenance_proposals SET state='creating',updated_at=NOW()
    WHERE id=${id} AND state='approved' RETURNING *`;
  if(!rows.length)throw new Error("INVALID_PROPOSAL_STATE");
  const p=proposalFromRow(rows[0]);
  const project=await getProjectById(p.projectId);
  const slug=project?parseGitHubRepository(project.repo_url):null;
  if(!slug || project?.default_branch!==p.base){
    await sql`UPDATE maintenance_proposals SET state='approved' WHERE id=${id} AND state='creating'`;
    throw new Error("PROJECT_CHANGED");
  }
  const token=process.env.GITHUB_TOKEN?.trim();
  if(!token){
    await sql`UPDATE maintenance_proposals SET state='approved' WHERE id=${id} AND state='creating'`;
    throw new Error("GITHUB_TOKEN_MISSING");
  }
  // A pull request is created ONLY for an existing branch, never by modifying code.
  let res:Response;
  try {res=await fetch(`https://api.github.com/repos/${encodeURIComponent(slug.owner)}/${encodeURIComponent(slug.repo)}/pulls`,{
    method:"POST",cache:"no-store",headers:{Authorization:`Bearer ${token}`,Accept:"application/vnd.github+json","Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28"},
    body:JSON.stringify({title:p.title,body:p.body,head:p.head,base:p.base,draft:true}),
  });} catch(e){
    await sql`UPDATE maintenance_proposals SET state='approved' WHERE id=${id} AND state='creating'`;
    throw e;
  }
  if(!res.ok) {
    await sql`UPDATE maintenance_proposals SET state='approved' WHERE id=${id} AND state='creating'`;
    await audit("pr.create.failed",actor,id,`GitHub HTTP ${res.status}`);
    throw new Error(`GITHUB_HTTP_${res.status}`);
  }
  const data=await res.json() as {html_url?:string};
  if(!data.html_url?.startsWith("https://github.com/")){
    // GitHub may have created the PR; require manual reconciliation before retry.
    await audit("pr.create.uncertain",actor,id,"Resposta do GitHub sem URL validada; conferir PR manualmente.");
    throw new Error("INVALID_GITHUB_RESPONSE");
  }
  await sql`UPDATE maintenance_proposals SET state='created',pr_url=${data.html_url},updated_at=NOW()
      WHERE id=${id} AND state='creating'`;
  await audit("pr.draft.created",actor,id,`Pull request draft criado: ${data.html_url}`);
  return data.html_url;
}

export async function runPreventiveMaintenance(actor:string,maxProjects=10) {
  await ensureOperationsSchema();
  const sql=getSql();const projects=(await listProjects(false)).filter(p=>p.state!=="archived").slice(0,maxProjects);
  const generated:string[]=[];const skipped:string[]=[];const failed:string[]=[];
  for(const project of projects){
    try{
      // Atomic daily claim prevents duplicate scheduled analyses across concurrent workers.
      const report=await analyzeMaintenance(project.id);
      const claim=await sql`INSERT INTO maintenance_scheduled_runs(day,project_id,report_id)
        VALUES (CURRENT_DATE,${project.id},${report.id}) ON CONFLICT DO NOTHING RETURNING report_id`;
      if(!claim.length){skipped.push(project.name);continue;}
      try {await saveMaintenanceReport(report);} catch(err){
        await sql`DELETE FROM maintenance_scheduled_runs WHERE project_id=${project.id} AND report_id=${report.id}`;
        throw err;
      }
      generated.push(project.name);
    }catch(e){failed.push(project.name);console.error("Falha na análise preventiva",project.id,e);}
  }
  await audit("maintenance.scheduled",actor,null,`Gerados ${generated.length}; ignorados ${skipped.length}; falhas ${failed.length}`);
  return {generated,skipped,failed};
}
