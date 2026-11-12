import { neon } from "@neondatabase/serverless";
import { Project, SyncLog, VercelDeploymentLink } from "@/types/project";

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "A variável de ambiente DATABASE_URL não está configurada no arquivo .env.local"
    );
  }
  return neon(url);
}

let initialized = false;

export async function ensureSchema() {
  if (initialized) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      external_id TEXT UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      tech TEXT NOT NULL DEFAULT 'Outro',
      source TEXT NOT NULL DEFAULT 'GitHub',
      repo_url TEXT DEFAULT '',
      deploy_url TEXT DEFAULT '',
      state TEXT NOT NULL DEFAULT 'dev',
      visibility TEXT DEFAULT 'public',
      default_branch TEXT DEFAULT 'main',
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      open_issues INTEGER DEFAULT 0,
      framework TEXT DEFAULT '',
      vercel_project_id TEXT DEFAULT '',
      vercel_accounts TEXT[] DEFAULT '{}',
      deployments JSONB DEFAULT '[]'::jsonb,
      last_commit_at TIMESTAMPTZ,
      last_deploy_status TEXT DEFAULT '',
      is_manual BOOLEAN NOT NULL DEFAULT false,
      is_pinned BOOLEAN NOT NULL DEFAULT false,
      is_hidden BOOLEAN NOT NULL DEFAULT false,
      custom_override BOOLEAN NOT NULL DEFAULT false,
      custom_notes TEXT DEFAULT '',
      local_path TEXT DEFAULT '',
      tags TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id SERIAL PRIMARY KEY,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      github_count INTEGER DEFAULT 0,
      gitlab_count INTEGER DEFAULT 0,
      vercel_count INTEGER DEFAULT 0,
      vercel1_count INTEGER DEFAULT 0,
      vercel2_count INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      details TEXT DEFAULT ''
    );
  `;
  initialized = true;
}

export async function listProjects(includeHidden = false): Promise<Project[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = includeHidden
    ? await sql`
        SELECT * FROM projects
        ORDER BY is_pinned DESC, COALESCE(last_commit_at, updated_at) DESC, name ASC
      `
    : await sql`
        SELECT * FROM projects
        WHERE is_hidden = false
        ORDER BY is_pinned DESC, COALESCE(last_commit_at, updated_at) DESC, name ASC
      `;
  return rows.map(mapRowToProject);
}

export async function getLastSyncLog(): Promise<SyncLog | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM sync_logs
    ORDER BY synced_at DESC
    LIMIT 1
  `;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    synced_at: new Date(r.synced_at).toISOString(),
    github_count: Number(r.github_count || 0),
    gitlab_count: Number(r.gitlab_count || 0),
    vercel_count: Number(r.vercel_count || 0),
    vercel1_count: Number(r.vercel1_count || 0),
    vercel2_count: Number(r.vercel2_count || 0),
    status: String(r.status || "success"),
    details: String(r.details || ""),
  };
}

export function mapRowToProject(r: Record<string, any>): Project {
  let deployments: VercelDeploymentLink[] = [];
  if (Array.isArray(r.deployments)) {
    deployments = r.deployments;
  } else if (typeof r.deployments === "string") {
    try {
      deployments = JSON.parse(r.deployments);
    } catch {
      deployments = [];
    }
  }

  return {
    id: String(r.id),
    external_id: r.external_id ? String(r.external_id) : null,
    name: String(r.name || ""),
    description: String(r.description || ""),
    tech: String(r.tech || "Outro"),
    source: (r.source as Project["source"]) || "GitHub",
    repo_url: String(r.repo_url || ""),
    deploy_url: String(r.deploy_url || ""),
    state: (r.state as Project["state"]) || "dev",
    visibility: r.visibility === "private" ? "private" : "public",
    default_branch: String(r.default_branch || "main"),
    stars: Number(r.stars || 0),
    forks: Number(r.forks || 0),
    open_issues: Number(r.open_issues || 0),
    framework: String(r.framework || ""),
    vercel_project_id: String(r.vercel_project_id || ""),
    vercel_accounts: Array.isArray(r.vercel_accounts)
      ? r.vercel_accounts.map(String)
      : [],
    deployments,
    last_commit_at: r.last_commit_at
      ? new Date(r.last_commit_at).toISOString()
      : null,
    last_deploy_status: String(r.last_deploy_status || ""),
    is_manual: Boolean(r.is_manual),
    is_pinned: Boolean(r.is_pinned),
    is_hidden: Boolean(r.is_hidden),
    custom_override: Boolean(r.custom_override),
    custom_notes: String(r.custom_notes || ""),
    local_path: String(r.local_path || ""),
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    created_at: r.created_at
      ? new Date(r.created_at).toISOString()
      : new Date().toISOString(),
    updated_at: r.updated_at
      ? new Date(r.updated_at).toISOString()
      : new Date().toISOString(),
  };
}
