export type MaintenanceSeverity = "critical" | "warning" | "info";
export interface MaintenanceFinding {
  id: string;
  title: string;
  severity: MaintenanceSeverity;
  category: "deploy" | "synchronization" | "repository" | "documentation" | "operations";
  evidence: string;
  confidence: "confirmed" | "possible";
  recurrence: number;
  steps: string[];
  commands: string[];
  source: string;
}
export interface MaintenanceAnalysis {
  id: string;
  projectId: string;
  projectName: string;
  createdAt: string;
  method: "rules" | "ai";
  summary: string;
  findings: MaintenanceFinding[];
  aiAdvice: string | null;
  sourceNote: string;
}
