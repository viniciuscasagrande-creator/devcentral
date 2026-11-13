"use client";

import React, { useEffect, useRef } from "react";
import {
  Search,
  Filter,
  Layers,
  Code2,
  Activity,
  Folder,
  LayoutGrid,
  List,
  X,
} from "lucide-react";

interface ProjectFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sourceFilter: string;
  onSourceChange: (s: string) => void;
  accountFilter: string;
  onAccountChange: (a: string) => void;
  langFilter: string;
  onLangChange: (l: string) => void;
  stateFilter: string;
  onStateChange: (s: string) => void;
  sortBy: "recent" | "name" | "stars";
  onSortChange: (s: "recent" | "name" | "stars") => void;
  viewMode: "grid" | "list";
  onViewModeChange: (v: "grid" | "list") => void;
  availableLanguages: string[];
  availableVercelAccounts: string[];
  filteredCount: number;
  totalCount: number;
  onClearAll: () => void;
}

export function ProjectFilters({
  searchQuery,
  onSearchChange,
  sourceFilter,
  onSourceChange,
  accountFilter,
  onAccountChange,
  langFilter,
  onLangChange,
  stateFilter,
  onStateChange,
  viewMode,
  onViewModeChange,
  availableLanguages,
  availableVercelAccounts,
  filteredCount,
  onClearAll,
}: ProjectFiltersProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const hasActiveFilters = Boolean(
    searchQuery || sourceFilter || accountFilter || langFilter || stateFilter
  );

  return (
    <div id="projects-section" className="space-y-4 mb-4">
      {/* Row 1: Search Input + 4 Filter Dropdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] gap-2.5 items-center">
        <div className="relative">
          <Search className="w-4 h-4 text-[#7f8ea8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            id="project-search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Pesquisar nome, linguagem, conta Vercel ou descrição..."
            className="w-full pl-10 pr-16 py-2.5 rounded-xl bg-[#0e1526] border border-[#222e4a] text-xs text-white placeholder-[#7f8ea8] focus:outline-none focus:border-[#7c5cff] transition"
          />
          <kbd className="hidden sm:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-[#162038] border border-[#2a3859] text-[10px] font-semibold text-[#9baac5] pointer-events-none">
            Ctrl + K
          </kbd>
        </div>

        {/* Todas as fontes */}
        <div className="relative">
          <Filter className="w-3.5 h-3.5 text-[#8b9bb8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={sourceFilter}
            onChange={(e) => onSourceChange(e.target.value)}
            className="w-full pl-8 pr-7 py-2.5 rounded-xl bg-[#0e1526] border border-[#222e4a] text-xs font-medium text-[#d5dff2] focus:outline-none focus:border-[#7c5cff] cursor-pointer"
          >
            <option value="">Todas as fontes</option>
            <option value="GitHub">GitHub</option>
            <option value="GitLab">GitLab</option>
            <option value="Vercel">Vercel</option>
            <option value="Manual">Manual</option>
          </select>
        </div>

        {/* Todas as contas Vercel */}
        <div className="relative">
          <Layers className="w-3.5 h-3.5 text-[#8b9bb8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={accountFilter}
            onChange={(e) => onAccountChange(e.target.value)}
            className="w-full pl-8 pr-7 py-2.5 rounded-xl bg-[#0e1526] border border-[#222e4a] text-xs font-medium text-[#d5dff2] focus:outline-none focus:border-[#7c5cff] cursor-pointer"
          >
            <option value="">Todas as contas Vercel</option>
            {availableVercelAccounts.map((acc) => (
              <option key={acc} value={acc}>
                ▲ {acc}
              </option>
            ))}
          </select>
        </div>

        {/* Todas as linguagens */}
        <div className="relative">
          <Code2 className="w-3.5 h-3.5 text-[#8b9bb8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={langFilter}
            onChange={(e) => onLangChange(e.target.value)}
            className="w-full pl-8 pr-7 py-2.5 rounded-xl bg-[#0e1526] border border-[#222e4a] text-xs font-medium text-[#d5dff2] focus:outline-none focus:border-[#7c5cff] cursor-pointer"
          >
            <option value="">Todas as linguagens</option>
            {availableLanguages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        {/* Todos os status */}
        <div className="relative">
          <Activity className="w-3.5 h-3.5 text-[#8b9bb8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <select
            value={stateFilter}
            onChange={(e) => onStateChange(e.target.value)}
            className="w-full pl-8 pr-7 py-2.5 rounded-xl bg-[#0e1526] border border-[#222e4a] text-xs font-medium text-[#d5dff2] focus:outline-none focus:border-[#7c5cff] cursor-pointer"
          >
            <option value="">Todos os status</option>
            <option value="online">Online (Em produção)</option>
            <option value="dev">Em desenvolvimento</option>
            <option value="archived">Arquivado</option>
          </select>
        </div>
      </div>

      {/* Row 2: "Seus projetos [14]" + View Switcher + Count */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2.5">
          <Folder className="w-5 h-5 text-[#a87ffb]" />
          <h2 className="text-lg font-extrabold text-white tracking-tight">
            Seus projetos
          </h2>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#2a1f63] text-[#d8ceff] border border-[#6e56cf]/50">
            {filteredCount}
          </span>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1 text-xs text-[#9baac5] hover:text-white ml-2 px-2 py-0.5 rounded-lg bg-[#121a2d] border border-[#253252] cursor-pointer"
            >
              <X className="w-3 h-3" /> Limpar filtros
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl border border-[#253252] bg-[#0e1526] p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === "grid"
                  ? "bg-[#5b46e8] text-white shadow-[0_0_10px_rgba(91,70,232,0.5)]"
                  : "text-[#8b9bb8] hover:text-white"
              }`}
              title="Visualização em Grade (4 colunas)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                viewMode === "list"
                  ? "bg-[#5b46e8] text-white shadow-[0_0_10px_rgba(91,70,232,0.5)]"
                  : "text-[#8b9bb8] hover:text-white"
              }`}
              title="Visualização em Lista"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-xs text-[#8b9bb8]">
            {filteredCount} projeto(s) exibido(s)
          </span>
        </div>
      </div>
    </div>
  );
}
