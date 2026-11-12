export type RecommendationStatus = "open" | "investigating" | "resolved";
export type RecommendationSeverity = "critical" | "warning" | "info";

export interface TelemetryRecommendation {
  id: string;
  projectId: string | null;
  projectName: string | null;
  category: "deploy" | "repository" | "sync" | "documentation";
  severity: RecommendationSeverity;
  status: RecommendationStatus;
  title: string;
  evidence: string;
  action: string;
  href: string | null;
  detectedAt: string;
  kind?: "confirmed_issue" | "preventive_suggestion";
  probableCause?: string;
  steps?: string[];
  commands?: string[];
}

export interface TelemetryEvent {
  id: string;
  type: "sync" | "commit" | "deployment";
  title: string;
  detail: string;
  occurredAt: string;
  projectId?: string;
}

export interface TelemetryPayload {
  generatedAt: string;
  sourceLabel: string;
  summary: {
    projects: number;
    deploymentsWithError: number;
    open: number;
    investigating: number;
    resolved: number;
    lastSyncAt: string | null;
  };
  recommendations: TelemetryRecommendation[];
  events: TelemetryEvent[];
  projects: { id: string; name: string }[];
}
