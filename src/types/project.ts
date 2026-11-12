export type ProjectSource = "GitHub" | "GitLab" | "Vercel" | "Manual";
export type ProjectState = "online" | "dev" | "archived";

export interface VercelDeploymentLink {
  account: string;
  sourceKey: "vercel1" | "vercel2" | string;
  url: string;
  vercelProjectId: string;
  status?: string;
}

export interface Project {
  id: string;
  external_id: string | null;
  name: string;
  description: string;
  tech: string;
  source: ProjectSource;
  repo_url: string;
  deploy_url: string;
  state: ProjectState;
  visibility: "public" | "private";
  default_branch: string;
  stars: number;
  forks: number;
  open_issues: number;
  framework: string;
  vercel_project_id: string;
  vercel_accounts: string[];
  deployments: VercelDeploymentLink[];
  last_commit_at: string | null;
  last_deploy_status: string;
  is_manual: boolean;
  is_pinned: boolean;
  is_hidden: boolean;
  custom_override: boolean;
  custom_notes: string;
  local_path: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: number;
  synced_at: string;
  github_count: number;
  gitlab_count: number;
  vercel_count: number;
  vercel1_count: number;
  vercel2_count: number;
  status: string;
  details: string;
}

export interface IntegrationConfigStatus {
  requiresSyncKey: boolean;
  github: {
    configured: boolean;
    mode: "token" | "username" | "none";
    label: string;
  };
  gitlab: {
    configured: boolean;
    mode: "token" | "username" | "none";
    label: string;
  };
  vercel1: {
    configured: boolean;
    accountName: string;
    hasTeamId: boolean;
    label: string;
  };
  vercel2: {
    configured: boolean;
    accountName: string;
    hasTeamId: boolean;
    label: string;
  };
  database: {
    configured: boolean;
  };
}
