"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Project, SyncLog } from "@/types/project";
import type {
  RecommendationStatus,
  TelemetryRecommendation,
} from "@/types/telemetry";

export type TelemetrySubTab =
  | "diagnostic"
  | "activity"
  | "alerts"
  | "improvements"
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

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    if (!selectedDiagId && recommendations.length > 0) {
      setSelectedDiagId(recommendations[0].id);
    }
  }, [recommendations, selectedDiagId]);

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

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="p-5 rounded-2xl border border-[#3ddba0]/40 bg-gradient-to-r from-[#121a29] via-[#132235] to-[#121a29] shadow-[0_0_25px_rgba(61,219,160,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#3ddba0]/15 text-[#3ddba0] border border-[#3ddba0]/40">
                DevCentral 3.0 · Observabilidade & Autoajuda
              </span>
              <span className="text-xs text-[#9baac5]">
                Dados reais do Neon PostgreSQL
              </span>
            </div>
            <h2 className="text-xl font-extrabold text-white mt-1.5">
              Telemetria & Central de Soluções
            </h2>
            <p className="text-xs text-[#9baac5] mt-0.5 max-w-3xl">
              Acompanha eventos reais sincronizados (GitHub, GitLab, Vercel 1 e
              Vercel 2), diagnostica falhas confirmadas e orienta passo a passo
              como corrigir e evoluir seus projetos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#0b101d] border border-[#2b374f] text-xs font-semibold text-white focus:outline-none focus:border-[#3ddba0]"
            >
              <option value="all">
                Todos os projetos ({projects.filter((p) => !p.is_hidden).length})
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

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mt-4">
          <div className="p-3 rounded-xl bg-[#0b101d]/90 border border-[#29344a]">
            <div className="text-[11px] text-[#9baac5]">Projetos Ativos</div>
            <div className="text-xl font-extrabold text-white mt-0.5">
              {projects.filter((p) => !p.is_hidden).length}
            </div>
            <div className="text-[10px] text-[#3ddba0] mt-0.5">
              Monitorados no Neon
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#0b101d]/90 border border-[#ff4d6d]/40">
            <div className="text-[11px] text-[#ff8fa3]">
              Deploys com Falha Registrada
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
              Recomendações Pendentes
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
              Acompanhamento ativo
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
              Salvas no Neon DB
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
              { id: "activity", label: "📡 Atividade dos Projetos" },
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

        {activeSubTab !== "activity" && (
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
      {activeSubTab === "activity" ? (
        <div className="p-5 rounded-2xl border border-[#29344a] bg-[#121a29]/90 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Linha do Tempo de Sincronizações Registradas no Neon
            </h3>
            <span className="text-xs text-[#9baac5]">
              {syncLogs.length} eventos registrados
            </span>
          </div>

          <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
            {syncLogs.map((log) => (
              <div
                key={log.id}
                className="p-3.5 rounded-xl bg-[#0d1422] border border-[#232f46] flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 bg-[#3ddba0]" />
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
            ))}
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
                  <button
                    key={diag.id}
                    type="button"
                    onClick={() => setSelectedDiagId(diag.id)}
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
                  </button>
                );
              })
            )}
          </div>

          {/* Right column: Interactive Solution Assistant */}
          <div className="lg:col-span-7">
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
                      Abrir ficha do projeto ↗
                    </button>
                  )}
                </div>

                {/* Diagnosis & Cause */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-[#0d1422] border border-[#232f46]">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#9baac5] mb-1">
                      1. O que foi detectado (Evidência)
                    </div>
                    <p className="text-xs text-white leading-relaxed">
                      {selectedDiag.evidence}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#0d1422] border border-[#232f46]">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#9baac5] mb-1">
                      2. Como Resolver
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
                      3. Passo a Passo Recomendado
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
