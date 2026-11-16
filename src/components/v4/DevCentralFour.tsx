"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, Bot, CheckCircle2, CircleAlert, Code2, GitPullRequest, Loader2, RefreshCcw, Search, ShieldCheck, Smartphone, TerminalSquare } from "lucide-react";
import { getFirebaseIdToken } from "@/lib/firebase";

type Project = { id: string; name: string; source: string; state: string; repoUrl: string };
type Health = { projects: number; deployFailures: number; activeAlerts: number; criticalAlerts: number; pendingTasks: number; lastSyncAt: string | null };
type Snapshot = { day: string; activeAlerts: number; deployFailures: number; pendingTasks: number };
type Correlation = { projectName: string; title: string; severity: string; occurrences: number; openTasks: number; recommendation: string };
type Overview = { projects: Project[]; health: Health; history: Snapshot[]; correlations: Correlation[]; generatedAt: string; source: string };
type Copilot = { projectName: string; question: string; evidence: string[]; recommendation: string; limitations: string; generatedAt: string };
type CodeResult = { projectName: string; supported: boolean; summary: string; inspectedAt?: string; repository?: string; checks: Array<{title: string; status: "ok"|"attention"|"info"; detail: string}> };
type PrResult = { projectName: string; supported: boolean; summary: string; prs: Array<{number:number;title:string;url:string;state:string;draft:boolean;merged:boolean;updatedAt:string;branch:string}> };
type View = "health" | "copilot" | "code" | "prs" | "mobile";

const tabs: Array<{id:View;label:string}> = [
  {id:"health",label:"Saúde"},{id:"copilot",label:"Copiloto"},{id:"code",label:"Código"},
  {id:"prs",label:"Pull requests"},{id:"mobile",label:"Aplicativo"},
];
const box = "rounded-2xl border border-[#303b5a] bg-[#11182b] p-4 sm:p-5";

export function DevCentralFour() {
  const [tab,setTab] = useState<View>("health");
  const [overview,setOverview] = useState<Overview|null>(null);
  const [selected,setSelected] = useState("");
  const [question,setQuestion] = useState("Quais os problemas prioritários deste projeto?");
  const [answer,setAnswer] = useState<Copilot|null>(null);
  const [code,setCode] = useState<CodeResult|null>(null);
  const [prs,setPrs] = useState<PrResult|null>(null);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [installPrompt,setInstallPrompt] = useState<{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>}|null>(null);

  const api = useCallback(async (method:"GET"|"POST",url:string,payload?:unknown) => {
    const token = await getFirebaseIdToken();
    if(!token) throw new Error("Faça login como administrador no painel principal.");
    const response = await fetch(url, {
      method,
      headers: {Authorization:`Bearer ${token}`,...(payload?{"Content-Type":"application/json"}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{}), cache:"no-store",
    });
    const result = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(result.error || `Erro HTTP ${response.status}`);
    return result;
  },[]);
  const reload = useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const data:Overview=await api("GET","/api/v4?view=overview");
      setOverview(data);setSelected(old=>old || data.projects[0]?.id || "");
    } catch(e){setError(e instanceof Error?e.message:"Falha ao carregar indicadores.");}
    finally{setLoading(false);}
  },[api]);
  useEffect(()=>{void reload();},[reload]);
  useEffect(()=>{
    const handler=(event:Event)=>{
      event.preventDefault();
      setInstallPrompt(event as unknown as {prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>});
    };
    window.addEventListener("beforeinstallprompt",handler);
    return ()=>window.removeEventListener("beforeinstallprompt",handler);
  },[]);
  const project=useMemo(()=>overview?.projects.find(p=>p.id===selected),[overview,selected]);

  const execute = async (work:()=>Promise<void>) => {
    setBusy(true);setError("");
    try{await work();}catch(e){setError(e instanceof Error?e.message:"Falha na consulta.");}
    finally{setBusy(false);}
  };
  const ask=()=>execute(async()=>{setAnswer(await api("POST","/api/v4",{projectId:selected,question}));});
  const inspect=()=>execute(async()=>{setCode(await api("GET",`/api/v4?view=code&projectId=${encodeURIComponent(selected)}`));});
  const pullRequests=()=>execute(async()=>{setPrs(await api("GET",`/api/v4?view=prs&projectId=${encodeURIComponent(selected)}`));});
  const install=async()=>{
    if(!installPrompt)return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };
  const health=overview?.health;
  const maxAlerts=Math.max(1,...(overview?.history||[]).map(x=>x.activeAlerts));

  return <main className="min-h-screen bg-[#070a14] text-slate-100 px-3 py-5 sm:px-8 lg:px-12">
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-sm flex items-center gap-2 text-[#a7b8d8] hover:text-white min-h-11"><ArrowLeft size={17}/> Painel principal</Link>
        <div className="flex flex-wrap gap-2 text-xs"><Link href="/assistente" className="px-3 py-2 rounded-lg border border-[#354463]">Assistente 3.0</Link><Link href="/operacoes" className="px-3 py-2 rounded-lg border border-[#354463]">Aprovações e PRs</Link><Link href="/relatorios" className="px-3 py-2 rounded-lg border border-[#354463]">Relatórios</Link></div>
      </div>
      <header className="rounded-3xl bg-gradient-to-br from-[#29205e] via-[#141a36] to-[#082a38] border border-[#6759a7]/60 p-5 sm:p-8 shadow-[0_0_35px_rgba(103,72,205,.13)]">
        <div className="text-xs tracking-[.2em] uppercase text-[#b4b2ff] font-bold">DevCentral 4.0 • Inteligência operacional</div>
        <h1 className="text-2xl sm:text-4xl font-extrabold mt-2 tracking-tight">Central Inteligente de Desenvolvimento</h1>
        <p className="mt-3 max-w-3xl text-sm text-[#b8c5e3]">Projetos, métricas, orientações e pull requests em um só lugar. Consultas somente leitura, com ações controladas na central de operações.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 px-3 py-1">Somente leitura</span><span className="rounded-full bg-violet-400/10 border border-violet-400/40 text-violet-200 px-3 py-1">Firebase + Neon + GitHub</span></div>
      </header>
      <nav aria-label="Módulos do DevCentral 4.0" className="flex flex-wrap gap-2">
        {tabs.map(t=><button key={t.id} type="button" onClick={()=>{setTab(t.id);setError("");}} aria-current={tab===t.id?"page":undefined} className={`min-h-11 px-3 sm:px-4 rounded-xl border text-sm font-semibold cursor-pointer ${tab===t.id?"bg-[#5643c8] border-[#9382ff] text-white":"bg-[#121b30] border-[#303d5d] text-[#b5c5e2]"}`}>{t.label}</button>)}
      </nav>
      {error && <div role="alert" className="border border-rose-500/50 bg-rose-950/30 text-rose-200 rounded-xl p-4 text-sm">{error}</div>}
      {tab!=="health" && tab!=="mobile" && <section className={`${box} flex flex-col sm:flex-row sm:items-end gap-3 sm:justify-between`}>
        <label className="block text-sm font-semibold flex-1">Projeto
          <select aria-label="Selecionar projeto" value={selected} onChange={e=>{setSelected(e.target.value);setCode(null);setPrs(null);setAnswer(null);}} className="block mt-2 w-full min-h-11 rounded-lg border border-[#455578] bg-[#0a1224] px-3 text-white">
            {(overview?.projects||[]).map(p=><option key={p.id} value={p.id}>{p.name} ({p.source})</option>)}
          </select>
        </label>
        <span className="text-xs text-[#98a8c7]">{project?.state || ""}</span>
      </section>}
      {tab==="health" && <div className="space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3"><h2 className="font-bold text-lg flex items-center gap-2"><Activity size={19}/> Saúde do workspace</h2><button type="button" onClick={()=>void reload()} disabled={loading} className="min-h-10 px-3 rounded-lg border border-[#405070] text-sm flex gap-2 items-center cursor-pointer disabled:opacity-50"><RefreshCcw size={15} className={loading?"animate-spin":""}/> Atualizar</button></div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[["Projetos",health?.projects],["Falhas de deploy",health?.deployFailures],["Alertas ativos",health?.activeAlerts],["Alertas críticos",health?.criticalAlerts],["Tarefas pendentes",health?.pendingTasks]].map(([label,value])=><article key={String(label)} className={box}><p className="text-xs text-[#a4b4d1]">{label}</p><p className="mt-2 text-3xl font-bold tabular-nums">{loading?"…":value??"—"}</p></article>)}
        </div>
        <section className={box}><h3 className="font-semibold">Histórico de alertas</h3><p className="text-xs text-[#9eacc6] mt-1">Apenas datas com coleta registrada; não representa disponibilidade contínua.</p>
          {overview?.history.length?<div className="mt-4 flex gap-1.5 items-end h-44 overflow-x-auto" aria-label="Alertas ativos nas coletas registradas">
            {overview.history.map(h=><div key={h.day} className="h-full min-w-7 max-w-14 flex-1 flex flex-col items-center justify-end gap-1" title={`${h.day}: ${h.activeAlerts} alertas`}><span className="text-[10px]">{h.activeAlerts}</span><div className="w-full bg-gradient-to-t from-violet-700 to-cyan-400 rounded-t" style={{height:`${Math.max(3,(h.activeAlerts/maxAlerts)*77)}%`}}/><span className="text-[10px] text-[#9caccc]">{h.day.slice(8)}</span></div>)}
          </div>:<p className="text-sm text-[#a7b5d1] mt-4">Sem coletas históricas registradas.</p>}
        </section>
        <section className={box}><h3 className="font-semibold">Problemas correlacionados</h3><div className="mt-3 space-y-2">{overview?.correlations.length?overview.correlations.map((x,i)=><div key={`${x.projectName}-${x.title}-${i}`} className="rounded-xl border border-[#293650] bg-[#0b1526] p-3"><div className="flex justify-between gap-3"><span className="font-semibold text-sm">{x.projectName} · {x.title}</span><span className="text-xs text-amber-200">{x.occurrences} ocorrências</span></div><p className="mt-1 text-sm text-[#a9bbd8]">{x.recommendation}</p></div>):<p className="text-sm text-[#a1b1ce]">Sem correlações prioritárias nos registros atuais.</p>}</div></section>
        <p className="text-xs text-[#869abc]">{overview?.source} Última sincronização registrada: {health?.lastSyncAt?new Date(health.lastSyncAt).toLocaleString("pt-BR"):"sem registro"}.</p>
      </div>}
      {tab==="copilot" && <section className={`${box} space-y-4`}><h2 className="font-bold flex gap-2 items-center"><Bot size={20}/> Copiloto contextual</h2><p className="text-xs text-[#abb9d3]">Respostas baseadas em fatos salvos no Neon, sem IA generativa e sem executar comandos.</p>
        <label className="block text-xs text-[#b8c9e3]">Sua pergunta<textarea value={question} onChange={e=>setQuestion(e.target.value)} maxLength={500} rows={3} className="block mt-2 w-full rounded-xl border border-[#405070] bg-[#081022] p-3 text-sm text-white" placeholder="Ex.: Há erros de deploy neste projeto?"/></label>
        <button disabled={busy||!selected||question.trim().length<4} onClick={()=>void ask()} className="min-h-11 rounded-xl bg-[#6650da] px-5 text-sm font-bold disabled:opacity-50 cursor-pointer">{busy?"Consultando...":"Consultar contexto"}</button>
        {answer&&<article className="rounded-xl border border-[#445477] bg-[#0b1427] p-4 space-y-3"><h3 className="font-semibold">Evidências — {answer.projectName}</h3><ul className="list-disc pl-5 space-y-1 text-sm text-[#cbd7ed]">{answer.evidence.map((x,i)=><li key={i}>{x}</li>)}</ul><p className="text-sm font-medium text-[#9de3ce]">{answer.recommendation}</p><p className="text-xs text-[#96a7c6]">{answer.limitations}</p></article>}
      </section>}
      {tab==="code" && <section className={`${box} space-y-4`}><h2 className="font-bold flex gap-2 items-center"><Code2 size={20}/> Análise de qualidade do projeto</h2><p className="text-xs text-[#a9b8d4]">Consulta GitHub e package.json. Não realiza build, não lê código-fonte inteiro e não afirma detectar vulnerabilidades reais.</p>
        <button disabled={!selected||busy} onClick={()=>void inspect()} className="min-h-11 px-5 bg-[#6650da] rounded-xl font-bold text-sm disabled:opacity-50 cursor-pointer inline-flex gap-2 items-center">{busy?<Loader2 className="animate-spin" size={17}/>:<Search size={17}/>} Inspecionar projeto</button>
        {code&&<div className="space-y-2"><p className="text-xs text-[#a9bad5]">{code.summary}</p>{code.checks.map((c,i)=><article key={i} className="rounded-xl bg-[#0a1427] p-3 border border-[#303d5a] flex gap-3 items-start">{c.status==="attention"?<CircleAlert className="text-amber-300 shrink-0" size={18}/>:<CheckCircle2 className="text-[#69dec1] shrink-0" size={18}/>}<div><h3 className="font-semibold text-sm">{c.title}</h3><p className="text-xs text-[#a8b8d5] mt-1">{c.detail}</p></div></article>)}</div>}
      </section>}
      {tab==="prs" && <section className={`${box} space-y-4`}><h2 className="font-bold flex items-center gap-2"><GitPullRequest size={20}/> Revisão e acompanhamento de PRs</h2><p className="text-xs text-[#aebcd6]">Consulta dos 30 PRs mais recentes no GitHub. Ações de aprovação e criação controlada continuam na Central de Operações.</p>
        <div className="flex gap-2 flex-wrap"><button disabled={!selected||busy} onClick={()=>void pullRequests()} className="min-h-11 px-5 bg-[#6650da] rounded-xl font-bold text-sm disabled:opacity-50 cursor-pointer">{busy?"Consultando...":"Consultar pull requests"}</button><Link href="/operacoes" className="min-h-11 px-4 inline-flex items-center rounded-xl border border-[#526484] text-sm">Ir para aprovações</Link></div>
        {prs&&<div className="space-y-2"><p className="text-xs text-[#aebbd4]">{prs.summary}</p>{prs.prs.length?prs.prs.map(pr=><article key={pr.number} className="rounded-xl border border-[#34435e] bg-[#0b1427] p-3 flex flex-col sm:flex-row sm:justify-between gap-2"><div><a target="_blank" rel="noopener noreferrer" href={pr.url} className="text-sm font-semibold text-[#b6a9ff] hover:underline">#{pr.number} {pr.title}</a><p className="text-xs text-[#aab9d6] mt-1">{pr.branch} · Atualizado {pr.updatedAt?new Date(pr.updatedAt).toLocaleString("pt-BR"):"sem data"}</p></div><span className="text-xs text-[#b2e3d6]">{pr.merged?"Mesclado":pr.draft?"Draft":pr.state==="open"?"Aberto":"Fechado"}</span></article>):<p className="text-sm text-[#a9b8d1]">Nenhum PR retornado.</p>}</div>}
      </section>}
      {tab==="mobile" && <section className={`${box} space-y-4`}><h2 className="font-bold flex items-center gap-2"><Smartphone size={20}/> DevCentral como aplicativo</h2><p className="text-sm text-[#bccbe4]">O DevCentral já possui manifesto e service worker. A versão 4.0 mantém o uso como PWA e atualiza sua identificação. O modo offline não armazena dados autenticados.</p>
        <div className="flex gap-3 flex-wrap">{installPrompt&&<button type="button" onClick={()=>void install()} className="min-h-11 px-5 bg-[#6650da] rounded-xl text-sm font-bold cursor-pointer">Instalar DevCentral</button>}<p className="text-sm text-[#aabbd8]">{installPrompt?"O navegador permite instalação direta.":"No Android: menu do navegador → Instalar app. No iPhone (Safari): Compartilhar → Adicionar à Tela de Início."}</p></div>
        <p className="text-xs text-[#8f9fbd] flex gap-2"><ShieldCheck size={16}/> Dados sensíveis e APIs autenticadas não são armazenados no cache offline.</p>
      </section>}
      <footer className="text-xs text-[#8999b6] border-t border-[#28324b] pt-4 flex items-center gap-2"><TerminalSquare size={15}/> DevCentral 4.0 · ações de PR, merge, código e deploy somente após revisão explícita nos fluxos já homologados.</footer>
    </div>
  </main>;
}
