"use client";

import React from "react";
import { RefreshCw, Plus, Activity, Globe } from "lucide-react";

interface AppHeaderProps {
  syncing: boolean;
  onSyncClick: () => void;
  onNewProjectClick: () => void;
  onTabChange?: (tab: any) => void;
  activeTab?: string;
}

export function AppHeader({
  syncing,
  onSyncClick,
  onNewProjectClick,
  onTabChange,
  activeTab,
}: AppHeaderProps) {
  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-[#a49eff]">
          DevCentral 3.0 • Workspace Pessoal Multi-Contas
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
          Central de Gerenciamento de Projetos
        </h1>
        <p className="text-xs sm:text-sm text-[#9baac5] mt-1">
          Projetos, deploys, repositórios e telemetria integrados ao Neon PostgreSQL.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {onTabChange && (
          <>
            <button
              type="button"
              onClick={() =>
                onTabChange(activeTab === "deployments" ? "all" : "deployments")
              }
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                activeTab === "deployments"
                  ? "bg-[#262b55] border-[#8b85ff] text-white"
                  : "bg-[#121a29] border-[#29344a] text-[#cbd5e8] hover:border-[#3e4e6d]"
              }`}
            >
              <Globe className="w-4 h-4 text-[#3ddba0]" />
              Monitor de Deploys
            </button>

            <button
              type="button"
              onClick={() =>
                onTabChange(activeTab === "activity" ? "all" : "activity")
              }
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                activeTab === "activity"
                  ? "bg-[#262b55] border-[#8b85ff] text-white"
                  : "bg-[#121a29] border-[#29344a] text-[#cbd5e8] hover:border-[#3e4e6d]"
              }`}
            >
              <Activity className="w-4 h-4 text-[#a49eff]" />
              Atividade
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onSyncClick}
          disabled={syncing}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#344463] bg-[#182337] hover:bg-[#1f2d47] text-xs font-semibold text-white transition cursor-pointer disabled:opacity-60"
        >
          <RefreshCw
            className={`w-4 h-4 text-[#3ddba0] ${syncing ? "animate-spin" : ""}`}
          />
          {syncing ? "Sincronizando..." : "Sincronizar"}
        </button>

        <button
          type="button"
          onClick={onNewProjectClick}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#746ef0] hover:bg-[#635ce0] border border-[#827aff] text-xs font-bold text-white shadow-lg shadow-[#746ef0]/20 transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Novo projeto
        </button>
      </div>
    </header>
  );
}
