"use client";
import React,{useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import { ArrowLeft,ShieldCheck,RefreshCw,GitPullRequest,ClipboardList,Activity,Clock3 } from "lucide-react";
import { getFirebaseIdToken } from "@/lib/firebase";

type Project={id:string;name:string;repoUrl:string;defaultBranch:string};
type Correlation={projectId:string;projectName:string;title:string;severity:string;occurrences:number;openTasks:number;evidence:string;recommendation:string};
type Proposal={id:string;projectId:string;projectName:string;title:string;body:string;head:string;base:string;state:"proposed"|"approved"|"creating"|"rejected"|"created";prUrl:string|null;createdAt:string};
type Audit={event:string;actor:string;targetId:string|null;details:string;createdAt:string};
type Payload={projects:Project[];proposals:Proposal[];correlations:Correlation[];audit:Audit[]};
const empty:Payload={projects:[],proposals:[],correlations:[],audit:[]};
export function MaintenanceOperations(){
  const [data,setData]=useState<Payload>(empty);
  const [projectId,setProjectId]=useState("");const [title,setTitle]=useState("");const [body,setBody]=useState("");const [head,setHead]=useState("");const [base,setBase]=useState("main");
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");const [query,setQuery]=useState("");
  const request=useCallback(async (method:"GET"|"POST",body?:Record<string,unknown>)=>{
    const token=await getFirebaseIdToken();if(!token)throw new Error("Entre como administrador no DevCentral.");
    const res=await fetch("/api/maintenance/operations",{method,cache:"no-store",headers:{Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(String(json.error||`HTTP ${res.status}`));return json;
  },[]);
  const reload=useCallback(async()=>{const next:Payload=await request("GET");setData(next);setProjectId(prev=>prev||next.projects[0]?.id||"");},[request]);
  useEffect(()=>{void reload().catch(e=>setError(String(e)));},[reload]);
  const currentProject=data.projects.find(p=>p.id===projectId);
  const filtered=useMemo(()=>data.correlations.filter(c=>(!projectId||c.projectId===projectId)&&`${c.title} ${c.projectName} ${c.evidence}`.toLowerCase().includes(query.toLowerCase())),[data.correlations,projectId,query]);
  const operate=async(body:Record<string,unknown>,success:string)=>{
    setBusy(true);setError("");setNotice("");
    try{const result=await request("POST",body);await reload();setNotice(result.url?`${success} ${result.url}`:success);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const inputClass="w-full min-h-11 rounded-xl border border-[#354261] bg-[#0a1427] px-3 py-2.5 text-sm text-white placeholder:text-[#8597b6]";
  const buttonClass="min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold border border-[#526399] bg-[#242c55] hover:bg-[#303a67] disabled:opacity-50 cursor-pointer";
  return <main className="min-h-screen bg-[#070a14] text-white p-4 sm:p-8"><div className="max-w-6xl mx-auto space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><Link href="/" className="inline-flex items-center gap-2 text-sm text-[#b6c5df]"><ArrowLeft size={17}/> Voltar ao painel</Link><div className="flex gap-2"><Link href="/assistente" className={buttonClass}>Assistente</Link><Link href="/relatorios" className={buttonClass}>Relatórios</Link></div></header>
    <section className="p-5 sm:p-7 rounded-2xl border border-[#6f5dcc]/50 bg-gradient-to-r from-[#1b1941] to-[#0d2833]"><p className="text-xs text-[#b2a7ff] uppercase tracking-widest">DevCentral 3.0 • Fases 4.2—4.5</p><h1 className="text-2xl sm:text-4xl font-extrabold mt-2">Operações inteligentes</h1><p className="text-sm text-[#bbcae0] mt-3">Correlação de ocorrências, trilha de auditoria, manutenção preventiva e criação controlada de pull requests draft. Nenhuma alteração de código ou deploy é automática.</p></section>
    {error&&<div role="alert" className="p-3 rounded-xl border border-red-500/50 text-red-200">{error}</div>}
    {notice&&<div role="status" className="p-3 rounded-xl border border-emerald-500/50 text-emerald-200 break-all">{notice}</div>}
    <section className="rounded-2xl border border-[#2b3954] bg-[#111b2e] p-4 space-y-3"><h2 className="text-lg font-bold flex items-center gap-2"><Activity size={18}/> Projeto e correlação de problemas</h2>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2"><select className={inputClass} value={projectId} onChange={e=>{const id=e.target.value;setProjectId(id);setBase(data.projects.find(p=>p.id===id)?.defaultBranch||"main");}}><option value="">Todos os projetos</option>{data.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input className={inputClass} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pesquisar problemas"/><button className={buttonClass} disabled={busy} onClick={()=>void reload().catch(e=>setError(String(e)))}><RefreshCw size={16} className="inline mr-2"/>Atualizar</button></div>
      {filtered.length?filtered.map((c,i)=><article key={`${c.projectId}:${c.title}:${i}`} className="bg-[#091323] border border-[#2d405c] rounded-xl p-3"><div className="flex flex-wrap justify-between gap-2"><b className="text-sm">{c.title}</b><span className="text-xs text-[#fbbf7a]">{c.occurrences} ocorrências • {c.openTasks} planos abertos</span></div><p className="text-xs text-[#9fb1d0] mt-1">{c.projectName} • {c.severity}</p><p className="text-xs text-[#c9d6ea] mt-2">{c.recommendation}</p><p className="text-xs text-[#8fa0be] mt-1 break-words">{c.evidence}</p></article>):<p className="text-xs text-[#9eabc6]">Nenhuma correlação encontrada para estes filtros. Não significa ausência de problemas.</p>}
    </section>
    <section className="rounded-2xl border border-[#2b3954] bg-[#111b2e] p-4 space-y-3"><h2 className="text-lg font-bold flex items-center gap-2"><Clock3 size={18}/> Manutenção preventiva</h2><p className="text-sm text-[#b4c2d9]">Gera até 10 relatórios por execução, no máximo uma vez por projeto por dia. A execução automática depende da configuração do Cloud Scheduler.</p><button className={buttonClass} disabled={busy} onClick={()=>void operate({action:"run_preventive"},"Manutenção preventiva concluída; consulte o histórico do Assistente.")}>Executar verificação manual</button></section>
    <section className="rounded-2xl border border-[#2b3954] bg-[#111b2e] p-4 space-y-3"><h2 className="text-lg font-bold flex items-center gap-2"><GitPullRequest size={18}/> Propostas para pull request</h2><p className="text-xs text-[#a5b4ce]">A branch de correção precisa existir no GitHub. Esta tela não gera nem envia commits. Primeiro crie uma proposta, depois aprove-a e confirme a abertura do PR draft.</p>
      <form onSubmit={e=>{e.preventDefault();if(!projectId){setError("Selecione um projeto.");return;}void operate({action:"propose",projectId,title,body,head,base},"Proposta registrada; revise e aprove abaixo.");}} className="grid gap-3">
        <p className="text-xs text-[#a7b8da]">Projeto: {currentProject?.name||"Selecione um projeto acima"}. Repositório: {currentProject?.repoUrl||"não configurado"}</p>
        <input className={inputClass} placeholder="Título da proposta" maxLength={180} required value={title} onChange={e=>setTitle(e.target.value)}/>
        <textarea className={inputClass} rows={4} maxLength={6000} placeholder="Descreva evidências, alterações já realizadas e como testar" value={body} onChange={e=>setBody(e.target.value)}/>
        <div className="grid sm:grid-cols-2 gap-2"><input className={inputClass} placeholder="Branch com a correção (ex.: fix/telemetria)" value={head} required onChange={e=>setHead(e.target.value)}/><input className={inputClass} placeholder="Branch base" value={base} required onChange={e=>setBase(e.target.value)}/></div>
        <button className={buttonClass} type="submit" disabled={busy||!projectId}>Registrar proposta (sem criar PR)</button>
      </form>
      <h3 className="text-sm font-bold pt-2">Propostas recentes</h3>
      {data.proposals.length?data.proposals.map(p=><article key={p.id} className="bg-[#091323] border border-[#30415c] rounded-xl p-3 space-y-2"><div className="flex flex-wrap justify-between gap-2"><b className="text-sm">{p.title}</b><span className="text-xs text-[#b4a6ff]">{p.state}</span></div><p className="text-xs text-[#9faccc]">{p.projectName} · {p.head} → {p.base}</p><p className="text-xs whitespace-pre-wrap text-[#c8d3e8] break-words">{p.body.slice(0,600)}</p><div className="flex flex-wrap gap-2">{p.state==="proposed"&&<><button disabled={busy} className={buttonClass} onClick={()=>void operate({action:"approve",id:p.id},"Proposta aprovada. Abra o PR apenas após revisar branch e alterações.")}>Aprovar</button><button disabled={busy} className={buttonClass} onClick={()=>void operate({action:"reject",id:p.id},"Proposta rejeitada.")}>Rejeitar</button></>}{p.state==="approved"&&<button disabled={busy} className={buttonClass} onClick={()=>{if(window.confirm(`Confirmar criação de PR draft para ${p.projectName} (${p.head} → ${p.base}) no GitHub?`)){void operate({action:"create_pr",id:p.id,confirm:"CRIAR PR"},"PR draft criado:");}}}>Confirmar criação de PR draft</button>}{p.prUrl&&<a className="text-sm underline text-[#8bd6ff] break-all" href={p.prUrl} target="_blank" rel="noopener noreferrer">Abrir PR no GitHub</a>}</div></article>):<p className="text-xs text-[#9faccc]">Nenhuma proposta criada.</p>}
    </section>
    <section className="rounded-2xl border border-[#2b3954] bg-[#111b2e] p-4 space-y-3"><h2 className="text-lg font-bold flex items-center gap-2"><ClipboardList size={18}/> Auditoria operacional</h2><div className="max-h-80 overflow-auto space-y-2">{data.audit.map((a,i)=><div key={`${a.createdAt}:${i}`} className="bg-[#091323] border border-[#283a55] rounded-lg p-3"><p className="text-xs font-semibold">{a.event} <span className="font-normal text-[#9cadc8]">· {new Date(a.createdAt).toLocaleString("pt-BR")}</span></p><p className="text-xs text-[#a6b6cf] mt-1 break-words">{a.actor} · {a.details}</p></div>)}{!data.audit.length&&<p className="text-xs text-[#a6b6cf]">Sem registros até agora.</p>}</div></section>
    <footer className="text-xs text-[#8b9bb9] flex items-center gap-2"><ShieldCheck size={16}/> Protegido por Firebase Admin; operações persistidas no Neon.</footer>
  </div></main>;
}
