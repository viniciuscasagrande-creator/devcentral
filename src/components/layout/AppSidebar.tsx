"use client";

import React from "react";
import Link from "next/link";
import { IntegrationConfigStatus, SyncLog } from "@/types/project";
import { FirebaseUser, firebaseConfig } from "@/lib/firebase";
import {
  Database,
  Layers,
  Pin,
  Globe,
  Activity,
  Server,
  EyeOff,
  Sparkles,
  AlertTriangle,
  Wrench,
  History,
  FolderGit2,
} from "lucide-react";
import { TelemetrySubTab } from "@/components/telemetry/TelemetrySolutionsCenter";

interface AppSidebarProps {
  activeTab: string;
  telemetrySubTab?: TelemetrySubTab;
  onSelectTab: (tab: any, subTab?: TelemetrySubTab) => void;
  counts: {
    total: number;
    pinned: number;
    online: number;
    hidden: number;
    github: number;
    gitlab: number;
    vercel1: number;
    vercel2: number;
    telemetryAlerts?: number;
  };
  integrationStatus: IntegrationConfigStatus | null;
  lastSync: SyncLog | null;
  signedUser: FirebaseUser | null;
  onSignOut: () => void;
  onOpenGitlabModal: () => void;
  onQuickFilter?: (source: string, account?: string) => void;
}

export function AppSidebar({
  activeTab,
  telemetrySubTab = "diagnostic",
  onSelectTab,
  counts,
  integrationStatus,
  signedUser,
  onSignOut,
  onOpenGitlabModal,
  onQuickFilter,
}: AppSidebarProps) {
  const acc1 =
    integrationStatus?.vercel1.accountName || "viniciuscasagrande-creator";
  const acc2 =
    integrationStatus?.vercel2.accountName || "DEVELOPDISKINGRESSOS-9897";

  return (
    <aside className="border-b lg:border-b-0 lg:border-r border-[#29344a] bg-[#0e1422]/90 backdrop-blur-md p-4 lg:py-6 lg:px-4 flex flex-col justify-start gap-5 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
      <div>
        <div className="flex items-center gap-3 px-2 mb-4">
          <span className="bg-gradient-to-br from-[#7774ef] to-[#55e4ba] p-2 rounded-xl text-[#090f1a] font-black text-base shadow-lg shadow-[#7774ef]/20">
            ⌘
          </span>
          <div>
            <div className="font-extrabold text-lg tracking-tight text-white">
              DevCentral{" "}
              <span className="text-xs font-bold text-[#a49eff]">3.0</span>
            </div>
            <div className="text-[10.5px] text-[#9baac5] font-medium">
              Cockpit + Telemetria & Soluções
            </div>
          </div>
        </div>

        {/* Aligned Neon Telemetry Box (Real Counts Only) */}
        <div className="mb-4 p-3 border border-[#3ddba0]/40 rounded-2xl bg-[#121a29]/95 shadow-[0_0_20px_rgba(61,219,160,0.08)] text-xs space-y-2">
          <div className="flex items-center justify-between font-bold text-white pb-1.5 border-b border-[#29344a]/80">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-[#3ddba0]" />
              Neon PostgreSQL
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#12372e] text-[#3ddba0] border border-[#3ddba0]/45">
              Online
            </span>
          </div>

          <div className="space-y-1.5 text-[#9baac5]">
            <div className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5">
              <span className="text-center text-[11px]">🔥</span>
              <span className="truncate text-[11px] font-medium text-[#b5c4dc]">
                Firebase ({firebaseConfig.projectId})
              </span>
              <span className="whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#3ddba0]/12 text-[#3ddba0] border border-[#3ddba0]/30">
                Ativo
              </span>
            </div>

            <div className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5">
              <span className="text-center text-[11px]">🐙</span>
              <span className="truncate text-[11px] font-medium text-[#b5c4dc]">
                GitHub
              </span>
              <span className="whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#3ddba0]/12 text-[#3ddba0] border border-[#3ddba0]/30">
                {counts.github}
              </span>
            </div>

            <div className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5">
              <span className="text-center text-[11px]">🦊</span>
              <span className="truncate text-[11px] font-medium text-[#b5c4dc]">
                GitLab
              </span>
              <button
                type="button"
                onClick={onOpenGitlabModal}
                className="cursor-pointer whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#3ddba0]/12 text-[#3ddba0] border border-[#3ddba0]/30"
              >
                {counts.gitlab}
              </button>
            </div>

            <div className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5">
              <span className="text-center text-[11px]">▲</span>
              <span className="truncate text-[11px] font-medium text-[#b5c4dc]">
                {acc1}
              </span>
              <span className="whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#3ddba0]/12 text-[#3ddba0] border border-[#3ddba0]/30">
                {counts.vercel1}
              </span>
            </div>

            <div className="grid grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-1.5">
              <span className="text-center text-[11px]">▲</span>
              <span className="truncate text-[11px] font-medium text-[#b5c4dc]">
                {acc2}
              </span>
              <span className="whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#3ddba0]/12 text-[#3ddba0] border border-[#3ddba0]/30">
                {counts.vercel2}
              </span>
            </div>
          </div>

          {signedUser && (
            <div className="pt-1.5 border-t border-[#29344a]/80 text-[10.5px] flex items-center justify-between gap-2">
              <span className="truncate text-white font-semibold">
                {signedUser.email || signedUser.uid}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="text-[10px] text-[#ff6b86] hover:underline cursor-pointer shrink-0"
              >
                Sair
              </button>
            </div>
          )}
        </div>

        {/* Main Navigation matching DevCentral 3.0 Tree */}
        <nav className="space-y-1 text-xs">
          <button
            type="button"
            onClick={() => {
              onQuickFilter?.("", "");
              onSelectTab("all");
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === "all"
                ? "bg-[#262b55] text-white"
                : "text-[#9baac5] hover:text-white hover:bg-[#182337]/60"
            }`}
          >
            <span className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-[#a49eff]" /> Visão Geral
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#121a29]">
              {counts.total}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("pinned")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === "pinned"
                ? "bg-[#262b55] text-white"
                : "text-[#9baac5] hover:text-white hover:bg-[#182337]/60"
            }`}
          >
            <span className="flex items-center gap-2">
              <Pin className="w-3.5 h-3.5 text-amber-400" /> Favoritos
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#121a29]">
              {counts.pinned}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab("deployments")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-semibold transition cursor-pointer ${
              activeTab === "deployments"
                ? "bg-[#262b55] text-white"
                : "text-[#9baac5] hover:text-white hover:bg-[#182337]/60"
            }`}
          >
            <span className="flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-[#3ddba0]" /> Deploys (Online)
            </span>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[#12372e] text-[#3ddba0]">
              {counts.online}
            </span>
          </button>

          {/* Telemetria & Soluções ★ */}
          <div className="pt-1 pb-1">
            <button
              type="button"
              onClick={() => onSelectTab("telemetry", "diagnostic")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold transition cursor-pointer border ${
                activeTab === "telemetry"
                  ? "bg-gradient-to-r from-[#262b55] to-[#12372e]/80 text-white border-[#3ddba0]/60 shadow-[0_0_12px_rgba(61,219,160,0.2)]"
                  : "bg-[#121a29]/90 text-white border-[#3ddba0]/30 hover:border-[#3ddba0]"
              }`}
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#3ddba0]" />
                Telemetria & Soluções ★
              </span>
              {counts.telemetryAlerts ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#ff4d6d]/20 text-[#ff6b86] border border-[#ff4d6d]/40">
                  {counts.telemetryAlerts}
                </span>
              ) : null}
            </button>

            <div className="mt-1 ml-3 pl-2.5 border-l border-[#29344a] space-y-0.5 text-[11px]">
              {[
                {
                  id: "diagnostic",
                  label: "Centro de Diagnóstico",
                  icon: Sparkles,
                },
                {
                  id: "activity",
                  label: "Atividade dos Projetos",
                  icon: Activity,
                },
                {
                  id: "alerts",
                  label: "Alertas e Problemas",
                  icon: AlertTriangle,
                },
                {
                  id: "improvements",
                  label: "Melhorias Recomendadas",
                  icon: Wrench,
                },
                {
                  id: "history",
                  label: "Histórico de Soluções",
                  icon: History,
                },
              ].map((sub) => {
                const Icon = sub.icon;
                const isSubActive =
                  activeTab === "telemetry" && telemetrySubTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() =>
                      onSelectTab("telemetry", sub.id as TelemetrySubTab)
                    }
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition cursor-pointer ${
                      isSubActive
                        ? "bg-[#182337] text-[#3ddba0] font-bold"
                        : "text-[#9baac5] hover:text-white"
                    }`}
                  >
                    <Icon className="w-3 h-3 shrink-0" />
                    <span className="truncate">{sub.label}</span>
                  </button>
                );
              })}
              <Link
                href="/telemetria"
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[#a9f3df] hover:text-white hover:bg-[#162c31] transition"
              >
                <Activity className="w-3 h-3 shrink-0 text-[#3ddba0]" />
                <span className="truncate">Página /telemetria ↗</span>
              </Link>
            </div>
          </div>

          {/* Quick Platform Filters */}
          <div className="pt-2 border-t border-[#29344a]/70 space-y-1">
            <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#9baac5]">
              Plataformas
            </div>
            <button
              type="button"
              onClick={() => onQuickFilter?.("GitHub", "")}
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[#9baac5] hover:text-white hover:bg-[#182337]/60 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <FolderGit2 className="w-3.5 h-3.5 text-[#a49eff]" /> GitHub / GitLab
              </span>
              <span className="text-[10px]">
                {counts.github + counts.gitlab}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onQuickFilter?.("", acc1)}
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[#9baac5] hover:text-white hover:bg-[#182337]/60 cursor-pointer"
            >
              <span className="flex items-center gap-2 truncate">
                <Server className="w-3.5 h-3.5 text-[#3ddba0] shrink-0" />
                <span className="truncate">Vercel 1 ({acc1})</span>
              </span>
              <span className="text-[10px]">{counts.vercel1}</span>
            </button>
            <button
              type="button"
              onClick={() => onQuickFilter?.("", acc2)}
              className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[#9baac5] hover:text-white hover:bg-[#182337]/60 cursor-pointer"
            >
              <span className="flex items-center gap-2 truncate">
                <Server className="w-3.5 h-3.5 text-[#a49eff] shrink-0" />
                <span className="truncate">Vercel 2 ({acc2})</span>
              </span>
              <span className="text-[10px]">{counts.vercel2}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onSelectTab("hidden")}
            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl font-medium transition cursor-pointer ${
              activeTab === "hidden"
                ? "bg-[#262b55] text-white"
                : "text-[#9baac5] hover:text-white hover:bg-[#182337]/60"
            }`}
          >
            <span className="flex items-center gap-2">
              <EyeOff className="w-3.5 h-3.5 text-[#9baac5]" /> Ocultos
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#121a29]">
              {counts.hidden}
            </span>
          </button>
        </nav>
      </div>
    </aside>
  );
}
