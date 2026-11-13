"use client";

import React from "react";
import { IntegrationConfigStatus, SyncLog } from "@/types/project";
import { FirebaseUser, firebaseConfig } from "@/lib/firebase";
import {
  Database,
  Flame,
  Home,
  Code2,
  Activity,
  Star,
  Rocket,
  Layers,
  Settings,
  Settings2,
  ArrowRight,
  ChevronsLeft,
  EyeOff,
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
  onOpenSettingsModal?: () => void;
  onQuickFilter?: (source: string, account?: string) => void;
}

export function AppSidebar({
  activeTab,
  onSelectTab,
  counts,
  integrationStatus,
  onOpenGitlabModal,
  onOpenSettingsModal,
  onQuickFilter,
}: AppSidebarProps) {
  const acc1 =
    integrationStatus?.vercel1.accountName || "viniciuscasagrande-creator";
  const acc2 =
    integrationStatus?.vercel2.accountName || "DEVELOPDISKINGRESSOS-9897";

  return (
    <aside className="border-b lg:border-b-0 lg:border-r border-[#1c243b] bg-[#080c17] px-3.5 py-5 flex flex-col justify-between gap-5 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto select-none">
      <div className="space-y-5">
        {/* Brand Header */}
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[#2d1f66] via-[#1c2347] to-[#0e3240] border border-[#6e56cf]/60 shadow-[0_0_20px_rgba(124,92,255,0.45)] grid place-items-center shrink-0">
              <svg
                viewBox="0 0 36 36"
                className="w-6 h-6"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient
                    id="dcLogoGrad"
                    x1="4"
                    y1="4"
                    x2="32"
                    y2="32"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#38bdf8" />
                    <stop offset="0.5" stopColor="#818cf8" />
                    <stop offset="1" stopColor="#c084fc" />
                  </linearGradient>
                </defs>
                <path
                  d="M9 7.5C9 5.8 10.8 4.8 12.3 5.7L28.5 15.2C30 16.1 30 18.2 28.5 19.1L12.3 28.6C10.8 29.5 9 28.5 9 26.8V7.5Z"
                  stroke="url(#dcLogoGrad)"
                  strokeWidth="3.2"
                  strokeLinejoin="round"
                />
                <path
                  d="M14 13.5L21 17.2L14 21V13.5Z"
                  fill="url(#dcLogoGrad)"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-extrabold text-[19px] tracking-tight text-white">
                  DevCentral
                </span>
                <span className="text-xs font-bold text-[#a5b4fc]">2.1</span>
              </div>
              <div className="text-[10.5px] text-[#7f8ea8] truncate">
                Multi-contas • Neon DB • Firebase
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onQuickFilter?.("", "");
              onSelectTab("all");
            }}
            className="w-7 h-7 rounded-lg bg-[#111729] border border-[#222c46] text-[#8b9bb8] hover:text-white grid place-items-center text-xs cursor-pointer shrink-0"
            title="Painel Principal"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* INFRAESTRUTURA & CONTAS */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7f8ea8]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2dd4a0]" />
            INFRAESTRUTURA & CONTAS
          </div>

          <div className="space-y-1 text-[11.5px]">
            {/* Neon PostgreSQL */}
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#11182b]/70 transition">
              <span className="flex items-center gap-2 text-[#c8d4eb] truncate">
                <Database className="w-3.5 h-3.5 text-[#818cf8] shrink-0" />
                <span className="truncate">Neon PostgreSQL</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0d2e28] text-[#3ddba0] border border-[#2dd4a0]/45 shrink-0">
                ● Online
              </span>
            </div>

            {/* Firebase */}
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#11182b]/70 transition">
              <span className="flex items-center gap-2 text-[#c8d4eb] truncate">
                <Flame className="w-3.5 h-3.5 text-[#fb923c] shrink-0" />
                <span className="truncate">
                  Firebase ({firebaseConfig.projectId})
                </span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0d2e28] text-[#3ddba0] border border-[#2dd4a0]/45 shrink-0">
                Ativo
              </span>
            </div>

            {/* GitHub */}
            <button
              type="button"
              onClick={() => onQuickFilter?.("GitHub", "")}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#11182b] transition cursor-pointer text-left"
            >
              <span className="flex items-center gap-2 text-[#c8d4eb] truncate">
                <svg
                  className="w-3.5 h-3.5 text-white shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
                </svg>
                <span className="truncate">GitHub</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0d2e28] text-[#3ddba0] border border-[#2dd4a0]/45 shrink-0">
                Ativo ({counts.github})
              </span>
            </button>

            {/* GitLab */}
            <button
              type="button"
              onClick={onOpenGitlabModal}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#11182b] transition cursor-pointer text-left"
            >
              <span className="flex items-center gap-2 text-[#c8d4eb] truncate">
                <svg
                  className="w-3.5 h-3.5 text-[#fc6d26] shrink-0"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
                </svg>
                <span className="truncate">GitLab (@ViniciusMurr...)</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0d2e28] text-[#3ddba0] border border-[#2dd4a0]/45 shrink-0">
                Ativo ({counts.gitlab})
              </span>
            </button>

            {/* Vercel 1 */}
            <button
              type="button"
              onClick={() => onQuickFilter?.("", acc1)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#11182b] transition cursor-pointer text-left"
            >
              <span className="flex items-center gap-2 text-[#c8d4eb] truncate">
                <span className="text-[10px] text-[#a5b4fc] shrink-0">▲</span>
                <span className="truncate">{acc1}</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0d2e28] text-[#3ddba0] border border-[#2dd4a0]/45 shrink-0">
                Ativo
              </span>
            </button>

            {/* Vercel 2 */}
            <button
              type="button"
              onClick={() => onQuickFilter?.("", acc2)}
              className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#11182b] transition cursor-pointer text-left"
            >
              <span className="flex items-center gap-2 text-[#c8d4eb] truncate">
                <span className="text-[10px] text-[#a5b4fc] shrink-0">▲</span>
                <span className="truncate">{acc2}</span>
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0d2e28] text-[#3ddba0] border border-[#2dd4a0]/45 shrink-0">
                Ativo
              </span>
            </button>
          </div>
        </div>

        {/* NAVEGAÇÃO */}
        <div className="space-y-1.5 pt-1 border-t border-[#161e33]">
          <div className="flex items-center gap-1.5 px-2 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7f8ea8]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2dd4a0]" />
            NAVEGAÇÃO
          </div>

          <nav className="space-y-1 text-xs">
            <button
              type="button"
              onClick={() => {
                onQuickFilter?.("", "");
                onSelectTab("all");
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-semibold transition cursor-pointer ${
                activeTab === "all"
                  ? "bg-gradient-to-r from-[#5641e5] to-[#4330c6] text-white border border-[#8e7bff] shadow-[0_0_18px_rgba(105,80,245,0.4)]"
                  : "text-[#9baac5] hover:text-white hover:bg-[#12192d]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Home className="w-4 h-4" /> Visão geral
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  activeTab === "all"
                    ? "bg-[#34249c] text-white"
                    : "bg-[#121a29] text-[#9baac5]"
                }`}
              >
                {counts.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onQuickFilter?.("", "");
                onSelectTab("all");
                document
                  .getElementById("projects-section")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium text-[#b8c6df] hover:text-white hover:bg-[#12192d] transition cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <Code2 className="w-4 h-4 text-[#8b9bb8]" /> Projetos
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab("telemetry", "diagnostic")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition cursor-pointer ${
                activeTab === "telemetry"
                  ? "bg-gradient-to-r from-[#5641e5] to-[#4330c6] text-white border border-[#8e7bff] shadow-[0_0_18px_rgba(105,80,245,0.4)]"
                  : "text-[#b8c6df] hover:text-white hover:bg-[#12192d]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Activity className="w-4 h-4 text-[#a87ffb]" /> Telemetria &
                Soluções
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#3b2785] text-[#d8ceff] border border-[#7c5cff]/50">
                Novo
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab("pinned")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition cursor-pointer ${
                activeTab === "pinned"
                  ? "bg-gradient-to-r from-[#5641e5] to-[#4330c6] text-white border border-[#8e7bff]"
                  : "text-[#b8c6df] hover:text-white hover:bg-[#12192d]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Star className="w-4 h-4 text-[#8b9bb8]" /> Fixados no topo
              </span>
              <span className="text-xs font-semibold text-[#9baac5]">
                {counts.pinned}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab("online")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition cursor-pointer ${
                activeTab === "online"
                  ? "bg-gradient-to-r from-[#5641e5] to-[#4330c6] text-white border border-[#8e7bff]"
                  : "text-[#b8c6df] hover:text-white hover:bg-[#12192d]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Rocket className="w-4 h-4 text-[#8b9bb8]" /> Em produção
                (Online)
              </span>
              <span className="text-xs font-semibold text-[#9baac5]">
                {counts.online}
              </span>
            </button>
          </nav>
        </div>

        {/* FERRAMENTAS */}
        <div className="space-y-1.5 pt-1 border-t border-[#161e33]">
          <div className="px-2 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7f8ea8]">
            FERRAMENTAS
          </div>

          <div className="space-y-1 text-xs">
            <button
              type="button"
              onClick={() => onSelectTab("deployments")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition cursor-pointer ${
                activeTab === "deployments"
                  ? "bg-[#1a2238] text-white"
                  : "text-[#b8c6df] hover:text-white hover:bg-[#12192d]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Rocket className="w-4 h-4 text-[#8b9bb8]" /> Deploys & Releases
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenGitlabModal}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium text-[#b8c6df] hover:text-white hover:bg-[#12192d] transition cursor-pointer"
            >
              <span className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-[#8b9bb8]" /> Integrações & API
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTab("activity")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition cursor-pointer ${
                activeTab === "activity"
                  ? "bg-[#1a2238] text-white"
                  : "text-[#b8c6df] hover:text-white hover:bg-[#12192d]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Settings2 className="w-4 h-4 text-[#8b9bb8]" /> Automação
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onOpenSettingsModal
                  ? onOpenSettingsModal()
                  : onSelectTab("hidden")
              }
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl font-medium transition cursor-pointer ${
                activeTab === "hidden"
                  ? "bg-[#1a2238] text-white"
                  : "text-[#b8c6df] hover:text-white hover:bg-[#12192d]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 text-[#8b9bb8]" /> Configurações
              </span>
              {counts.hidden > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-[#7f8ea8]">
                  <EyeOff className="w-3 h-3" /> {counts.hidden}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Promo Card: Telemetria & Soluções */}
      <div
        onClick={() => onSelectTab("telemetry", "diagnostic")}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onSelectTab("telemetry", "diagnostic");
          }
        }}
        className="relative rounded-2xl p-4 bg-gradient-to-br from-[#12263a] via-[#151836] to-[#26174a] border border-[#38bdf8]/45 shadow-[0_0_25px_rgba(124,92,255,0.22)] hover:border-[#a87ffb] transition cursor-pointer group"
      >
        <div className="flex items-end gap-1 mb-2.5 h-5">
          <span className="w-1.5 h-2.5 rounded-sm bg-[#38bdf8]" />
          <span className="w-1.5 h-4 rounded-sm bg-[#818cf8]" />
          <span className="w-1.5 h-5 rounded-sm bg-[#c084fc]" />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="font-extrabold text-sm text-white">
              Telemetria & Soluções
            </div>
            <p className="text-[11px] leading-snug text-[#9baac5]">
              Monitore métricas, saúde dos projetos e receba recomendações
              inteligentes.
            </p>
          </div>

          <span className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9] text-white grid place-items-center shrink-0 shadow-lg shadow-[#8b5cf6]/30 group-hover:translate-x-0.5 transition">
            <ArrowRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </aside>
  );
}
