"use client";

import React, { useState } from "react";
import { Project } from "@/types/project";
import {
  Star,
  MoreHorizontal,
  Globe,
  Lock,
  Eye,
  Edit3,
  Trash2,
} from "lucide-react";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const isOnline = p.state === "online" || Boolean(p.deploy_url);

  // Combine tech + tags (avoiding duplicates)
  const techPills = Array.from(
    new Set([p.tech, ...(p.tags || [])].filter(Boolean))
  ).slice(0, 4);

  return (
    <article
      className={`group relative rounded-2xl p-4 flex flex-col justify-between transition duration-200 border bg-gradient-to-br from-[#131b30]/95 via-[#0f1628]/95 to-[#0b101f]/95 hover:-translate-y-0.5 ${
        isOnline
          ? "border-[#2dd4a0]/75 shadow-[0_0_16px_rgba(45,212,160,0.16),inset_0_0_12px_rgba(45,212,160,0.04)] hover:border-[#3ddba0]"
          : "border-[#ff4d6d]/75 shadow-[0_0_16px_rgba(255,77,109,0.16),inset_0_0_12px_rgba(255,77,109,0.04)] hover:border-[#ff4d6d]"
      }`}
    >
      <div>
        {/* Card Header */}
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onSelect(p)}
            className="flex items-center gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl grid place-items-center bg-gradient-to-br from-[#2c3366] to-[#1e2347] border border-[#485191]/60 text-[#e2ddff] font-extrabold text-xs shrink-0 shadow-inner">
              {p.name.slice(0, 2).toUpperCase()}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 flex-wrap text-[10px] font-bold uppercase tracking-wider text-[#8b9bb8]">
                <span>{p.source}</span>
                <span>•</span>
                <span className="inline-flex items-center gap-0.5">
                  {p.visibility === "private" ? (
                    <>
                      <Lock className="w-2.5 h-2.5 text-amber-400" /> PRIVADO
                    </>
                  ) : (
                    <>
                      <Globe className="w-2.5 h-2.5 text-[#38bdf8]" /> PÚBLICO
                    </>
                  )}
                </span>
                {p.is_pinned && (
                  <>
                    <span>•</span>
                    <span className="text-[#c4b5fd]">FIXADO</span>
                  </>
                )}
              </div>

              <h3
                className="text-[14.5px] font-extrabold text-white leading-snug mt-0.5 truncate group-hover:text-[#b4a8ff] transition"
                title={p.name}
              >
                {p.name}
              </h3>
            </div>
          </button>

          <span
            className={`text-[10.5px] px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap border shrink-0 ${
              isOnline
                ? "text-[#3ddba0] bg-[#0d2e28] border-[#2dd4a0]/55 shadow-[0_0_10px_rgba(45,212,160,0.2)]"
                : "text-[#ff6b86] bg-[#ff4d6d]/15 border-[#ff4d6d]/55 shadow-[0_0_10px_rgba(255,77,109,0.2)]"
            }`}
          >
            ● {isOnline ? "Online" : "Em dev"}
          </span>
        </div>

        {/* Description */}
        <p className="text-[#9baac5] text-[11.5px] leading-relaxed mt-3 line-clamp-2 min-h-[34px]">
          {p.description || "Projeto sincronizado com Neon PostgreSQL."}
        </p>

        {/* Tech & Vercel Account Badges */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {techPills.map((t) => (
            <span
              key={t}
              className="text-[10.5px] font-medium px-2 py-0.5 rounded-md bg-[#141d33] border border-[#263554] text-[#cbd5e8]"
            >
              {t}
            </span>
          ))}
          {(p.vercel_accounts || []).map((acc) => (
            <span
              key={acc}
              className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-[#1c1a3b] border border-[#453a85] text-[#b4a8ff] truncate max-w-[195px]"
              title={acc}
            >
              ▲ {acc}
            </span>
          ))}
        </div>
      </div>

      {/* Footer Links & Action Icons */}
      <div className="mt-3.5 pt-2.5 border-t border-[#1c263d] flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          {p.repo_url ? (
            <a
              href={p.repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#d5dff2] hover:text-white transition"
            >
              Repositório ↗
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onSelect(p)}
              className="font-semibold text-[#d5dff2] hover:text-white transition cursor-pointer"
            >
              Repositório ↗
            </button>
          )}

          {p.deploy_url ? (
            <a
              href={p.deploy_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#3ddba0] hover:underline transition"
            >
              Abrir site ↗
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onSelect(p)}
              className="font-semibold text-[#8b9bb8] hover:text-white transition cursor-pointer"
            >
              Detalhes ↗
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 text-[#8b9bb8]">
          {p.repo_url && (
            <a
              href={p.repo_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded-lg hover:text-white hover:bg-[#182337] transition"
              title="Abrir repositório"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
              </svg>
            </a>
          )}

          <button
            type="button"
            onClick={() => onTogglePin(p)}
            className={`p-1 rounded-lg transition cursor-pointer ${
              p.is_pinned
                ? "text-amber-400 hover:bg-amber-400/10"
                : "hover:text-white hover:bg-[#182337]"
            }`}
            title={p.is_pinned ? "Desafixar do topo" : "Fixar no topo"}
          >
            <Star
              className="w-3.5 h-3.5"
              fill={p.is_pinned ? "currentColor" : "none"}
            />
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1 rounded-lg hover:text-white hover:bg-[#182337] transition cursor-pointer"
              title="Opções do projeto"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>

            {menuOpen && (
              <div
                onMouseLeave={() => setMenuOpen(false)}
                className="absolute right-0 bottom-full mb-1.5 w-40 rounded-xl border border-[#2c3b5e] bg-[#0e1526] shadow-2xl p-1 z-30 text-xs"
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onSelect(p);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[#d5dff2] hover:text-white hover:bg-[#1a243d] flex items-center gap-2 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-[#a78bfa]" />
                  Ver detalhes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(p);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[#d5dff2] hover:text-white hover:bg-[#1a243d] flex items-center gap-2 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#3ddba0]" />
                  Editar projeto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(p);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[#ff6b86] hover:bg-[#ff4d6d]/15 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remover
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
