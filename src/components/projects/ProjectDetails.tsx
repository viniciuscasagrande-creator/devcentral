"use client";

import React, { useState } from "react";
import { Project } from "@/types/project";
import {
  X,
  ExternalLink,
  GitBranch,
  Globe,
  FolderGit2,
  Edit3,
  Pin,
  Lock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

interface ProjectDetailsProps {
  project: Project | null;
  onClose: () => void;
  onEdit: (project: Project) => void;
  onTogglePin: (project: Project) => void;
  onPingUrl: (url: string) => Promise<{
    reachable: boolean;
    statusCode: number;
    latencyMs: number;
    checkedAt: string;
  }>;
}

export function ProjectDetails({
  project,
  onClose,
  onEdit,
  onTogglePin,
  onPingUrl,
}: ProjectDetailsProps) {
  const [pingResult, setPingResult] = useState<{
    loading?: boolean;
    reachable?: boolean;
    statusCode?: number;
    latencyMs?: number;
    checkedAt?: string;
  } | null>(null);

  if (!project) return null;

  const isOnline = project.state === "online" || Boolean(project.deploy_url);
  const vscodeUrl = project.local_path
    ? `vscode://file/${project.local_path.replace(/\\/g, "/")}`
    : "";

  const handlePing = async (url: string) => {
    setPingResult({ loading: true });
    try {
      const res = await onPingUrl(url);
      setPingResult({ loading: false, ...res });
    } catch {
      setPingResult({ loading: false, reachable: false, statusCode: 0 });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className={`w-full max-w-2xl rounded-2xl border bg-[#111a2b] text-white shadow-2xl overflow-hidden ${
          isOnline
            ? "border-[#3ddba0]/80 shadow-[0_0_28px_rgba(61,219,160,0.25)]"
            : "border-[#ff4d6d]/80 shadow-[0_0_28px_rgba(255,77,109,0.25)]"
        }`}
      >
        {/* Header */}
        <div className="p-6 border-b border-[#29344a] flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl grid place-items-center bg-[#282e57] text-[#c3beff] font-black text-base">
              {project.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-[#a49eff]">
                  {project.source}
                </span>
                {project.visibility === "private" && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-[#182337] text-[#9baac5]">
                    <Lock className="w-3 h-3" /> Privado
                  </span>
                )}
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    isOnline
                      ? "bg-[#12372e] text-[#3ddba0] border-[#3ddba0]/50"
                      : "bg-[#ff4d6d]/15 text-[#ff6b86] border-[#ff4d6d]/50"
                  }`}
                >
                  ● {isOnline ? "Em Produção (Online)" : "Off / Em dev"}
                </span>
              </div>
              <h2 className="text-xl font-extrabold mt-1">{project.name}</h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#9baac5] hover:text-white hover:bg-[#182337] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-sm">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#9baac5] mb-1">
              Descrição
            </div>
            <p className="text-[#d5e0f2] leading-relaxed">
              {project.description || "Sem descrição cadastrada."}
            </p>
          </div>

          {project.custom_notes && (
            <div className="p-3.5 rounded-xl border border-[#344463] bg-[#0c1322]">
              <div className="text-xs font-bold text-[#a49eff] mb-1">
                📌 Notas Técnicas & Operacionais
              </div>
              <p className="text-xs text-[#cbd5e8]">{project.custom_notes}</p>
            </div>
          )}

          {/* Technical Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border border-[#29344a] bg-[#0e1525]">
              <div className="text-[11px] text-[#9baac5]">Stack Principal</div>
              <div className="font-bold text-white mt-0.5">{project.tech}</div>
            </div>
            <div className="p-3 rounded-xl border border-[#29344a] bg-[#0e1525]">
              <div className="text-[11px] text-[#9baac5]">Branch Padrão</div>
              <div className="font-bold text-white mt-0.5 flex items-center gap-1">
                <GitBranch className="w-3.5 h-3.5 text-[#a49eff]" />
                {project.default_branch || "main"}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-[#29344a] bg-[#0e1525]">
              <div className="text-[11px] text-[#9baac5]">Status Deploy</div>
              <div className="font-bold text-[#3ddba0] mt-0.5">
                {project.last_deploy_status || (isOnline ? "READY" : "DEV")}
              </div>
            </div>
            <div className="p-3 rounded-xl border border-[#29344a] bg-[#0e1525]">
              <div className="text-[11px] text-[#9baac5]">Atualizado em</div>
              <div className="font-bold text-white mt-0.5 text-xs">
                {new Date(
                  project.last_commit_at || project.updated_at
                ).toLocaleDateString("pt-BR")}
              </div>
            </div>
          </div>

          {/* Vercel Multi-Account Deployments */}
          {((project.deployments && project.deployments.length > 0) ||
            project.deploy_url) && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[#9baac5]">
                Ambientes & Deploys Vinculados
              </div>
              {project.deploy_url && (
                <div className="p-3 rounded-xl border border-[#3ddba0]/40 bg-[#0e1525] flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-[#3ddba0] truncate">
                      {project.deploy_url}
                    </div>
                    <div className="text-[11px] text-[#9baac5]">
                      Deploy principal •{" "}
                      {(project.vercel_accounts || []).join(", ") ||
                        project.source}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePing(project.deploy_url)}
                      disabled={pingResult?.loading}
                      className="px-2.5 py-1 rounded-lg border border-[#344463] bg-[#182337] text-xs font-semibold hover:border-[#3ddba0] cursor-pointer inline-flex items-center gap-1"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${
                          pingResult?.loading ? "animate-spin" : ""
                        }`}
                      />
                      Verificar Online
                    </button>
                    <a
                      href={project.deploy_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-[#12372e] text-[#3ddba0] text-xs font-bold inline-flex items-center gap-1"
                    >
                      Abrir <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}

              {pingResult && !pingResult.loading && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-semibold flex items-center gap-2 ${
                    pingResult.reachable
                      ? "bg-[#12372e]/70 text-[#3ddba0] border border-[#3ddba0]/40"
                      : "bg-[#ff4d6d]/15 text-[#ff6b86] border border-[#ff4d6d]/40"
                  }`}
                >
                  {pingResult.reachable ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" /> Verificação em tempo
                      real: Site Online (HTTP {pingResult.statusCode} em{" "}
                      {pingResult.latencyMs}ms)
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4" /> Verificação em tempo
                      real: Site inacessível ou erro (HTTP{" "}
                      {pingResult.statusCode || "Timeout"})
                    </>
                  )}
                </div>
              )}

              {(project.deployments || []).map((d, i) => (
                <div
                  key={`${d.vercelProjectId}-${i}`}
                  className="p-2.5 rounded-xl border border-[#29344a] bg-[#0e1525] flex items-center justify-between gap-2 text-xs"
                >
                  <div className="truncate">
                    <span className="font-semibold text-[#a49eff]">
                      ▲ {d.account}:
                    </span>{" "}
                    <span className="text-[#cbd5e8]">{d.url}</span>
                  </div>
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#3ddba0] hover:underline shrink-0"
                    >
                      Abrir ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Links & Local Path */}
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            {project.repo_url && (
              <a
                href={project.repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#344463] bg-[#182337] text-xs font-semibold text-white hover:border-[#8b85ff]"
              >
                <FolderGit2 className="w-3.5 h-3.5 text-[#a49eff]" />
                Abrir Repositório ({project.source}) ↗
              </a>
            )}
            {vscodeUrl && (
              <a
                href={vscodeUrl}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#3ddba0]/40 bg-[#12372e]/50 text-xs font-semibold text-[#3ddba0] hover:bg-[#12372e]"
              >
                Abrir no VS Code ({project.local_path}) ↗
              </a>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#29344a] bg-[#0e1422] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onTogglePin(project)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#29344a] bg-[#182337] text-xs font-semibold text-white hover:border-amber-400 cursor-pointer"
          >
            <Pin className="w-3.5 h-3.5 text-amber-400" />
            {project.is_pinned ? "Desafixar do topo" : "Fixar no topo"}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEdit(project);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#746ef0] hover:bg-[#635ce0] text-xs font-bold text-white cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Editar Projeto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
