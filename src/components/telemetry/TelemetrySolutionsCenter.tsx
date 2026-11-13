"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { Project, SyncLog } from "@/types/project";
import type {
  ProjectTask,
  RecommendationStatus,
  TaskPriority,
  TaskStatus,
  TelemetryRecommendation,
} from "@/types/telemetry";
import { getAdminIdToken } from "@/lib/firebase";

export type TelemetrySubTab =
  | "diagnostic"
  | "activity"
  | "alerts"
  | "improvements"
  | "tasks"
  | "history";

interface TelemetrySolutionsCenterProps {
  projects: Project[];
  recommendations: TelemetryRecommendation[];
  syncLogs: SyncLog[];
  loading: boolean;
  initialSubTab?: TelemetrySubTab;
  onRefresh: () => Promise<void>;
  onUpdateStatus: (id: string, status: RecommendationStatus) => Promise<void>;
  onSelectProject: (p: Project | null) => void;
}

const statusLabels: Record<RecommendationStatus, string> = {
  open: "Pendente",
  investigating: "Em análise",
  resolved: "Resolvida",
};

export function TelemetrySolutionsCenter({
  projects,
  recommendations,
  syncLogs,
  loading,
  initialSubTab = "diagnostic",
  onRefresh,
  onUpdateStatus,
  onSelectProject,
}: TelemetrySolutionsCenterProps) {
  const [activeSubTab, setActiveSubTab] =
    useState<TelemetrySubTab>(initialSubTab);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDiagId, setSelectedDiagId] = useState<string | null>(
    recommendations[0]?.id || null
  );
  const [updatingId, setUpdatingId] = useState<string>("");
  const [copiedCmd, setCopiedCmd] = useState<string>("");
  const [notice, setNotice] = useState<string | null>(null);

  // Tasks state (Central de Tarefas e Melhorias)
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskProjectId, setTaskProjectId] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("high");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskIssueUrl, setTaskIssueUrl] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  // Scheduled Auto-Sync state
  const [autoSyncMinutes, setAutoSyncMinutes] = useState<number>(0);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [autoSyncRunning, setAutoSyncRunning] = useState(false);

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    if (!selectedDiagId && recommendations.length > 0) {
      setSelectedDiagId(recommendations[0].id);
    }
  }, [recommendations, selectedDiagId]);

  const loadTasks = useCallback(async () => {
    try {
      const token = await getAdminIdToken();
      const headers: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {};
      const res = await fetch("/api/tasks", { headers, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  // Scheduled Auto-Sync Timer with duplicate-execution lock
  const triggerScheduledSync = useCallback(async () => {
    if (autoSyncRunning) return;
    setAutoSyncRunning(true);
    try {
      const token = await getAdminIdToken();
      if (!token) {
        setNotice(
          "Auto-Sync agendado requer sessão de administrador autenticada."
        );
        return;
      }
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scheduled: true }),
      });
      if (res.status === 409) {
        setNotice(
          "Sincronização duplicada prevenida: já existe uma execução em andamento."
        );
      } else if (res.ok) {
        setNotice(
          `Sincronização automática concluída às ${new Date().toLocaleTimeString("pt-BR")}.`
        );
        await onRefresh();
      }
    } catch {
      setNotice("Alerta: falha na tentativa de sincronização agendada.");
    } finally {
      setAutoSyncRunning(false);
    }
  }, [autoSyncRunning, onRefresh]);

  useEffect(() => {
    if (autoSyncMinutes <= 0) {
      setSecondsRemaining(0);
      return;
    }
    setSecondsRemaining(autoSyncMinutes * 60);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          void triggerScheduledSync();
          return autoSyncMinutes * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoSyncMinutes, triggerScheduledSync]);

  const filteredDiagnostics = useMemo(() => {
    return recommendations.filter((d) => {
      if (selectedProjectId !== "all" && d.projectId !== selectedProjectId) {
        return false;
      }
      if (activeSubTab === "alerts" && d.severity === "info") {
        return false;
      }
      if (activeSubTab === "improvements" && d.severity !== "info") {
        return false;
      }
      if (activeSubTab === "history" && d.status === "open") {
        return false;
      }
      if (statusFilter !== "all" && d.status !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          d.title.toLowerCase().includes(q) ||
          (d.projectName || "").toLowerCase().includes(q) ||
          d.evidence.toLowerCase().includes(q) ||
          d.action.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [
    recommendations,
    selectedProjectId,
    activeSubTab,
    statusFilter,
    searchTerm,
  ]);

  const selectedDiag = useMemo(() => {
    return (
      filteredDiagnostics.find((d) => d.id === selectedDiagId) ||
      filteredDiagnostics[0] ||
      null
    );
  }, [filteredDiagnostics, selectedDiagId]);

  const handleUpdate = async (
    item: TelemetryRecommendation,
    newStatus: RecommendationStatus
  ) => {
    setUpdatingId(item.id);
    try {
      await onUpdateStatus(item.id, newStatus);
    } finally {
      setUpdatingId("");
    }
  };

  const copyCommand = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedCmd(cmd);
      setTimeout(() => setCopiedCmd(""), 2000);
    } catch {
      // ignore
    }
  };

  const handleConvertDiagToTask = async (diag: TelemetryRecommendation) => {
    setSavingTask(true);
    try {
      const token = await getAdminIdToken();
      if (!token) {
        setNotice(
          "Faça login como administrador no cabeçalho para criar tarefas no Neon PostgreSQL."
        );
        return;
      }
      const proj = projects.find((p) => p.id === diag.projectId);
      const defaultIssue = proj?.repo_url
        ? `${proj.repo_url.replace(/\.git$/, "")}/issues`
        : "";
      const priority: TaskPriority =
        diag.severity === "critical"
          ? "high"
          : diag.severity === "warning"
            ? "medium"
            : "low";

      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: diag.projectId,
          projectName: diag.projectName || "Sistema",
          recommendationId: diag.id,
          title: diag.title,
          priority,
          status: "todo",
          notes: `${diag.evidence} | Solução: ${diag.action}`,
          issueUrl: defaultIssue,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          setTasks((prev) => [data.task, ...prev]);
          setActiveSubTab("tasks");
          setNotice("Recomendação convertida em tarefa na Central de Tarefas!");
        }
      }
    } finally {
      setSavingTask(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSavingTask(true);
    try {
      const token = await getAdminIdToken();
      if (!token) {
        setNotice("Faça login como administrador para cadastrar tarefas.");
        return;
      }
      const proj = projects.find((p) => p.id === taskProjectId);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: proj ? proj.id : null,
          projectName: proj ? proj.name : "Geral",
          title: taskTitle.trim(),
          priority: taskPriority,
          status: "todo",
          notes: taskNotes.trim(),
          issueUrl:
            taskIssueUrl.trim() ||
            (proj?.repo_url
              ? `${proj.repo_url.replace(/\.git$/, "")}/issues`
              : ""),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          setTasks((prev) => [data.task, ...prev]);
          setTaskTitle("");
          setTaskNotes("");
          setTaskIssueUrl("");
          setNotice("Tarefa registrada com sucesso no Neon PostgreSQL.");
        }
      }
    } finally {
      setSavingTask(false);
    }
  };

  const handleTaskStatusChange = async (
    task: ProjectTask,
    status: TaskStatus
  ) => {
    const token = await getAdminIdToken();
    if (!token) {
      setNotice("Faça login como administrador para alterar tarefas.");
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

  const deploymentsWithError = projects.filter(
    (p) =>
      !p.is_hidden &&
      /ERROR|FAILED|FAILURE|CANCELED|CANCELLED/i.test(p.last_deploy_status)
  ).length;
  const openCount = recommendations.filter((r) => r.status === "open").length;
  const investigatingCount = recommendations.filter(
    (r) => r.status === "investigating"
  ).length;
  const resolvedCount = recommendations.filter(
    (r) => r.status === "resolved"
  ).length;
  const pendingTasksCount = tasks.filter((t) => t.status !== "done").length;

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl border border-[#3ddba0]/40 bg-gradient-to-r from-[#121a29] via-[#132235] to-[#121a29] shadow-[0_0_25px_rgba(61,219,160,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#3ddba0]/15 text-[#3ddba0] border border-[#3ddba0]/40">
                DevCentral 3.0 · Diagnóstico, Assistente & Tarefas
              </span>
              <span className="text-xs text-[#9baac5]">
                Dados reais do Neon PostgreSQL
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-white mt-1.5">
              Central de Telemetria, Soluções & Tarefas
            </h2>
            <p className="text-xs text-[#9baac5] mt-0.5 max-w-3xl">
              Detecta falhas de deploy, repositórios sem atualização, links
              indisponíveis e problemas de sincronização. Propõe correções para
              revisão humana e transforma recomendações em tarefas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Auto-Sync Scheduler Control */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs">
              <span className="text-[#9baac5] font-semibold">Auto-Sync:</span>
              <select
                value={autoSyncMinutes}
                onChange={(e) => setAutoSyncMinutes(Number(e.target.value))}
                className="bg-transparent text-[#3ddba0] font-bold focus:outline-none cursor-pointer"
              >
                <option value={0} className="bg-[#0b101d] text-white">
                  Manual
                </option>
                <option value={15} className="bg-[#0b101d] text-white">
                  A cada 15 min
                </option>
                <option value={30} className="bg-[#0b101d] text-white">
                  A cada 30 min
                </option>
                <option value={60} className="bg-[#0b101d] text-white">
                  A cada 60 min
                </option>
              </select>
              {autoSyncMinutes > 0 && (
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#162238] text-[#a5b4fc]">
                  {autoSyncRunning
                    ? "Sincronizando..."
                    : formatCountdown(secondsRemaining)}
                </span>
              )}
            </div>

            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs font-semibold text-white focus:outline-none focus:border-[#3ddba0]"
            >
              <option value="all">
                Todos os projetos ({projects.filter((p) => !p.is_hidden).length}
                )
              </option>
              {projects
                .filter((p) => !p.is_hidden)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.source})
                  </option>
                ))}
            </select>

            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-[#3ddba0]/15 hover:bg-[#3ddba0]/25 text-[#3ddba0] border border-[#3ddba0]/40 text-xs font-bold transition cursor-pointer disabled:opacity-50"
            >
              {loading ? "Analisando..." : "↻ Atualizar Diagnóstico"}
            </button>

            <Link
              href="/telemetria"
              className="px-3 py-2 rounded-xl bg-[#182235] hover:bg-[#22304a] text-[#c2d0e8] border border-[#2b374f] text-xs font-semibold transition"
            >
              Abrir /telemetria ↗
            </Link>
          </div>
        </div>

        {notice && (
          <div className="mt-3 px-3.5 py-2 rounded-xl bg-[#17233b] border border-[#6e56cf]/50 text-xs text-[#d8ceff] flex items-center justify-between">
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-[#9baac5] hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mt-4">
          <div className="p-3 rounded-xl bg-[#0b101d]/90 border border-[#29344a]">
            <div className="text-[11px] text-[#9baac5]">Projetos Ativos</div>
            <div className="text-xl font-extrabold text-white mt-0.5">
              {projects.filter((p) => !p.is_hidden).length}
            </div>
            <div className="text-[10px] text-[#3ddba0] mt-0.5">
              Contagem 100% real
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#0b101d]/90 border border-[#ff4d6d]/40">
            <div className="text-[11px] text-[#ff8fa3]">
              Deploys com Falha
            </div>
            <div className="text-xl font-extrabold text-[#ff4d6d] mt-0.5">
              {deploymentsWithError}
            </div>
            <div className="text-[10px] text-[#9baac5] mt-0.5">
              Status ERROR / FAILED
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#0b101d]/90 border border-amber-500/35">
            <div className="text-[11px] text-amber-300">
              Alertas Pendentes
            </div>
            <div className="text-xl font-extrabold text-amber-300 mt-0.5">
              {openCount}
            </div>
            <div className="text-[10px] text-[#9baac5] mt-0.5">
              Aguardando ação
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#0b101d]/90 border border-[#7c74ff]/40">
            <div className="text-[11px] text-[#c8c4ff]">Em Análise</div>
            <div className="text-xl font-extrabold text-[#a59eff] mt-0.5">
              {investigatingCount}
            </div>
            <div className="text-[10px] text-[#9baac5] mt-0.5">
              Investigação ativa
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#0b101d]/90 border border-[#3ddba0]/40">
            <div className="text-[11px] text-[#3ddba0]">
              Soluções Resolvidas
            </div>
            <div className="text-xl font-extrabold text-[#3ddba0] mt-0.5">
              {resolvedCount}
            </div>
            <div className="text-[10px] text-[#9baac5] mt-0.5">
              Histórico no Neon DB
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#0b101d]/90 border border-[#c084fc]/40">
            <div className="text-[11px] text-[#e9d5ff]">
              Tarefas em Aberto
            </div>
            <div className="text-xl font-extrabold text-[#c084fc] mt-0.5">
              {pendingTasksCount}
            </div>
            <div className="text-[10px] text-[#9baac5] mt-0.5">
              Central de Melhorias
            </div>
          </div>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: "diagnostic", label: "🩺 Centro de Diagnóstico" },
              { id: "alerts", label: "🚨 Alertas & Falhas" },
              { id: "improvements", label: "💡 Melhorias Recomendadas" },
              {
                id: "tasks",
                label: `📋 Central de Tarefas (${pendingTasksCount})`,
              },
              { id: "activity", label: "📡 Histórico de Sincronizações" },
              { id: "history", label: "✅ Histórico de Soluções" },
            ] as { id: TelemetrySubTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeSubTab === tab.id
                  ? "bg-[#3ddba0]/20 text-[#3ddba0] border border-[#3ddba0]/50 shadow-[0_0_12px_rgba(61,219,160,0.18)]"
                  : "bg-[#121a29] text-[#9baac5] border border-[#29344a] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeSubTab !== "activity" && activeSubTab !== "tasks" && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar problema, projeto ou solução..."
              className="px-3 py-1.5 rounded-xl bg-[#121a29] border border-[#29344a] text-xs text-white placeholder-[#7f8ea8] focus:outline-none focus:border-[#3ddba0]"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-[#121a29] border border-[#29344a] text-xs text-[#c2d0e8]"
            >
              <option value="all">Todos os status</option>
              <option value="open">Pendente</option>
              <option value="investigating">Em análise</option>
              <option value="resolved">Resolvida</option>
            </select>
          </div>
        )}
      </div>

      {/* Main Content */}
      {activeSubTab === "tasks" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Create Task Form */}
          <form
            onSubmit={handleCreateTask}
            className="lg:col-span-4 p-5 rounded-2xl border border-[#29344a] bg-[#121a29] space-y-3.5 h-fit"
          >
            <div>
              <h3 className="text-sm font-extrabold text-white">
                Nova Tarefa ou Melhoria
              </h3>
              <p className="text-xs text-[#9baac5] mt-0.5">
                Registre tarefas vinculadas aos projetos e associe Issues ou Pull
                Requests do GitHub/GitLab.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#9baac5]">
                Projeto
              </label>
              <select
                value={taskProjectId}
                onChange={(e) => setTaskProjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs text-white"
              >
                <option value="">Geral / Multi-projetos</option>
                {projects
                  .filter((p) => !p.is_hidden)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#9baac5]">
                Título da Tarefa
              </label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Ex: Corrigir variável de ambiente no deploy..."
                className="w-full px-3 py-2 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#9baac5]">
                Prioridade
              </label>
              <select
                value={taskPriority}
                onChange={(e) =>
                  setTaskPriority(e.target.value as TaskPriority)
                }
                className="w-full px-3 py-2 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs text-white"
              >
                <option value="high">Alta Prioridade</option>
                <option value="medium">Média Prioridade</option>
                <option value="low">Baixa Prioridade</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#9baac5]">
                Link para Issue / Pull Request (GitHub / GitLab)
              </label>
              <input
                type="url"
                value={taskIssueUrl}
                onChange={(e) => setTaskIssueUrl(e.target.value)}
                placeholder="https://github.com/.../issues/1"
                className="w-full px-3 py-2 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#9baac5]">
                Observações Técnicas
              </label>
              <textarea
                rows={3}
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                placeholder="Detalhes da implementação ou revisão..."
                className="w-full px-3 py-2 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs text-white"
              />
            </div>

            <button
              type="submit"
              disabled={savingTask || !taskTitle.trim()}
              className="w-full py-2 rounded-xl bg-gradient-to-r from-[#5641e5] to-[#4330c6] hover:opacity-95 disabled:opacity-50 text-xs font-bold text-white cursor-pointer"
            >
              {savingTask ? "Salvando..." : "+ Registrar Tarefa no Neon"}
            </button>
          </form>

          {/* Tasks List */}
          <div className="lg:col-span-8 p-5 rounded-2xl border border-[#29344a] bg-[#121a29] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-white">
                Tarefas & Melhorias Acompanhadas ({tasks.length})
              </h3>
              <span className="text-xs text-[#9baac5]">
                Sincronizado com Neon PostgreSQL
              </span>
            </div>

            {tasks.length === 0 ? (
              <div className="p-8 rounded-xl border border-[#232f46] bg-[#0d1422] text-center text-xs text-[#9baac5]">
                Nenhuma tarefa cadastrada ainda. Use o botão{" "}
                <strong className="text-white">
                  &ldquo;+ Converter em Tarefa&rdquo;
                </strong>{" "}
                em qualquer recomendação do Centro de Diagnóstico ou crie uma
                nova tarefa ao lado.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3.5 rounded-xl bg-[#0d1422] border border-[#232f46] flex items-start justify-between gap-3 flex-wrap"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            task.priority === "high"
                              ? "bg-[#ff4d6d]/20 text-[#ff6b86]"
                              : task.priority === "medium"
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-[#38bdf8]/20 text-[#38bdf8]"
                          }`}
                        >
                          {task.priority === "high"
                            ? "Alta"
                            : task.priority === "medium"
                              ? "Média"
                              : "Baixa"}
                        </span>
                        <span className="text-xs font-bold text-[#a59eff]">
                          {task.projectName}
                        </span>
                        <span
                          className={`text-xs font-bold ${
                            task.status === "done"
                              ? "line-through text-[#6f809e]"
                              : "text-white"
                          }`}
                        >
                          {task.title}
                        </span>
                      </div>

                      {task.notes && (
                        <p className="text-xs text-[#9baac5]">{task.notes}</p>
                      )}

                      {task.issueUrl && (
                        <a
                          href={task.issueUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#3ddba0] hover:underline"
                        >
                          Abrir Issue / Pull Request ({task.issueUrl}) ↗
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={task.status}
                        onChange={(e) =>
                          void handleTaskStatusChange(
                            task,
                            e.target.value as TaskStatus
                          )
                        }
                        className="px-2.5 py-1 rounded-lg bg-[#162038] border border-[#2c3b5e] text-xs text-white"
                      >
                        <option value="todo">Pendente</option>
                        <option value="in_progress">Em andamento</option>
                        <option value="done">Concluída</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleDeleteTask(task.id)}
                        className="px-2.5 py-1 rounded-lg bg-[#ff4d6d]/15 hover:bg-[#ff4d6d]/25 text-[#ff6b86] text-xs font-semibold cursor-pointer"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : activeSubTab === "activity" ? (
        <div className="p-5 rounded-2xl border border-[#29344a] bg-[#121a29]/90 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Histórico de Sincronizações Multi-Cloud (GitHub, GitLab, Vercel 1
              & Vercel 2)
            </h3>
            <span className="text-xs text-[#9baac5]">
              {syncLogs.length} eventos registrados
            </span>
          </div>

          <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
            {syncLogs.map((log) => {
              const hasFail = /error|fail|partial/i.test(log.status);
              return (
                <div
                  key={log.id}
                  className={`p-3.5 rounded-xl bg-[#0d1422] border flex flex-wrap items-center justify-between gap-3 ${
                    hasFail ? "border-[#ff4d6d]/50" : "border-[#232f46]"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${
                        hasFail ? "bg-[#ff4d6d]" : "bg-[#3ddba0]"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white">
                          Sincronização ({log.status})
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#182235] text-[#9baac5] border border-[#2b374f]">
                          GH:{log.github_count} · GL:{log.gitlab_count} · V1:
                          {log.vercel1_count} · V2:{log.vercel2_count}
                        </span>
                      </div>
                      <p className="text-xs text-[#9baac5] mt-0.5 break-words">
                        {log.details}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] text-[#7f8ea8] shrink-0">
                    {new Date(log.synced_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left column: Diagnostics list */}
          <div className="lg:col-span-5 space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
            {filteredDiagnostics.length === 0 ? (
              <div className="p-8 rounded-2xl border border-[#29344a] bg-[#121a29]/70 text-center">
                <div className="text-sm font-bold text-white mb-1">
                  Nenhum item encontrado neste filtro
                </div>
                <p className="text-xs text-[#9baac5]">
                  Altere o projeto selecionado ou o filtro de status acima.
                </p>
              </div>
            ) : (
              filteredDiagnostics.map((diag) => {
                const isSelected = selectedDiag?.id === diag.id;
                const borderClass =
                  diag.severity === "critical"
                    ? "border-[#ff4d6d]/60"
                    : diag.severity === "warning"
                      ? "border-amber-500/50"
                      : "border-[#29344a]";
                return (
                  <div
                    key={diag.id}
                    onClick={() => setSelectedDiagId(diag.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        setSelectedDiagId(diag.id);
                      }
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition cursor-pointer ${borderClass} ${
                      isSelected
                        ? "bg-[#1a253a] ring-1 ring-[#3ddba0]"
                        : "bg-[#121a29]/85 hover:bg-[#162033]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            diag.severity === "critical"
                              ? "bg-[#ff4d6d]/15 text-[#ff8fa3] border border-[#ff4d6d]/35"
                              : diag.severity === "warning"
                                ? "bg-amber-500/15 text-amber-300 border border-amber-500/35"
                                : "bg-[#7c74ff]/15 text-[#c8c4ff] border border-[#7c74ff]/35"
                          }`}
                        >
                          {diag.severity === "critical"
                            ? "Prioridade Alta"
                            : diag.severity === "warning"
                              ? "Atenção"
                              : "Melhoria"}
                        </span>
                        <span className="text-xs font-bold text-[#a59eff] truncate">
                          {diag.projectName || "Sistema"}
                        </span>
                      </div>

                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                          diag.status === "resolved"
                            ? "bg-[#12372e] text-[#3ddba0]"
                            : diag.status === "investigating"
                              ? "bg-[#22244a] text-[#c8c4ff]"
                              : "bg-[#1b2436] text-[#9baac5]"
                        }`}
                      >
                        {statusLabels[diag.status]}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-white line-clamp-1">
                      {diag.title}
                    </div>
                    <p className="text-[11px] text-[#9baac5] line-clamp-2 mt-1">
                      {diag.evidence}
                    </p>

                    {/* Mobile & Quick Touch Actions */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-[#232f46]/80">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDiagId(diag.id);
                          document
                            .getElementById("telemetry-solution-detail")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#182235] hover:bg-[#22304a] text-[11px] font-bold text-[#3ddba0] border border-[#3ddba0]/35 cursor-pointer"
                      >
                        Ver solução
                      </button>

                      {diag.projectId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const found = projects.find(
                              (p) => p.id === diag.projectId
                            );
                            if (found) onSelectProject(found);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-[#22244a] hover:bg-[#2d3063] text-[11px] font-bold text-[#c8c4ff] border border-[#7c74ff]/40 cursor-pointer"
                        >
                          Analisar projeto
                        </button>
                      )}

                      {diag.status !== "resolved" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleUpdate(diag, "resolved");
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-[#12372e] hover:bg-[#194d40] text-[11px] font-bold text-[#3ddba0] border border-[#3ddba0]/40 cursor-pointer ml-auto"
                        >
                          ✓ Marcar resolvido
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right column: Interactive Solution Assistant */}
          <div id="telemetry-solution-detail" className="lg:col-span-7">
            {selectedDiag ? (
              <div className="p-5 rounded-2xl border border-[#29344a] bg-[#121a29] space-y-4 sticky top-4">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#232f46]">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#3ddba0]">
                        Projeto:{" "}
                        {selectedDiag.projectName || "Sistema de Sincronização"}
                      </span>
                      <span className="text-[11px] text-[#9baac5]">
                        • Categoria: {selectedDiag.category.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold text-white mt-1">
                      {selectedDiag.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={savingTask}
                      onClick={() => void handleConvertDiagToTask(selectedDiag)}
                      className="px-3 py-1.5 rounded-lg bg-[#5641e5] hover:bg-[#4330c6] text-xs font-bold text-white cursor-pointer"
                    >
                      + Converter em Tarefa
                    </button>

                    {selectedDiag.projectId && (
                      <button
                        type="button"
                        onClick={() => {
                          const found = projects.find(
                            (p) => p.id === selectedDiag.projectId
                          );
                          if (found) onSelectProject(found);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#182235] hover:bg-[#22304a] text-xs font-semibold text-[#c2d0e8] border border-[#2b374f] cursor-pointer"
                      >
                        Analisar projeto ↗
                      </button>
                    )}
                  </div>
                </div>

                {/* Diagnosis, Probable Cause & Action */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-[#0d1422] border border-[#232f46]">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#9baac5] mb-1">
                      1. Evidência Detectada
                    </div>
                    <p className="text-xs text-white leading-relaxed">
                      {selectedDiag.evidence}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#0d1422] border border-[#232f46]">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                      2. Causa Provável
                    </div>
                    <p className="text-xs text-[#c2d0e8] leading-relaxed">
                      {selectedDiag.probableCause ||
                        "Configuração pendente ou divergência entre o repositório e o ambiente de deploy."}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#0d1422] border border-[#232f46]">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#3ddba0] mb-1">
                      3. Ação Recomendada
                    </div>
                    <p className="text-xs text-[#c2d0e8] leading-relaxed">
                      {selectedDiag.action}
                    </p>
                  </div>
                </div>

                {/* Step-by-Step Solution Guide */}
                {selectedDiag.steps && selectedDiag.steps.length > 0 && (
                  <div className="p-4 rounded-xl bg-[#0b101d] border border-[#3ddba0]/30">
                    <div className="text-xs font-extrabold uppercase tracking-wider text-[#3ddba0] mb-2.5">
                      4. Procedimento de Correção Passo a Passo
                    </div>
                    <ol className="space-y-2">
                      {selectedDiag.steps.map((step, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-2.5 text-xs text-[#e2e8f0]"
                        >
                          <span className="w-5 h-5 rounded-full bg-[#3ddba0]/15 text-[#3ddba0] border border-[#3ddba0]/40 flex items-center justify-center text-[11px] font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <span className="leading-relaxed pt-0.5">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Intelligent Solution Assistant: Proposed Code for Human Review */}
                {selectedDiag.proposedCode && (
                  <div className="p-4 rounded-xl bg-[#0a1224] border border-[#38bdf8]/40 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30">
                          🤖 Assistente Inteligente de Soluções • Revisão Humana
                          Obrigatória
                        </span>
                        <div className="text-xs font-bold text-white mt-1">
                          {selectedDiag.proposedCode.filename}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void copyCommand(selectedDiag.proposedCode!.snippet)
                        }
                        className="px-2.5 py-1 rounded-lg bg-[#16243d] hover:bg-[#1f3254] text-xs font-semibold text-[#38bdf8] border border-[#38bdf8]/30 cursor-pointer"
                      >
                        {copiedCmd === selectedDiag.proposedCode.snippet
                          ? "Proposta copiada!"
                          : "Copiar código proposto"}
                      </button>
                    </div>
                    <p className="text-[11px] text-[#9baac5]">
                      {selectedDiag.proposedCode.description} (Nunca aplicado
                      automaticamente sem aprovação).
                    </p>
                    <pre className="p-3 rounded-lg bg-[#070b14] border border-[#1e2942] text-xs font-mono text-[#d5e0f2] overflow-x-auto">
                      {selectedDiag.proposedCode.snippet}
                    </pre>
                  </div>
                )}

                {/* Terminal / VS Code Commands */}
                {selectedDiag.commands && selectedDiag.commands.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-[#090d16] border border-[#232f46]">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#9baac5] mb-2">
                      Comandos de Verificação / Correção (Terminal VS Code)
                    </div>
                    <div className="space-y-1.5">
                      {selectedDiag.commands.map((cmd, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#11192a] border border-[#26334d] font-mono text-xs text-[#3ddba0]"
                        >
                          <span className="truncate">$ {cmd}</span>
                          <button
                            type="button"
                            onClick={() => void copyCommand(cmd)}
                            className="px-2 py-0.5 rounded bg-[#1c2840] hover:bg-[#283858] text-[10px] text-white font-sans font-semibold shrink-0 cursor-pointer"
                          >
                            {copiedCmd === cmd ? "Copiado!" : "Copiar"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Persist Status in Neon DB */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[#232f46]">
                  <span className="text-xs text-[#9baac5]">
                    Status salvo no Neon PostgreSQL:{" "}
                    <strong className="text-white">
                      {statusLabels[selectedDiag.status]}
                    </strong>
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={updatingId === selectedDiag.id}
                      onClick={() =>
                        void handleUpdate(selectedDiag, "investigating")
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#22244a] hover:bg-[#2d3060] text-[#c8c4ff] border border-[#7c74ff]/40 text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      🔍 Em análise
                    </button>
                    <button
                      type="button"
                      disabled={updatingId === selectedDiag.id}
                      onClick={() =>
                        void handleUpdate(selectedDiag, "resolved")
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#12372e] hover:bg-[#194d40] text-[#3ddba0] border border-[#3ddba0]/40 text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      ✓ Marcar Resolvida
                    </button>
                    {selectedDiag.status !== "open" && (
                      <button
                        type="button"
                        disabled={updatingId === selectedDiag.id}
                        onClick={() => void handleUpdate(selectedDiag, "open")}
                        className="px-3 py-1.5 rounded-lg bg-[#1b2436] hover:bg-[#253149] text-[#9baac5] border border-[#2b374f] text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        Reabrir
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 rounded-2xl border border-[#29344a] bg-[#121a29]/60 text-center">
                <p className="text-xs text-[#9baac5]">
                  Selecione um diagnóstico ou recomendação ao lado para ver o
                  passo a passo de solução.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
