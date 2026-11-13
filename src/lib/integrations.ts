import dns from "node:dns";
import { getSql, ensureSchema } from "@/lib/db";
import {
  IntegrationConfigStatus,
  ProjectSource,
  ProjectState,
  VercelDeploymentLink,
} from "@/types/project";

// Avoid IPv6 connection timeouts on Windows / Node 24 when calling external APIs
dns.setDefaultResultOrder("ipv4first");

export function getIntegrationStatus(): IntegrationConfigStatus {
  const syncKey = process.env.DASHBOARD_SYNC_KEY?.trim() || "";
  const ghToken = process.env.GITHUB_TOKEN?.trim() || "";
  const ghUser = process.env.GITHUB_USERNAME?.trim() || "";
  const glToken = process.env.GITLAB_TOKEN?.trim() || "";
  const glUser = process.env.GITLAB_USERNAME?.trim() || "";

  const v1Name =
    process.env.VERCEL_ACCOUNT_1_NAME?.trim() || "Vercel — Conta 1";
  const v1Token =
    process.env.VERCEL_TOKEN_1?.trim() || process.env.VERCEL_TOKEN?.trim() || "";
  const v1Team =
    process.env.VERCEL_TEAM_ID_1?.trim() ||
    process.env.VERCEL_TEAM_ID?.trim() ||
    "";

  const v2Name =
    process.env.VERCEL_ACCOUNT_2_NAME?.trim() || "Vercel — Conta 2";
  const v2Token = process.env.VERCEL_TOKEN_2?.trim() || "";
  const v2Team = process.env.VERCEL_TEAM_ID_2?.trim() || "";

  const dbUrl = process.env.DATABASE_URL?.trim() || "";

  return {
    requiresSyncKey: Boolean(syncKey),
    github: {
      configured: Boolean(ghToken || ghUser),
      mode: ghToken ? "token" : ghUser ? "username" : "none",
      label: ghToken
        ? "Token API (Públicos + Privados)"
        : ghUser
        ? `Públicos (@${ghUser})`
        : "A conectar (.env)",
    },
    gitlab: {
      configured: Boolean(glToken || glUser),
      mode: glToken ? "token" : glUser ? "username" : "none",
      label: glToken
        ? "Token API (Públicos + Privados)"
        : glUser
        ? `Públicos (@${glUser})`
        : "A conectar (.env)",
    },
    vercel1: {
      configured: Boolean(v1Token),
      accountName: v1Name,
      hasTeamId: Boolean(v1Team),
      label: v1Token
        ? `${v1Name}${v1Team ? " (Team)" : " (Pessoal)"}`
        : "A conectar (.env)",
    },
    vercel2: {
      configured: Boolean(v2Token),
      accountName: v2Name,
      hasTeamId: Boolean(v2Team),
      label: v2Token
        ? `${v2Name}${v2Team ? " (Team)" : " (Pessoal)"}`
        : "A conectar (.env)",
    },
    database: {
      configured: Boolean(dbUrl),
    },
  };
}

interface RawRepo {
  external_id: string;
  name: string;
  repoKey: string;
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
  tags: string[];
}

interface VercelProjectData {
  id: string;
  sourceKey: "vercel1" | "vercel2";
  accountLabel: string;
  name: string;
  framework: string;
  deployUrl: string;
  deployStatus: string;
  updatedAt: string | null;
  repoKey: string;
  linkedRepoId?: string;
}

function normalizeRepoPath(value: string): string {
  if (!value) return "";
  try {
    return new URL(value).pathname
      .toLowerCase()
      .replace(/\.git$/, "")
      .replace(/\/$/, "")
      .replace(/^\//, "");
  } catch {
    return String(value)
      .toLowerCase()
      .replace(/^https?:\/\/[^/]+\//, "")
      .replace(/\.git$/, "")
      .replace(/\/$/, "");
  }
}

function normalizeName(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function formatFrameworkTech(
  fw: string | null | undefined,
  fallback = "Não informada"
): string {
  if (!fw) return fallback;
  const map: Record<string, string> = {
    nextjs: "Next.js",
    vite: "Vite",
    create_react_app: "React",
    astro: "Astro",
    nuxtjs: "Nuxt",
    sveltekit: "SvelteKit",
    svelte: "Svelte",
    remix: "Remix",
    gatsby: "Gatsby",
    angular: "Angular",
    vue: "Vue.js",
    python: "Python",
    fastapi: "FastAPI",
    other: fallback,
  };
  return map[fw.toLowerCase()] || fw;
}

async function fetchGitHubRepos(): Promise<{
  repos: RawRepo[];
  error?: string;
}> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const username = process.env.GITHUB_USERNAME?.trim();

  if (!token && !username) {
    return { repos: [] };
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "DevCentral-Dashboard",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const all: any[] = [];
    for (let page = 1; page <= 5; page++) {
      const endpoint = token
        ? `https://api.github.com/user/repos?sort=updated&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`
        : `https://api.github.com/users/${encodeURIComponent(
            username!
          )}/repos?sort=updated&per_page=100&page=${page}`;

      const res = await fetch(endpoint, { headers, cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        return {
          repos: [],
          error: `GitHub API (${res.status}): ${text.slice(0, 140)}`,
        };
      }
      const data = await res.json();
      if (!Array.isArray(data)) break;
      all.push(...data);
      if (data.length < 100) break;
    }

    const repos: RawRepo[] = all.map((r: any) => {
      const homepage =
        typeof r.homepage === "string" && r.homepage.startsWith("http")
          ? r.homepage.trim()
          : "";
      const isArchived = Boolean(r.archived);
      const state: ProjectState = isArchived
        ? "archived"
        : homepage
        ? "online"
        : "dev";

      return {
        external_id: `github:${r.id}`,
        name: String(r.name || "Sem nome"),
        repoKey: normalizeRepoPath(r.full_name || r.html_url || ""),
        description: String(r.description || ""),
        tech: String(r.language || "Não informada"),
        source: "GitHub",
        repo_url: String(r.html_url || ""),
        deploy_url: homepage,
        state,
        visibility: r.private ? "private" : "public",
        default_branch: String(r.default_branch || "main"),
        stars: Number(r.stargazers_count || 0),
        forks: Number(r.forks_count || 0),
        open_issues: Number(r.open_issues_count || 0),
        framework: "",
        vercel_project_id: "",
        vercel_accounts: [],
        deployments: [],
        last_commit_at: r.pushed_at || r.updated_at || null,
        last_deploy_status: homepage ? "READY" : "",
        tags: Array.isArray(r.topics) ? r.topics.slice(0, 6) : [],
      };
    });

    return { repos };
  } catch (err: any) {
    return {
      repos: [],
      error: `Erro ao conectar ao GitHub: ${err?.message || err}`,
    };
  }
}

async function fetchGitLabProjects(): Promise<{
  repos: RawRepo[];
  error?: string;
}> {
  const token = process.env.GITLAB_TOKEN?.trim();
  const username = process.env.GITLAB_USERNAME?.trim();
  const baseUrl = (
    process.env.GITLAB_BASE_URL?.trim() || "https://gitlab.com"
  ).replace(/\/+$/, "");

  if (!token && !username) {
    return { repos: [] };
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (token) {
      headers["PRIVATE-TOKEN"] = token;
    }

    const all: any[] = [];
    const seenIds = new Set<number>();
    for (let page = 1; page <= 5; page++) {
      const endpoint = token
        ? `${baseUrl}/api/v4/projects?membership=true&simple=false&order_by=last_activity_at&sort=desc&per_page=100&page=${page}`
        : `${baseUrl}/api/v4/users/${encodeURIComponent(
            username!
          )}/projects?order_by=last_activity_at&sort=desc&per_page=100&page=${page}`;

      const res = await fetch(endpoint, { headers, cache: "no-store" });
      if (!res.ok) {
        const text = await res.text();
        return {
          repos: [],
          error: `GitLab API (${res.status}): ${text.slice(0, 140)}`,
        };
      }
      const data = await res.json();
      if (!Array.isArray(data)) break;
      for (const item of data) {
        if (item?.id && !seenIds.has(Number(item.id))) {
          seenIds.add(Number(item.id));
          all.push(item);
        }
      }
      if (data.length < 100) break;
    }

    if (token && username) {
      try {
        const userEndpoint = `${baseUrl}/api/v4/users/${encodeURIComponent(
          username
        )}/projects?order_by=last_activity_at&sort=desc&per_page=100`;
        const userRes = await fetch(userEndpoint, { headers, cache: "no-store" });
        if (userRes.ok) {
          const userData = await userRes.json();
          if (Array.isArray(userData)) {
            for (const item of userData) {
              if (item?.id && !seenIds.has(Number(item.id))) {
                seenIds.add(Number(item.id));
                all.push(item);
              }
            }
          }
        }
      } catch {
        // ignore supplementary user lookup errors
      }
    }

    // Fetch top language for first 25 projects in parallel
    const repos: RawRepo[] = await Promise.all(
      all.map(async (p: any, idx: number) => {
        let detectedLang = "";
        if (idx < 25) {
          try {
            const langRes = await fetch(
              `${baseUrl}/api/v4/projects/${p.id}/languages`,
              { headers, cache: "no-store" }
            );
            if (langRes.ok) {
              const langObj = await langRes.json();
              const top = Object.entries(langObj || {}).sort(
                (a: any, b: any) => Number(b[1]) - Number(a[1])
              )[0];
              if (top?.[0]) detectedLang = top[0];
            }
          } catch {
            // ignore
          }
        }

        const topics: string[] = Array.isArray(p.topics)
          ? p.topics
          : Array.isArray(p.tag_list)
          ? p.tag_list
          : [];

        const isArchived = Boolean(p.archived);
        const websiteUrl =
          typeof p.website_url === "string" && p.website_url.startsWith("http")
            ? p.website_url.trim()
            : "";

        return {
          external_id: `gitlab:${p.id}`,
          name: String(p.name || "Sem nome"),
          repoKey: normalizeRepoPath(p.path_with_namespace || p.web_url || ""),
          description: String(p.description || ""),
          tech: detectedLang || topics[0] || "Não informada",
          source: "GitLab",
          repo_url: String(p.web_url || ""),
          deploy_url: websiteUrl,
          state: isArchived ? "archived" : websiteUrl ? "online" : "dev",
          visibility: p.visibility === "public" ? "public" : "private",
          default_branch: String(p.default_branch || "main"),
          stars: Number(p.star_count || 0),
          forks: Number(p.forks_count || 0),
          open_issues: Number(p.open_issues_count || 0),
          framework: "",
          vercel_project_id: "",
          vercel_accounts: [],
          deployments: [],
          last_commit_at: p.last_activity_at || p.updated_at || null,
          last_deploy_status: websiteUrl ? "READY" : "",
          tags: topics.slice(0, 6),
        };
      })
    );

    return { repos };
  } catch (err: any) {
    return {
      repos: [],
      error: `Erro ao conectar ao GitLab: ${err?.message || err}`,
    };
  }
}

function extractVercelDeployUrl(vp: any): string {
  const production = vp.targets?.production;
  const aliases = production?.alias || production?.aliases || [];
  const alias = Array.isArray(aliases) ? aliases[0] : aliases;
  if (typeof alias === "string" && alias) {
    return alias.startsWith("http") ? alias : `https://${alias}`;
  }
  const prodDep = Array.isArray(vp.latestDeployments)
    ? vp.latestDeployments.find((d: any) => d.target === "production") ||
      vp.latestDeployments[0]
    : null;
  if (prodDep?.alias?.length) {
    const a0 = prodDep.alias[0];
    return a0.startsWith("http") ? a0 : `https://${a0}`;
  }
  if (prodDep?.url) {
    return prodDep.url.startsWith("http")
      ? prodDep.url
      : `https://${prodDep.url}`;
  }
  if (production?.url) {
    return production.url.startsWith("http")
      ? production.url
      : `https://${production.url}`;
  }
  return "";
}

async function fetchSingleVercelAccount(account: {
  key: "vercel1" | "vercel2";
  label: string;
  token: string;
  teamId: string;
}): Promise<{ projects: VercelProjectData[]; error?: string }> {
  if (!account.token) {
    return { projects: [] };
  }

  try {
    const all: any[] = [];
    let cursor = "";

    for (let page = 1; page <= 10; page++) {
      const buildUrl = (useTeamParam: "teamId" | "slug" | "none") => {
        const u = new URL("https://api.vercel.com/v9/projects");
        u.searchParams.set("limit", "100");
        if (account.teamId && useTeamParam === "teamId") {
          u.searchParams.set("teamId", account.teamId);
        } else if (account.teamId && useTeamParam === "slug") {
          u.searchParams.set("slug", account.teamId.toLowerCase());
        }
        if (cursor) {
          u.searchParams.set("from", cursor);
        }
        return u.toString();
      };

      // Scoped Vercel tokens (vcp_...) already point to their team/account when no teamId is passed.
      // Only pass teamId initially if it is an explicit "team_..." ID; otherwise try default token scope first, then fallback to slug.
      const initialMode =
        account.teamId && account.teamId.startsWith("team_")
          ? "teamId"
          : "none";

      let res = await fetch(buildUrl(initialMode), {
        headers: {
          Authorization: `Bearer ${account.token}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });

      // Fallback if needed
      if (!res.ok && account.teamId && initialMode === "none") {
        res = await fetch(buildUrl("slug"), {
          headers: {
            Authorization: `Bearer ${account.token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        });
      } else if (!res.ok && initialMode === "teamId") {
        res = await fetch(buildUrl("none"), {
          headers: {
            Authorization: `Bearer ${account.token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        });
      }

      if (!res.ok) {
        const text = await res.text();
        return {
          projects: [],
          error: `${account.label} (${res.status}): ${text.slice(0, 140)}`,
        };
      }

      const data = await res.json();
      const pageList = Array.isArray(data?.projects) ? data.projects : [];
      all.push(...pageList);

      if (!data?.pagination?.next || pageList.length === 0) break;
      cursor = String(data.pagination.next);
    }

    const projects: VercelProjectData[] = all.map((vp: any) => {
      const deployUrl = extractVercelDeployUrl(vp);
      const prodTarget = vp.targets?.production;
      const latestDep = Array.isArray(vp.latestDeployments)
        ? vp.latestDeployments[0]
        : null;
      const deployStatus = String(
        prodTarget?.readyState ||
          latestDep?.readyState ||
          (deployUrl ? "READY" : "")
      ).toUpperCase();

      const repo = vp.link?.repo || vp.gitRepository?.repo || "";
      const owner =
        vp.link?.org || vp.link?.owner || vp.gitRepository?.owner || "";
      const repoKey = normalizeRepoPath(
        repo.includes("/") ? repo : owner && repo ? `${owner}/${repo}` : repo
      );
      const linkedRepoId = vp.link?.repoId
        ? String(vp.link.repoId)
        : vp.link?.projectId
        ? String(vp.link.projectId)
        : undefined;

      return {
        id: String(vp.id),
        sourceKey: account.key,
        accountLabel: account.label,
        name: String(vp.name || ""),
        framework: String(vp.framework || ""),
        deployUrl,
        deployStatus,
        updatedAt: vp.updatedAt ? new Date(vp.updatedAt).toISOString() : null,
        repoKey,
        linkedRepoId,
      };
    });

    return { projects };
  } catch (err: any) {
    return {
      projects: [],
      error: `Erro em ${account.label}: ${err?.message || err}`,
    };
  }
}

export async function runFullSync() {
  await ensureSchema();
  const sql = getSql();

  const account1 = {
    key: "vercel1" as const,
    label: process.env.VERCEL_ACCOUNT_1_NAME?.trim() || "Vercel 1",
    token:
      process.env.VERCEL_TOKEN_1?.trim() ||
      process.env.VERCEL_TOKEN?.trim() ||
      "",
    teamId:
      process.env.VERCEL_TEAM_ID_1?.trim() ||
      process.env.VERCEL_TEAM_ID?.trim() ||
      "",
  };

  const account2 = {
    key: "vercel2" as const,
    label: process.env.VERCEL_ACCOUNT_2_NAME?.trim() || "Vercel 2",
    token: process.env.VERCEL_TOKEN_2?.trim() || "",
    teamId: process.env.VERCEL_TEAM_ID_2?.trim() || "",
  };

  const [ghResult, glResult, v1Result, v2Result] = await Promise.all([
    fetchGitHubRepos(),
    fetchGitLabProjects(),
    fetchSingleVercelAccount(account1),
    fetchSingleVercelAccount(account2),
  ]);

  const errors: string[] = [];
  if (ghResult.error) errors.push(ghResult.error);
  if (glResult.error) errors.push(glResult.error);
  if (v1Result.error) errors.push(v1Result.error);
  if (v2Result.error) errors.push(v2Result.error);

  const allRepos: RawRepo[] = [...ghResult.repos, ...glResult.repos];
  const allVercel: VercelProjectData[] = [
    ...v1Result.projects,
    ...v2Result.projects,
  ];
  const matchedVercelKeys = new Set<string>();

  const attachVercelToRepo = (target: RawRepo, vp: VercelProjectData) => {
    const depEntry: VercelDeploymentLink = {
      account: vp.accountLabel,
      sourceKey: vp.sourceKey,
      url: vp.deployUrl,
      vercelProjectId: vp.id,
      status: vp.deployStatus,
    };
    const isFirstVercelAttach = !target.vercel_project_id;
    const isBetterReadyDeploy =
      vp.deployStatus === "READY" && target.last_deploy_status !== "READY";

    target.deployments = [...target.deployments, depEntry];
    if (
      vp.deployUrl &&
      (!target.deploy_url || isFirstVercelAttach || isBetterReadyDeploy)
    ) {
      target.deploy_url = vp.deployUrl;
    }
    if (isFirstVercelAttach || isBetterReadyDeploy) {
      target.vercel_project_id = vp.id;
    }
    if (vp.deployStatus && (isFirstVercelAttach || isBetterReadyDeploy || !target.last_deploy_status)) {
      target.last_deploy_status = vp.deployStatus;
    }
    if (vp.framework) {
      target.framework = vp.framework;
      if (target.tech === "Não informada") {
        target.tech = formatFrameworkTech(vp.framework, target.tech);
      }
    }
    if (vp.deployUrl && target.state !== "archived") {
      target.state = "online";
    }
    if (!target.vercel_accounts.includes(vp.accountLabel)) {
      target.vercel_accounts = [...target.vercel_accounts, vp.accountLabel];
    }
  };

  // Pass 1: Correlate Vercel projects that have an explicit repository link (byRepoKey or byRepoId)
  for (const vp of allVercel) {
    const uniqueKey = `${vp.sourceKey}:${vp.id}`;
    const byRepoKey = vp.repoKey
      ? allRepos.filter((r) => r.repoKey && r.repoKey === vp.repoKey)
      : [];
    const byRepoId =
      byRepoKey.length === 0 && vp.linkedRepoId
        ? allRepos.filter(
            (r) =>
              r.external_id === `github:${vp.linkedRepoId}` ||
              r.external_id === `gitlab:${vp.linkedRepoId}`
          )
        : [];

    const explicitTargets = byRepoKey.length > 0 ? byRepoKey : byRepoId;
    if (explicitTargets.length > 0) {
      matchedVercelKeys.add(uniqueKey);
      for (const target of explicitTargets) {
        attachVercelToRepo(target, vp);
      }
      // Also attach to any repository whose normalized name matches vp.name (e.g., safesaff on GitHub/GitLab when Vercel safesaff points to safsafe)
      for (const sameNameRepo of allRepos) {
        if (
          !explicitTargets.includes(sameNameRepo) &&
          normalizeName(sameNameRepo.name) === normalizeName(vp.name) &&
          !sameNameRepo.deploy_url
        ) {
          attachVercelToRepo(sameNameRepo, vp);
        }
      }
    }
  }

  // Pass 2: Correlate remaining unlinked Vercel projects by normalized name ONLY if the repo has no Vercel deploy yet
  for (const vp of allVercel) {
    const uniqueKey = `${vp.sourceKey}:${vp.id}`;
    if (matchedVercelKeys.has(uniqueKey)) continue;

    const matchingRepos = allRepos.filter(
      (r) => normalizeName(r.name) === normalizeName(vp.name)
    );
    const unattachedTargets = matchingRepos.filter(
      (r) => r.deployments.length === 0
    );

    if (unattachedTargets.length > 0) {
      matchedVercelKeys.add(uniqueKey);
      for (const target of unattachedTargets) {
        attachVercelToRepo(target, vp);
      }
    } else if (
      matchingRepos.length > 0 &&
      vp.deployUrl &&
      vp.deployStatus === "READY"
    ) {
      // If the repo already has an explicit link that failed (ERROR), update the repo's primary URL to the READY one while STILL keeping the standalone Vercel app visible
      for (const target of matchingRepos) {
        if (target.last_deploy_status !== "READY") {
          target.deploy_url = vp.deployUrl;
          target.last_deploy_status = "READY";
          if (target.state !== "archived") target.state = "online";
        }
      }
    }
  }

  // Pass 3: Propagate online deploy URL between mirror repositories (e.g., GitHub <-> GitLab with identical normalized name)
  for (const repo of allRepos) {
    if (repo.deploy_url) continue;
    const donor = allRepos.find(
      (other) =>
        other !== repo &&
        normalizeName(other.name) === normalizeName(repo.name) &&
        Boolean(other.deploy_url)
    );
    if (donor) {
      repo.deploy_url = donor.deploy_url;
      if (repo.state !== "archived") repo.state = "online";
      if (!repo.last_deploy_status && donor.last_deploy_status) {
        repo.last_deploy_status = donor.last_deploy_status;
      }
      if (repo.vercel_accounts.length === 0 && donor.vercel_accounts.length > 0) {
        repo.vercel_accounts = [...donor.vercel_accounts];
      }
      if (repo.deployments.length === 0 && donor.deployments.length > 0) {
        repo.deployments = [...donor.deployments];
      }
    }
  }

  // Add standalone Vercel projects (from either Account 1 or Account 2) that didn't match a repo
  for (const vp of allVercel) {
    const uniqueKey = `${vp.sourceKey}:${vp.id}`;
    if (matchedVercelKeys.has(uniqueKey)) continue;

    allRepos.push({
      external_id: `vercel:${vp.sourceKey}:${vp.id}`,
      name: vp.name,
      repoKey: vp.repoKey,
      description: vp.framework
        ? `Projeto Vercel (${vp.framework}) — ${vp.accountLabel}`
        : `Projeto hospedado na ${vp.accountLabel}`,
      tech: formatFrameworkTech(vp.framework, "Next.js / Web"),
      source: "Vercel",
      repo_url: "",
      deploy_url: vp.deployUrl,
      state: vp.deployUrl ? "online" : "dev",
      visibility: vp.deployUrl ? "public" : "private",
      default_branch: "main",
      stars: 0,
      forks: 0,
      open_issues: 0,
      framework: vp.framework,
      vercel_project_id: vp.id,
      vercel_accounts: [vp.accountLabel],
      deployments: [
        {
          account: vp.accountLabel,
          sourceKey: vp.sourceKey,
          url: vp.deployUrl,
          vercelProjectId: vp.id,
          status: vp.deployStatus,
        },
      ],
      last_commit_at: vp.updatedAt,
      last_deploy_status: vp.deployStatus,
      tags: [vp.accountLabel, vp.framework].filter(Boolean),
    });
  }

  let upsertedCount = 0;
  for (const item of allRepos) {
    const id = item.external_id.replace(/:/g, "-");
    const deploymentsJson = JSON.stringify(item.deployments || []);

    await sql`
      INSERT INTO projects (
        id, external_id, name, description, tech, source, repo_url, deploy_url,
        state, visibility, default_branch, stars, forks, open_issues,
        framework, vercel_project_id, vercel_accounts, deployments,
        last_commit_at, last_deploy_status, is_manual, tags, updated_at
      ) VALUES (
        ${id},
        ${item.external_id},
        ${item.name},
        ${item.description},
        ${item.tech},
        ${item.source},
        ${item.repo_url},
        ${item.deploy_url},
        ${item.state},
        ${item.visibility},
        ${item.default_branch},
        ${item.stars},
        ${item.forks},
        ${item.open_issues},
        ${item.framework},
        ${item.vercel_project_id},
        ${item.vercel_accounts},
        ${deploymentsJson}::jsonb,
        ${item.last_commit_at},
        ${item.last_deploy_status},
        false,
        ${item.tags},
        NOW()
      )
      ON CONFLICT (external_id) DO UPDATE SET
        name = CASE WHEN projects.custom_override THEN projects.name ELSE EXCLUDED.name END,
        description = CASE WHEN projects.custom_override AND projects.description <> '' THEN projects.description ELSE EXCLUDED.description END,
        tech = CASE WHEN projects.custom_override THEN projects.tech ELSE EXCLUDED.tech END,
        repo_url = CASE WHEN EXCLUDED.repo_url <> '' THEN EXCLUDED.repo_url ELSE projects.repo_url END,
        deploy_url = CASE WHEN projects.custom_override AND projects.deploy_url <> '' THEN projects.deploy_url WHEN EXCLUDED.deploy_url <> '' THEN EXCLUDED.deploy_url ELSE projects.deploy_url END,
        state = CASE WHEN projects.custom_override THEN projects.state ELSE EXCLUDED.state END,
        visibility = EXCLUDED.visibility,
        default_branch = EXCLUDED.default_branch,
        stars = EXCLUDED.stars,
        forks = EXCLUDED.forks,
        open_issues = EXCLUDED.open_issues,
        framework = CASE WHEN EXCLUDED.framework <> '' THEN EXCLUDED.framework ELSE projects.framework END,
        vercel_project_id = CASE WHEN EXCLUDED.vercel_project_id <> '' THEN EXCLUDED.vercel_project_id ELSE projects.vercel_project_id END,
        vercel_accounts = EXCLUDED.vercel_accounts,
        deployments = EXCLUDED.deployments,
        last_commit_at = COALESCE(EXCLUDED.last_commit_at, projects.last_commit_at),
        last_deploy_status = CASE WHEN EXCLUDED.last_deploy_status <> '' THEN EXCLUDED.last_deploy_status ELSE projects.last_deploy_status END,
        tags = CASE WHEN projects.custom_override THEN projects.tags ELSE EXCLUDED.tags END,
        updated_at = NOW();
    `;
    upsertedCount++;
  }

  const totalVercel = v1Result.projects.length + v2Result.projects.length;
  const status =
    errors.length > 0
      ? upsertedCount > 0
        ? "partial"
        : "error"
      : "success";

  const details =
    errors.length > 0
      ? errors.join(" | ")
      : `Sincronizados: ${ghResult.repos.length} GitHub, ${glResult.repos.length} GitLab, ${v1Result.projects.length} ${account1.label} e ${v2Result.projects.length} ${account2.label}.`;

  await sql`
    INSERT INTO sync_logs (
      github_count, gitlab_count, vercel_count, vercel1_count, vercel2_count, status, details
    )
    VALUES (
      ${ghResult.repos.length},
      ${glResult.repos.length},
      ${totalVercel},
      ${v1Result.projects.length},
      ${v2Result.projects.length},
      ${status},
      ${details}
    )
  `;

  return {
    githubCount: ghResult.repos.length,
    gitlabCount: glResult.repos.length,
    vercel1Count: v1Result.projects.length,
    vercel2Count: v2Result.projects.length,
    vercelCount: totalVercel,
    upsertedCount,
    status,
    details,
    errors,
  };
}
