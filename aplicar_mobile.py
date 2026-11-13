#!/usr/bin/env python3
"""Patch mobile-first para a versão componentizada do DevCentral 3.
Executar na raiz da cópia local do repositório; não faz deploy.
"""
from pathlib import Path
import sys

ROOT=Path.cwd()
PAGE=ROOT/'src/app/page.tsx'
FILTERS=ROOT/'src/components/projects/ProjectFilters.tsx'
FORM=ROOT/'src/components/projects/ProjectForm.tsx'
GRID=ROOT/'src/components/projects/ProjectGrid.tsx'
CSS=ROOT/'src/app/globals.css'
LAYOUT=ROOT/'src/app/layout.tsx'
NAV=ROOT/'src/components/layout/MobileNavigation.tsx'
NEEDED=[PAGE,FILTERS,FORM,GRID,CSS,LAYOUT]
missing=[str(p.relative_to(ROOT)) for p in NEEDED if not p.is_file()]
if missing:
    sys.exit('ERRO: arquivos esperados não encontrados: '+', '.join(missing)+'\nAbra a raiz do DevCentral (Next.js componentizado).')

original={p:p.read_text('utf-8') for p in NEEDED}
changed={**original}

def replace(path,old,new,count=1):
    text=changed[path]
    if old not in text:
        if new in text:
            return
        raise RuntimeError('O código mudou; não consegui localizar trecho seguro em '+str(path.relative_to(ROOT))+': '+repr(old[:90]))
    if text.count(old)!=count:
        raise RuntimeError('Encontradas '+str(text.count(old))+' ocorrências (esperado '+str(count)+') em '+str(path.relative_to(ROOT))+': '+repr(old[:90]))
    changed[path]=text.replace(old,new,count)

# 1: layout mobile com menu lateral em drawer acessível e barra de navegação inferior
replace(PAGE,'import React, { useEffect, useMemo, useState, useCallback } from "react";',
'''import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Menu, X as CloseMenu } from "lucide-react";
import { MobileNavigation } from "@/components/layout/MobileNavigation";''')
replace(PAGE,'  return (\n    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[268px_1fr] bg-[#070a14] text-white">',
'''  return (
    <div className="min-h-screen min-w-0 grid grid-cols-1 lg:grid-cols-[268px_1fr] bg-[#070a14] text-white">
      {/* Mobile toolbar stays outside desktop sidebar; all actions use existing handlers. */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#273254] bg-[#080c17]/95 backdrop-blur-lg px-4 py-3 min-w-0">
        <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menu" aria-controls="devcentral-mobile-drawer" aria-expanded={mobileMenuOpen}
          className="min-h-11 min-w-11 grid place-items-center rounded-xl border border-[#344463] bg-[#141c32] text-white">
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-extrabold text-base truncate">DevCentral <span className="text-[#a5b4fc]">3.0</span></div>
          <div className="text-[10px] text-[#9baac5] truncate">Projetos • Telemetria • Soluções</div>
        </div>
        <button type="button" onClick={() => signedUser ? openModal() : handleSignIn()} aria-label="Novo projeto"
          className="min-h-11 min-w-11 grid place-items-center rounded-xl bg-[#6d4aff] text-white text-xl font-bold">+</button>
      </div>
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/80" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />
          <div id="devcentral-mobile-drawer" role="dialog" aria-modal="true" aria-label="Menu principal" className="absolute inset-y-0 left-0 w-[min(88vw,340px)] overflow-y-auto bg-[#080c17] shadow-2xl">
            <button type="button" className="sticky top-2 z-10 ml-auto mr-3 mt-2 grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#344463] bg-[#151f35]" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}><CloseMenu className="w-5 h-5" /></button>
            <div className="[&>aside]:!border-0 [&>aside]:!min-h-0"><AppSidebar
              activeTab={activeTab}
              telemetrySubTab={telemetrySubTab}
              onSelectTab={(tab, sub) => { setActiveTab(tab); if (sub) setTelemetrySubTab(sub); setMobileMenuOpen(false); }}
              counts={counts} integrationStatus={integrationStatus} lastSync={lastSync} signedUser={signedUser}
              onSignOut={() => { signOutFirebase(); setMobileMenuOpen(false); }}
              onOpenGitlabModal={() => { setMobileMenuOpen(false); signedUser ? setGitlabModalOpen(true) : handleSignIn(); }}
              onOpenSettingsModal={() => { setMobileMenuOpen(false); signedUser ? setSyncKeyModalOpen(true) : handleSignIn(); }}
              onQuickFilter={(src, acc) => { setSourceFilter(src); setAccountFilter(acc || ""); setActiveTab("all"); setMobileMenuOpen(false); }}
            /></div>
          </div>
        </div>
      )}
      <div className="hidden lg:block min-w-0">''')
replace(PAGE,'      />\n\n      <main className="p-4 sm:p-6 lg:px-8 lg:py-6 max-w-[1640px] w-full mx-auto">',
'''      />
      </div>

      <main className="min-w-0 p-4 pb-28 sm:p-6 sm:pb-28 lg:px-8 lg:py-6 max-w-[1640px] w-full mx-auto">''')
replace(PAGE,'      </main>\n\n      <ProjectDetails',
'''      </main>
      <MobileNavigation
        activeTab={activeTab}
        onNavigate={(tab) => { setActiveTab(tab); setMobileMenuOpen(false); }}
        onNewProject={() => signedUser ? openModal() : handleSignIn()}
      />

      <ProjectDetails''')
# State inserted near known existing navigation state
replace(PAGE,'  const [activeTab, setActiveTab] = useState<NavTab>("all");',
'''  const [activeTab, setActiveTab] = useState<NavTab>("all");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileMenuOpen(false); };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", escape); };
  }, [mobileMenuOpen]);''')

# 2: Mobile filter drawer with always visible search; using existing controlled state
replace(FILTERS,'import React, { useEffect, useRef } from "react";',
        'import React, { useEffect, useRef, useState } from "react";')
replace(FILTERS,'  const searchInputRef = useRef<HTMLInputElement>(null);',
'''  const searchInputRef = useRef<HTMLInputElement>(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);''')
replace(FILTERS,'      {/* Row 1: Search Input + 4 Filter Dropdowns */}\n      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))] gap-2.5 items-center">',
'''      {/* Mobile search stays visible; filter selects expand on demand. */}
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
''')
# Mobile CSS touch and width; don't hide entire main/filter
extra_css='''

/* DevCentral 3 mobile edition: layout, touch and safe areas */
html { width: 100%; overflow-x: clip; }
body { min-width: 320px; width: 100%; }
main, article, section, form, .min-w-0 { min-width: 0; }
img, video, canvas { max-width: 100%; height: auto; }
@media (max-width: 1023px) {
  input, select, textarea { font-size: 16px; }
  button, select, input[type="button"], input[type="submit"] { min-height: 44px; }
  [role="dialog"] { max-width: 100vw; }
}
@media (max-width: 639px) {
  /* Keep accessible actions above the fixed bottom navigation */
  main { padding-bottom: calc(110px + env(safe-area-inset-bottom)); }
  .mobile-project-form { max-height: 100dvh; border-radius: 20px 20px 0 0; }
}
'''
if '/* DevCentral 3 mobile edition:' not in changed[CSS]:
    changed[CSS]+=extra_css

# 3: Dialog uses full width and safe area at phone sizes, desktop unchanged
replace(FORM,'className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"',
        'className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"')
replace(FORM,'className="w-full max-w-lg rounded-2xl border border-[#344463] bg-[#111a2b] p-6 text-white shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"',
        'className="mobile-project-form w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-[#344463] bg-[#111a2b] p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6 text-white shadow-2xl space-y-4 max-h-[94dvh] sm:max-h-[90vh] overflow-y-auto"')
# 4: existing 4-column grid, pad only enough to adapt on mobile
replace(GRID,'"grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5"',
        '"grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3"')
# 5: Next.js viewport metadata (no index.html in App Router)
replace(LAYOUT,'import type { Metadata } from "next";',
        'import type { Metadata, Viewport } from "next";')
replace(LAYOUT,'export const metadata: Metadata = {',
'''export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070a14",
};

export const metadata: Metadata = {''')

mobile_nav='''"use client";

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
'''
if NAV.exists() and NAV.read_text('utf-8')!=mobile_nav:
    raise RuntimeError('MobileNavigation.tsx já existe com outro conteúdo. Revise antes de sobrescrever.')

# Ensure all replacements and the new component are prepared before touching files.
for p,c in changed.items():
    if c!=original[p]:
        p.write_text(c,'utf-8')
NAV.parent.mkdir(parents=True,exist_ok=True)
NAV.write_text(mobile_nav,'utf-8')
print('PATCH APLICADO: layout mobile, drawer, bottom nav, filtros e formulários responsivos, quatro cards no desktop.')
print('Próximos comandos: npm install ; npm run build ; npm run dev')
print('Não publique antes de testar autenticação, telemetria, cadastro e filtros.')
