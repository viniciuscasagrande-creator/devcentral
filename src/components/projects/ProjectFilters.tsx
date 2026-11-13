"use client";

import React, { useEffect, useRef, useState } from "react";
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
  SlidersHorizontal,
  Star,
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
  onTogglePinnedTab?: () => void;
  isPinnedTab?: boolean;
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
  onTogglePinnedTab,
  isPinnedTab = false,
}: ProjectFiltersProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

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

  const activeFilterCount = [
    sourceFilter,
    accountFilter,
    langFilter,
    stateFilter,
    isPinnedTab ? "pinned" : "",
  ].filter(Boolean).length;

  const hasActiveFilters = Boolean(searchQuery || activeFilterCount > 0);

  return (
    <div id="projects-section" className="space-y-3.5 mb-4">
      {/* Mobile search stays visible; filter selects expand on demand. */}
      <div className="lg:hidden flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white">Buscar projetos</span>
        <button type="button" aria-expanded={mobileFilterOpen} aria-controls="devcentral-filter-options"
          onClick={() => setMobileFilterOpen((v) => !v)}
          className="min-h-11 inline-flex items-center gap-2 px-4 rounded-xl border border-[#344463] bg-[#141d33] text-xs font-semibold text-[#dce5fb]">
          <Filter className="w-4 h-4" /> {mobileFilterOpen ? "Ocultar filtros" : "Filtros"}
          {hasActiveFilters ? <span className="h-2 w-2 rounded-full bg-[#38bdf8]" /> : null}
        </button>
      </div>
      {/* Row 1: Search Input + filter dropdowns */}
      <div id="devcentral-filter-options" className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] gap-2.5 items-center ${mobileFilterOpen ? "" : "[&>div:not(:first-child)]:hidden lg:[&>div:not(:first-child)]:block"}`}>
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#7f8ea8] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            id="project-search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Pesquisar nome, linguagem, conta Vercel ou descrição..."
            className="w-full min-h-[42px] pl-10 pr-4 sm:pr-16 py-2.5 rounded-xl bg-[#0e1526] border border-[#222e4a] text-xs text-white placeholder-[#7f8ea8] focus:outline-none focus:border-[#7c5cff] transition"
          />
          <kbd className="hidden sm:inline-block absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-[#162038] border border-[#2a3859] text-[10px] font-semibold text-[#9baac5] pointer-events-none">
            Ctrl + K
          </kbd>
        </div>

        {/* Filter 1: Todas as fontes */}
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

        {/* Filter 2: Todas as contas Vercel */}
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

        {/* Filter 3: Todas as linguagens */}
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

        {/* Filter 4: Todos os status */}
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

      {/* Row 2: "Seus projetos [count]" + View Switcher + Count */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <Folder className="w-5 h-5 text-[#a87ffb]" />
          <h2 className="text-lg font-extrabold text-white tracking-tight">
            Seus projetos
          </h2>
          <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#2a1f63] text-[#d8ceff] border border-[#6e56cf]/50">
            {filteredCount}
          </span>

          <button
            type="button"
            onClick={() => setMobileSheetOpen(true)}
            className="lg:hidden inline-flex items-center gap-1.5 text-xs font-semibold text-[#dce5fb] px-3 py-1.5 rounded-xl bg-[#131d36] border border-[#2c3b5e] cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#a78bfa]" />
            Filtros rápidos
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#5641e5] text-[10px] text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearAll}
              className="inline-flex items-center gap-1 text-xs text-[#9baac5] hover:text-white px-2.5 py-1 rounded-lg bg-[#121a2d] border border-[#253252] cursor-pointer"
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
              title="Visualização em Grade"
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

      {/* Painel de Filtros Mobile (Bottom Sheet) */}
      {mobileSheetOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-black/75 backdrop-blur-sm flex items-end justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMobileSheetOpen(false);
          }}
        >
          <div className="w-full max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-[#2c3b5e] bg-[#0c1222] p-5 space-y-4 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1e2942] pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#a78bfa]" />
                <span className="text-sm font-extrabold text-white">
                  Filtros Rápidos (Mobile)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileSheetOpen(false)}
                className="w-8 h-8 rounded-lg bg-[#162038] text-[#9baac5] hover:text-white grid place-items-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Origem & Contas */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#8b9bb8]">
                Origem & Contas Vercel
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onSourceChange(sourceFilter === "GitHub" ? "" : "GitHub");
                    onAccountChange("");
                  }}
                  className={`min-h-[42px] px-3 py-2 rounded-xl font-bold border text-left transition cursor-pointer ${
                    sourceFilter === "GitHub"
                      ? "bg-[#5641e5] border-[#8e7bff] text-white"
                      : "bg-[#11192e] border-[#22304d] text-[#cbd5e8]"
                  }`}
                >
                  🐙 GitHub
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSourceChange(sourceFilter === "GitLab" ? "" : "GitLab");
                    onAccountChange("");
                  }}
                  className={`min-h-[42px] px-3 py-2 rounded-xl font-bold border text-left transition cursor-pointer ${
                    sourceFilter === "GitLab"
                      ? "bg-[#5641e5] border-[#8e7bff] text-white"
                      : "bg-[#11192e] border-[#22304d] text-[#cbd5e8]"
                  }`}
                >
                  🦊 GitLab
                </button>
                {availableVercelAccounts.map((acc, idx) => (
                  <button
                    key={acc}
                    type="button"
                    onClick={() => {
                      onSourceChange("");
                      onAccountChange(accountFilter === acc ? "" : acc);
                    }}
                    className={`min-h-[42px] px-3 py-2 rounded-xl font-bold border text-left truncate transition cursor-pointer ${
                      accountFilter === acc
                        ? "bg-[#5641e5] border-[#8e7bff] text-white"
                        : "bg-[#11192e] border-[#22304d] text-[#cbd5e8]"
                    }`}
                  >
                    ▲ Vercel {idx + 1} ({acc.slice(0, 12)}...)
                  </button>
                ))}
              </div>
            </div>

            {/* Status & Favoritos */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#8b9bb8]">
                Status & Favoritos
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onStateChange(stateFilter === "online" ? "" : "online")
                  }
                  className={`min-h-[42px] px-2.5 py-2 rounded-xl font-bold border text-center transition cursor-pointer ${
                    stateFilter === "online"
                      ? "bg-[#0d2e28] border-[#2dd4a0] text-[#3ddba0]"
                      : "bg-[#11192e] border-[#22304d] text-[#cbd5e8]"
                  }`}
                >
                  ● Online
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onStateChange(stateFilter === "dev" ? "" : "dev")
                  }
                  className={`min-h-[42px] px-2.5 py-2 rounded-xl font-bold border text-center transition cursor-pointer ${
                    stateFilter === "dev"
                      ? "bg-[#ff4d6d]/20 border-[#ff4d6d] text-[#ff6b86]"
                      : "bg-[#11192e] border-[#22304d] text-[#cbd5e8]"
                  }`}
                >
                  ● Em dev
                </button>
                {onTogglePinnedTab && (
                  <button
                    type="button"
                    onClick={onTogglePinnedTab}
                    className={`min-h-[42px] px-2.5 py-2 rounded-xl font-bold border inline-flex items-center justify-center gap-1 transition cursor-pointer ${
                      isPinnedTab
                        ? "bg-amber-500/20 border-amber-400 text-amber-300"
                        : "bg-[#11192e] border-[#22304d] text-[#cbd5e8]"
                    }`}
                  >
                    <Star className="w-3.5 h-3.5" /> Favoritos
                  </button>
                )}
              </div>
            </div>

            {/* Linguagem */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#8b9bb8]">
                Linguagem / Stack
              </label>
              <select
                value={langFilter}
                onChange={(e) => onLangChange(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-[#11192e] border border-[#22304d] text-white"
              >
                <option value="">Todas as linguagens</option>
                {availableLanguages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center gap-2.5 pt-2 border-t border-[#1e2942]">
              <button
                type="button"
                onClick={() => {
                  onClearAll();
                  setMobileSheetOpen(false);
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-[#162038] border border-[#2c3b5e] text-xs font-bold text-[#cbd5e8] cursor-pointer"
              >
                Limpar Tudo
              </button>
              <button
                type="button"
                onClick={() => setMobileSheetOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-[#5641e5] to-[#4330c6] text-xs font-bold text-white cursor-pointer"
              >
                Ver {filteredCount} projeto(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
