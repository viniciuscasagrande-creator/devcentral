import dns from "node:dns";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { getProjectById } from "@/lib/db";
import type { ProjectOperationalInspection } from "@/types/telemetry";

dns.setDefaultResultOrder("ipv4first");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractGitHubRepoSlug(repoUrl: string): string | null {
  try {
    const u = new URL(repoUrl);
    if (!u.hostname.includes("github.com")) return null;
    const parts = u.pathname
      .replace(/\.git$/, "")
      .split("/")
      .filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return null;
  } catch {
    return null;
  }
}

function extractGitLabProjectPath(repoUrl: string): string | null {
  try {
    const u = new URL(repoUrl);
    if (!u.hostname.includes("gitlab")) return null;
    const slug = u.pathname
      .replace(/\.git$/, "")
      .replace(/^\/+|\/+$/g, "");
    return slug || null;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { id } = await context.params;
  const project = await getProjectById(id);
  if (!project) {
    return NextResponse.json(
      { error: "Projeto não encontrado no banco Neon." },
      { status: 404 }
    );
  }

  const nowIso = new Date().toISOString();
  const buildLogs: ProjectOperationalInspection["buildLogs"] = [
    {
      timestamp: nowIso,
      level: "info",
      text: `[DevCentral Inspect] Iniciando inspeção operacional somente-leitura para "${project.name}" (${project.source}).`,
      source: "DevCentral",
    },
  ];

  // 1. Live HTTP endpoint check
  const targetUrl =
    project.deploy_url ||
    project.deployments?.find((d) => d.url)?.url ||
    "";
  let httpCheck: ProjectOperationalInspection["httpCheck"] = {
    checkedUrl: targetUrl,
    online: false,
    statusCode: null,
    latencyMs: null,
    message: "Nenhuma URL de produção cadastrada para este projeto.",
  };

  if (targetUrl && targetUrl.startsWith("http")) {
    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(targetUrl, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "DevCentral-Telemetry-Monitor/3.0" },
        cache: "no-store",
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - t0;
      const online = res.status >= 200 && res.status < 400;
      httpCheck = {
        checkedUrl: targetUrl,
        online,
        statusCode: res.status,
        latencyMs,
        message: online
          ? `Endpoint respondeu HTTP ${res.status} em ${latencyMs} ms.`
          : `Alerta: Endpoint retornou HTTP ${res.status} (${latencyMs} ms).`,
      };
      buildLogs.push({
        timestamp: new Date().toISOString(),
        level: online ? "info" : "error",
        text: `[HTTP Monitor] GET ${targetUrl} -> HTTP ${res.status} (${latencyMs} ms)`,
        source: "HTTP Check",
      });
    } catch (err: any) {
      const latencyMs = Date.now() - t0;
      httpCheck = {
        checkedUrl: targetUrl,
        online: false,
        statusCode: null,
        latencyMs,
        message: `Falha de conexão ao verificar ${targetUrl}: ${err?.message || "timeout"}`,
      };
      buildLogs.push({
        timestamp: new Date().toISOString(),
        level: "error",
        text: `[HTTP Monitor] Falha ao conectar em ${targetUrl}: ${err?.message || "timeout"}`,
        source: "HTTP Check",
      });
    }
  } else {
    buildLogs.push({
      timestamp: nowIso,
      level: "warn",
      text: `[HTTP Monitor] Projeto sem URL HTTPS de deploy configurada.`,
      source: "HTTP Check",
    });
  }

  // 2. Live Recent Commits (GitHub / GitLab)
  const commits: ProjectOperationalInspection["commits"] = [];
  const ghSlug = project.repo_url ? extractGitHubRepoSlug(project.repo_url) : null;
  const glPath = project.repo_url ? extractGitLabProjectPath(project.repo_url) : null;

  if (ghSlug) {
    try {
      const ghToken = process.env.GITHUB_TOKEN?.trim();
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "DevCentral-Dashboard",
      };
      if (ghToken) headers.Authorization = `Bearer ${ghToken}`;
      const res = await fetch(
        `https://api.github.com/repos/${ghSlug}/commits?per_page=5`,
        { headers, cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const c of data) {
            commits.push({
              sha: String(c.sha || "").slice(0, 7),
              message: String(c.commit?.message || "").split("\n")[0],
              author: String(
                c.commit?.author?.name || c.author?.login || "Autor"
              ),
              date: c.commit?.author?.date || nowIso,
              url: String(c.html_url || project.repo_url),
            });
          }
          buildLogs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            text: `[GitHub API] Carregados ${commits.length} commits recentes de ${ghSlug} (último: ${commits[0]?.sha || "-"} "${commits[0]?.message || ""}").`,
            source: "GitHub",
          });
        }
      } else {
        buildLogs.push({
          timestamp: new Date().toISOString(),
          level: "warn",
          text: `[GitHub API] Repositório ${ghSlug} retornou HTTP ${res.status} ao consultar commits.`,
          source: "GitHub",
        });
      }
    } catch (err: any) {
      buildLogs.push({
        timestamp: new Date().toISOString(),
        level: "warn",
        text: `[GitHub API] Erro ao consultar commits: ${err?.message || err}`,
        source: "GitHub",
      });
    }
  } else if (glPath) {
    try {
      const glToken = process.env.GITLAB_TOKEN?.trim();
      const baseUrl = (
        process.env.GITLAB_BASE_URL?.trim() || "https://gitlab.com"
      ).replace(/\/+$/, "");
      const headers: Record<string, string> = { Accept: "application/json" };
      if (glToken) headers["PRIVATE-TOKEN"] = glToken;
      const res = await fetch(
        `${baseUrl}/api/v4/projects/${encodeURIComponent(glPath)}/repository/commits?per_page=5`,
        { headers, cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          for (const c of data) {
            commits.push({
              sha: String(c.short_id || c.id || "").slice(0, 7),
              message: String(c.title || c.message || "").split("\n")[0],
              author: String(c.author_name || "Autor"),
              date: c.created_at || c.committed_date || nowIso,
              url: String(c.web_url || project.repo_url),
            });
          }
          buildLogs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            text: `[GitLab API] Carregados ${commits.length} commits recentes de ${glPath}.`,
            source: "GitLab",
          });
        }
      }
    } catch {
      // ignore
    }
  } else {
    buildLogs.push({
      timestamp: nowIso,
      level: "warn",
      text: `[Git Check] Projeto não possui URL de repositório GitHub/GitLab vinculada.`,
      source: "Git",
    });
  }

  // 3. Live Vercel Deployments & Build Logs
  const deployments: ProjectOperationalInspection["deployments"] = [];
  const v1Token =
    process.env.VERCEL_TOKEN_1?.trim() || process.env.VERCEL_TOKEN?.trim() || "";
  const v1Name = process.env.VERCEL_ACCOUNT_1_NAME?.trim() || "Vercel 1";
  const v2Token = process.env.VERCEL_TOKEN_2?.trim() || "";
  const v2Name = process.env.VERCEL_ACCOUNT_2_NAME?.trim() || "Vercel 2";

  const candidateLinks =
    project.deployments && project.deployments.length > 0
      ? project.deployments
      : project.vercel_project_id
        ? [
            {
              account: project.vercel_accounts?.[0] || v2Name,
              sourceKey: (project.vercel_accounts?.[0] === v1Name
                ? "vercel1"
                : "vercel2") as "vercel1" | "vercel2",
              url: project.deploy_url,
              vercelProjectId: project.vercel_project_id,
              status: project.last_deploy_status || "READY",
            },
          ]
        : [];

  for (const link of candidateLinks) {
    const isV1 =
      link.sourceKey === "vercel1" || link.account === v1Name;
    const token = isV1 ? v1Token : v2Token;
    const accountLabel = link.account || (isV1 ? v1Name : v2Name);
    if (!token || !link.vercelProjectId) continue;

    try {
      const depRes = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(link.vercelProjectId)}&limit=5`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );
      if (depRes.ok) {
        const depData = await depRes.json();
        const depList = Array.isArray(depData?.deployments)
          ? depData.deployments
          : [];
        for (const d of depList) {
          const state = String(d.readyState || d.state || "READY").toUpperCase();
          const depUrl = d.url ? `https://${d.url}` : link.url || "";
          const errMsg =
            d.errorMessage ||
            d.errorCode ||
            (state === "ERROR"
              ? "Build encerrado com código de saída diferente de zero na Vercel."
              : undefined);
          deployments.push({
            id: String(d.uid || d.id || ""),
            account: accountLabel,
            url: depUrl,
            state,
            createdAt: d.created
              ? new Date(d.created).toISOString()
              : nowIso,
            target: String(d.target || "preview"),
            inspectorUrl: String(d.inspectorUrl || depUrl),
            errorMessage: errMsg,
          });
          buildLogs.push({
            timestamp: d.created
              ? new Date(d.created).toISOString()
              : nowIso,
            level: state === "ERROR" || state === "CANCELED" ? "error" : "info",
            text: `[Vercel ${accountLabel}] Deploy ${String(d.uid || d.id || "").slice(0, 9)} (${d.target || "preview"}) -> Status: ${state}${errMsg ? ` | Erro: ${errMsg}` : ""} | URL: ${depUrl}`,
            source: accountLabel,
          });
        }

        // Fetch build events for the most recent deployment
        const latestDep = depList[0];
        const latestId = latestDep?.uid || latestDep?.id;
        if (latestId) {
          try {
            const evRes = await fetch(
              `https://api.vercel.com/v2/deployments/${encodeURIComponent(latestId)}/events?limit=25`,
              {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
              }
            );
            if (evRes.ok) {
              const evList = await evRes.json();
              if (Array.isArray(evList)) {
                for (const ev of evList.slice(-18)) {
                  const rawText = String(
                    ev?.payload?.text || ev?.text || ""
                  ).trim();
                  if (!rawText) continue;
                  const isErr =
                    /error|failed|exception|err!|exit code/i.test(rawText) ||
                    ev?.type === "stderr";
                  buildLogs.push({
                    timestamp: ev?.created
                      ? new Date(ev.created).toISOString()
                      : nowIso,
                    level: isErr ? "error" : "info",
                    text: rawText,
                    source: `Build ${String(latestId).slice(0, 7)}`,
                  });
                }
              }
            }
          } catch {
            // ignore build event fetch error
          }
        }
      }
    } catch (err: any) {
      buildLogs.push({
        timestamp: nowIso,
        level: "warn",
        text: `[Vercel ${accountLabel}] Falha ao consultar histórico de deploys: ${err?.message || err}`,
        source: accountLabel,
      });
    }
  }

  const currentDeployStatus =
    deployments[0]?.state ||
    (httpCheck.online ? "READY" : project.last_deploy_status || "UNKNOWN");
  const currentState =
    httpCheck.online || currentDeployStatus === "READY" ? "online" : project.state;

  const hasDeployFailure = /ERROR|FAILED|FAILURE|CANCELED/i.test(
    currentDeployStatus
  );
  const canCloseAlert =
    (httpCheck.online || !targetUrl) && !hasDeployFailure;

  const summary = canCloseAlert
    ? `Verificação concluída com sucesso: Deploy em estado ${currentDeployStatus}${httpCheck.online ? ` e endpoint respondendo HTTP ${httpCheck.statusCode} (${httpCheck.latencyMs} ms)` : ""}. O alerta pode ser encerrado com segurança.`
    : `Atenção: A verificação detectou pendência técnica ativa (Status de Deploy: ${currentDeployStatus}${httpCheck.checkedUrl && !httpCheck.online ? `, Endpoint indisponível: ${httpCheck.message}` : ""}). Corrija antes de encerrar o alerta.`;

  const payload: ProjectOperationalInspection = {
    projectId: project.id,
    projectName: project.name,
    inspectedAt: nowIso,
    readOnly: true,
    httpCheck,
    commits,
    deployments,
    buildLogs,
    verification: {
      previousDeployStatus: project.last_deploy_status || "N/A",
      currentDeployStatus,
      previousState: project.state,
      currentState,
      canCloseAlert,
      summary,
    },
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
