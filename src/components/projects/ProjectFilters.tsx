"use client";

import React, { useState, useEffect } from "react";
import { Search, LayoutGrid, List, X, Bookmark, Plus } from "lucide-react";

export interface SavedFilterPreset {
  id: string;
  label: string;
  source: string;
  account: string;
  lang: string;
  state: string;
}

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
  onClearAll: () => void;
}

const PRESET_STORAGE_KEY = "devcentral_3_saved_filters";

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
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  availableLanguages,
  availableVercelAccounts,
  onClearAll,
}: ProjectFiltersProps) {
  const [savedPresets, setSavedPresets] = useState<SavedFilterPreset[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRESET_STORAGE_KEY);
      if (raw) setSavedPresets(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const hasActiveFilters = Boolean(
    searchQuery || sourceFilter || accountFilter || langFilter || stateFilter
  );

  const handleSavePreset = () => {
    const label = window.prompt(
      "Nome para salvar este filtro rápido (ex: Produção Vercel 2):"
    );
    if (!label?.trim()) return;
    const preset: SavedFilterPreset = {
      id: `preset-${Date.now()}`,
      label: label.trim(),
      source: sourceFilter,
      account: accountFilter,
      lang: langFilter,
      state: stateFilter,
    };
    const next = [...savedPresets, preset];
    setSavedPresets(next);
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleApplyPreset = (p: SavedFilterPreset) => {
    onSourceChange(p.source);
    onAccountChange(p.account);
    onLangChange(p.lang);
    onStateChange(p.state);
  };

  const handleDeletePreset = (id: string) => {
    const next = savedPresets.filter((x) => x.id !== id);
    setSavedPresets(next);
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-3 mb-5">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative flex-1 max-w-xl">
          <Search className="w-4 h-4 text-[#9baac5] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Pesquisar por nome, stack, tag, conta Vercel ou descrição..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#121a29] border border-[#29344a] text-sm text-white placeholder-[#9baac5] focus:outline-none focus:border-[#8b85ff]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sourceFilter}
            onChange={(e) => onSourceChange(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-[#121a29] border border-[#29344a] text-xs font-medium text-white"
          >
            <option value="">Todas as plataformas</option>
            <option value="GitHub">GitHub</option>
            <option value="GitLab">GitLab</option>
            <option value="Vercel">Vercel</option>
            <option value="Manual">Manual</option>
          </select>

          <select
            value={accountFilter}
            onChange={(e) => onAccountChange(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-[#121a29] border border-[#29344a] text-xs font-medium text-white"
          >
            <option value="">Todas as contas Vercel</option>
            {availableVercelAccounts.map((acc) => (
              <option key={acc} value={acc}>
                ▲ {acc}
              </option>
            ))}
          </select>

          <select
            value={langFilter}
            onChange={(e) => onLangChange(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-[#121a29] border border-[#29344a] text-xs font-medium text-white"
          >
            <option value="">Todas as linguagens</option>
            {availableLanguages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>

          <select
            value={stateFilter}
            onChange={(e) => onStateChange(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-[#121a29] border border-[#29344a] text-xs font-medium text-white"
          >
            <option value="">Todos os status</option>
            <option value="online">Online (Verde Neon)</option>
            <option value="dev">Em dev (Vermelho Neon)</option>
            <option value="archived">Arquivado</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) =>
              onSortChange(e.target.value as "recent" | "name" | "stars")
            }
            className="px-3 py-2.5 rounded-xl bg-[#121a29] border border-[#29344a] text-xs font-medium text-white"
          >
            <option value="recent">Mais recentes</option>
            <option value="name">Ordem A–Z</option>
            <option value="stars">Mais estrelas</option>
          </select>

          <div className="inline-flex rounded-xl border border-[#29344a] bg-[#121a29] p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange("grid")}
              className={`p-2 rounded-lg cursor-pointer ${
                viewMode === "grid"
                  ? "bg-[#262b55] text-white"
                  : "text-[#9baac5] hover:text-white"
              }`}
              title="Grade"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange("list")}
              className={`p-2 rounded-lg cursor-pointer ${
                viewMode === "list"
                  ? "bg-[#262b55] text-white"
                  : "text-[#9baac5] hover:text-white"
              }`}
              title="Lista"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Removable Filter Chips & Saved Filter Presets */}
      {(hasActiveFilters || savedPresets.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {sourceFilter && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#262b55] text-white border border-[#8b85ff]/40">
                Fonte: {sourceFilter}
                <button
                  type="button"
                  onClick={() => onSourceChange("")}
                  className="hover:text-[#ff6b86] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {accountFilter && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#262b55] text-white border border-[#8b85ff]/40">
                Conta: {accountFilter}
                <button
                  type="button"
                  onClick={() => onAccountChange("")}
                  className="hover:text-[#ff6b86] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {langFilter && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#262b55] text-white border border-[#8b85ff]/40">
                Stack: {langFilter}
                <button
                  type="button"
                  onClick={() => onLangChange("")}
                  className="hover:text-[#ff6b86] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {stateFilter && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-[#262b55] text-white border border-[#8b85ff]/40">
                Status: {stateFilter}
                <button
                  type="button"
                  onClick={() => onStateChange("")}
                  className="hover:text-[#ff6b86] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
            {hasActiveFilters && (
              <>
                <button
                  type="button"
                  onClick={handleSavePreset}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-[#3ddba0]/40 bg-[#12372e]/60 text-[#3ddba0] hover:bg-[#12372e] cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Salvar filtro
                </button>
                <button
                  type="button"
                  onClick={onClearAll}
                  className="text-xs text-[#9baac5] hover:text-white underline px-2 cursor-pointer"
                >
                  Limpar filtros
                </button>
              </>
            )}
          </div>

          {savedPresets.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-[#9baac5] flex items-center gap-1">
                <Bookmark className="w-3 h-3 text-[#a49eff]" /> Filtros salvos:
              </span>
              {savedPresets.map((p) => (
                <div
                  key={p.id}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-[#182337] text-[#c3beff] border border-[#344463]"
                >
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="hover:text-white cursor-pointer"
                  >
                    {p.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePreset(p.id)}
                    className="text-[#9baac5] hover:text-[#ff6b86] cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
