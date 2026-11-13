"use client";

import React, { useState } from "react";
import {
  Search,
  Bell,
  Lock,
  Rocket,
  ChevronDown,
  PlayCircle,
  Check,
  Layers,
  Plus,
  LogOut,
  Menu,
} from "lucide-react";
import { FirebaseUser } from "@/lib/firebase";
import { AlertsBell } from "@/components/alerts/AlertsBell";

interface AppHeaderProps {
  syncing: boolean;
  onSyncClick: () => void;
  onNewProjectClick: () => void;
  onTabChange?: (tab: any) => void;
  activeTab?: string;
  signedUser?: FirebaseUser | null;
  onSignInClick?: () => void;
  onSignOutClick?: () => void;
  onFocusSearch?: () => void;
  onOpenMobileMenu?: () => void;
}

export function AppHeader({
  syncing,
  onSyncClick,
  onNewProjectClick,
  onTabChange,
  signedUser,
  onSignInClick,
  onSignOutClick,
  onFocusSearch,
  onOpenMobileMenu,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="space-y-4 mb-5">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menu de navegação"
            className="lg:hidden w-10 h-10 rounded-xl bg-[#101729] border border-[#2a3859] text-white grid place-items-center cursor-pointer shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="text-[10.5px] sm:text-[11px] font-bold uppercase tracking-[0.14em] sm:tracking-[0.18em] text-[#a5b4fc] truncate">
            WORKSPACE PESSOAL • MULTI-CONTAS • NEON DB • FIREBASE AUTH
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFocusSearch}
            className="w-10 h-10 rounded-full bg-[#101729] border border-[#222e4a] text-[#9baac5] hover:text-white hover:border-[#4b5d88] grid place-items-center transition cursor-pointer"
            title="Pesquisar (Ctrl + K)"
          >
            <Search className="w-4 h-4" />
          </button>

          <AlertsBell signedIn={Boolean(signedUser)} onOpenTelemetry={() => onTabChange?.("telemetry")} />

          {signedUser ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onNewProjectClick}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#141d33] border border-[#2c3b5e] hover:border-[#7c5cff] text-xs font-semibold text-white transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#3ddba0]" />
                Novo projeto
              </button>
              <button
                type="button"
                onClick={onSignOutClick}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#7c5cff] to-[#5b3df5] hover:from-[#6d4ce8] hover:to-[#4f32db] border border-[#a78bfa]/70 shadow-[0_0_20px_rgba(124,92,255,0.45)] text-xs font-bold text-white transition cursor-pointer"
                title={`Logado como ${signedUser.email || signedUser.uid} — clique para sair`}
              >
                <span className="w-2 h-2 rounded-full bg-[#3ddba0]" />
                <span className="max-w-[180px] truncate">
                  {signedUser.email || "Admin"}
                </span>
                <LogOut className="w-3.5 h-3.5 opacity-80" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignInClick}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#7c5cff] to-[#5b3df5] hover:from-[#6d4ce8] hover:to-[#4f32db] border border-[#a78bfa]/70 shadow-[0_0_20px_rgba(124,92,255,0.45)] text-xs font-bold text-white transition cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-amber-300" />
              Entrar com Google (Admin)
            </button>
          )}
        </div>
      </div>

      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-[#1f2942] bg-gradient-to-r from-[#0c1224] via-[#111530] to-[#0c1224] px-6 py-5 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
        {/* Left Vertical Neon Accent Bar */}
        <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-[#38bdf8] via-[#818cf8] to-[#a855f7] shadow-[0_0_14px_#38bdf8]" />

        {/* Ambient Glows */}
        <div className="pointer-events-none absolute -right-12 -top-16 w-80 h-80 rounded-full bg-[#6d28d9]/20 blur-3xl" />
        <div className="pointer-events-none absolute right-1/4 -bottom-16 w-72 h-72 rounded-full bg-[#38bdf8]/15 blur-3xl" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-[1.35fr_0.85fr_0.8fr] items-center gap-6">
          {/* Left Column: Title, Subtitle, CTA Buttons */}
          <div className="space-y-3 pl-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#c7d2fe]">
              <Layers className="w-4 h-4 text-[#38bdf8]" />
              <span>DevCentral Workspace</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white leading-none">
              Painel de{" "}
              <span className="bg-gradient-to-r from-[#a78bfa] via-[#c084fc] to-[#818cf8] bg-clip-text text-transparent">
                projetos
              </span>
            </h1>

            <p className="text-xs sm:text-[13px] text-[#9baac5] max-w-xl leading-relaxed">
              Projetos públicos visíveis; faça login com Google para carregar
              projetos privados e sincronizar via API.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {/* Split Button: Sincronizar projetos */}
              <div className="relative inline-flex items-stretch rounded-xl bg-gradient-to-r from-[#6d4aff] to-[#7c3aed] border border-[#a78bfa]/70 shadow-[0_0_22px_rgba(124,92,255,0.45)]">
                <button
                  type="button"
                  onClick={onSyncClick}
                  disabled={syncing}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white hover:bg-white/5 rounded-l-xl transition cursor-pointer disabled:opacity-60"
                >
                  <Rocket
                    className={`w-4 h-4 ${syncing ? "animate-bounce" : ""}`}
                  />
                  {syncing ? "Sincronizando..." : "Sincronizar projetos"}
                </button>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="px-2.5 border-l border-white/20 text-white hover:bg-white/10 rounded-r-xl grid place-items-center cursor-pointer"
                  title="Mais ações"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {menuOpen && (
                  <div
                    onMouseLeave={() => setMenuOpen(false)}
                    className="absolute left-0 top-full mt-2 w-52 rounded-xl border border-[#2c3b5e] bg-[#0e1526] shadow-2xl p-1.5 z-30 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onSyncClick();
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-white hover:bg-[#1a243d] flex items-center gap-2 cursor-pointer"
                    >
                      <Rocket className="w-3.5 h-3.5 text-[#a78bfa]" />
                      Sincronizar via API agora
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onNewProjectClick();
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-white hover:bg-[#1a243d] flex items-center gap-2 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-[#3ddba0]" />
                      Cadastrar novo projeto
                    </button>
                  </div>
                )}
              </div>

              {/* Secondary Button: Abrir Telemetria & Soluções */}
              <button
                type="button"
                onClick={() => onTabChange?.("telemetry")}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10172a]/90 hover:bg-[#162038] border border-[#2a3656] text-xs font-bold text-white transition cursor-pointer"
              >
                <PlayCircle className="w-4 h-4 text-[#a5b4fc]" />
                <span>Abrir Telemetria & Soluções</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#3b2785] text-[#d8ceff] border border-[#7c5cff]/50">
                  Novo
                </span>
              </button>
            </div>
          </div>

          {/* Center Column: 3D Isometric Glowing Neon Stack Illustration */}
          <div className="hidden lg:flex items-center justify-center">
            <div className="relative w-56 h-36 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#38bdf8]/25 via-[#818cf8]/25 to-[#c084fc]/25 blur-2xl" />
              <svg
                viewBox="0 0 260 170"
                className="w-full h-full drop-shadow-[0_0_18px_rgba(129,140,248,0.55)]"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <linearGradient id="isoTop" x1="60" y1="20" x2="200" y2="110" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#1e294a" />
                    <stop offset="1" stopColor="#2e1d59" />
                  </linearGradient>
                  <linearGradient id="isoStroke" x1="50" y1="20" x2="210" y2="140" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#38bdf8" />
                    <stop offset="0.5" stopColor="#818cf8" />
                    <stop offset="1" stopColor="#d946ef" />
                  </linearGradient>
                </defs>
                {/* Bottom Isometric Plate */}
                <path
                  d="M130 62L204 102L130 142L56 102L130 62Z"
                  fill="#121833"
                  stroke="url(#isoStroke)"
                  strokeWidth="2"
                  strokeOpacity="0.55"
                />
                {/* Middle Isometric Plate */}
                <path
                  d="M130 44L204 84L130 124L56 84L130 44Z"
                  fill="#171f3f"
                  stroke="url(#isoStroke)"
                  strokeWidth="2.2"
                  strokeOpacity="0.8"
                />
                {/* Top Isometric Cube/Plate */}
                <path
                  d="M130 22L204 62L130 102L56 62L130 22Z"
                  fill="url(#isoTop)"
                  stroke="url(#isoStroke)"
                  strokeWidth="2.8"
                />
                {/* Center DevCentral Emblem on Top Plate */}
                <path
                  d="M116 49L152 62L116 75V49Z"
                  stroke="url(#isoStroke)"
                  strokeWidth="3.5"
                  strokeLinejoin="round"
                  fill="#818cf8"
                  fillOpacity="0.25"
                />
              </svg>
            </div>
          </div>

          {/* Right Column: Feature Checklist */}
          <div className="space-y-2.5 text-xs text-[#d5dff2] lg:justify-self-end">
            <div className="flex items-center gap-2.5">
              <Check className="w-4 h-4 text-[#818cf8] shrink-0" />
              <span className="font-medium">GitHub, GitLab e Vercel</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Check className="w-4 h-4 text-[#818cf8] shrink-0" />
              <span className="font-medium">Deploy e status em tempo real</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Check className="w-4 h-4 text-[#818cf8] shrink-0" />
              <span className="font-medium">Telemetria e recomendações</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#3b2785] text-[#d8ceff] border border-[#7c5cff]/50">
                Novo
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
