"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, ClipboardList, Copy, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { getFirebaseIdToken } from "@/lib/firebase";
import type { MaintenanceAnalysis, MaintenanceFinding } from "@/types/maintenance";
import { MaintenanceHistory } from "@/components/maintenance/MaintenanceHistory";

type ProjectOption = { id: string; name: string; source: string };
type InitialData = { projects: ProjectOption[]; reports: MaintenanceAnalysis[]; aiAvailable: boolean };
const severityText = { critical: "Crítico", warning: "Atenção", info: "Informativo" };
const severityClass = {
  critical: "text-rose-300 border-rose-500/40 bg-rose-500/10",
  warning: "text-amber-200 border-amber-500/40 bg-amber-500/10",
  info: "text-sky-300 border-sky-500/40 bg-sky-500/10",
};

export function MaintenanceWorkspace() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selected, setSelected] = useState("");
  const [report, setReport] = useState<MaintenanceAnalysis | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [taskBusy, setTaskBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const api = useCallback(async (method: "GET" | "POST", url: string, body?: unknown) => {
    const token = await getFirebaseIdToken();
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`);
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data: InitialData = await api("GET", "/api/maintenance");
      setProjects(data.projects);
      setAiAvailable(data.aiAvailable);
      if (!selected && data.projects[0]) setSelected(data.projects[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar projetos.");
    } finally {
      setLoading(false);
    }
  }, [api, selected]);

  useEffect(() => {
    void load();
  }, [load]);

  const analyze = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data: { report: MaintenanceAnalysis } = await api("POST", "/api/maintenance", { projectId: selected, useAi });
      setReport(data.report);
      setNotice("Análise registrada no Neon. Nenhuma alteração foi executada nos projetos.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na análise.");
    } finally {
      setBusy(false);
    }
  };

  const createTask = async (f: MaintenanceFinding) => {
    if (!report || taskBusy) return;
    setTaskBusy(f.id);
    setError("");
    setNotice("");
    try {
      const priority = f.severity === "critical" ? "high" : f.severity === "warning" ? "medium" : "low";
      await api("POST", "/api/tasks", {
        projectId: report.projectId,
        projectName: report.projectName,
        recommendationId: f.id,
        title: f.title,
        priority,
        status: "todo",
        assignee: "Admin",
        checklist: f.steps.map((text, i) => ({ id: `step_${i + 1}`, text, done: false })),
        notes: `Análise ${report.id} • ${f.evidence}`.slice(0, 1500),
      });
      setNotice("Plano de ação criado no Neon. Abra Telemetria → Tarefas para acompanhar.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar tarefa.");
    } finally {
      setTaskBusy("");
    }
  };

  return (
    <main className="min-h-screen bg-[#070a14] text-white px-4 py-6 sm:p-8 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#bac7e3] hover:text-white min-h-11">
            <ArrowLeft size={17} /> Voltar ao painel
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link href="/telemetria" className="px-3 py-2.5 rounded-xl border border-[#334461] bg-[#151c30] text-xs">Telemetria</Link>
            <Link href="/relatorios" className="px-3 py-2.5 rounded-xl border border-[#334461] bg-[#151c30] text-xs">Relatórios</Link>
          </div>
        </header>
        <section className="rounded-2xl border border-[#50448d]/60 bg-gradient-to-br from-[#161938] via-[#111b30] to-[#0d222f] p-5 sm:p-7">
          <p className="text-xs uppercase tracking-widest font-semibold text-[#b9a7ff] flex items-center gap-2">
            <Bot size={16} /> DevCentral 3.0 • Central de manutenção
          </p>
          <h1 className="mt-3 text-2xl sm:text-4xl font-extrabold">Assistente Inteligente de Manutenção</h1>
          <p className="mt-3 text-sm text-[#afbdd8] max-w-3xl">
            Analisa recomendações, alertas recorrentes e tarefas do Neon. Propõe ações verificáveis sem editar código, executar comandos ou disparar deploys.
          </p>
        </section>
        <section className="rounded-2xl border border-[#293756] bg-[#111b2e] p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <label className="block text-sm font-semibold text-[#d9e5f9]">
              Projeto
              <select aria-label="Selecionar projeto" value={selected} onChange={e => setSelected(e.target.value)} className="mt-2 w-full min-h-11 rounded-xl bg-[#0b1425] border border-[#34425f] p-3 text-white">
                <option value="">Selecione um projeto</option>
                {projects.map(p => <option value={p.id} key={p.id}>{p.name} ({p.source})</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void load()} disabled={loading} className="min-h-11 rounded-xl bg-[#172541] border border-[#34425f] px-4 inline-flex gap-2 items-center justify-center text-sm disabled:opacity-50 cursor-pointer">
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="inline-flex items-center gap-3 text-sm text-[#c4d0e4] cursor-pointer">
              <input type="checkbox" checked={useAi} disabled={!aiAvailable} onChange={e => setUseAi(e.target.checked)} className="w-5 h-5 accent-violet-500" />
              <span>Complementar com IA externa {aiAvailable ? "(opcional)" : "(indisponível: configure OPENAI_API_KEY no servidor)"}</span>
            </label>
            <button type="button" disabled={!selected || busy || loading} onClick={() => void analyze()} className="min-h-12 px-5 py-3 rounded-xl bg-gradient-to-r from-[#6c4bef] to-[#4e6bed] text-white font-bold text-sm disabled:opacity-50 inline-flex gap-2 items-center justify-center cursor-pointer">
              {busy ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />} {busy ? "Analisando..." : "Analisar projeto"}
            </button>
          </div>
          <p className="text-xs text-[#95a5c2]">Sem IA: diagnóstico por regras locais. Com IA: resumos de evidências limitadas e mascaradas são enviados ao provedor externo com sua autorização. Nunca envie segredos nas descrições dos projetos.</p>
          {error && <div role="alert" className="p-3 rounded-xl border border-rose-500/50 bg-rose-950/30 text-sm text-rose-200">{error}</div>}
          {notice && <div role="status" className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/20 text-sm text-emerald-200">{notice}</div>}
        </section>
        {report && <section className="space-y-4" aria-live="polite">
          <div className="rounded-2xl border border-[#334461] bg-[#121a2b] p-4 sm:p-5">
            <div className="flex flex-wrap justify-between gap-2">
              <h2 className="font-extrabold text-lg">Relatório: {report.projectName}</h2>
              <span className="text-xs text-[#9faed0]">{new Date(report.createdAt).toLocaleString("pt-BR")}</span>
            </div>
            <p className="text-sm mt-3 text-[#dae6ff]">{report.summary}</p>
            <p className="text-xs text-[#91a2c4] mt-2">{report.sourceNote}</p>
            {report.aiAdvice && <div className="mt-4 p-4 rounded-xl border border-violet-500/40 bg-[#1c1940]">
              <p className="font-bold text-sm flex items-center gap-2 mb-3"><Bot size={17} /> Orientação da IA — revisar antes de aplicar</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#dce5ff]">{report.aiAdvice}</p>
            </div>}
          </div>
          <div className="flex gap-2 items-center"><ClipboardList size={18} className="text-[#a49dff]" /><h2 className="font-bold">Recomendações ({report.findings.length})</h2></div>
          {report.findings.length === 0 ? <div className="p-5 rounded-xl bg-[#111b2e] border border-[#293756] text-sm text-[#abb9d5]">Nenhuma ocorrência ativa encontrada nos registros. Faça uma inspeção operacional na Telemetria para verificar os dados atuais.</div> : report.findings.map(f => (
            <article key={f.id} className="rounded-xl border border-[#30415f] bg-[#111b2e] p-4 space-y-3">
              <div className="flex gap-2 items-start justify-between flex-wrap">
                <h3 className="font-bold text-sm sm:text-base break-words flex-1">{f.title}</h3>
                <span className={`text-xs border px-2.5 py-1 rounded-full ${severityClass[f.severity]}`}>{severityText[f.severity]}</span>
              </div>
              <p className="text-xs text-[#abb9d5]">{f.confidence === "confirmed" ? "Evidência registrada" : "Sugestão preventiva"} • {f.source} • Recorrências registradas: {f.recurrence}</p>
              <p className="text-sm text-[#d5e0f4] break-words">{f.evidence}</p>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-[#bfd0e8]">{f.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
              {f.commands.length > 0 && <div className="rounded-lg bg-[#070e1b] p-3 space-y-2">
                {f.commands.map((command, i) => <div key={i} className="flex items-center justify-between gap-2">
                  <code className="text-xs break-all text-[#a8cbf5]">{command}</code>
                  <button type="button" title="Copiar comando para revisão" onClick={() => void navigator.clipboard.writeText(command)} className="shrink-0 p-2 rounded-lg hover:bg-[#1b2a45] cursor-pointer"><Copy size={15} /></button>
                </div>)}
              </div>}
              <button type="button" disabled={Boolean(taskBusy)} onClick={() => void createTask(f)} className="min-h-11 inline-flex items-center gap-2 rounded-lg bg-[#203453] hover:bg-[#28446a] border border-[#47638b] px-4 text-xs font-bold disabled:opacity-50 cursor-pointer">
                {taskBusy === f.id ? <Loader2 size={16} className="animate-spin" /> : <ClipboardList size={16} />} Criar plano de ação
              </button>
            </article>
          ))}
        </section>}
        <MaintenanceHistory projectId={selected} refreshKey={report?.id} onOpenReport={(saved) => { setReport(saved); setNotice(""); }} />
        <footer className="text-xs text-[#8f9fbd] flex gap-2 items-start"><ShieldCheck size={16} className="shrink-0" /> As recomendações não alteram arquivos ou deploys. A verificação posterior deve ocorrer na Telemetria Operacional antes de encerrar alertas.</footer>
      </div>
    </main>
  );
}
