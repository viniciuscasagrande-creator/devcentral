"use client";

import React from "react";
import { ProjectSource, ProjectState } from "@/types/project";
import { X } from "lucide-react";

interface ProjectFormProps {
  open: boolean;
  editingId: string | null;
  saving: boolean;
  formName: string;
  setFormName: (v: string) => void;
  formDesc: string;
  setFormDesc: (v: string) => void;
  formTech: string;
  setFormTech: (v: string) => void;
  formSource: ProjectSource;
  setFormSource: (v: ProjectSource) => void;
  formRepoUrl: string;
  setFormRepoUrl: (v: string) => void;
  formDeployUrl: string;
  setFormDeployUrl: (v: string) => void;
  formState: ProjectState;
  setFormState: (v: ProjectState) => void;
  formVisibility: "public" | "private";
  setFormVisibility: (v: "public" | "private") => void;
  formBranch: string;
  setFormBranch: (v: string) => void;
  formTags: string;
  setFormTags: (v: string) => void;
  formNotes: string;
  setFormNotes: (v: string) => void;
  formLocalPath: string;
  setFormLocalPath: (v: string) => void;
  formPinned: boolean;
  setFormPinned: (v: boolean) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function ProjectForm({
  open,
  editingId,
  saving,
  formName,
  setFormName,
  formDesc,
  setFormDesc,
  formTech,
  setFormTech,
  formSource,
  setFormSource,
  formRepoUrl,
  setFormRepoUrl,
  formDeployUrl,
  setFormDeployUrl,
  formState,
  setFormState,
  formVisibility,
  setFormVisibility,
  formBranch,
  setFormBranch,
  formTags,
  setFormTags,
  formNotes,
  setFormNotes,
  formLocalPath,
  setFormLocalPath,
  formPinned,
  setFormPinned,
  onClose,
  onSubmit,
}: ProjectFormProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <form
        onSubmit={onSubmit}
        className="mobile-project-form w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-[#344463] bg-[#111a2b] p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6 text-white shadow-2xl space-y-4 max-h-[94dvh] sm:max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">
            {editingId ? "Editar Projeto" : "Novo Projeto"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9baac5] hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <label className="sm:col-span-2 space-y-1">
            <span className="text-[#9baac5]">Nome do projeto *</span>
            <input
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b1321] border border-[#29344a] text-white"
            />
          </label>

          <label className="sm:col-span-2 space-y-1">
            <span className="text-[#9baac5]">Descrição</span>
            <input
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b1321] border border-[#29344a] text-white"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[#9baac5]">Linguagem / Stack</span>
            <input
              value={formTech}
              onChange={(e) => setFormTech(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b1321] border border-[#29344a] text-white"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[#9baac5]">Plataforma de origem</span>
            <select
              value={formSource}
              onChange={(e) => setFormSource(e.target.value as ProjectSource)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b1321] border border-[#29344a] text-white"
            >
              <option value="GitHub">GitHub</option>
              <option value="GitLab">GitLab</option>
              <option value="Vercel">Vercel</option>
              <option value="Manual">Manual</option>
            </select>
          </label>

          <label className="sm:col-span-2 space-y-1">
            <span className="text-[#9baac5]">URL do Repositório</span>
            <input
              value={formRepoUrl}
              onChange={(e) => setFormRepoUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b1321] border border-[#29344a] text-white"
            />
          </label>

          <label className="sm:col-span-2 space-y-1">
            <span className="text-[#9baac5]">URL de Deploy (Produção)</span>
            <input
              value={formDeployUrl}
              onChange={(e) => setFormDeployUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b1321] border border-[#29344a] text-white"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[#9baac5]">Status</span>
            <select
              value={formState}
              onChange={(e) => setFormState(e.target.value as ProjectState)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b1321] border border-[#29344a] text-white"
            >
              <option value="online">Online (Verde Neon)</option>
              <option value="dev">Em dev (Vermelho Neon)</option>
              <option value="archived">Arquivado</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[#9baac5]">Visibilidade</span>
            <select
              value={formVisibility}
              onChange={(e) =>
                setFormVisibility(e.target.value as "public" | "private")
              }
              className="w-full px-3 py-2 rounded-xl bg-[#0b1321] border border-[#29344a] text-white"
            >
              <option value="public">Público</option>
              <option value="private">Privado</option>
            </select>
          </label>

          <label className="sm:col-span-2 space-y-1">
            <span className="text-[#9baac5]">Caminho Local no PC (VS Code ↗)</span>
            <input
              value={formLocalPath}
              onChange={(e) => setFormLocalPath(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b1321] border border-[#29344a] text-white"
            />
          </label>

          <label className="sm:col-span-2 space-y-1">
            <span className="text-[#9baac5]">Notas Técnicas</span>
            <input
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#0b1321] border border-[#29344a] text-white"
            />
          </label>
        </div>

        <div className="flex items-center justify-between pt-2">
          <label className="inline-flex items-center gap-2 text-xs text-[#9baac5] cursor-pointer">
            <input
              type="checkbox"
              checked={formPinned}
              onChange={(e) => setFormPinned(e.target.checked)}
            />
            Fixar nos favoritos
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#29344a] text-xs font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-[#746ef0] hover:bg-[#635ce0] text-xs font-bold text-white cursor-pointer"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
