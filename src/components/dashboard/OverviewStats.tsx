"use client";

import React from "react";
import { Project } from "@/types/project";
import { Layers, Rocket } from "lucide-react";

interface OverviewStatsProps {
  projects: Project[];
  onFilterSelect?: (filter: {
    source?: string;
    state?: string;
    lang?: string;
  }) => void;
  onOpenGitlabModal?: () => void;
}

export function OverviewStats({
  projects,
  onFilterSelect,
  onOpenGitlabModal,
}: OverviewStatsProps) {
  const total = projects.length;
  const online = projects.filter(
    (p) => p.state === "online" || Boolean(p.deploy_url)
  ).length;
  const githubCount = projects.filter((p) => p.source === "GitHub").length;
  const gitlabCount = projects.filter((p) => p.source === "GitLab").length;
  const vercelTotal = projects.filter(
    (p) =>
      p.source === "Vercel" ||
      (p.vercel_accounts && p.vercel_accounts.length > 0) ||
      p.deploy_url?.includes("vercel.app")
  ).length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3.5 mb-5">
      {/* 1. Total no dashboard */}
      <button
        type="button"
        onClick={() => onFilterSelect?.({ source: "", state: "" })}
        className="text-left p-4 rounded-2xl border border-[#222d47] bg-gradient-to-br from-[#13192e] to-[#0d1323] hover:border-[#4b5d88] transition cursor-pointer flex items-center justify-between gap-2"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#1c2242] border border-[#323c6e] grid place-items-center shrink-0 mt-0.5">
            <Layers className="w-5 h-5 text-[#9381ff]" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-[#9baac5] truncate">
              Total no dashboard
            </div>
            <div className="text-2xl font-black text-white leading-tight mt-0.5">
              {total}
            </div>
            <div className="text-[10.5px] text-[#7f8ea8] mt-0.5 truncate">
              Projetos carregados
            </div>
          </div>
        </div>

        <svg
          viewBox="0 0 68 28"
          className="w-16 h-7 shrink-0"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 22C12 22 16 14 26 16C36 18 42 8 52 10C58 11 62 6 66 5"
            stroke="#a855f7"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* 2. Projetos online exibidos (Emerald Neon Highlight) */}
      <button
        type="button"
        onClick={() => onFilterSelect?.({ state: "online" })}
        className="text-left p-4 rounded-2xl border border-[#2dd4a0]/80 bg-gradient-to-br from-[#0e2a27] via-[#0d2025] to-[#0c1724] shadow-[0_0_20px_rgba(45,212,160,0.18)] hover:border-[#3ddba0] transition cursor-pointer flex items-center justify-between gap-2"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#0f3830] border border-[#2dd4a0]/50 grid place-items-center shrink-0 mt-0.5">
            <Rocket className="w-5 h-5 text-[#3ddba0]" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-[#b5d6cc] truncate">
              Projetos online exibidos
            </div>
            <div className="text-2xl font-black text-[#3ddba0] leading-tight mt-0.5">
              {online}
            </div>
            <div className="text-[10.5px] text-[#84b8a8] mt-0.5 truncate">
              Com link de deploy ativo
            </div>
          </div>
        </div>

        <svg
          viewBox="0 0 68 28"
          className="w-16 h-7 shrink-0"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 22C12 21 18 15 28 17C38 19 44 8 54 10C60 11 63 6 66 4"
            stroke="#3ddba0"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* 3. GitHub */}
      <button
        type="button"
        onClick={() => onFilterSelect?.({ source: "GitHub" })}
        className="text-left p-4 rounded-2xl border border-[#222d47] bg-gradient-to-br from-[#13192e] to-[#0d1323] hover:border-[#4b5d88] transition cursor-pointer flex items-center justify-between gap-2"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#182138] border border-[#2b395c] grid place-items-center shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-[#c8d4eb]"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-[#9baac5] truncate">
              GitHub
            </div>
            <div className="text-2xl font-black text-white leading-tight mt-0.5">
              {githubCount}
            </div>
            <div className="text-[10.5px] text-[#7f8ea8] mt-0.5 truncate">
              Repositórios
            </div>
          </div>
        </div>

        <svg
          viewBox="0 0 68 28"
          className="w-16 h-7 shrink-0"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 21C14 21 18 15 28 16C38 17 44 10 54 11C60 12 63 8 66 6"
            stroke="#38bdf8"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* 4. GitLab */}
      <button
        type="button"
        onClick={() =>
          gitlabCount > 0
            ? onFilterSelect?.({ source: "GitLab" })
            : onOpenGitlabModal?.()
        }
        className="text-left p-4 rounded-2xl border border-[#222d47] bg-gradient-to-br from-[#13192e] to-[#0d1323] hover:border-[#4b5d88] transition cursor-pointer flex items-center justify-between gap-2"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#1c2240] border border-[#2f3b69] grid place-items-center shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-[#a5b4fc]"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-[#9baac5] truncate">
              GitLab
            </div>
            <div className="text-2xl font-black text-white leading-tight mt-0.5">
              {gitlabCount}
            </div>
            <div className="text-[10.5px] text-[#7f8ea8] mt-0.5 truncate">
              Repositórios
            </div>
          </div>
        </div>

        <svg
          viewBox="0 0 68 28"
          className="w-16 h-7 shrink-0"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 20C14 20 22 18 34 19C46 20 52 15 66 15"
            stroke="#6366f1"
            strokeWidth="2"
            strokeLinecap="round"
            strokeOpacity="0.65"
          />
        </svg>
      </button>

      {/* 5. Vercel (2 Contas) */}
      <button
        type="button"
        onClick={() => onFilterSelect?.({ state: "online" })}
        className="text-left p-4 rounded-2xl border border-[#222d47] bg-gradient-to-br from-[#13192e] to-[#0d1323] hover:border-[#4b5d88] transition cursor-pointer flex items-center justify-between gap-2"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#1f1d42] border border-[#3e377d] grid place-items-center shrink-0 mt-0.5">
            <span className="text-base text-[#c4b5fd]">▲</span>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-[#9baac5] truncate">
              Vercel (2 Contas)
            </div>
            <div className="text-2xl font-black text-[#a87ffb] leading-tight mt-0.5">
              {vercelTotal}
            </div>
            <div className="text-[10.5px] text-[#7f8ea8] mt-0.5 truncate">
              Aplicações hospedadas
            </div>
          </div>
        </div>

        <svg
          viewBox="0 0 68 28"
          className="w-16 h-7 shrink-0"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 22C12 22 18 14 28 16C38 18 44 8 54 10C60 11 63 6 66 5"
            stroke="#a87ffb"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
