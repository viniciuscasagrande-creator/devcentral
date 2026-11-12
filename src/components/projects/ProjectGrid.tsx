"use client";

import React from "react";
import { Project } from "@/types/project";
import { ProjectCard } from "./ProjectCard";

interface ProjectGridProps {
  projects: Project[];
  onSelect: (project: Project) => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onTogglePin: (project: Project) => void;
}

export function ProjectGrid({
  projects,
  onSelect,
  onEdit,
  onDelete,
  onTogglePin,
}: ProjectGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
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
