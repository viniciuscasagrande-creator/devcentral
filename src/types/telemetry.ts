export type RecommendationStatus = "open" | "investigating" | "resolved";
export type RecommendationSeverity = "critical" | "warning" | "info";
export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface ProposedCodeChange {
  filename: string;
  language: string;
  description: string;
  snippet: string;
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface ProjectTask {
  id: string;
  projectId: string | null;
  projectName: string;
  recommendationId?: string | null;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignee?: string | null;
  dueDate?: string | null;
  checklist?: TaskChecklistItem[];
  notes?: string | null;
  issueUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectOperationalInspection {
  projectId: string;
  projectName: string;
  inspectedAt: string;
  readOnly: true;
  httpCheck: {
    checkedUrl: string;
    online: boolean;
    statusCode: number | null;
    latencyMs: number | null;
    message: string;
  };
  commits: {
    sha: string;
    message: string;
    author: string;
    date: string;
    url: string;
  }[];
  deployments: {
    id: string;
    account: string;
    url: string;
    state: string;
    createdAt: string;
    target: string;
    inspectorUrl: string;
    errorMessage?: string;
  }[];
  buildLogs: {
    timestamp: string;
    level: "info" | "warn" | "error";
    text: string;
    source: string;
  }[];
  verification: {
    previousDeployStatus: string;
    currentDeployStatus: string;
    previousState: string;
    currentState: string;
    canCloseAlert: boolean;
    summary: string;
  };
}

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
  proposedCode?: ProposedCodeChange;
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
    staleRepos?: number;
    lastSyncAt: string | null;
  };
  recommendations: TelemetryRecommendation[];
  events: TelemetryEvent[];
  tasks?: ProjectTask[];
  projects: { id: string; name: string }[];
}

