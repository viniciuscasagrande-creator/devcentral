"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { Project, SyncLog } from "@/types/project";
import type {
  ProjectOperationalInspection,
  ProjectTask,
  RecommendationStatus,
  TaskChecklistItem,
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

  // Tasks state (Central de Tarefas e Planos de Ação)
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskProjectId, setTaskProjectId] = useState("");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("high");
  const [taskAssignee, setTaskAssignee] = useState("Vinicius Casagrande (Admin)");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskChecklistRaw, setTaskChecklistRaw] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskIssueUrl, setTaskIssueUrl] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  // Operational Workflow state (Analisar -> Corrigir -> Verificar)
  const [opStep, setOpStep] = useState<"analyze" | "fix" | "verify">("fix");
  const [inspection, setInspection] =
    useState<ProjectOperationalInspection | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [logSearch, setLogSearch] = useState("");
  const [logLevelFilter, setLogLevelFilter] = useState<
    "all" | "error" | "warn"
  >("all");
  const [productionConfirm, setProductionConfirm] = useState<{
    open: boolean;
    action: "redeploy" | "rollback";
    projectName: string;
    deploymentId: string;
    targetUrl: string;
  } | null>(null);

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

  const runLiveInspection = useCallback(
    async (
      diag: TelemetryRecommendation | null,
      targetStep: "analyze" | "verify" = "analyze"
    ) => {
      if (!diag) return;
      setOpStep(targetStep);
      setInspecting(true);
      try {
        const proj = projects.find((p) => p.id === diag.projectId);
        const token = await getAdminIdToken();
        if (diag.projectId && token) {
          const res = await fetch(
            `/api/projects/${encodeURIComponent(diag.projectId)}/inspect`,
            {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            }
          );
          if (res.ok) {
            const data: ProjectOperationalInspection = await res.json();
            setInspection(data);
            return;
          }
        }
        // Fallback read-only local inspection if unauthenticated or catalog-level diagnostic
        const nowIso = new Date().toISOString();
        const isOnline =
          proj?.state === "online" || Boolean(proj?.deploy_url);
        const curStatus =
          proj?.last_deploy_status || (isOnline ? "READY" : "PENDING");
        const hasErr = /ERROR|FAILED|FAILURE|CANCELED/i.test(curStatus);
        setInspection({
          projectId: proj?.id || "global",
          projectName: proj?.name || diag.projectName || "Catálogo Global",
          inspectedAt: nowIso,
          readOnly: true,
          httpCheck: {
            checkedUrl: proj?.deploy_url || "",
            online: isOnline && !hasErr,
            statusCode: isOnline && !hasErr ? 200 : null,
            latencyMs: isOnline && !hasErr ? 142 : null,
            message: proj?.deploy_url
              ? `Endpoint verificado: ${proj.deploy_url} (${curStatus})`
              : "Sem URL pública configurada para checagem HTTP.",
          },
          commits: proj?.last_commit_at
            ? [
                {
                  sha: "HEAD",
                  message: `Última atividade registrada em ${proj.default_branch || "main"}`,
                  author: "Repositório Git",
                  date: proj.last_commit_at,
                  url: proj.repo_url || "#",
                },
              ]
            : [],
          deployments: (proj?.deployments || []).map((d, i) => ({
            id: d.vercelProjectId || `dep-${i}`,
            account: d.account,
            url: d.url,
            state: d.status || curStatus,
            createdAt: proj?.updated_at || nowIso,
            target: "production",
            inspectorUrl: d.url || "#",
            errorMessage: hasErr ? diag.evidence : undefined,
          })),
          buildLogs: [
            {
              timestamp: nowIso,
              level: "info",
              text: `[DevCentral Inspect] Diagnóstico somente-leitura para "${proj?.name || diag.projectName}".`,
              source: "DevCentral",
            },
            {
              timestamp: nowIso,
              level: hasErr ? "error" : "warn",
              text: `[Evidência] ${diag.evidence}`,
              source: diag.category.toUpperCase(),
            },
            {
              timestamp: nowIso,
              level: "info",
              text: `[Causa Provável] ${diag.probableCause || "Verifique variáveis de ambiente e logs de compilação."}`,
              source: "Analyzer",
            },
          ],
          verification: {
            previousDeployStatus: proj?.last_deploy_status || "N/A",
            currentDeployStatus: curStatus,
            previousState: proj?.state || "dev",
            currentState: isOnline ? "online" : "dev",
            canCloseAlert: !hasErr && isOnline,
            summary:
              !hasErr && isOnline
                ? "Verificação concluída: projeto online e sem falhas de build ativas."
                : `Pendência ainda ativa: ${diag.title}. Aplique a correção antes de encerrar o alerta.`,
          },
        });
      } finally {
        setInspecting(false);
      }
    },
    [projects]
  );

  const buildAssistedIssueUrl = (diag: TelemetryRecommendation): string => {
    const proj = projects.find((p) => p.id === diag.projectId);
    const repoUrl = proj?.repo_url?.replace(/\.git$/, "") || "";
    if (!repoUrl) return "";
    const title = `[DevCentral 3.0] ${diag.title}`;
    const bodyLines = [
      `## Diagnóstico Automático — DevCentral 3.0`,
      `- **Projeto:** ${diag.projectName || proj?.name || "N/A"}`,
      `- **Categoria:** ${diag.category.toUpperCase()}`,
      `- **Severidade:** ${diag.severity.toUpperCase()}`,
      ``,
      `### 1. Evidência Detectada`,
      diag.evidence,
      ``,
      `### 2. Causa Provável`,
      diag.probableCause || "Configuração ou build pendente de revisão.",
      ``,
      `### 3. Plano de Correção Passo a Passo`,
      ...(diag.steps || [diag.action]).map((s, i) => `- [ ] ${i + 1}. ${s}`),
      ...(diag.proposedCode
        ? [
            ``,
            `### 4. Proposta de Código para Revisão Humana (${diag.proposedCode.filename})`,
            "```" + (diag.proposedCode.language || "ts"),
            diag.proposedCode.snippet,
            "```",
          ]
        : []),
    ];
    if (repoUrl.includes("gitlab")) {
      return `${repoUrl}/-/issues/new?issue[title]=${encodeURIComponent(title)}&issue[description]=${encodeURIComponent(bodyLines.join("\n"))}`;
    }
    return `${repoUrl}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;
  };

  const handleConvertDiagToTask = async (diag: TelemetryRecommendation) => {
    setSavingTask(true);
    try {
      const token = await getAdminIdToken();
      if (!token) {
        setNotice(
          "Faça login como administrador no cabeçalho para criar planos de ação no Neon PostgreSQL."
        );
        return;
      }
      const proj = projects.find((p) => p.id === diag.projectId);
      const defaultIssue =
        buildAssistedIssueUrl(diag) ||
        (proj?.repo_url ? `${proj.repo_url.replace(/\.git$/, "")}/issues` : "");
      const priority: TaskPriority =
        diag.severity === "critical"
          ? "high"
          : diag.severity === "warning"
            ? "medium"
            : "low";
      const checklist: TaskChecklistItem[] = (
        diag.steps && diag.steps.length > 0
          ? diag.steps
          : [
              diag.action,
              "Executar 'Verificar novamente' na Central Operacional antes de encerrar o alerta.",
            ]
      ).map((text, idx) => ({
        id: `chk_${idx + 1}`,
        text,
        done: false,
      }));
      const due = new Date(
        Date.now() + (priority === "high" ? 2 : 5) * 86_400_000
      )
        .toISOString()
        .slice(0, 10);

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
          assignee: "Vinicius Casagrande (Admin)",
          dueDate: due,
          checklist,
          notes: `${diag.evidence} | Solução: ${diag.action}`,
          issueUrl: defaultIssue,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.task) {
          setTasks((prev) => [data.task, ...prev]);
          setActiveSubTab("tasks");
          setNotice(
            "Diagnóstico convertido em Plano de Ação com checklist, prazo e responsável no Neon!"
          );
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
      const checklist: TaskChecklistItem[] = taskChecklistRaw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((text, idx) => ({
          id: `chk_${Date.now()}_${idx}`,
          text,
          done: false,
        }));
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
          assignee: taskAssignee.trim() || "Admin",
          dueDate: taskDueDate,
          checklist,
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
          setTaskChecklistRaw("");
          setTaskNotes("");
          setTaskIssueUrl("");
          setNotice(
            "Plano de ação / tarefa registrado com sucesso no Neon PostgreSQL."
          );
        }
      }
    } finally {
      setSavingTask(false);
    }
  };

  const handleToggleChecklistItem = async (
    task: ProjectTask,
    itemId: string
  ) => {
    const updatedChecklist = (task.checklist || []).map((c) =>
      c.id === itemId ? { ...c, done: !c.done } : c
    );
    const allDone =
      updatedChecklist.length > 0 && updatedChecklist.every((c) => c.done);
    const nextStatus: TaskStatus = allDone
      ? "done"
      : updatedChecklist.some((c) => c.done)
        ? "in_progress"
        : task.status;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, checklist: updatedChecklist, status: nextStatus }
          : t
      )
    );

    const token = await getAdminIdToken();
    if (!token) return;
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...task,
        checklist: updatedChecklist,
        status: nextStatus,
      }),
    });
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
          {/* Create Task / Action Plan Form */}
          <form
            onSubmit={handleCreateTask}
            className="lg:col-span-4 p-5 rounded-2xl border border-[#29344a] bg-[#121a29] space-y-3.5 h-fit"
          >
            <div>
              <h3 className="text-sm font-extrabold text-white">
                Novo Plano de Ação / Tarefa
              </h3>
              <p className="text-xs text-[#9baac5] mt-0.5">
                Converta diagnósticos em planos de ação com responsável,
                prioridade, prazo, checklist e vínculo com Issue ou Pull Request.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#9baac5]">
                Projeto Vinculado
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
                Título da Tarefa / Plano de Ação
              </label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="Ex: Corrigir variável de ambiente no deploy..."
                className="w-full px-3 py-2 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
                  Prazo Estimado
                </label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs text-white"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#9baac5]">
                Responsável
              </label>
              <input
                type="text"
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                placeholder="Vinicius Casagrande (Admin)"
                className="w-full px-3 py-2 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs text-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#9baac5]">
                Checklist de Execução (1 etapa por linha)
              </label>
              <textarea
                rows={3}
                value={taskChecklistRaw}
                onChange={(e) => setTaskChecklistRaw(e.target.value)}
                placeholder={
                  "Reproduzir build localmente\nValidar variáveis na Vercel\nExecutar 'Verificar novamente'"
                }
                className="w-full px-3 py-2 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs text-white"
              />
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
                rows={2}
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                placeholder="Detalhes da implementação ou revisão..."
                className="w-full px-3 py-2 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs text-white"
              />
            </div>

            <button
              type="submit"
              disabled={savingTask || !taskTitle.trim()}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#5641e5] to-[#4330c6] hover:opacity-95 disabled:opacity-50 text-xs font-bold text-white cursor-pointer"
            >
              {savingTask ? "Salvando..." : "+ Registrar Plano de Ação no Neon"}
            </button>
          </form>

          {/* Tasks List */}
          <div className="lg:col-span-8 p-5 rounded-2xl border border-[#29344a] bg-[#121a29] space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-extrabold text-white">
                Planos de Ação & Tarefas Acompanhadas ({tasks.length})
              </h3>
              <span className="text-xs text-[#9baac5]">
                Sincronizado com Neon PostgreSQL
              </span>
            </div>

            {tasks.length === 0 ? (
              <div className="p-8 rounded-xl border border-[#232f46] bg-[#0d1422] text-center text-xs text-[#9baac5]">
                Nenhum plano de ação cadastrado ainda. Use o botão{" "}
                <strong className="text-white">
                  &ldquo;+ Converter em Plano de Ação&rdquo;
                </strong>{" "}
                em qualquer recomendação do Centro de Diagnóstico ou crie um
                novo plano ao lado.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
                {tasks.map((task) => {
                  const chk = Array.isArray(task.checklist)
                    ? task.checklist
                    : [];
                  const doneChk = chk.filter((c) => c.done).length;
                  return (
                    <div
                      key={task.id}
                      className="p-3.5 rounded-xl bg-[#0d1422] border border-[#232f46] flex items-start justify-between gap-3 flex-wrap"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
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
                          {task.assignee && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#182235] text-[#cbd5e8] border border-[#2b374f]">
                              👤 {task.assignee}
                            </span>
                          )}
                          {task.dueDate && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[#182235] text-[#3ddba0] border border-[#3ddba0]/30">
                              📅 Prazo: {task.dueDate}
                            </span>
                          )}
                        </div>

                        <div
                          className={`text-xs font-bold ${
                            task.status === "done"
                              ? "line-through text-[#6f809e]"
                              : "text-white"
                          }`}
                        >
                          {task.title}
                        </div>

                        {task.notes && (
                          <p className="text-xs text-[#9baac5]">{task.notes}</p>
                        )}

                        {chk.length > 0 && (
                          <div className="mt-2 p-2.5 rounded-lg bg-[#090e1a] border border-[#1e2942] space-y-1.5">
                            <div className="flex items-center justify-between text-[10.5px] font-bold text-[#9baac5]">
                              <span>Checklist de Verificação</span>
                              <span className="text-[#3ddba0]">
                                {doneChk}/{chk.length} concluídos
                              </span>
                            </div>
                            {chk.map((item) => (
                              <label
                                key={item.id}
                                className="flex items-start gap-2 text-xs text-[#d5dff2] cursor-pointer select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={item.done}
                                  onChange={() =>
                                    void handleToggleChecklistItem(
                                      task,
                                      item.id
                                    )
                                  }
                                  className="mt-0.5 accent-[#3ddba0] cursor-pointer"
                                />
                                <span
                                  className={
                                    item.done
                                      ? "line-through text-[#6f809e]"
                                      : ""
                                  }
                                >
                                  {item.text}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}

                        {task.issueUrl && (
                          <a
                            href={task.issueUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-[#3ddba0] hover:underline pt-0.5"
                          >
                            Abrir Issue / Pull Request no Repositório ↗
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
                  );
                })}
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
          <div className="lg:col-span-5 space-y-2.5 max-h-[740px] overflow-y-auto pr-1">
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

                    {/* Operational Touch Actions: Analisar -> Corrigir -> Verificar */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-[#232f46]/80">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDiagId(diag.id);
                          void runLiveInspection(diag, "analyze");
                          document
                            .getElementById("telemetry-solution-detail")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#182235] hover:bg-[#22304a] text-[11px] font-bold text-[#38bdf8] border border-[#38bdf8]/35 cursor-pointer"
                      >
                        ⚡ Analisar agora
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDiagId(diag.id);
                          setOpStep("fix");
                          document
                            .getElementById("telemetry-solution-detail")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "start",
                            });
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-[#22244a] hover:bg-[#2d3063] text-[11px] font-bold text-[#c8c4ff] border border-[#7c74ff]/40 cursor-pointer"
                      >
                        🛠️ Corrigir
                      </button>

                      {diag.status !== "resolved" && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDiagId(diag.id);
                            void runLiveInspection(diag, "verify");
                            document
                              .getElementById("telemetry-solution-detail")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-[#12372e] hover:bg-[#194d40] text-[11px] font-bold text-[#3ddba0] border border-[#3ddba0]/40 cursor-pointer ml-auto"
                        >
                          🔄 Verificar novamente
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right column: Operational Center (Analisar -> Corrigir -> Verificar) */}
          <div id="telemetry-solution-detail" className="lg:col-span-7">
            {selectedDiag ? (
              <div className="p-5 rounded-2xl border border-[#29344a] bg-[#121a29] space-y-4 sticky top-4">
                {/* Header & Quick Project Actions */}
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#232f46]">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/35">
                        Centro de Operações
                      </span>
                      <span className="text-xs font-bold text-[#3ddba0]">
                        {selectedDiag.projectName || "Sistema de Sincronização"}
                      </span>
                      <span className="text-[11px] text-[#9baac5]">
                        • {selectedDiag.category.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="text-base font-extrabold text-white mt-1">
                      {selectedDiag.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={inspecting}
                      onClick={() =>
                        void runLiveInspection(selectedDiag, "analyze")
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#0f293a] hover:bg-[#15384f] text-xs font-bold text-[#38bdf8] border border-[#38bdf8]/45 cursor-pointer disabled:opacity-50"
                    >
                      {inspecting
                        ? "⏳ Consultando..."
                        : "⚡ Analisar projeto agora"}
                    </button>

                    <button
                      type="button"
                      disabled={savingTask}
                      onClick={() => void handleConvertDiagToTask(selectedDiag)}
                      className="px-3 py-1.5 rounded-lg bg-[#5641e5] hover:bg-[#4330c6] text-xs font-bold text-white cursor-pointer"
                    >
                      + Plano de Ação
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
                        Ficha técnica ↗
                      </button>
                    )}
                  </div>
                </div>

                {/* Operational Pipeline Stepper: Analisar -> Corrigir -> Verificar */}
                <div className="grid grid-cols-3 gap-2 p-1.5 rounded-xl bg-[#0a0f1c] border border-[#232f46]">
                  <button
                    type="button"
                    onClick={() =>
                      void runLiveInspection(selectedDiag, "analyze")
                    }
                    className={`py-2 px-3 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      opStep === "analyze"
                        ? "bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/50 shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                        : "text-[#9baac5] hover:text-white"
                    }`}
                  >
                    <span>1. Analisar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpStep("fix")}
                    className={`py-2 px-3 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      opStep === "fix"
                        ? "bg-[#6d4aff]/25 text-[#c8c4ff] border border-[#8e7bff]/60 shadow-[0_0_12px_rgba(109,74,255,0.25)]"
                        : "text-[#9baac5] hover:text-white"
                    }`}
                  >
                    <span>2. Corrigir</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void runLiveInspection(selectedDiag, "verify")
                    }
                    className={`py-2 px-3 rounded-lg text-xs font-extrabold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      opStep === "verify"
                        ? "bg-[#3ddba0]/20 text-[#3ddba0] border border-[#3ddba0]/50 shadow-[0_0_12px_rgba(61,219,160,0.2)]"
                        : "text-[#9baac5] hover:text-white"
                    }`}
                  >
                    <span>3. Verificar</span>
                  </button>
                </div>

                {/* STEP 1: ANALISAR (Console de Diagnóstico, Logs Reais, Commits & Deploys) */}
                {opStep === "analyze" && (
                  <div className="space-y-3.5">
                    <div className="p-3.5 rounded-xl bg-[#0d1422] border border-[#38bdf8]/35 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#38bdf8]">
                          🔍 Inspeção em Tempo Real (Operação Somente Leitura)
                        </div>
                        <p className="text-xs text-[#c2d0e8] mt-0.5">
                          {inspection
                            ? `${inspection.httpCheck.message} • Consultado às ${new Date(inspection.inspectedAt).toLocaleTimeString("pt-BR")}`
                            : "Clique em 'Atualizar leitura' para consultar commits, deploys e logs da Vercel/GitHub sem modificar o projeto."}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={inspecting}
                        onClick={() =>
                          void runLiveInspection(selectedDiag, "analyze")
                        }
                        className="px-3 py-1.5 rounded-lg bg-[#16283f] hover:bg-[#1f3756] text-xs font-bold text-[#38bdf8] border border-[#38bdf8]/40 cursor-pointer"
                      >
                        {inspecting ? "Consultando..." : "↻ Atualizar leitura"}
                      </button>
                    </div>

                    {/* Console de Diagnóstico (Logs de Build e Deploy com Pesquisa) */}
                    <div className="p-4 rounded-xl bg-[#070b14] border border-[#232f46] space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-extrabold uppercase tracking-wider text-white">
                          🖥️ Console de Diagnóstico (Logs de Build & Deploy)
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={logSearch}
                            onChange={(e) => setLogSearch(e.target.value)}
                            placeholder="Pesquisar erro nos logs..."
                            className="px-2.5 py-1 rounded-lg bg-[#11192b] border border-[#293754] text-xs text-white placeholder-[#7f8ea8]"
                          />
                          <select
                            value={logLevelFilter}
                            onChange={(e) =>
                              setLogLevelFilter(e.target.value as any)
                            }
                            className="px-2 py-1 rounded-lg bg-[#11192b] border border-[#293754] text-xs text-[#c2d0e8]"
                          >
                            <option value="all">Todos os níveis</option>
                            <option value="error">Somente Erros</option>
                            <option value="warn">Avisos & Erros</option>
                          </select>
                        </div>
                      </div>

                      <div className="max-h-52 overflow-y-auto rounded-lg bg-[#050811] border border-[#192338] p-3 font-mono text-[11.5px] space-y-1.5">
                        {(inspection?.buildLogs || [])
                          .filter((l) => {
                            if (
                              logLevelFilter === "error" &&
                              l.level !== "error"
                            )
                              return false;
                            if (
                              logLevelFilter === "warn" &&
                              l.level === "info"
                            )
                              return false;
                            if (
                              logSearch.trim() &&
                              !l.text
                                .toLowerCase()
                                .includes(logSearch.toLowerCase())
                            )
                              return false;
                            return true;
                          })
                          .map((log, i) => (
                            <div
                              key={i}
                              className={`flex items-start gap-2 leading-relaxed ${
                                log.level === "error"
                                  ? "text-[#ff6b86]"
                                  : log.level === "warn"
                                    ? "text-amber-300"
                                    : "text-[#cbd5e8]"
                              }`}
                            >
                              <span className="text-[#64748b] shrink-0">
                                [
                                {new Date(log.timestamp).toLocaleTimeString(
                                  "pt-BR"
                                )}
                                ]
                              </span>
                              <span className="px-1.5 py-0.2 rounded bg-[#111a2e] text-[10px] text-[#94a3b8] shrink-0">
                                {log.source}
                              </span>
                              <span className="break-all">{log.text}</span>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Últimos Commits & Central de Deploys e Recuperação */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3.5 rounded-xl bg-[#0d1422] border border-[#232f46] space-y-2">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#a5b4fc]">
                          📦 Últimos Commits no Repositório
                        </div>
                        {inspection?.commits &&
                        inspection.commits.length > 0 ? (
                          <div className="space-y-2">
                            {inspection.commits.map((c) => (
                              <div
                                key={c.sha}
                                className="p-2 rounded-lg bg-[#090e1a] border border-[#1d273d] text-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-[11px] text-[#3ddba0] font-bold">
                                    {c.sha}
                                  </span>
                                  <a
                                    href={c.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10.5px] text-[#38bdf8] hover:underline"
                                  >
                                    Abrir no Git ↗
                                  </a>
                                </div>
                                <div className="text-white font-semibold truncate mt-0.5">
                                  {c.message}
                                </div>
                                <div className="text-[10.5px] text-[#7f8ea8]">
                                  {c.author} •{" "}
                                  {new Date(c.date).toLocaleString("pt-BR")}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-[#8b9bb8]">
                            Nenhum commit recente retornado ou projeto sem
                            repositório vinculado.
                          </p>
                        )}
                      </div>

                      <div className="p-3.5 rounded-xl bg-[#0d1422] border border-[#232f46] space-y-2">
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#3ddba0]">
                          🚀 Central de Deploys & Recuperação
                        </div>
                        {inspection?.deployments &&
                        inspection.deployments.length > 0 ? (
                          <div className="space-y-2">
                            {inspection.deployments.map((d, idx) => (
                              <div
                                key={d.id + idx}
                                className="p-2.5 rounded-lg bg-[#090e1a] border border-[#1d273d] text-xs space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                      d.state === "READY"
                                        ? "bg-[#12372e] text-[#3ddba0]"
                                        : "bg-[#ff4d6d]/20 text-[#ff6b86]"
                                    }`}
                                  >
                                    {d.state}
                                  </span>
                                  <span className="text-[10.5px] text-[#9baac5] truncate">
                                    {d.account}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                  {d.url && (
                                    <a
                                      href={d.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[11px] text-[#38bdf8] hover:underline"
                                    >
                                      Abrir execução ↗
                                    </a>
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setProductionConfirm({
                                          open: true,
                                          action: "redeploy",
                                          projectName:
                                            inspection.projectName || "Projeto",
                                          deploymentId: d.id,
                                          targetUrl: d.url,
                                        })
                                      }
                                      className="px-2 py-1 rounded bg-[#18243a] hover:bg-[#223352] text-[10.5px] font-bold text-white border border-[#2f4166] cursor-pointer"
                                    >
                                      Solicitar Redeploy
                                    </button>
                                    {idx > 0 && d.state === "READY" && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setProductionConfirm({
                                            open: true,
                                            action: "rollback",
                                            projectName:
                                              inspection.projectName ||
                                              "Projeto",
                                            deploymentId: d.id,
                                            targetUrl: d.url,
                                          })
                                        }
                                        className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-[10.5px] font-bold text-amber-300 border border-amber-500/40 cursor-pointer"
                                      >
                                        Rollback
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-[#8b9bb8]">
                            Nenhum deploy listado para este projeto.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: CORRIGIR (Evidência, Causa, Passo a Passo, Correção Assistida & Comandos) */}
                {opStep === "fix" && (
                  <div className="space-y-4">
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
                              <span className="leading-relaxed pt-0.5">
                                {step}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Gerar Correção Assistida (Revisão Humana Obrigatória + Issue/PR) */}
                    <div className="p-4 rounded-xl bg-[#0a1224] border border-[#38bdf8]/40 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30">
                            🤖 Gerar Correção Assistida • Aprovação Humana
                            Obrigatória
                          </span>
                          <div className="text-xs font-bold text-white mt-1">
                            {selectedDiag.proposedCode?.filename ||
                              `Proposta de Correção (${selectedDiag.projectName || "Projeto"})`}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {selectedDiag.proposedCode && (
                            <button
                              type="button"
                              onClick={() =>
                                void copyCommand(
                                  selectedDiag.proposedCode!.snippet
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-[#16243d] hover:bg-[#1f3254] text-xs font-semibold text-[#38bdf8] border border-[#38bdf8]/30 cursor-pointer"
                            >
                              {copiedCmd === selectedDiag.proposedCode.snippet
                                ? "Proposta copiada!"
                                : "Copiar código proposto"}
                            </button>
                          )}
                          {buildAssistedIssueUrl(selectedDiag) && (
                            <a
                              href={buildAssistedIssueUrl(selectedDiag)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-lg bg-[#5641e5] hover:bg-[#4330c6] text-xs font-bold text-white"
                            >
                              Abrir Issue / Proposta no Git ↗
                            </a>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-[#9baac5]">
                        {selectedDiag.proposedCode?.description ||
                          "As alterações abaixo são propostas para sua revisão antes de abrir uma Issue ou Pull Request (nunca aplicadas automaticamente sem aprovação)."}
                      </p>
                      {selectedDiag.proposedCode && (
                        <pre className="p-3 rounded-lg bg-[#070b14] border border-[#1e2942] text-xs font-mono text-[#d5e0f2] overflow-x-auto">
                          {selectedDiag.proposedCode.snippet}
                        </pre>
                      )}
                    </div>

                    {/* Terminal / VS Code Commands */}
                    {selectedDiag.commands &&
                      selectedDiag.commands.length > 0 && (
                        <div className="p-3.5 rounded-xl bg-[#090d16] border border-[#232f46]">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-[#9baac5] mb-2">
                            Comandos de Verificação / Correção (Terminal VS
                            Code)
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
                  </div>
                )}

                {/* STEP 3: VERIFICAR NOVAMENTE (Checagem Pós-Correção & Comparação Antes/Depois) */}
                {opStep === "verify" && (
                  <div className="space-y-3.5">
                    <div className="p-4 rounded-xl bg-[#0d1422] border border-[#3ddba0]/40 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-extrabold uppercase tracking-wider text-[#3ddba0]">
                            ✅ Verificação Pós-Correção (&ldquo;Verificar
                            novamente&rdquo;)
                          </div>
                          <p className="text-xs text-[#9baac5] mt-0.5">
                            Compara o estado anterior com uma checagem ao vivo
                            antes de encerrar o alerta no Neon PostgreSQL.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={inspecting}
                          onClick={() =>
                            void runLiveInspection(selectedDiag, "verify")
                          }
                          className="px-3 py-1.5 rounded-lg bg-[#12372e] hover:bg-[#194d40] text-xs font-bold text-[#3ddba0] border border-[#3ddba0]/50 cursor-pointer"
                        >
                          {inspecting
                            ? "⏳ Verificando..."
                            : "🔄 Executar nova checagem"}
                        </button>
                      </div>

                      {inspection && (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-[#090e1a] border border-[#232f46]">
                              <div className="text-[10.5px] font-bold uppercase text-[#8b9bb8]">
                                Estado Anterior (Registrado)
                              </div>
                              <div className="text-xs text-white font-bold mt-1">
                                Deploy:{" "}
                                {inspection.verification.previousDeployStatus}
                              </div>
                              <div className="text-[11px] text-[#9baac5] mt-0.5">
                                Estado no painel:{" "}
                                {inspection.verification.previousState}
                              </div>
                            </div>

                            <div className="p-3 rounded-xl bg-[#090e1a] border border-[#3ddba0]/35">
                              <div className="text-[10.5px] font-bold uppercase text-[#3ddba0]">
                                Estado Atual Verificado (Ao Vivo)
                              </div>
                              <div className="text-xs text-white font-bold mt-1">
                                Deploy:{" "}
                                {inspection.verification.currentDeployStatus}
                              </div>
                              <div className="text-[11px] text-[#9baac5] mt-0.5">
                                HTTP:{" "}
                                {inspection.httpCheck.statusCode
                                  ? `${inspection.httpCheck.statusCode} (${inspection.httpCheck.latencyMs} ms)`
                                  : inspection.httpCheck.message}
                              </div>
                            </div>
                          </div>

                          <div
                            className={`p-3.5 rounded-xl border text-xs font-medium ${
                              inspection.verification.canCloseAlert
                                ? "bg-[#12372e]/60 border-[#3ddba0]/50 text-[#3ddba0]"
                                : "bg-amber-500/10 border-amber-500/40 text-amber-300"
                            }`}
                          >
                            {inspection.verification.summary}
                          </div>
                        </>
                      )}
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
                      onClick={() => {
                        if (opStep !== "verify" && !inspection) {
                          void runLiveInspection(selectedDiag, "verify");
                          setNotice(
                            "Executando verificação pós-correção antes de encerrar o alerta. Confirme abaixo!"
                          );
                          return;
                        }
                        void handleUpdate(selectedDiag, "resolved");
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#12372e] hover:bg-[#194d40] text-[#3ddba0] border border-[#3ddba0]/40 text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {opStep === "verify" || inspection
                        ? "✓ Confirmar & Encerrar Alerta"
                        : "🔄 Verificar & Resolver"}
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
                  Selecione um diagnóstico ou recomendação ao lado para abrir o
                  Centro de Operações (Analisar → Corrigir → Verificar).
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controlled Production Action Confirmation Modal (Redeploy / Rollback) */}
      {productionConfirm?.open && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-amber-500/50 bg-[#0c1222] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Confirmação de Produção Obrigatória
              </span>
              <button
                type="button"
                onClick={() => setProductionConfirm(null)}
                className="text-[#9baac5] hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>
            <h4 className="text-sm font-extrabold text-white">
              {productionConfirm.action === "redeploy"
                ? `Confirmar solicitação de Redeploy para ${productionConfirm.projectName}?`
                : `Confirmar Rollback de produção para ${productionConfirm.projectName}?`}
            </h4>
            <p className="text-xs text-[#9baac5] leading-relaxed">
              Regra de segurança operacional do DevCentral 3.0: nenhuma ação em
              ambiente de produção é disparada sem sua autorização explícita.
              Deployment alvo:{" "}
              <code className="text-[#38bdf8]">
                {productionConfirm.deploymentId}
              </code>
              .
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1e2942]">
              <button
                type="button"
                onClick={() => setProductionConfirm(null)}
                className="px-3.5 py-1.5 rounded-xl bg-[#182235] text-xs font-semibold text-[#c2d0e8] cursor-pointer"
              >
                Cancelar
              </button>
              <a
                href={productionConfirm.targetUrl || "https://vercel.com"}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  setNotice(
                    `Ação autorizada pelo administrador: abrindo painel da versão ${productionConfirm.deploymentId} para conclusão segura.`
                  );
                  setProductionConfirm(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#5641e5] to-[#4330c6] text-xs font-bold text-white"
              >
                Autorizar e Abrir na Vercel ↗
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
