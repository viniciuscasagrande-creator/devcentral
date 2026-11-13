"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Project } from "@/types/project";
import type {
  ProjectTask,
  RecommendationStatus,
  TaskPriority,
  TaskStatus,
  TelemetryRecommendation,
} from "@/types/telemetry";
import { getAdminIdToken } from "@/lib/firebase";
import {
  X,
  ExternalLink,
  GitBranch,
  FolderGit2,
  Edit3,
  Pin,
  Lock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Database,
  Activity,
  Bot,
  ListTodo,
  Code2,
  Copy,
  Check,
  Plus,
  Trash2,
  Sparkles,
  ShieldCheck,
  Terminal,
  FileCode2,
} from "lucide-react";

interface ProjectDetailsProps {
  project: Project | null;
  onClose: () => void;
  onEdit: (project: Project) => void;
  onTogglePin: (project: Project) => void;
  onPingUrl: (url: string) => Promise<{
    reachable: boolean;
    statusCode: number;
    latencyMs: number;
    checkedAt: string;
  }>;
}

type AnalysisTab =
  | "ficha"
  | "deploys"
  | "diagnostico"
  | "assistente"
  | "tarefas";

function inferDatabaseUsed(project: Project): string {
  const haystack = [
    project.name,
    project.description,
    project.tech,
    project.custom_notes,
    ...(project.tags || []),
  ]
    .join(" ")
    .toLowerCase();

  if (haystack.includes("neon") || haystack.includes("postgres")) {
    return "Neon PostgreSQL (Serverless)";
  }
  if (haystack.includes("supabase")) {
    return "Supabase PostgreSQL";
  }
  if (haystack.includes("firebase") || haystack.includes("firestore")) {
    return "Firebase / Cloud Firestore";
  }
  if (haystack.includes("prisma")) {
    return "PostgreSQL via Prisma ORM";
  }
  if (haystack.includes("mongo")) {
    return "MongoDB Atlas";
  }
  if (haystack.includes("mysql") || haystack.includes("planetscale")) {
    return "MySQL / PlanetScale";
  }
  if (haystack.includes("sqlite") || haystack.includes("turso")) {
    return "SQLite / Turso";
  }
  return "Neon PostgreSQL / Storage Integrado";
}

export function ProjectDetails({
  project,
  onClose,
  onEdit,
  onTogglePin,
  onPingUrl,
}: ProjectDetailsProps) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>("ficha");
  const [pingResult, setPingResult] = useState<{
    loading?: boolean;
    reachable?: boolean;
    statusCode?: number;
    latencyMs?: number;
    checkedAt?: string;
  } | null>(null);

  const [recommendations, setRecommendations] = useState<
    TelemetryRecommendation[]
  >([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // New task form inside modal
  const [taskTitle, setTaskTitle] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("high");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskIssueUrl, setTaskIssueUrl] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  useEffect(() => {
    if (!project) return;
    setActiveTab("ficha");
    setPingResult(null);
    setFeedbackMsg(null);

    let cancelled = false;
    async function loadProjectAnalysis(p: Project) {
      setLoadingTelemetry(true);
      try {
        const token = await getAdminIdToken();
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};
        const [telRes, taskRes] = await Promise.all([
          fetch("/api/telemetry", { headers, cache: "no-store" }),
          fetch(`/api/tasks?projectId=${encodeURIComponent(p.id)}`, {
            headers,
            cache: "no-store",
          }),
        ]);
        if (cancelled) return;
        if (telRes.ok) {
          const telData = await telRes.json();
          const allRecs: TelemetryRecommendation[] =
            telData.recommendations || [];
          setRecommendations(
            allRecs.filter(
              (r) =>
                r.projectId === p.id ||
                (r.projectName &&
                  r.projectName.toLowerCase() === p.name.toLowerCase())
            )
          );
        }
        if (taskRes.ok) {
          const taskData = await taskRes.json();
          setTasks(taskData.tasks || []);
        }
      } catch {
        // silent fallback
      } finally {
        if (!cancelled) setLoadingTelemetry(false);
      }
    }

    loadProjectAnalysis(project);
    if (project.deploy_url) {
      setPingResult({ loading: true });
      onPingUrl(project.deploy_url)
        .then((res) => {
          if (!cancelled) setPingResult({ loading: false, ...res });
        })
        .catch(() => {
          if (!cancelled)
            setPingResult({ loading: false, reachable: false, statusCode: 0 });
        });
    }

    return () => {
      cancelled = true;
    };
  }, [project, onPingUrl]);

  const dbUsed = useMemo(
    () => (project ? inferDatabaseUsed(project) : ""),
    [project]
  );

  if (!project) return null;

  const isOnline = project.state === "online" || Boolean(project.deploy_url);
  const vscodeUrl = project.local_path
    ? `vscode://file/${project.local_path.replace(/\\/g, "/")}`
    : `vscode://file/D:/Projetos Vs Code/${project.name}`;

  const defaultIssuesUrl = project.repo_url
    ? `${project.repo_url.replace(/\.git$/, "")}/issues`
    : "";

  const handlePing = async (url: string) => {
    setPingResult({ loading: true });
    try {
      const res = await onPingUrl(url);
      setPingResult({ loading: false, ...res });
    } catch {
      setPingResult({ loading: false, reachable: false, statusCode: 0 });
    }
  };

  const copySnippet = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleStatusChange = async (
    recId: string,
    status: RecommendationStatus
  ) => {
    try {
      const token = await getAdminIdToken();
      if (!token) {
        setFeedbackMsg(
          "Faça login como administrador no topo para atualizar o status do diagnóstico."
        );
        return;
      }
      const res = await fetch("/api/telemetry", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: recId, status }),
      });
      if (res.ok) {
        setRecommendations((prev) =>
          prev.map((r) => (r.id === recId ? { ...r, status } : r))
        );
        setFeedbackMsg("Status do diagnóstico atualizado no Neon PostgreSQL.");
      }
    } catch {
      setFeedbackMsg("Erro ao atualizar status do diagnóstico.");
    }
  };

  const handleCreateTaskFromRec = async (rec: TelemetryRecommendation) => {
    setSavingTask(true);
    setFeedbackMsg(null);
    try {
      const token = await getAdminIdToken();
      if (!token) {
        setFeedbackMsg(
          "Autentique-se como administrador para criar tarefas no banco Neon."
        );
        return;
      }
      const priority: TaskPriority =
        rec.severity === "critical"
          ? "high"
          : rec.severity === "warning"
            ? "medium"
            : "low";
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          projectName: project.name,
          recommendationId: rec.id,
          title: rec.title,
          priority,
          status: "todo",
          notes: `${rec.evidence} — Solução: ${rec.action}`,
          issueUrl: defaultIssuesUrl,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          setTasks((prev) => [data.task, ...prev]);
          setActiveTab("tarefas");
          setFeedbackMsg("Recomendação convertida em tarefa com sucesso!");
        }
      } else {
        setFeedbackMsg("Não foi possível salvar a tarefa.");
      }
    } finally {
      setSavingTask(false);
    }
  };

  const handleAddManualTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSavingTask(true);
    setFeedbackMsg(null);
    try {
      const token = await getAdminIdToken();
      if (!token) {
        setFeedbackMsg("Autentique-se como administrador para criar tarefas.");
        return;
      }
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: project.id,
          projectName: project.name,
          title: taskTitle.trim(),
          priority: taskPriority,
          status: "todo",
          notes: taskNotes.trim(),
          issueUrl: taskIssueUrl.trim() || defaultIssuesUrl,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          setTasks((prev) => [data.task, ...prev]);
          setTaskTitle("");
          setTaskNotes("");
          setTaskIssueUrl("");
          setFeedbackMsg("Tarefa adicionada ao projeto!");
        }
      }
    } finally {
      setSavingTask(false);
    }
  };

  const handleUpdateTaskStatus = async (
    task: ProjectTask,
    status: TaskStatus
  ) => {
    const token = await getAdminIdToken();
    if (!token) {
      setFeedbackMsg("Autentique-se como administrador para alterar tarefas.");
      return;
    }
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...task, status }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.task) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? data.task : t))
        );
      }
    }
  };

  const handleDeleteTask = async (id: string) => {
    const token = await getAdminIdToken();
    if (!token) return;
    const res = await fetch(`/api/tasks?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const openIssuesCount = recommendations.filter(
    (r) => r.status !== "resolved"
  ).length;
  const openTasksCount = tasks.filter((t) => t.status !== "done").length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div
        className={`w-full max-w-4xl rounded-2xl border bg-[#0c1222] text-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
          isOnline
            ? "border-[#2dd4a0]/75 shadow-[0_0_32px_rgba(45,212,160,0.2)]"
            : "border-[#ff4d6d]/75 shadow-[0_0_32px_rgba(255,77,109,0.2)]"
        }`}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1e2942] bg-[#0a0f1d] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-xl grid place-items-center bg-gradient-to-br from-[#352b78] to-[#1e2447] border border-[#6e56cf]/60 text-[#e2ddff] font-black text-base shrink-0">
              {project.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#182238] text-[#a5b4fc] border border-[#2c3b5e]">
                  Análise & Ficha Técnica • {project.source}
                </span>
                {project.visibility === "private" && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    <Lock className="w-3 h-3" /> Privado
                  </span>
                )}
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    isOnline
                      ? "bg-[#0d2e28] text-[#3ddba0] border-[#2dd4a0]/50"
                      : "bg-[#ff4d6d]/15 text-[#ff6b86] border-[#ff4d6d]/50"
                  }`}
                >
                  ● {isOnline ? "Em Produção (Online)" : "Em Desenvolvimento"}
                </span>
              </div>
              <h2 className="text-xl font-extrabold mt-1 truncate">
                {project.name}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#9baac5] hover:text-white hover:bg-[#182337] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-2.5 bg-[#0e1526] border-b border-[#1e2942] flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("ficha")}
            className={`px-3.5 py-2 rounded-t-xl font-bold inline-flex items-center gap-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "ficha"
                ? "border-[#8b5cf6] text-white bg-[#151f36]"
                : "border-transparent text-[#8b9bb8] hover:text-white"
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-[#a78bfa]" />
            1. Ficha Técnica Completa
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("deploys")}
            className={`px-3.5 py-2 rounded-t-xl font-bold inline-flex items-center gap-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "deploys"
                ? "border-[#3ddba0] text-white bg-[#151f36]"
                : "border-transparent text-[#8b9bb8] hover:text-white"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-[#3ddba0]" />
            2. Saúde dos Deploys & HTTP
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("diagnostico")}
            className={`px-3.5 py-2 rounded-t-xl font-bold inline-flex items-center gap-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "diagnostico"
                ? "border-amber-400 text-white bg-[#151f36]"
                : "border-transparent text-[#8b9bb8] hover:text-white"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            3. Diagnóstico ({openIssuesCount})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("assistente")}
            className={`px-3.5 py-2 rounded-t-xl font-bold inline-flex items-center gap-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "assistente"
                ? "border-[#38bdf8] text-white bg-[#151f36]"
                : "border-transparent text-[#8b9bb8] hover:text-white"
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-[#38bdf8]" />
            4. Assistente de Soluções
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("tarefas")}
            className={`px-3.5 py-2 rounded-t-xl font-bold inline-flex items-center gap-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === "tarefas"
                ? "border-[#c084fc] text-white bg-[#151f36]"
                : "border-transparent text-[#8b9bb8] hover:text-white"
            }`}
          >
            <ListTodo className="w-3.5 h-3.5 text-[#c084fc]" />
            5. Tarefas & Issues ({openTasksCount})
          </button>
        </div>

        {feedbackMsg && (
          <div className="mx-6 mt-3 px-3.5 py-2 rounded-xl bg-[#192540] border border-[#6e56cf]/60 text-xs text-[#d8ceff] flex items-center justify-between">
            <span>{feedbackMsg}</span>
            <button
              type="button"
              onClick={() => setFeedbackMsg(null)}
              className="text-[#9baac5] hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tab Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-sm">
          {/* TAB 1: FICHA TÉCNICA COMPLETA */}
          {activeTab === "ficha" && (
            <div className="space-y-5">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#8b9bb8] mb-1">
                  Resumo & Documentação do Software
                </div>
                <p className="text-[#d5e0f2] leading-relaxed bg-[#0f172a] p-3.5 rounded-xl border border-[#1e2942]">
                  {project.description ||
                    "Sem descrição detalhada cadastrada. Recomenda-se documentar o propósito, stack e variáveis de ambiente."}
                </p>
              </div>

              {/* Complete Technical Sheet Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-[#222f49] bg-[#0f172a]">
                  <div className="text-[11px] text-[#8b9bb8]">
                    Tecnologia / Stack Principal
                  </div>
                  <div className="font-bold text-white mt-1">
                    {project.tech || "TypeScript / Next.js"}
                  </div>
                  {project.framework && (
                    <div className="text-[11px] text-[#a5b4fc] mt-0.5">
                      Framework: {project.framework}
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-xl border border-[#222f49] bg-[#0f172a]">
                  <div className="text-[11px] text-[#8b9bb8] flex items-center gap-1">
                    <Database className="w-3 h-3 text-[#38bdf8]" /> Banco
                    Utilizado
                  </div>
                  <div className="font-bold text-[#38bdf8] mt-1 text-xs">
                    {dbUsed}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-[#222f49] bg-[#0f172a]">
                  <div className="text-[11px] text-[#8b9bb8]">
                    Branch & Repositório
                  </div>
                  <div className="font-bold text-white mt-1 flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-[#a78bfa]" />
                    {project.default_branch || "main"}
                    <span className="text-[11px] font-normal text-[#8b9bb8]">
                      ({project.source})
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-[#222f49] bg-[#0f172a]">
                  <div className="text-[11px] text-[#8b9bb8]">
                    Contas Vercel Vinculadas
                  </div>
                  <div className="font-bold text-[#c4b5fd] mt-1 text-xs">
                    {(project.vercel_accounts || []).length > 0
                      ? project.vercel_accounts.join(" • ")
                      : "Sem conta Vercel vinculada"}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-[#222f49] bg-[#0f172a]">
                  <div className="text-[11px] text-[#8b9bb8]">
                    Última Atividade / Commit
                  </div>
                  <div className="font-bold text-white mt-1 text-xs">
                    {new Date(
                      project.last_commit_at || project.updated_at
                    ).toLocaleString("pt-BR")}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-[#222f49] bg-[#0f172a]">
                  <div className="text-[11px] text-[#8b9bb8]">
                    Indicadores Git & Pendências
                  </div>
                  <div className="font-bold text-white mt-1 text-xs flex items-center gap-2.5">
                    <span>★ {project.stars || 0}</span>
                    <span>⑂ {project.forks || 0}</span>
                    <span className="text-amber-300">
                      Issues: {project.open_issues || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tags */}
              {(project.tags || []).length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-[#8b9bb8] mb-2">
                    Tecnologias & Tags Identificadas
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2.5 py-1 rounded-lg bg-[#141d33] border border-[#263554] text-[#cbd5e8]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {project.custom_notes && (
                <div className="p-3.5 rounded-xl border border-[#344463] bg-[#0e1629]">
                  <div className="text-xs font-bold text-[#a49eff] mb-1">
                    📌 Documentação & Observações Operacionais
                  </div>
                  <p className="text-xs text-[#cbd5e8] whitespace-pre-line">
                    {project.custom_notes}
                  </p>
                </div>
              )}

              {/* Direct Shortcuts */}
              <div className="pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-[#8b9bb8] mb-2.5">
                  Atalhos Rápidos de Desenvolvimento
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {project.repo_url && (
                    <a
                      href={project.repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#344463] bg-[#162038] text-xs font-semibold text-white hover:border-[#8b85ff]"
                    >
                      <FolderGit2 className="w-3.5 h-3.5 text-[#a49eff]" />
                      Abrir Repositório ({project.source}) ↗
                    </a>
                  )}
                  {project.deploy_url && (
                    <a
                      href={project.deploy_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#2dd4a0]/50 bg-[#0d2e28] text-xs font-semibold text-[#3ddba0] hover:bg-[#123d35]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir Ambiente Online ↗
                    </a>
                  )}
                  <a
                    href={vscodeUrl}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#38bdf8]/40 bg-[#0c2438] text-xs font-semibold text-[#38bdf8] hover:bg-[#11324d]"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    Abrir Projeto Local no VS Code (
                    {project.local_path || `D:/Projetos Vs Code/${project.name}`}
                    ) ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SAÚDE DOS DEPLOYS & MONITORAMENTO HTTP */}
          {activeTab === "deploys" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-[#22304d] bg-[#0f172a] space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-[#a5b4fc]">
                      Comparativo: Status Informado pela Vercel vs. Disponibilidade Real do Site
                    </div>
                    <p className="text-xs text-[#8b9bb8] mt-0.5">
                      Separa o status do último build na Vercel da resposta HTTP real do domínio publicado.
                    </p>
                  </div>
                  {project.deploy_url && (
                    <button
                      type="button"
                      onClick={() => handlePing(project.deploy_url)}
                      disabled={pingResult?.loading}
                      className="px-3 py-1.5 rounded-xl bg-[#5641e5] hover:bg-[#4330c6] text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          pingResult?.loading ? "animate-spin" : ""
                        }`}
                      />
                      Testar Endpoint Agora
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Status informado pela Vercel */}
                  <div className="p-3.5 rounded-xl border border-[#263554] bg-[#0b1120]">
                    <div className="text-[11px] font-semibold text-[#8b9bb8]">
                      1. Status Informado pela Plataforma (Vercel / CI)
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="font-extrabold text-sm text-white">
                        {project.last_deploy_status ||
                          (isOnline ? "READY" : "NÃO PUBLICADO")}
                      </span>
                      <span
                        className={`text-[10.5px] font-bold px-2.5 py-0.5 rounded-full ${
                          /ERROR|FAIL/i.test(project.last_deploy_status || "")
                            ? "bg-[#ff4d6d]/20 text-[#ff6b86] border border-[#ff4d6d]/40"
                            : "bg-[#0d2e28] text-[#3ddba0] border border-[#2dd4a0]/40"
                        }`}
                      >
                        {(project.vercel_accounts || []).join(", ") ||
                          project.source}
                      </span>
                    </div>
                  </div>

                  {/* Status real HTTP */}
                  <div className="p-3.5 rounded-xl border border-[#263554] bg-[#0b1120]">
                    <div className="text-[11px] font-semibold text-[#8b9bb8]">
                      2. Disponibilidade HTTP Real & Tempo de Resposta
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      {!project.deploy_url ? (
                        <span className="text-xs text-[#8b9bb8]">
                          Sem domínio configurado
                        </span>
                      ) : pingResult?.loading ? (
                        <span className="text-xs text-[#a5b4fc]">
                          Medindo latência HTTP...
                        </span>
                      ) : pingResult ? (
                        <>
                          <span
                            className={`font-extrabold text-sm ${
                              pingResult.reachable
                                ? "text-[#3ddba0]"
                                : "text-[#ff6b86]"
                            }`}
                          >
                            {pingResult.reachable
                              ? `ONLINE (HTTP ${pingResult.statusCode})`
                              : `INDISPONÍVEL (${pingResult.statusCode || "Timeout"})`}
                          </span>
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#152038] text-[#38bdf8]">
                            {pingResult.latencyMs ?? 0} ms
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-[#8b9bb8]">
                          Clique em &ldquo;Testar Endpoint Agora&rdquo;
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Lista de domínios / ambientes por conta */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-[#8b9bb8]">
                  Domínios & Contas de Deploy
                </div>
                {project.deploy_url && (
                  <div className="p-3 rounded-xl border border-[#2dd4a0]/40 bg-[#0f172a] flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#3ddba0] truncate">
                        {project.deploy_url}
                      </div>
                      <div className="text-[11px] text-[#8b9bb8]">
                        Domínio Principal de Produção
                      </div>
                    </div>
                    <a
                      href={project.deploy_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 rounded-lg bg-[#0d2e28] text-[#3ddba0] text-xs font-bold inline-flex items-center gap-1"
                    >
                      Abrir Site <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {(project.deployments || []).map((d, i) => (
                  <div
                    key={`${d.vercelProjectId}-${i}`}
                    className="p-3 rounded-xl border border-[#22304d] bg-[#0f172a] flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="truncate">
                      <span className="font-bold text-[#a5b4fc]">
                        ▲ {d.account}
                      </span>{" "}
                      • <span className="text-[#cbd5e8]">{d.url || "Sem URL"}</span>{" "}
                      <span className="ml-2 text-[10.5px] px-2 py-0.5 rounded bg-[#162238] text-[#3ddba0]">
                        {d.status || "READY"}
                      </span>
                    </div>
                    {d.url && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePing(d.url)}
                          className="text-[#38bdf8] hover:underline cursor-pointer"
                        >
                          Ping HTTP
                        </button>
                        <a
                          href={d.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#3ddba0] hover:underline"
                        >
                          Abrir ↗
                        </a>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: DIAGNÓSTICO AUTOMÁTICO DO PROJETO */}
          {activeTab === "diagnostico" && (
            <div className="space-y-3.5">
              {loadingTelemetry ? (
                <div className="p-6 text-center text-xs text-[#8b9bb8]">
                  Analisando indicadores e telemetria do projeto...
                </div>
              ) : recommendations.length === 0 ? (
                <div className="p-5 rounded-xl border border-[#2dd4a0]/40 bg-[#0d2e28]/30 flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-[#3ddba0] shrink-0" />
                  <div>
                    <div className="font-bold text-sm text-white">
                      Nenhum problema detectado neste projeto
                    </div>
                    <p className="text-xs text-[#9baac5]">
                      Repositório vinculado, descrição preenchida e status de deploy saudável.
                    </p>
                  </div>
                </div>
              ) : (
                recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-4 rounded-xl border border-[#263554] bg-[#0f172a] space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              rec.severity === "critical"
                                ? "bg-[#ff4d6d]/20 text-[#ff6b86] border border-[#ff4d6d]/40"
                                : rec.severity === "warning"
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                  : "bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/40"
                            }`}
                          >
                            {rec.severity === "critical"
                              ? "Crítico"
                              : rec.severity === "warning"
                                ? "Atenção"
                                : "Melhoria"}
                          </span>
                          <span className="text-xs font-bold text-white">
                            {rec.title}
                          </span>
                        </div>
                        <p className="text-xs text-[#9baac5] mt-1">
                          <strong className="text-[#cbd5e8]">Evidência:</strong>{" "}
                          {rec.evidence}
                        </p>
                        {rec.probableCause && (
                          <p className="text-xs text-[#9baac5] mt-0.5">
                            <strong className="text-[#cbd5e8]">
                              Causa provável:
                            </strong>{" "}
                            {rec.probableCause}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <select
                          value={rec.status}
                          onChange={(e) =>
                            handleStatusChange(
                              rec.id,
                              e.target.value as RecommendationStatus
                            )
                          }
                          className="rounded-lg bg-[#162038] border border-[#2c3b5e] px-2.5 py-1 text-xs text-white"
                        >
                          <option value="open">Pendente</option>
                          <option value="investigating">Em análise</option>
                          <option value="resolved">Resolvido</option>
                        </select>

                        <button
                          type="button"
                          disabled={savingTask}
                          onClick={() => handleCreateTaskFromRec(rec)}
                          className="px-2.5 py-1 rounded-lg bg-[#5641e5] hover:bg-[#4330c6] text-xs font-bold text-white cursor-pointer"
                        >
                          + Criar Tarefa
                        </button>
                      </div>
                    </div>

                    {rec.steps && rec.steps.length > 0 && (
                      <div className="p-3 rounded-lg bg-[#0b1120] border border-[#1e2942]">
                        <div className="text-[11px] font-bold text-[#a5b4fc] mb-1">
                          Procedimento de Correção Passo a Passo:
                        </div>
                        <ol className="list-decimal list-inside space-y-1 text-xs text-[#cbd5e8]">
                          {rec.steps.map((s, idx) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: ASSISTENTE INTELIGENTE DE SOLUÇÕES (REVISÃO HUMANA) */}
          {activeTab === "assistente" && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-[#38bdf8]/40 bg-[#0c2238]/60 flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-[#38bdf8] shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-bold text-white">
                    Assistente Inteligente de Soluções • Modo de Revisão Humana
                  </div>
                  <p className="text-[#9baac5] mt-0.5">
                    As alterações de código e configuração abaixo são geradas com base nos logs, deploys e repositório de{" "}
                    <strong className="text-white">{project.name}</strong>.{" "}
                    <span className="text-amber-300 font-semibold">
                      Nenhuma alteração é aplicada automaticamente sem sua revisão e aprovação.
                    </span>
                  </p>
                </div>
              </div>

              {recommendations.filter((r) => r.proposedCode).length === 0 ? (
                <div className="p-4 rounded-xl border border-[#22304d] bg-[#0f172a] space-y-2">
                  <div className="text-xs font-bold text-[#3ddba0]">
                    ✓ Nenhuma correção emergencial pendente para {project.name}
                  </div>
                  <p className="text-xs text-[#9baac5]">
                    Comandos preventivos recomendados para validação local antes de novos deploys:
                  </p>
                  <pre className="p-3 rounded-lg bg-[#090d18] border border-[#1e2942] text-xs font-mono text-[#cbd5e8] overflow-x-auto">
{`cd "${project.local_path || `D:/Projetos Vs Code/${project.name}`}"
git status
npx tsc --noEmit --incremental false
npm run build`}
                  </pre>
                </div>
              ) : (
                recommendations
                  .filter((r) => r.proposedCode)
                  .map((rec) => (
                    <div
                      key={`assist-${rec.id}`}
                      className="p-4 rounded-xl border border-[#263554] bg-[#0f172a] space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <FileCode2 className="w-4 h-4 text-[#a78bfa]" />
                          <span className="text-xs font-bold text-white">
                            {rec.proposedCode!.filename}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            copySnippet(rec.id, rec.proposedCode!.snippet)
                          }
                          className="px-2.5 py-1 rounded-lg bg-[#162038] hover:bg-[#1f2d4d] border border-[#2c3b5e] text-xs font-semibold text-[#cbd5e8] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          {copiedId === rec.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-[#3ddba0]" />
                              Copiado para revisão
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copiar proposta
                            </>
                          )}
                        </button>
                      </div>

                      <p className="text-xs text-[#9baac5]">
                        {rec.proposedCode!.description}
                      </p>

                      <pre className="p-3 rounded-lg bg-[#080c17] border border-[#1e2942] text-xs font-mono text-[#d5e0f2] overflow-x-auto">
                        {rec.proposedCode!.snippet}
                      </pre>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* TAB 5: CENTRAL DE TAREFAS & ISSUES DO PROJETO */}
          {activeTab === "tarefas" && (
            <div className="space-y-4">
              <form
                onSubmit={handleAddManualTask}
                className="p-4 rounded-xl border border-[#263554] bg-[#0f172a] space-y-3"
              >
                <div className="text-xs font-bold uppercase tracking-wider text-[#c4b5fd]">
                  Nova Tarefa ou Melhoria para {project.name}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Título da tarefa ou correção..."
                    className="sm:col-span-2 px-3 py-2 rounded-xl bg-[#090e1a] border border-[#22304d] text-xs text-white"
                  />
                  <select
                    value={taskPriority}
                    onChange={(e) =>
                      setTaskPriority(e.target.value as TaskPriority)
                    }
                    className="px-3 py-2 rounded-xl bg-[#090e1a] border border-[#22304d] text-xs text-white"
                  >
                    <option value="high">Prioridade Alta</option>
                    <option value="medium">Prioridade Média</option>
                    <option value="low">Prioridade Baixa</option>
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={taskNotes}
                    onChange={(e) => setTaskNotes(e.target.value)}
                    placeholder="Observações técnicas (opcional)..."
                    className="px-3 py-2 rounded-xl bg-[#090e1a] border border-[#22304d] text-xs text-white"
                  />
                  <input
                    type="url"
                    value={taskIssueUrl}
                    onChange={(e) => setTaskIssueUrl(e.target.value)}
                    placeholder={
                      defaultIssuesUrl ||
                      "Link para Issue / PR no GitHub ou GitLab..."
                    }
                    className="px-3 py-2 rounded-xl bg-[#090e1a] border border-[#22304d] text-xs text-white"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingTask || !taskTitle.trim()}
                    className="px-4 py-1.5 rounded-xl bg-[#5641e5] hover:bg-[#4330c6] disabled:opacity-50 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar Tarefa
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                {tasks.length === 0 ? (
                  <div className="p-6 rounded-xl border border-[#1e2942] bg-[#0f172a] text-center text-xs text-[#8b9bb8]">
                    Nenhuma tarefa cadastrada para este projeto. Você pode converter alertas da aba Diagnóstico ou criar uma tarefa acima.
                  </div>
                ) : (
                  tasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-xl border border-[#22304d] bg-[#0f172a] flex items-start justify-between gap-3 flex-wrap"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              t.priority === "high"
                                ? "bg-[#ff4d6d]/20 text-[#ff6b86]"
                                : t.priority === "medium"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-[#38bdf8]/20 text-[#38bdf8]"
                            }`}
                          >
                            {t.priority === "high"
                              ? "Alta"
                              : t.priority === "medium"
                                ? "Média"
                                : "Baixa"}
                          </span>
                          <span
                            className={`text-xs font-bold ${
                              t.status === "done"
                                ? "line-through text-[#6f809e]"
                                : "text-white"
                            }`}
                          >
                            {t.title}
                          </span>
                        </div>
                        {t.notes && (
                          <p className="text-xs text-[#9baac5]">{t.notes}</p>
                        )}
                        {t.issueUrl && (
                          <a
                            href={t.issueUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[#a5b4fc] hover:underline"
                          >
                            Issue / Pull Request vinculado ↗
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={t.status}
                          onChange={(e) =>
                            handleUpdateTaskStatus(
                              t,
                              e.target.value as TaskStatus
                            )
                          }
                          className="rounded-lg bg-[#162038] border border-[#2c3b5e] px-2.5 py-1 text-xs text-white"
                        >
                          <option value="todo">Pendente</option>
                          <option value="in_progress">Em andamento</option>
                          <option value="done">Concluída</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => handleDeleteTask(t.id)}
                          className="p-1.5 rounded-lg text-[#ff6b86] hover:bg-[#ff4d6d]/15 cursor-pointer"
                          title="Excluir tarefa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 border-t border-[#1e2942] bg-[#0a0f1d] flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => onTogglePin(project)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#29344a] bg-[#151f36] text-xs font-semibold text-white hover:border-amber-400 cursor-pointer"
          >
            <Pin className="w-3.5 h-3.5 text-amber-400" />
            {project.is_pinned ? "Desafixar do topo" : "Fixar no topo"}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(project);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#6c56f5] to-[#523ce0] hover:opacity-95 text-xs font-bold text-white cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Editar Cadastro do Projeto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
