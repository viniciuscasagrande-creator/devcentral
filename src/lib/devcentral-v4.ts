import "server-only";
import { getProjectById, listProjects, listProjectTasks } from "@/lib/db";
import { getHealthReport } from "@/lib/health-reports";
import { getCorrelations, parseGitHubRepository } from "@/lib/maintenance-operations";
import { listOperationalAlerts } from "@/lib/alerts";
import type { Project } from "@/types/project";

// Todas as rotinas deste módulo são somente leitura.
// Nenhuma função gera commit, altera código, aprova PR ou executa deploy.
const githubHeaders = (): HeadersInit => ({
  Accept: "application/vnd.github+json",
  "User-Agent": "DevCentral-4.0-ReadOnly",
  ...(process.env.GITHUB_TOKEN?.trim()
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN.trim()}` }
    : {}),
});

async function githubGet(path: string): Promise<unknown> {
  // O host é constante; apenas segmentos validados são interpolados.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(`https://api.github.com${path}`, {
      headers: githubHeaders(), signal: controller.signal, cache: "no-store",
    });
    if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timeout); }
}

function githubSlug(project: Project): string | null {
  const parsed = parseGitHubRepository(project.repo_url || "");
  if (!parsed) return null;
  if (![parsed.owner, parsed.repo].every(x => /^[a-zA-Z0-9_.-]{1,100}$/.test(x))) return null;
  return `${parsed.owner}/${parsed.repo}`;
}

async function resolveProject(id: string): Promise<Project> {
  if (!id || id.length > 256) throw new Error("PROJECT_INVALID");
  const project = await getProjectById(id);
  if (!project || project.is_hidden) throw new Error("PROJECT_NOT_FOUND");
  return project;
}

export async function getV4Overview() {
  const [projects, health, correlations] = await Promise.all([
    listProjects(false), getHealthReport(30), getCorrelations(),
  ]);
  return {
    projects: projects.map(p => ({ id: p.id, name: p.name, source: p.source, state: p.state, repoUrl: p.repo_url })),
    health: health.current, history: health.history,
    correlations: correlations.slice(0, 8), generatedAt: new Date().toISOString(),
    source: "Dados registrados no Neon; não representam monitoramento em tempo real contínuo.",
  };
}

export async function inspectCode(projectId: string) {
  const project = await resolveProject(projectId);
  const slug = githubSlug(project);
  if (!slug) return { projectName: project.name, supported: false, summary: "Análise de metadados disponível somente para repositórios GitHub vinculados.", checks: [] };
  const ref = encodeURIComponent(project.default_branch || "main");
  const [metadata, packageFile] = await Promise.allSettled([
    githubGet(`/repos/${slug}`),
    githubGet(`/repos/${slug}/contents/package.json?ref=${ref}`),
  ]);
  const checks: Array<{ title: string; status: "attention" | "info" | "ok"; detail: string }> = [];
  const repo = metadata.status === "fulfilled" ? metadata.value as Record<string, unknown> : null;
  if (repo) {
    checks.push({ title: "Repositório", status: "ok", detail: `GitHub: ${slug} — visibilidade ${repo.private ? "privada" : "pública"}.` });
    if (repo.archived === true) checks.push({ title: "Arquivado", status: "attention", detail: "Repositório arquivado; confirme se a manutenção deve continuar." });
    if (repo.has_issues === false) checks.push({ title: "Issues desativadas", status: "info", detail: "O rastreamento de issues está desativado neste repositório." });
    if (typeof repo.open_issues_count === "number" && repo.open_issues_count > 0)
      checks.push({ title: "Issues/PRs abertos", status: "info", detail: `${repo.open_issues_count} itens abertos registrados pelo GitHub (contagem pode incluir PRs).` });
  } else checks.push({ title: "Metadados", status: "attention", detail: "Consulta ao GitHub indisponível; verifique token e permissões." });
  if (packageFile.status === "fulfilled") {
    const file = packageFile.value as { content?: string; encoding?: string; size?: number };
    // GitHub entrega o package.json codificado; limite estrito antes de decodificar.
    if (file.encoding === "base64" && file.content && file.content.length < 160000) {
      try {
        const pkg = JSON.parse(Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8")) as {
          scripts?: Record<string, unknown>; engines?: Record<string, string>; dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        for (const [label, key] of [["Build", "build"], ["Testes", "test"], ["Lint", "lint"]] as const) {
          const exists = Boolean(pkg.scripts && typeof pkg.scripts[key] === "string");
          checks.push({ title: `Script ${label.toLowerCase()}`, status: exists ? "ok" : "attention", detail: exists ? `Script '${key}' encontrado no package.json.` : `Script '${key}' não declarado no package.json.` });
        }
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        checks.push({ title: "Dependências", status: "info", detail: `${Object.keys(allDeps).length} dependências declaradas. Não foram examinadas vulnerabilidades ou versões instaladas.` });
        if (!pkg.engines?.node) checks.push({ title: "Versão do Node", status: "info", detail: "Campo engines.node não declarado; confira a versão utilizada no CI e no deploy." });
      } catch { checks.push({ title: "package.json", status: "attention", detail: "Não foi possível interpretar package.json." }); }
    } else checks.push({ title: "package.json", status: "info", detail: "Arquivo muito grande ou formato não suportado." });
  } else checks.push({ title: "package.json", status: "info", detail: "package.json indisponível neste repositório ou branch; análise de scripts omitida." });
  return { projectName: project.name, supported: true, inspectedAt: new Date().toISOString(), repository: `https://github.com/${slug}`, checks,
    summary: "Inspeção heurística e somente leitura de metadados e package.json. Não é um teste de build, varredura de vulnerabilidades ou auditoria integral do código." };
}

export async function listPullRequests(projectId: string) {
  const project = await resolveProject(projectId);
  const slug = githubSlug(project);
  if (!slug) return { projectName: project.name, supported: false, prs: [], summary: "Acompanhamento de PRs disponível para repositórios GitHub vinculados." };
  const data = await githubGet(`/repos/${slug}/pulls?state=all&per_page=30&sort=updated&direction=desc`);
  if (!Array.isArray(data)) throw new Error("GITHUB_INVALID_RESPONSE");
  const prs = data.slice(0, 30).map((x: Record<string, unknown>) => {
    const head = x.head as { ref?: string } | undefined;
    return { number: Number(x.number), title: String(x.title || ""), url: String(x.html_url || ""),
      state: String(x.state || ""), draft: Boolean(x.draft), merged: Boolean(x.merged_at),
      updatedAt: String(x.updated_at || ""), branch: String(head?.ref || "") };
  });
  return { projectName: project.name, supported: true, prs,
    summary: "Últimos 30 PRs por atualização. Consulte o GitHub para checks, revisões e permissões atuais. Aprovações e merge não são executados aqui." };
}

export async function answerCopilot(projectId: string, question: string) {
  const project = await resolveProject(projectId);
  const query = question.trim().slice(0, 500);
  if (query.length < 4) throw new Error("QUESTION_INVALID");
  const [alertsPayload, tasks, health] = await Promise.all([
    listOperationalAlerts(), listProjectTasks(project.id), getHealthReport(7),
  ]);
  const alerts = alertsPayload.alerts.filter(a => a.projectId === project.id && a.state === "active");
  const pending = tasks.filter(t => t.status !== "done");
  const q = query.toLocaleLowerCase("pt-BR");
  const evidence: string[] = [];
  if (/deploy|build|publica|produção|falha|erro/.test(q)) {
    evidence.push(`Último status de deploy armazenado: ${project.last_deploy_status || "não informado"}.`);
    if (project.deploy_url) evidence.push("O projeto possui URL de publicação cadastrada; teste HTTP ao vivo na Telemetria.");
    evidence.push(...alerts.slice(0, 3).map(a => `Alerta ${a.severity}: ${a.title} (${a.occurrences} ocorrência(s)).`));
  } else if (/tarefa|plano|pendência|prazo|manutenção/.test(q)) {
    evidence.push(`${pending.length} tarefa(s) pendente(s) registradas neste projeto.`);
    evidence.push(...pending.slice(0, 4).map(t => `Tarefa [${t.priority}/${t.status}]: ${t.title}.`));
  } else if (/commit|repo|git|pull|pr|branch|código/.test(q)) {
    evidence.push(`Origem: ${project.source}; branch principal: ${project.default_branch || "não informada"}.`);
    evidence.push(`Último commit registrado: ${project.last_commit_at || "não informado"}.`);
    evidence.push("Consulte as abas Código e Pull Requests para dados atuais do GitHub.");
  } else {
    evidence.push(`Projeto ${project.name}: estado cadastrado ${project.state}; origem ${project.source}.`);
    evidence.push(`${alerts.length} alerta(s) ativo(s) e ${pending.length} tarefa(s) pendente(s).`);
    evidence.push(`Visão geral do workspace: ${health.current.activeAlerts} alertas ativos no total.`);
  }
  return { projectName: project.name, question: query, evidence,
    recommendation: alerts.length ? "Priorize os alertas críticos, revise as evidências na Telemetria e valide após corrigir." :
      pending.length ? "Revise os planos de ação pendentes e confirme os resultados antes de encerrar." :
      "Não há evidência suficiente para propor uma correção específica. Execute a inspeção na Telemetria.",
    limitations: "Resposta determinística baseada nos dados registrados; não executa ações, não verifica logs em tempo real e não usa IA generativa.",
    generatedAt: new Date().toISOString() };
}
