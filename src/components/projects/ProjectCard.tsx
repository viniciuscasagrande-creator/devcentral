"use client";

import React from "react";
import { Project } from "@/types/project";
import { Pin, Lock, ExternalLink, Edit3, Trash2, Eye } from "lucide-react";

interface ProjectCardProps {
  project: Project;
  onSelect: (project: Project) => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onTogglePin: (project: Project) => void;
}

export function ProjectCard({
  project: p,
  onSelect,
  onEdit,
  onDelete,
  onTogglePin,
}: ProjectCardProps) {
  const isOnline = p.state === "online" || Boolean(p.deploy_url);
  const vscodeUrl = p.local_path
    ? `vscode://file/${p.local_path.replace(/\\/g, "/")}`
    : "";

  return (
    <article
      className={`group rounded-xl p-3 flex flex-col justify-between transition duration-200 border bg-gradient-to-br from-[#171f31] to-[#121a29] hover:-translate-y-0.5 ${
        isOnline
          ? "border-[#3ddba0]/85 shadow-[0_0_14px_rgba(61,219,160,0.22),inset_0_0_10px_rgba(61,219,160,0.05)] hover:border-[#3ddba0]"
          : "border-[#ff4d6d]/85 shadow-[0_0_14px_rgba(255,77,109,0.22),inset_0_0_10px_rgba(255,77,109,0.05)] hover:border-[#ff4d6d]"
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-1.5">
          <button
            type="button"
            onClick={() => onSelect(p)}
            className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg grid place-items-center bg-[#282e57] text-[#c3beff] font-extrabold text-xs shrink-0">
              {p.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9baac5]">
                  {p.source}
                </span>
                {p.visibility === "private" && (
                  <span className="inline-flex items-center gap-0.5 text-[9.5px] px-1 py-0.2 rounded bg-[#182337] text-[#9baac5]">
                    <Lock className="w-2.5 h-2.5" /> Priv
                  </span>
                )}
              </div>
              <h3
                className="text-sm font-bold text-white leading-tight mt-0.5 truncate group-hover:text-[#a49eff] transition"
                title={p.name}
              >
                {p.name}
              </h3>
            </div>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onTogglePin(p)}
              className={`p-1 rounded-md transition cursor-pointer ${
                p.is_pinned
                  ? "text-amber-400 bg-amber-400/10"
                  : "text-[#9baac5] opacity-60 hover:opacity-100 hover:bg-[#182337]"
              }`}
              title="Fixar/Desafixar"
            >
              <Pin className="w-3 h-3" />
            </button>

            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap border ${
                isOnline
                  ? "text-[#3ddba0] bg-[#12372e] border-[#3ddba0]/50 shadow-[0_0_8px_rgba(61,219,160,0.25)]"
                  : "text-[#ff6b86] bg-[#ff4d6d]/15 border-[#ff4d6d]/50 shadow-[0_0_8px_rgba(255,77,109,0.25)]"
              }`}
            >
              ● {isOnline ? "Online" : "Off"}
            </span>
          </div>
        </div>

        <p className="text-[#9baac5] text-[11px] leading-snug mt-2 line-clamp-2 min-h-[30px]">
          {p.description || "Sem descrição cadastrada."}
        </p>

        <div className="flex flex-wrap items-center gap-1 mt-2">
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#34425b] text-[#c1cae0]">
            {p.tech}
          </span>
          {(p.vercel_accounts || []).map((acc) => (
            <span
              key={acc}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[#182337] text-[#a49eff] border border-[#29344a] truncate max-w-[130px]"
              title={acc}
            >
              ▲ {acc}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-2.5 pt-2 border-t border-[#29344a]/80 flex items-center justify-between gap-1.5 flex-wrap text-[11px]">
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => onSelect(p)}
            className="font-semibold text-[#a49eff] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
          >
            <Eye className="w-3 h-3" /> Detalhes
          </button>
          {p.repo_url && (
            <a
              href={p.repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#b9b5ff] hover:underline"
            >
              Repo ↗
            </a>
          )}
          {vscodeUrl && (
            <a
              href={vscodeUrl}
              className="font-semibold text-[#55e4ba] hover:underline"
            >
              VS Code ↗
            </a>
          )}
          {p.deploy_url && (
            <a
              href={p.deploy_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#3ddba0] hover:underline inline-flex items-center gap-0.5"
            >
              Site <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onEdit(p)}
            className="p-1 rounded text-[#9baac5] hover:text-white hover:bg-[#182337] cursor-pointer"
            title="Editar"
          >
            <Edit3 className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(p)}
            className="p-1 rounded text-[#9baac5] hover:text-[#ff6b86] hover:bg-[#182337] cursor-pointer"
            title="Excluir"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </article>
  );
}
