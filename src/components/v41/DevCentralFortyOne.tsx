"use client";
import React, {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {getFirebaseIdToken} from "@/lib/firebase";
import {ArrowLeft, Bot, Send, Activity, History, ShieldCheck, GitPullRequest, ClipboardList, RefreshCw, LoaderCircle, Code2} from "lucide-react";

type Project = {id:string;name:string;source:string;defaultBranch:string;repoUrl:string};
type Message = {id:string;role:"user"|"assistant";content:string;createdAt:string};
type Signal = {source:string;title:string;evidence:string;occurrences:number};
type Investigation = {projectName:string;observedAt:string;priority:string;signals:Signal[];repeatProblems:{title:string;occurrences:number;recommendation:string}[];steps:string[];tasks:{title:string;priority:string;status:string}[];note:string};
type Metrics={health:{projects:number;deployFailures:number;activeAlerts:number;criticalAlerts:number;pendingTasks:number};history:{day:string;activeAlerts:number;pendingTasks:number}[];recurrences:{title:string;projectName:string;occurrences:number}[];messages:number;projectsWithHistory:number;note:string};
const style="rounded-xl border border-[#33405e] bg-[#101a2d] text-[#e2e8f0]";

export function DevCentralFortyOne(){
  const [tab,setTab]=useState<"chat"|"investigation"|"proposals"|"metrics">("chat");
  const [projects,setProjects]=useState<Project[]>([]);
  const [projectId,setProjectId]=useState("");
  const [messages,setMessages]=useState<Message[]>([]);
  const [question,setQuestion]=useState("");
  const [useAi,setUseAi]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [investigation,setInvestigation]=useState<Investigation|null>(null);
  const [metrics,setMetrics]=useState<Metrics|null>(null);
  const [branch,setBranch]=useState("");
  const [proposalTitle,setProposalTitle]=useState("");
  const [proposalBody,setProposalBody]=useState("");
  const project=projects.find(x=>x.id===projectId);

  const request=useCallback(async(method:"GET"|"POST",path:string,body?:Record<string,unknown>)=>{
    const token=await getFirebaseIdToken();
    if(!token)throw Error("Entre como administrador na página principal.");
    const res=await fetch(path,{method,cache:"no-store",headers:{Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(data.error || `Erro HTTP ${res.status}`);
    return data;
  },[]);

  const loadProjects=useCallback(async()=>{
    try {const data=await request("GET","/api/v41?action=projects");setProjects(data.projects || []);setProjectId(prev=>prev || data.projects?.[0]?.id || "");}
    catch(e){setError(e instanceof Error?e.message:"Falha ao carregar projetos.");}
  },[request]);
  useEffect(()=>{void loadProjects();},[loadProjects]);

  const loadHistory=useCallback(async()=>{
    if(!projectId)return;
    try {const data=await request("GET",`/api/v41?action=history&projectId=${encodeURIComponent(projectId)}`);setMessages(data.messages || []);}
    catch(e){setError(e instanceof Error?e.message:"Falha ao carregar a conversa.");}
  },[projectId,request]);
  useEffect(()=>{setMessages([]);setInvestigation(null);void loadHistory();},[loadHistory]);

  const act=async(fn:()=>Promise<void>)=>{setBusy(true);setError("");setNotice("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Falha na operação.");}finally{setBusy(false);}};
  const chat=()=>act(async()=>{
    if(!projectId || question.trim().length<4)return;
    const data=await request("POST","/api/v41",{action:"chat",projectId,question,useAi});
    setQuestion("");await loadHistory();
    setNotice(data.method==="ai"?"Resposta com IA armazenada no Neon.":"Resposta por regras armazenada no Neon.");
  });
  const investigate=()=>act(async()=>{const data=await request("POST","/api/v41",{action:"investigate",projectId});setInvestigation(data);});
  const refreshMetrics=()=>act(async()=>{setMetrics(await request("GET","/api/v41?action=metrics"));});
  const createTask=(signal:Signal)=>act(async()=>{
    await request("POST","/api/tasks",{projectId,projectName:project?.name || "Projeto",title:`Investigar: ${signal.title}`.slice(0,170),priority:investigation?.priority || "medium",status:"todo",assignee:"Admin",notes:`Evidência registrada: ${signal.evidence}`.slice(0,1100),checklist:[{id:"step_1",text:"Inspecionar logs reais e coletar evidências",done:false},{id:"step_2",text:"Revisar proposta e aprovar mudança se necessária",done:false},{id:"step_3",text:"Verificar novamente após correção",done:false}]});
    setNotice("Plano criado no Neon. Consulte Telemetria → Tarefas.");
  });
  const propose=()=>act(async()=>{
    if(!project || !proposalTitle.trim() || !branch.trim() || !proposalBody.trim())throw Error("Preencha título, branch existente e justificativa.");
    await request("POST","/api/maintenance/operations",{action:"propose",projectId,title:proposalTitle,body:proposalBody,head:branch,base:project.defaultBranch || "main"});
    setNotice("Proposta registrada. Revise e aprove em /operacoes antes de criar um PR draft.");
    setProposalTitle("");setProposalBody("");
  });

  const tabs=[{id:"chat",label:"Copiloto",icon:Bot},{id:"investigation",label:"Investigar",icon:Code2},{id:"proposals",label:"Propor PR",icon:GitPullRequest},{id:"metrics",label:"Indicadores",icon:Activity}] as const;
  return <main className="min-h-screen bg-[#070a14] px-4 py-6 sm:px-8 text-white">
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3"><Link href="/" className="text-sm text-[#bac7e3] flex gap-2 items-center min-h-11"><ArrowLeft size={17}/> Voltar ao painel</Link><div className="flex flex-wrap gap-2"><Link href="/central-4" className="text-xs text-[#c3b8ff]">Central 4.0</Link><Link href="/operacoes" className="text-xs text-[#c3b8ff]">Aprovações</Link><Link href="/relatorios" className="text-xs text-[#c3b8ff]">Relatórios</Link></div></div>
      <header className="rounded-2xl border border-[#55448d] p-5 sm:p-7 bg-gradient-to-br from-[#221747] via-[#111b35] to-[#092c39]"><p className="text-xs tracking-widest uppercase text-[#bcaaff]">DevCentral 4.1 • Central Inteligente</p><h1 className="text-2xl sm:text-4xl font-extrabold mt-2">Copiloto e Manutenção Supervisionada</h1><p className="text-sm text-[#b9c8e0] mt-3">Conversa por projeto, histórico no Neon, evidências, propostas revisáveis e saúde operacional. Nenhum comando, merge ou deploy automático.</p></header>
      <section className={`${style} p-4 space-y-3`}>
        <label className="text-sm block font-semibold">Projeto ativo
          <select className="w-full mt-2 min-h-11 p-2 rounded-lg bg-[#0b1425] border border-[#40516b]" value={projectId} onChange={e=>{setProjectId(e.target.value);setBranch("");}}><option value="">Selecione</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name} • {p.source}</option>)}</select>
        </label>
        <div role="tablist" aria-label="Áreas do DevCentral 4.1" className="grid grid-cols-2 sm:grid-cols-4 gap-2">{tabs.map(t=><button key={t.id} role="tab" aria-selected={tab===t.id} onClick={()=>setTab(t.id)} className={`min-h-11 rounded-lg text-sm inline-flex gap-2 items-center justify-center border cursor-pointer ${tab===t.id?"bg-[#5944c8] border-[#a999ff]":"border-[#34445f] bg-[#11182b]"}`}><t.icon size={15}/>{t.label}</button>)}</div>
        {error&&<p role="alert" className="text-sm p-3 rounded-lg bg-red-950/50 text-red-200 border border-red-700">{error}</p>}
        {notice&&<p role="status" className="text-sm p-3 rounded-lg bg-emerald-950/40 text-emerald-200 border border-emerald-700">{notice}</p>}
      </section>
      {tab==="chat"&&<section className={`${style} p-4 sm:p-5 space-y-4`}>
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold flex items-center gap-2"><History size={18}/> Conversa e memória do projeto</h2><button disabled={busy} onClick={()=>void loadHistory()} title="Recarregar conversa" className="p-2 cursor-pointer"><RefreshCw size={18}/></button></div>
        <div aria-live="polite" className="max-h-[55vh] overflow-auto space-y-3">{messages.length===0&&<p className="text-sm text-[#9daecb]">Nenhuma conversa registrada. Faça uma pergunta para iniciar o histórico no Neon.</p>}{messages.map(m=><article key={m.id} className={`p-3 rounded-xl border ${m.role==="assistant"?"bg-[#14263b] border-[#2d5671]":"bg-[#241b47] border-[#53418b] ml-3"}`}><div className="text-xs text-[#b5c7e8] mb-2">{m.role==="assistant"?"DevCentral":"Você"} • {new Date(m.createdAt).toLocaleString("pt-BR")}</div><p className="text-sm whitespace-pre-wrap break-words">{m.content}</p></article>)}</div>
        <label className="flex items-center gap-3 text-xs text-[#c2cde2]"><input type="checkbox" checked={useAi} onChange={e=>setUseAi(e.target.checked)} className="accent-violet-500 w-5 h-5"/>Complementar com IA externa (opcional; exige OPENAI_API_KEY no servidor)</label>
        <form onSubmit={e=>{e.preventDefault();void chat();}} className="space-y-2"><label htmlFor="question41" className="text-sm font-semibold">Sua pergunta</label><textarea id="question41" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={1000} rows={3} placeholder="Quais problemas recorrentes precisam de atenção?" className="w-full p-3 rounded-xl border border-[#40516b] bg-[#0b1425] resize-y"/><button type="submit" disabled={!projectId||busy||question.trim().length<4} className="w-full sm:w-auto min-h-11 px-5 bg-[#5944c8] rounded-xl font-bold text-sm disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2">{busy?<LoaderCircle size={17} className="animate-spin"/>:<Send size={17}/>} Enviar pergunta</button></form>
        <p className="text-xs text-[#9daecb]">A IA externa recebe apenas um resumo delimitado dos registros e contexto recente quando você marca a opção. Verifique se informações sensíveis não estão nos campos de origem.</p>
      </section>}
      {tab==="investigation"&&<section className={`${style} p-4 sm:p-5 space-y-4`}><h2 className="font-bold">Investigação e correlação de ocorrências</h2><button disabled={!projectId||busy} onClick={()=>void investigate()} className="min-h-11 rounded-xl px-4 bg-[#5944c8] font-bold text-sm disabled:opacity-50 cursor-pointer">{busy?"Consultando...":"Investigar dados do projeto"}</button>{investigation&&<div className="space-y-3"><p className="text-xs text-[#a2b2cf]">{investigation.note}</p><div className="grid sm:grid-cols-2 gap-3">{investigation.signals.length?investigation.signals.map((s,i)=><article key={i} className="p-4 rounded-xl bg-[#0a1424] border border-[#344663] space-y-2"><p className="text-xs text-[#a7b7d5]">{s.source} • Recorrências: {s.occurrences}</p><h3 className="font-bold text-sm">{s.title}</h3><p className="text-xs text-[#bbc8df] break-words">{s.evidence}</p><button disabled={busy} onClick={()=>void createTask(s)} className="min-h-10 px-3 rounded-lg bg-[#22395b] text-xs font-bold inline-flex gap-2 items-center cursor-pointer disabled:opacity-50"><ClipboardList size={15}/> Criar plano de ação</button></article>):<p className="text-sm text-[#a7b7d5]">Sem ocorrências ativas registradas.</p>}</div><h3 className="font-bold">Procedimentos sugeridos</h3><ol className="list-decimal pl-5 text-sm space-y-2 text-[#c2d0e6]">{investigation.steps.map((s,i)=><li key={i}>{s}</li>)}</ol></div>}</section>}
      {tab==="proposals"&&<section className={`${style} p-4 sm:p-5 space-y-4`}><h2 className="font-bold flex gap-2 items-center"><GitPullRequest size={18}/> Proposta de pull request supervisionada</h2><p className="text-sm text-[#a9bad4]">Esta etapa registra uma proposta no Neon. A branch com alterações precisa existir no GitHub; criação do PR draft somente depois de aprovar na página Operações. Não cria código ou commits automaticamente.</p><form onSubmit={e=>{e.preventDefault();void propose();}} className="grid gap-3"><label className="text-sm">Branch de origem já existente<input value={branch} onChange={e=>setBranch(e.target.value)} maxLength={120} placeholder="feature/correcao-revisada" className="mt-1 w-full min-h-11 p-3 rounded-lg border border-[#40516b] bg-[#0b1425]"/></label><p className="text-xs text-[#b7c7df]">Destino: {project?.defaultBranch || "main"}</p><label className="text-sm">Título da proposta<input value={proposalTitle} onChange={e=>setProposalTitle(e.target.value)} maxLength={180} className="mt-1 w-full min-h-11 p-3 rounded-lg border border-[#40516b] bg-[#0b1425]"/></label><label className="text-sm">Justificativa e mudanças propostas<textarea rows={5} maxLength={6000} value={proposalBody} onChange={e=>setProposalBody(e.target.value)} className="mt-1 w-full p-3 rounded-lg border border-[#40516b] bg-[#0b1425]"/></label><button disabled={!projectId||busy} className="min-h-11 bg-[#5944c8] rounded-xl px-4 font-bold text-sm cursor-pointer disabled:opacity-50" type="submit">Registrar proposta para aprovação</button></form><Link href="/operacoes" className="inline-block underline text-sm text-[#c7bcff]">Abrir aprovações e auditoria</Link></section>}
      {tab==="metrics"&&<section className={`${style} p-4 sm:p-5 space-y-4`}><div className="flex justify-between items-center gap-2"><h2 className="font-bold">Saúde e eficiência da manutenção</h2><button onClick={()=>void refreshMetrics()} disabled={busy} className="px-3 min-h-11 bg-[#25395d] rounded-xl text-sm cursor-pointer">Atualizar indicadores</button></div>{metrics&&<><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[{label:"Projetos",value:metrics.health.projects},{label:"Alertas ativos",value:metrics.health.activeAlerts},{label:"Tarefas pendentes",value:metrics.health.pendingTasks},{label:"Conversas armazenadas",value:metrics.messages}].map(t=><article key={t.label} className="rounded-xl bg-[#0b1425] p-4 border border-[#354663]"><p className="text-2xl font-bold">{t.value}</p><p className="text-xs text-[#adbfda]">{t.label}</p></article>)}</div><h3 className="font-bold">Problemas recorrentes</h3>{metrics.recurrences.map((r,i)=><div key={i} className="p-3 bg-[#0b1425] rounded-xl text-xs"><strong>{r.projectName}</strong> • {r.title} • {r.occurrences} ocorrência(s)</div>)}<p className="text-xs text-[#adbfda]">{metrics.note}</p></>}</section>}
      <footer className="text-xs text-[#a3b3d0] flex gap-2 items-start"><ShieldCheck size={18} className="shrink-0"/>Leituras e propostas supervisionadas. Criação de PRs, revisão de código, merge, comandos e deploys exigem ações separadas e confirmação explícita.</footer>
    </div>
  </main>;
}
