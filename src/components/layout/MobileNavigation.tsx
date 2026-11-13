"use client";

import React from "react";
import { LayoutDashboard, FolderKanban, Activity, Menu, Plus } from "lucide-react";

type Section = "all" | "pinned" | "online" | "hidden" | "telemetry" | "activity" | "deployments" | "integrations";

interface MobileNavigationProps {
  activeTab: string;
  onNavigate: (tab: Section) => void;
  onNewProject: () => void;
}

/** Fixed bottom navigation on phones only, uses the same tab state as desktop. */
export function MobileNavigation({ activeTab, onNavigate, onNewProject }: MobileNavigationProps) {
  const items = [
    { id: "all" as const, label: "Início", Icon: LayoutDashboard },
    { id: "online" as const, label: "Online", Icon: FolderKanban },
    { id: "telemetry" as const, label: "Telemetria", Icon: Activity },
    { id: "integrations" as const, label: "Contas", Icon: Menu },
  ];
  return (
    <nav aria-label="Navegação principal mobile"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#2a3654] bg-[#090f1e]/95 backdrop-blur-xl px-1 pt-1.5 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-10px_35px_rgba(0,0,0,0.45)]">
      <div className="mx-auto flex max-w-lg items-stretch justify-around gap-1">
        {items.map(({ id, label, Icon }) => (
          <button type="button" key={id} onClick={() => onNavigate(id)}
            aria-current={activeTab === id ? "page" : undefined}
            className={`flex flex-1 min-w-0 min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition ${activeTab === id ? "bg-[#30225b] text-[#ddd6fe]" : "text-[#92a1bf] hover:bg-[#151e36]"}`}>
            <Icon className="w-5 h-5 shrink-0" /> <span className="truncate max-w-full">{label}</span>
          </button>
        ))}
        <button type="button" onClick={onNewProject} aria-label="Criar novo projeto"
          className="flex min-w-14 min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold text-white bg-gradient-to-br from-[#6d4aff] to-[#7c3aed]">
          <Plus className="w-5 h-5" /><span>Novo</span>
        </button>
      </div>
    </nav>
  );
}
