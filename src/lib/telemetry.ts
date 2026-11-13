import "server-only";
import { getSql, listProjects, listProjectTasks } from "@/lib/db";
import type { Project } from "@/types/project";
import type {
  RecommendationStatus,
  TelemetryEvent,
  TelemetryPayload,
  TelemetryRecommendation,
} from "@/types/telemetry";

const DAY = 24 * 60 * 60 * 1000;
const STALE_REPO_DAYS = 45;

function validHttps(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function timestamp(date: unknown): string | null {
  if (!date) return null;
  const d = new Date(String(date));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function ensureTelemetrySchema() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS telemetry_recommendation_status (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'investigating', 'resolved')),
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

function buildRecommendations(
  projects: Project[],
  lastSyncAt: string | null,
  lastSyncStatus: string | null,
  lastSyncDetails: string | null,
  now: Date
): TelemetryRecommendation[] {
  const signals: TelemetryRecommendation[] = [];
  const detectedAt = now.toISOString();
  const add = (r: Omit<TelemetryRecommendation, "status" | "detectedAt">) => {
    signals.push({ ...r, status: "open", detectedAt });
  };

  if (lastSyncStatus && /error|partial|fail/i.test(lastSyncStatus)) {
    add({
      id: "sync:integration-error",
      projectId: null,
      projectName: "Sincronizador Multi-Cloud",
      category: "sync",
      severity: "critical",
      kind: "confirmed_issue",
      title: "Falha detectada na última sincronização de integrações",
      evidence: `Status: ${lastSyncStatus}. Detalhes: ${lastSyncDetails || "Sem detalhes adicionais."}`,
      probableCause:
        "Token de API expirado ou revogado em uma das integrações (GitHub, GitLab, Vercel 1 ou Vercel 2) ou limite temporário de requisições.",
      action:
        "Verifique as credenciais no arquivo .env.local e execute uma nova sincronização manual para validar.",
      steps: [
        "Confira GITHUB_TOKEN, GITLAB_TOKEN, VERCEL_TOKEN e VERCEL_TOKEN_2 no arquivo .env.local.",
        "Teste a sincronização pelo cabeçalho do DevCentral em 'Sincronizar Tudo'.",
        "Verifique no histórico de sincronizações qual provedor retornou contagem zerada ou erro.",
      ],
      commands: ["curl.exe -X POST http://localhost:3000/api/sync"],
      proposedCode: {
        filename: ".env.local (Revisão Humana — Nunca aplicado automaticamente)",
        language: "dotenv",
        description:
          "Verifique e renove apenas o token da integração que apresentou erro antes de reiniciar o servidor.",
        snippet: `# Revise os tokens autorizados no ambiente local:
GITHUB_TOKEN="ghp_seu_token_atualizado"
GITLAB_TOKEN="glpat-seu_token_atualizado"
VERCEL_TOKEN="seu_token_vercel_conta_1"
VERCEL_TOKEN_2="seu_token_vercel_conta_2"`,
      },
      href: "/telemetria",
    });
  }

  if (!lastSyncAt || now.getTime() - new Date(lastSyncAt).getTime() > DAY) {
    add({
      id: "sync:outdated",
      projectId: null,
      projectName: "Sincronizador Multi-Cloud",
      category: "sync",
      severity: "warning",
      kind: "confirmed_issue",
      title: "Sincronização desatualizada (> 24h)",
      evidence: lastSyncAt
        ? `Última sincronização registrada: ${new Date(lastSyncAt).toLocaleString("pt-BR")}.`
        : "Nenhuma sincronização registrada no Neon.",
      probableCause:
        "A sincronização periódica automática estava desativada ou o painel permaneceu fechado por mais de 24 horas.",
      action:
        "Ative o Auto-Sync agendado na Central de Telemetria ou execute uma sincronização imediata.",
      steps: [
        "Acesse o painel principal do DevCentral autenticado como administrador.",
        "Clique em 'Sincronizar Tudo' no cabeçalho ou ative o Auto-Sync (15m/30m/60m) na Central de Telemetria.",
        "Confirme o novo registro na aba Atividade.",
      ],
      commands: ["curl.exe -i http://localhost:3000/api/telemetry"],
      href: "/",
    });
  }

  for (const p of projects) {
    if (p.is_hidden || p.state === "archived") continue;
    const status = String(p.last_deploy_status || "").toUpperCase();
    const failed = ["ERROR", "FAILED", "FAILURE", "CANCELED", "CANCELLED"].some(
      (x) => status.includes(x)
    );
    if (failed) {
      add({
        id: `deploy:failed:${p.id}`,
        projectId: p.id,
        projectName: p.name,
        category: "deploy",
        severity: "critical",
        kind: "confirmed_issue",
        title: "Último status de deploy indica falha",
        evidence: `Status registrado: ${status} nas contas ${(p.vercel_accounts || []).join(", ") || "Vercel"}.`,
        probableCause:
          "Erro de compilação (TypeScript/ESLint), variável de ambiente ausente na Vercel ou falha de comando de build.",
        action:
          "Abra a plataforma do deploy, consulte os logs e verifique build, variáveis e dependências antes de republicar.",
        steps: [
          `Execute o build localmente na pasta do projeto (${p.local_path || p.name}) para reproduzir o erro.`,
          "Verifique se todas as variáveis de ambiente (.env.local) estão configuradas na conta Vercel vinculada.",
          "Corrija o erro, faça commit/push e acompanhe o novo deploy.",
        ],
        commands: [
          p.local_path ? `cd "${p.local_path}"` : `# Abra a pasta do projeto ${p.name}`,
          "npx tsc --noEmit",
          "npm run build",
        ],
        proposedCode: {
          filename: "next.config.ts / package.json (Proposta para Revisão Humana)",
          language: "typescript",
          description: `Sugestão de verificação de build seguro para ${p.name}. Revise os tipos antes de aplicar.`,
          snippet: `// 1. Valide o tipo estrito antes do deploy:
// Terminal: npx tsc --noEmit --incremental false

// 2. Certifique-se de que variáveis obrigatórias possuem fallback seguro:
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
if (!apiUrl && process.env.NODE_ENV === "production") {
  console.warn("[${p.name}] NEXT_PUBLIC_API_URL ausente no ambiente de build.");
}`,
        },
        href: validHttps(p.deploy_url) || validHttps(p.repo_url),
      });
    }
    if (
      p.state === "online" &&
      !p.deploy_url &&
      !(p.deployments || []).some((d) => d.url)
    ) {
      add({
        id: `deploy:missing-link:${p.id}`,
        projectId: p.id,
        projectName: p.name,
        category: "deploy",
        severity: "warning",
        kind: "confirmed_issue",
        title: "Projeto online sem URL de publicação",
        evidence:
          "O projeto está marcado como online, mas não possui URL de deploy registrada.",
        probableCause:
          "O nome do projeto na Vercel diverge do nome do repositório ou a URL manual ainda não foi preenchida.",
        action:
          "Confira a vinculação com a conta Vercel correta ou cadastre o domínio na edição do projeto.",
        steps: [
          "Abra o card do projeto no painel e clique em 'Analisar projeto' ou 'Editar'.",
          "Informe a URL HTTPS de produção no campo URL de Deploy ou sincronize novamente as contas Vercel.",
        ],
        commands: [],
        proposedCode: {
          filename: `Ficha Técnica (${p.name}) — Revisão Humana`,
          language: "json",
          description: "Defina a URL de produção oficial no cadastro do projeto para habilitar o monitoramento HTTP.",
          snippet: `{
  "projectId": "${p.id}",
  "name": "${p.name}",
  "state": "online",
  "deploy_url": "https://${p.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")}.vercel.app"
}`,
        },
        href: validHttps(p.repo_url),
      });
    }
    if (!p.repo_url && !p.is_manual) {
      add({
        id: `repository:missing-link:${p.id}`,
        projectId: p.id,
        projectName: p.name,
        category: "repository",
        severity: "info",
        kind: "confirmed_issue",
        title: "Repositório sem link associado",
        evidence:
          "Não existe uma URL de repositório registrada para este projeto importado.",
        probableCause:
          "Projeto detectado apenas na Vercel sem vínculo direto com repositório GitHub ou GitLab.",
        action:
          "Revisar o vínculo GitHub/GitLab e informar a URL correta, caso exista.",
        steps: [
          "Verifique na Vercel se o projeto possui Git Repository conectado.",
          "Caso o repositório exista no GitHub ou GitLab, adicione a URL do repositório no cadastro do projeto.",
        ],
        commands: ["git remote -v"],
        proposedCode: {
          filename: "Vinculação Git remota (Revisão Humana)",
          language: "bash",
          description: "Comandos sugeridos para vincular o projeto local ao repositório remoto.",
          snippet: `cd "${p.local_path || `D:/Projetos Vs Code/${p.name}`}"
git remote -v
# Se ausente, adicione o repositório oficial:
git remote add origin https://github.com/viniciuscasagrande-creator/${p.name}.git`,
        },
        href: null,
      });
    }
    if (p.last_commit_at) {
      const daysSinceCommit = Math.floor(
        (now.getTime() - new Date(p.last_commit_at).getTime()) / DAY
      );
      if (daysSinceCommit > STALE_REPO_DAYS) {
        add({
          id: `repository:stale:${p.id}`,
          projectId: p.id,
          projectName: p.name,
          category: "repository",
          severity: "info",
          kind: "preventive_suggestion",
          title: `Repositório sem atualização há ${daysSinceCommit} dias`,
          evidence: `Último commit registrado em ${new Date(p.last_commit_at).toLocaleDateString("pt-BR")} (${daysSinceCommit} dias atrás).`,
          probableCause:
            "Projeto estabilizado em produção sem manutenção recente, dependências desatualizadas ou desenvolvimento migrado para outra branch.",
          action:
            "Revise dependências de segurança (npm audit), confirme se a branch padrão está atualizada ou arquive o projeto caso esteja inativo.",
          steps: [
            `Abra o projeto ${p.name} e verifique se há branches ativas não mescladas na branch '${p.default_branch || "main"}'.`,
            "Execute 'npm outdated' e 'npm audit' para checar pacotes vulneráveis.",
            "Se o projeto foi descontinuado, altere o status para 'Arquivado' no DevCentral.",
          ],
          commands: [
            p.local_path ? `cd "${p.local_path}"` : `# Pasta do projeto ${p.name}`,
            "git fetch --all",
            "npm audit",
          ],
          proposedCode: {
            filename: `Manutenção Preventiva (${p.name}) — Revisão Humana`,
            language: "bash",
            description: "Verificação segura de pacotes e segurança sem alterar código automaticamente.",
            snippet: `# Verifique atualizações e vulnerabilidades antes de aplicar qualquer patch:
git status
npm outdated
npm audit --omit=dev`,
          },
          href: validHttps(p.repo_url),
        });
      }
    }
    if (!p.description && !p.is_manual) {
      add({
        id: `documentation:missing-description:${p.id}`,
        projectId: p.id,
        projectName: p.name,
        category: "documentation",
        severity: "info",
        kind: "preventive_suggestion",
        title: "Descrição do projeto ausente",
        evidence: "O projeto não possui descrição cadastrada no catálogo.",
        probableCause:
          "O campo About/Description do repositório no GitHub ou GitLab está em branco.",
        action:
          "Adicione um resumo, propósito, stack e instruções de execução na descrição ou no README.",
        steps: [
          "Clique em 'Analisar projeto' ou 'Editar' no card do projeto no DevCentral.",
          "Inclua objetivo principal, stack tecnológica (${p.tech}) e link de produção.",
        ],
        commands: [],
        proposedCode: {
          filename: `README.md (${p.name}) — Sugestão para Revisão Humana`,
          language: "markdown",
          description: "Template de cabeçalho técnico sugerido para documentar o repositório.",
          snippet: `# ${p.name}

Repositório oficial gerenciado pelo **DevCentral 3.0**.

- **Stack Principal:** ${p.tech || "TypeScript / Next.js"}
- **Origem:** ${p.source} (${p.default_branch || "main"})
- **Ambiente de Produção:** ${p.deploy_url || "Em configuração"}`,
        },
        href: validHttps(p.repo_url),
      });
    }
  }

  const weight = { critical: 0, warning: 1, info: 2 };
  return signals.sort(
    (a, b) =>
      weight[a.severity] - weight[b.severity] || a.title.localeCompare(b.title)
  );
}

export async function getTelemetryPayload(): Promise<TelemetryPayload> {
  await ensureTelemetrySchema();
  const sql = getSql();
  const [projects, logs, saved, tasks] = await Promise.all([
    listProjects(true),
    sql`SELECT id, synced_at, status, details, github_count, gitlab_count, vercel1_count, vercel2_count
        FROM sync_logs ORDER BY synced_at DESC LIMIT 30`,
    sql`SELECT id, status FROM telemetry_recommendation_status`,
    listProjectTasks().catch(() => []),
  ]);
  const now = new Date();
  const lastSyncAt = timestamp(logs[0]?.synced_at);
  const lastSyncStatus = logs[0]?.status ? String(logs[0].status) : null;
  const lastSyncDetails = logs[0]?.details ? String(logs[0].details) : null;
  const states = new Map<string, RecommendationStatus>(
    saved.map((r) => [String(r.id), String(r.status) as RecommendationStatus])
  );
  const recommendations = buildRecommendations(
    projects,
    lastSyncAt,
    lastSyncStatus,
    lastSyncDetails,
    now
  ).map((r) => ({
    ...r,
    status: states.get(r.id) || "open",
  }));
  const events: TelemetryEvent[] = logs.map((r) => ({
    id: `sync:${r.id}`,
    type: "sync",
    title: `Sincronização: ${String(r.status || "desconhecido")}`,
    detail: `GitHub ${Number(r.github_count || 0)} · GitLab ${Number(r.gitlab_count || 0)} · Vercel 1 ${Number(r.vercel1_count || 0)} · Vercel 2 ${Number(r.vercel2_count || 0)}. ${String(r.details || "").slice(0, 250)}`,
    occurredAt: timestamp(r.synced_at) || now.toISOString(),
  }));
  for (const p of projects) {
    if (p.is_hidden || !p.last_commit_at) continue;
    events.push({
      id: `commit:last:${p.id}`,
      type: "commit",
      projectId: p.id,
      title: `Último commit registrado: ${p.name}`,
      detail: `Origem: ${p.source}. Representa a data coletada na última importação, não um feed de commits em tempo real.`,
      occurredAt: p.last_commit_at,
    });
  }
  events.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const staleRepos = projects.filter(
    (p) =>
      !p.is_hidden &&
      p.state !== "archived" &&
      p.last_commit_at &&
      Math.floor((now.getTime() - new Date(p.last_commit_at).getTime()) / DAY) >
        STALE_REPO_DAYS
  ).length;
  return {
    generatedAt: now.toISOString(),
    sourceLabel:
      "Dados armazenados no Neon; atualizados pelas sincronizações do DevCentral",
    summary: {
      projects: projects.filter((p) => !p.is_hidden).length,
      deploymentsWithError: projects.filter(
        (p) =>
          !p.is_hidden &&
          /ERROR|FAILED|FAILURE|CANCELED|CANCELLED/i.test(p.last_deploy_status)
      ).length,
      open: recommendations.filter((r) => r.status === "open").length,
      investigating: recommendations.filter((r) => r.status === "investigating")
        .length,
      resolved: recommendations.filter((r) => r.status === "resolved").length,
      staleRepos,
      lastSyncAt,
    },
    recommendations,
    events: events.slice(0, 80),
    tasks,
    projects: projects
      .filter((p) => !p.is_hidden)
      .map((p) => ({ id: p.id, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function changeRecommendationStatus(
  id: string,
  status: RecommendationStatus
) {
  const payload = await getTelemetryPayload();
  if (!payload.recommendations.some((r) => r.id === id)) return false;
  const sql = getSql();
  await sql`
    INSERT INTO telemetry_recommendation_status (id, status, changed_at)
    VALUES (${id}, ${status}, NOW())
    ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, changed_at = NOW()
  `;
  return true;
}
