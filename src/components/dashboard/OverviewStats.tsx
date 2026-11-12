"use client";

import React from "react";
import { Project } from "@/types/project";
import { AlertTriangle, CheckCircle2, FolderGit2, Layers, Server } from "lucide-react";

interface OverviewStatsProps {
  projects: Project[];
  onFilterSelect?: (filter: { source?: string; state?: string; lang?: string }) => void;
}

export function OverviewStats({ projects, onFilterSelect }: OverviewStatsProps) {
  const total = projects.length;
  const online = projects.filter(
    (p) => p.state === "online" || Boolean(p.deploy_url)
  ).length;
  const repos = projects.filter(
    (p) => p.source === "GitHub" || p.source === "GitLab" || Boolean(p.repo_url)
  ).length;
  const deployErrors = projects.filter(
    (p) =>
      p.last_deploy_status === "ERROR" ||
      p.last_deploy_status === "BLOCKED" ||
      (p.deployments || []).some(
        (d) => d.status === "ERROR" || d.status === "BLOCKED"
      )
  ).length;
  const vercelTotal = projects.filter(
    (p) =>
      p.source === "Vercel" ||
      (p.vercel_accounts && p.vercel_accounts.length > 0) ||
      p.deploy_url?.includes("vercel.app")
  ).length;

  // Language distribution (real counts only)
  const langCounts: Record<string, number> = {};
  for (const p of projects) {
    const t = p.tech || "Outro";
    langCounts[t] = (langCounts[t] || 0) + 1;
  }
  const topLangs = Object.entries(langCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="space-y-4 mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5">
        <button
          type="button"
          onClick={() => onFilterSelect?.({ source: "", state: "" })}
          className="text-left p-4 rounded-2xl border border-[#29344a] bg-[#121a29]/90 hover:border-[#3e4e6d] transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#9baac5]">
            <span>Projetos</span>
            <Layers className="w-4 h-4 text-[#a49eff]" />
          </div>
          <div className="text-3xl font-black text-white mt-2">{total}</div>
          <div className="text-[11px] text-[#9baac5] mt-1">
            Consolidados no Neon DB
          </div>
        </button>

        <button
          type="button"
          onClick={() => onFilterSelect?.({ state: "online" })}
          className="text-left p-4 rounded-2xl border border-[#3ddba0]/45 bg-[#121a29]/90 shadow-[0_0_14px_rgba(61,219,160,0.12)] hover:border-[#3ddba0] transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#9baac5]">
            <span>Em produção</span>
            <CheckCircle2 className="w-4 h-4 text-[#3ddba0]" />
          </div>
          <div className="text-3xl font-black text-[#3ddba0] mt-2">{online}</div>
          <div className="text-[11px] text-[#9baac5] mt-1">
            Com deploy ativo
          </div>
        </button>

        <button
          type="button"
          onClick={() => onFilterSelect?.({ source: "GitHub" })}
          className="text-left p-4 rounded-2xl border border-[#29344a] bg-[#121a29]/90 hover:border-[#3e4e6d] transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-[#9baac5]">
            <span>Repositórios</span>
            <FolderGit2 className="w-4 h-4 text-[#a49eff]" />
          </div>
          <div className="text-3xl font-black text-white mt-2">{repos}</div>
          <div className="text-[11px] text-[#9baac5] mt-1">
            GitHub + GitLab reais
          </div>
        </button>

        <div className="p-4 rounded-2xl border border-[#29344a] bg-[#121a29]/90">
          <div className="flex items-center justify-between text-xs text-[#9baac5]">
            <span>Vercel (2 Contas)</span>
            <Server className="w-4 h-4 text-[#a49eff]" />
          </div>
          <div className="text-3xl font-black text-[#a49eff] mt-2">
            {vercelTotal}
          </div>
          <div className="text-[11px] text-[#9baac5] mt-1">
            Deploys multi-contas
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border bg-[#121a29]/90 ${
            deployErrors > 0
              ? "border-[#ff4d6d]/60 shadow-[0_0_14px_rgba(255,77,109,0.15)]"
              : "border-[#29344a]"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#9baac5]">
            <span>Falhas de deploy</span>
            <AlertTriangle
              className={`w-4 h-4 ${
                deployErrors > 0 ? "text-[#ff6b86]" : "text-[#9baac5]"
              }`}
            />
          </div>
          <div
            className={`text-3xl font-black mt-2 ${
              deployErrors > 0 ? "text-[#ff6b86]" : "text-white"
            }`}
          >
            {deployErrors}
          </div>
          <div className="text-[11px] text-[#9baac5] mt-1">
            Status ERROR / BLOCKED
          </div>
        </div>
      </div>

      {topLangs.length > 0 && (
        <div className="p-3.5 rounded-2xl border border-[#29344a] bg-[#121a29]/75 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-[#9baac5]">
            Distribuição por stack:
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {topLangs.map(([lang, count]) => (
              <button
                key={lang}
                type="button"
                onClick={() => onFilterSelect?.({ lang })}
                className="text-xs px-2.5 py-1 rounded-lg border border-[#344463] bg-[#182337]/80 hover:border-[#8b85ff] text-white transition cursor-pointer flex items-center gap-1.5"
              >
                <span className="font-semibold">{lang}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#0e1525] text-[#3ddba0] font-bold">
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
