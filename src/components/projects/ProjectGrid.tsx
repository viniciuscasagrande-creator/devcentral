"use client";

import React from "react";
import { Project } from "@/types/project";
import { ProjectCard } from "./ProjectCard";

interface ProjectGridProps {
  projects: Project[];
  viewMode?: "grid" | "list";
  onSelect: (project: Project) => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onTogglePin: (project: Project) => void;
}

export function ProjectGrid({
  projects,
  viewMode = "grid",
  onSelect,
  onEdit,
  onDelete,
  onTogglePin,
}: ProjectGridProps) {
  if (projects.length === 0) {
    return (
      <div className="p-10 rounded-2xl border border-[#222e4a] bg-[#0e1526]/70 text-center text-sm text-[#9baac5]">
        Nenhum projeto encontrado para os filtros selecionados.
      </div>
    );
  }

  return (
    <div
      className={
        viewMode === "list"
          ? "grid grid-cols-1 gap-3.5"
          : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5"
      }
    >
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          onTogglePin={onTogglePin}
        />
      ))}
    </div>
  );
}
