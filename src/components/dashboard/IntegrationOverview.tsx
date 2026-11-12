"use client";

import React from "react";
import { IntegrationConfigStatus, Project } from "@/types/project";

interface IntegrationOverviewProps {
  integrationStatus: IntegrationConfigStatus | null;
  projects: Project[];
  onOpenGitlabModal: () => void;
  onSelectSourceFilter: (source: string, account?: string) => void;
}

export function IntegrationOverview({
  integrationStatus,
  projects,
  onOpenGitlabModal,
  onSelectSourceFilter,
}: IntegrationOverviewProps) {
  const ghCount = projects.filter((p) => p.source === "GitHub").length;
  const glCount = projects.filter((p) => p.source === "GitLab").length;

  const acc1Name =
    integrationStatus?.vercel1.accountName || "viniciuscasagrande-creator";
  const acc2Name =
    integrationStatus?.vercel2.accountName || "DEVELOPDISKINGRESSOS-9897";

  const v1Count = projects.filter((p) =>
    (p.vercel_accounts || []).includes(acc1Name)
  ).length;
  const v2Count = projects.filter((p) =>
    (p.vercel_accounts || []).includes(acc2Name)
  ).length;

  return (
    <div className="mb-6 p-4 rounded-2xl border border-[#29344a] bg-[#121a29]/80">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-xs font-bold uppercase tracking-wider text-[#9baac5]">
          Minhas plataformas conectadas (contagens reais do Neon PostgreSQL)
        </div>
        <span className="text-xs font-semibold text-[#3ddba0]">
          ● {projects.length} projetos ativos no catálogo
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => onSelectSourceFilter("GitHub", "")}
          className="text-left p-3.5 rounded-xl border border-[#3ddba0]/40 bg-[#0e1525] hover:border-[#3ddba0] transition flex items-center justify-between gap-2 cursor-pointer"
        >
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">
              🐙 GitHub
            </div>
            <div className="text-[11px] text-[#9baac5] truncate">
              {integrationStatus?.github.label || "Repositórios sincronizados"}
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#12372e] text-[#3ddba0] border border-[#3ddba0]/40">
            {ghCount} repos
          </span>
        </button>

        <div className="p-3.5 rounded-xl border border-[#3ddba0]/40 bg-[#0e1525] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onSelectSourceFilter("GitLab", "")}
            className="text-left min-w-0 flex-1 cursor-pointer"
          >
            <div className="text-xs font-bold text-white truncate">
              🦊 GitLab
            </div>
            <div className="text-[11px] text-[#9baac5] truncate">
              {integrationStatus?.gitlab.label || "@ViniciusMurray & Disk"}
            </div>
          </button>
          <button
            type="button"
            onClick={onOpenGitlabModal}
            className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#12372e] text-[#3ddba0] border border-[#3ddba0]/40 hover:bg-[#3ddba0]/20 cursor-pointer"
          >
            {glCount} projetos
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelectSourceFilter("", acc1Name)}
          className="text-left p-3.5 rounded-xl border border-[#3ddba0]/40 bg-[#0e1525] hover:border-[#3ddba0] transition flex items-center justify-between gap-2 cursor-pointer"
        >
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">
              ▲ Vercel 1 ({acc1Name})
            </div>
            <div className="text-[11px] text-[#9baac5] truncate">
              {integrationStatus?.vercel1.label || "Conta Vercel 1"}
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#12372e] text-[#3ddba0] border border-[#3ddba0]/40">
            {v1Count} vinculados
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectSourceFilter("", acc2Name)}
          className="text-left p-3.5 rounded-xl border border-[#3ddba0]/40 bg-[#0e1525] hover:border-[#3ddba0] transition flex items-center justify-between gap-2 cursor-pointer"
        >
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">
              ▲ Vercel 2 ({acc2Name})
            </div>
            <div className="text-[11px] text-[#9baac5] truncate">
              {integrationStatus?.vercel2.label || "Conta Vercel 2"}
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#12372e] text-[#3ddba0] border border-[#3ddba0]/40">
            {v2Count} vinculados
          </span>
        </button>
      </div>
    </div>
  );
}
