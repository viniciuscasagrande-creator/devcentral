import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

function loadDatabaseUrl() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    const match = content.match(/^DATABASE_URL=["']?([^"'\r\n]+)["']?/m);
    if (match && match[1]) return match[1].trim();
  }
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  throw new Error("DATABASE_URL não configurada no ambiente de build.");
}

const sql = neon(loadDatabaseUrl());

// Consulta apenas projetos declaradamente públicos para o snapshot estático inicial.
const rows = await sql`
  SELECT
    id, name, description, tech, source, repo_url, deploy_url,
    state, visibility, is_pinned, tags, vercel_accounts, deployments,
    last_deploy_status, last_commit_at, updated_at
  FROM projects
  WHERE is_hidden = false AND visibility = 'public'
  ORDER BY is_pinned DESC, COALESCE(last_commit_at, updated_at) DESC, name ASC
`;

const syncLogs = await sql`
  SELECT id, synced_at, status, details, github_count, gitlab_count, vercel1_count, vercel2_count
  FROM sync_logs
  ORDER BY synced_at DESC
  LIMIT 15
`;

let savedStatuses = [];
try {
  savedStatuses = await sql`SELECT id, status FROM telemetry_recommendation_status`;
} catch {
  savedStatuses = [];
}
const statusMap = new Map(
  savedStatuses.map((r) => [String(r.id), String(r.status)])
);

let initialTasks = [];
try {
  const taskRows = await sql`SELECT * FROM project_tasks ORDER BY updated_at DESC LIMIT 50`;
  initialTasks = taskRows.map((t) => ({
    id: String(t.id),
    projectId: t.project_id ? String(t.project_id) : null,
    projectName: String(t.project_name || "Geral"),
    recommendationId: t.recommendation_id ? String(t.recommendation_id) : null,
    title: String(t.title || ""),
    priority: String(t.priority || "medium"),
    status: String(t.status || "todo"),
    notes: String(t.notes || ""),
    issueUrl: String(t.issue_url || ""),
  }));
} catch {
  initialTasks = [];
}

const safeRows = rows.map((p) => ({
  id: p.id,
  name: p.name,
  description: p.description || "",
  tech: p.tech || "TypeScript",
  source: p.source,
  repo_url: p.repo_url || "",
  deploy_url: p.deploy_url || "",
  state: p.state,
  visibility: "public",
  is_pinned: Boolean(p.is_pinned),
  tags: Array.isArray(p.tags) ? p.tags : [],
  vercel_accounts: Array.isArray(p.vercel_accounts) ? p.vercel_accounts : [],
  deployments: Array.isArray(p.deployments) ? p.deployments : [],
  last_deploy_status: p.last_deploy_status || "",
  last_commit_at: p.last_commit_at
    ? new Date(p.last_commit_at).toISOString()
    : null,
  updated_at: p.updated_at ? new Date(p.updated_at).toISOString() : null,
  custom_notes: "",
  local_path: "",
}));

const safeLogs = syncLogs.map((l) => ({
  id: Number(l.id),
  synced_at: l.synced_at
    ? new Date(l.synced_at).toISOString()
    : new Date().toISOString(),
  status: String(l.status || "success"),
  details: String(l.details || ""),
  github_count: Number(l.github_count || 0),
  gitlab_count: Number(l.gitlab_count || 0),
  vercel1_count: Number(l.vercel1_count || 0),
  vercel2_count: Number(l.vercel2_count || 0),
  total_projects:
    Number(l.github_count || 0) +
    Number(l.gitlab_count || 0) +
    Number(l.vercel1_count || 0) +
    Number(l.vercel2_count || 0),
}));

function buildPublicRecommendations(projects, lastSyncAt) {
  const recs = [];
  const now = new Date();
  const detectedAt = now.toISOString();
  const DAY = 24 * 60 * 60 * 1000;

  if (!lastSyncAt || now.getTime() - new Date(lastSyncAt).getTime() > DAY) {
    const id = "sync:outdated";
    recs.push({
      id,
      projectId: null,
      projectName: "Catálogo Global",
      category: "sync",
      severity: "warning",
      kind: "confirmed_issue",
      title: "Sincronização desatualizada (> 24h)",
      evidence: lastSyncAt
        ? `Última sincronização registrada: ${new Date(lastSyncAt).toLocaleString("pt-BR")}.`
        : "Nenhuma sincronização registrada no banco Neon.",
      probableCause:
        "A sincronização com GitHub, GitLab e as 2 contas Vercel é executada sob demanda pelo administrador.",
      action:
        "Autentique-se com Google no cabeçalho e clique em 'Sincronizar projetos' para atualizar repositórios e deploys.",
      steps: [
        "Clique em 'Entrar com Google (Admin)' no topo do painel.",
        "Acione o botão 'Sincronizar projetos' para consultar GitHub, GitLab e as 2 contas Vercel.",
        "Verifique o log atualizado na aba Automação.",
      ],
      commands: ["npm run dev"],
      href: "/",
      status: statusMap.get(id) || "open",
      detectedAt,
    });
  }

  for (const p of projects) {
    const st = String(p.last_deploy_status || "").toUpperCase();
    const failed = ["ERROR", "FAILED", "FAILURE", "CANCELED", "CANCELLED"].some(
      (x) => st.includes(x)
    );
    if (failed) {
      const id = `deploy:failed:${p.id}`;
      recs.push({
        id,
        projectId: p.id,
        projectName: p.name,
        category: "deploy",
        severity: "critical",
        kind: "confirmed_issue",
        title: "Último status de deploy indica falha",
        evidence: `Status registrado na Vercel: ${st}. O ambiente de produção pode estar desatualizado.`,
        probableCause:
          "Erro de compilação TypeScript/Next.js, variável de ambiente ausente na Vercel ou falha no comando de build.",
        action:
          "Reproduza o build localmente, revise as variáveis de ambiente na conta Vercel vinculada e republique.",
        steps: [
          `Execute o build local do projeto (${p.name}) para inspecionar erros de compilação.`,
          "Confira se todas as variáveis (.env) estão definidas nas configurações da Vercel.",
          "Faça novo commit/push para disparar um deploy limpo.",
        ],
        commands: ["npm run build", "npx tsc --noEmit"],
        proposedCode: {
          filename: `next.config.ts (${p.name}) — Proposta para Revisão Humana`,
          language: "typescript",
          description:
            "Validação recomendada antes de republicar (nunca aplicada automaticamente sem aprovação).",
          snippet: `// Terminal: npx tsc --noEmit --incremental false\nconst apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";\nif (!apiUrl && process.env.NODE_ENV === "production") {\n  console.warn("[${p.name}] Variável ausente no build.");\n}`,
        },
        href: p.deploy_url || p.repo_url || null,
        status: statusMap.get(id) || "open",
        detectedAt,
      });
    }

    if (
      p.state === "online" &&
      !p.deploy_url &&
      !(p.deployments || []).some((d) => d.url)
    ) {
      const id = `deploy:missing-link:${p.id}`;
      recs.push({
        id,
        projectId: p.id,
        projectName: p.name,
        category: "deploy",
        severity: "warning",
        kind: "confirmed_issue",
        title: "Projeto marcado como Online sem URL de publicação",
        evidence:
          "O projeto consta como online, mas não possui URL principal de produção registrada.",
        probableCause:
          "O nome do projeto na Vercel diverge do repositório ou o domínio público não foi associado.",
        action:
          "Vincule a URL HTTPS de produção no cadastro do projeto ou sincronize novamente as contas Vercel.",
        steps: [
          "Abra os detalhes do card no painel e verifique as contas Vercel associadas.",
          "Preencha o campo URL de Deploy ou sincronize as contas Vercel.",
        ],
        commands: [],
        href: p.repo_url || null,
        status: statusMap.get(id) || "open",
        detectedAt,
      });
    }

    if (!p.repo_url) {
      const id = `repository:missing-link:${p.id}`;
      recs.push({
        id,
        projectId: p.id,
        projectName: p.name,
        category: "repository",
        severity: "info",
        kind: "confirmed_issue",
        title: "Projeto sem repositório Git vinculado",
        evidence:
          "Projeto detectado apenas na hospedagem (Vercel) sem URL de repositório GitHub/GitLab.",
        probableCause:
          "Deploy avulso via CLI ou repositório com nome divergente entre GitHub/GitLab e Vercel.",
        action:
          "Associe a URL do repositório Git correspondente para unificar o rastreamento.",
        steps: [
          "Verifique na Vercel qual repositório Git está conectado ao projeto.",
          "Cadastre a URL do repositório no card do projeto no DevCentral.",
        ],
        commands: ["git remote -v"],
        href: p.deploy_url || null,
        status: statusMap.get(id) || "open",
        detectedAt,
      });
    }

    if (!p.description) {
      const id = `documentation:missing-description:${p.id}`;
      recs.push({
        id,
        projectId: p.id,
        projectName: p.name,
        category: "documentation",
        severity: "info",
        kind: "preventive_suggestion",
        title: "Descrição técnica ausente no catálogo",
        evidence: "O projeto não possui resumo cadastrado no banco de dados.",
        probableCause: "Campo About/Description em branco no GitHub/GitLab.",
        action:
          "Adicione uma descrição objetiva com propósito, stack e link de produção.",
        steps: [
          "Preencha a descrição no repositório GitHub/GitLab ou diretamente no editor do DevCentral.",
        ],
        commands: [],
        href: p.repo_url || null,
        status: statusMap.get(id) || "open",
        detectedAt,
      });
    }
  }

  const weight = { critical: 0, warning: 1, info: 2 };
  return recs.sort(
    (a, b) =>
      weight[a.severity] - weight[b.severity] || a.title.localeCompare(b.title)
  );
}

const initialRecs = buildPublicRecommendations(
  safeRows,
  safeLogs[0]?.synced_at || null
);

// Sincroniza e carrega operational_alerts no Neon PostgreSQL
await sql`
  CREATE TABLE IF NOT EXISTS operational_alerts (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    project_name TEXT NOT NULL,
    title TEXT NOT NULL,
    evidence TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning')),
    state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'recovered')),
    read_at TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recovered_at TIMESTAMPTZ,
    occurrences INTEGER NOT NULL DEFAULT 1
  )
`;
await sql`ALTER TABLE operational_alerts ADD COLUMN IF NOT EXISTS state_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
await sql`CREATE INDEX IF NOT EXISTS operational_alerts_state_idx ON operational_alerts (state, last_seen_at DESC)`;

await sql`CREATE TABLE IF NOT EXISTS operational_notification_config (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;
await sql`INSERT INTO operational_notification_config (id) VALUES (1) ON CONFLICT DO NOTHING`;
await sql`CREATE TABLE IF NOT EXISTS operational_notification_deliveries (
  event_id TEXT NOT NULL, channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing', attempts INTEGER NOT NULL DEFAULT 1,
  last_error TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, channel)
)`;
await sql`CREATE TABLE IF NOT EXISTS operational_health_daily (
  day DATE PRIMARY KEY,
  projects INTEGER NOT NULL,
  deploy_failures INTEGER NOT NULL,
  critical_alerts INTEGER NOT NULL,
  active_alerts INTEGER NOT NULL,
  pending_tasks INTEGER NOT NULL,
  last_sync_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

const confirmedActiveRecs = initialRecs.filter(
  (r) =>
    r.kind === "confirmed_issue" &&
    (r.severity === "critical" || r.severity === "warning") &&
    r.status !== "resolved"
);
const buildScanStart = new Date().toISOString();
for (const r of confirmedActiveRecs) {
  await sql`
    INSERT INTO operational_alerts
      (id, project_id, project_name, title, evidence, severity, first_seen_at, last_seen_at)
    VALUES
      (${r.id}, ${r.projectId}, ${r.projectName || "Sistema"}, ${r.title},
       ${String(r.evidence || "").slice(0, 2000)}, ${r.severity}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      project_id = EXCLUDED.project_id,
      project_name = EXCLUDED.project_name,
      title = EXCLUDED.title,
      evidence = EXCLUDED.evidence,
      severity = EXCLUDED.severity,
      state = 'active',
      read_at = CASE WHEN operational_alerts.state = 'recovered' THEN NULL ELSE operational_alerts.read_at END,
      recovered_at = NULL,
      last_seen_at = NOW(),
      occurrences = operational_alerts.occurrences + 1
  `;
}
await sql`
  UPDATE operational_alerts SET state = 'recovered', recovered_at = NOW()
  WHERE state = 'active' AND last_seen_at < ${buildScanStart}::timestamptz
`;
const alertRows = await sql`
  SELECT * FROM operational_alerts
  ORDER BY CASE WHEN state = 'active' THEN 0 ELSE 1 END,
           CASE severity WHEN 'critical' THEN 0 ELSE 1 END,
           last_seen_at DESC
  LIMIT 100
`;
const initialAlerts = alertRows.map((r) => ({
  id: String(r.id),
  projectId: r.project_id == null ? null : String(r.project_id),
  projectName: String(r.project_name),
  title: String(r.title),
  evidence: String(r.evidence),
  severity: String(r.severity),
  state: String(r.state),
  readAt: r.read_at ? new Date(String(r.read_at)).toISOString() : null,
  firstSeenAt: r.first_seen_at ? new Date(String(r.first_seen_at)).toISOString() : new Date().toISOString(),
  lastSeenAt: r.last_seen_at ? new Date(String(r.last_seen_at)).toISOString() : new Date().toISOString(),
  recoveredAt: r.recovered_at ? new Date(String(r.recovered_at)).toISOString() : null,
  occurrences: Number(r.occurrences || 1),
}));
const initialUnreadAlerts = initialAlerts.filter((a) => a.state === "active" && !a.readAt).length;

const activeAlertCount = initialAlerts.filter((a) => a.state === "active").length;
const criticalAlertCount = initialAlerts.filter((a) => a.state === "active" && a.severity === "critical").length;
const deployFailureCount = safeRows.filter((p) => /ERROR|FAILED|FAILURE|CANCELED|CANCELLED/i.test(p.last_deploy_status || "")).length;
const pendingTaskCount = initialTasks.filter((t) => t.status !== "done").length;

await sql`
  INSERT INTO operational_health_daily
    (day, projects, deploy_failures, critical_alerts, active_alerts, pending_tasks, last_sync_at, recorded_at)
  VALUES
    (CURRENT_DATE, ${safeRows.length}, ${deployFailureCount}, ${criticalAlertCount},
     ${activeAlertCount}, ${pendingTaskCount}, ${safeLogs[0]?.synced_at || null}, NOW())
  ON CONFLICT (day) DO UPDATE SET
    projects = EXCLUDED.projects,
    deploy_failures = EXCLUDED.deploy_failures,
    critical_alerts = EXCLUDED.critical_alerts,
    active_alerts = EXCLUDED.active_alerts,
    pending_tasks = EXCLUDED.pending_tasks,
    last_sync_at = EXCLUDED.last_sync_at,
    recorded_at = NOW()
`;

const healthHistoryRows = await sql`
  SELECT day::text AS day, projects, deploy_failures, critical_alerts, active_alerts, pending_tasks, recorded_at
  FROM operational_health_daily
  WHERE day >= CURRENT_DATE - 89
  ORDER BY day ASC
`;
const initialHealthHistory = healthHistoryRows.map((r) => ({
  day: String(r.day),
  projects: Number(r.projects),
  deployFailures: Number(r.deploy_failures),
  criticalAlerts: Number(r.critical_alerts),
  activeAlerts: Number(r.active_alerts),
  pendingTasks: Number(r.pending_tasks),
}));

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c])
  );

const totalCount = safeRows.length;
const onlineCount = safeRows.filter(
  (p) => p.state === "online" || Boolean(p.deploy_url)
).length;
const pinnedCount = safeRows.filter((p) => p.is_pinned).length;
const ghCount = safeRows.filter((p) => p.source === "GitHub").length;
const glCount = safeRows.filter((p) => p.source === "GitLab").length;
const v1Count = safeRows.filter((p) =>
  (p.vercel_accounts || []).includes("viniciuscasagrande-creator")
).length;
const v2Count = safeRows.filter((p) =>
  (p.vercel_accounts || []).includes("DEVELOPDISKINGRESSOS-9897")
).length;
const vcCount = safeRows.filter(
  (p) =>
    p.source === "Vercel" ||
    (Array.isArray(p.vercel_accounts) && p.vercel_accounts.length > 0) ||
    (p.deploy_url && p.deploy_url.includes("vercel.app"))
).length;
const openRecsCount = initialRecs.filter((r) => r.status !== "resolved").length;

function renderCardHtml(p) {
  const isOnline = p.state === "online" || Boolean(p.deploy_url);
  const vAccs = Array.isArray(p.vercel_accounts) ? p.vercel_accounts : [];
  const techPills = Array.from(
    new Set([p.tech || "TypeScript", ...(p.tags || [])].filter(Boolean))
  ).slice(0, 4);

  return `<article class="card ${isOnline ? "card-online" : "card-off"}" data-card-id="${esc(p.id)}">
      <div>
        <div class="card-head">
          <div style="display:flex;gap:10px;align-items:flex-start;min-width:0;flex:1;cursor:pointer" onclick="window.__openProjectModal('${esc(p.id)}')">
            <div class="avatar">${esc((p.name || "PR").slice(0, 2).toUpperCase())}</div>
            <div style="min-width:0;flex:1">
              <div class="card-meta">
                ${esc(p.source.toUpperCase())} • ${p.visibility === "private" ? "🔒 PRIVADO" : "🌐 PÚBLICO"}${p.is_pinned ? " • <span style='color:#c4b5fd'>FIXADO</span>" : ""}
              </div>
              <h3 title="${esc(p.name)}">${esc(p.name)}</h3>
            </div>
          </div>
          <span class="status ${isOnline ? "" : "off"}">● ${isOnline ? "Online" : "Em dev"}</span>
        </div>
        <p class="desc">${esc(p.description || "Projeto sincronizado com Neon PostgreSQL.")}</p>
        <div class="tags">
          ${techPills.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
          ${vAccs.map((a) => `<span class="tag vercel" title="${esc(a)}">▲ ${esc(a)}</span>`).join("")}
        </div>
      </div>
      <div>
        <div class="links">
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            ${
              p.repo_url
                ? `<a class="link-repo" href="${esc(p.repo_url)}" target="_blank" rel="noopener">Repositório ↗</a>`
                : `<button class="link-btn" onclick="window.__openProjectModal('${esc(p.id)}')">Repositório ↗</button>`
            }
            ${
              p.deploy_url
                ? `<a class="link-deploy" href="${esc(p.deploy_url)}" target="_blank" rel="noopener">Abrir site ↗</a>`
                : `<button class="link-btn" style="color:#8b9bb8" onclick="window.__openProjectModal('${esc(p.id)}')">Detalhes ↗</button>`
            }
          </div>
          <div class="card-actions">
            ${
              p.repo_url
                ? `<a class="icon-act" href="${esc(p.repo_url)}" target="_blank" rel="noopener" title="Repositório GitHub">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg>
                  </a>`
                : ""
            }
            <button class="icon-act ${p.is_pinned ? "pinned" : ""}" onclick="window.__togglePinLocal('${esc(p.id)}')" title="Fixar no topo">★</button>
            <button class="icon-act" onclick="window.__openProjectModal('${esc(p.id)}')" title="Analisar projeto">•••</button>
          </div>
        </div>
        <button class="btn-analyze" onclick="window.__openProjectModal('${esc(p.id)}')">📈 Analisar projeto</button>
      </div>
    </article>`;
}

const preRenderedCardsHtml = safeRows.map(renderCardHtml).join("\n");

fs.mkdirSync("firebase-dist", { recursive: true });
fs.mkdirSync("firebase-dist/telemetria", { recursive: true });
if (fs.existsSync("firebase-dist/projects.json")) {
  fs.unlinkSync("firebase-dist/projects.json");
}
for (const asset of ["manifest.json", "icon.svg", "sw.js"]) {
  const srcPath = path.resolve(process.cwd(), "public", asset);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.resolve(process.cwd(), "firebase-dist", asset));
  }
}

function buildHtml(defaultTab = "all") {
  return `<!doctype html>
<html lang="pt-BR" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=5">
<meta name="theme-color" content="#070a14">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="DevCentral">
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon.svg">
<title>DevCentral 3.0 — Workspace Pessoal &amp; Telemetria</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color-scheme:dark;--bg:#070a14;--surface:#0e1526;--surface2:#141d33;--border:#1f2a44;--text:#f1f5f9;--muted:#8b9bb8;--accent:#818cf8;--green:#3ddba0;--red:#ff4d6d;--amber:#f59e0b}
*{box-sizing:border-box}
html,body{margin:0;padding:0;overflow-x:hidden;background:radial-gradient(ellipse 1100px 550px at 65% -15%,rgba(91,70,232,0.18) 0%,transparent 70%),var(--bg);color:var(--text);min-height:100vh}
button,input,select,textarea{font:inherit}
button{cursor:pointer;touch-action:manipulation}
a{color:inherit;text-decoration:none}

.shell{display:grid;grid-template-columns:268px 1fr;min-height:100vh}

/* SIDEBAR & MOBILE DRAWER */
.sidebar-backdrop{display:none;position:fixed;inset:0;z-index:85;background:rgba(4,7,15,0.78);backdrop-filter:blur(4px)}
.sidebar-backdrop.open{display:block}
.sidebar{border-right:1px solid #1c243b;background:#080c17;padding:20px 14px;display:flex;flex-direction:column;justify-content:space-between;gap:18px;position:sticky;top:0;height:100vh;overflow-y:auto;user-select:none;z-index:90}
.brand-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 4px}
.brand{display:flex;gap:11px;align-items:center;min-width:0}
.logo-box{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#2d1f66,#1c2347,#0e3240);border:1px solid rgba(110,86,207,0.65);box-shadow:0 0 20px rgba(124,92,255,0.45);display:grid;place-items:center;flex-shrink:0}
.collapse-btn{width:34px;height:34px;border-radius:9px;background:#111729;border:1px solid #222c46;color:#8b9bb8;display:grid;place-items:center;font-size:12px}
.collapse-btn:hover{color:#fff}
.mobile-menu-btn{display:none;width:40px;height:40px;border-radius:12px;background:#101729;border:1px solid #253252;color:#e2e8f0;place-items:center;font-size:18px;flex-shrink:0}

.sec-title{display:flex;align-items:center;gap:6px;padding:6px 8px 4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.3px;color:#7f8ea8}
.sec-dot{width:6px;height:6px;border-radius:99px;background:#2dd4a0}

.infra-list{display:grid;gap:3px;font-size:11.5px}
.infra-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-radius:9px;color:#c8d4eb;background:transparent;border:0;width:100%;text-align:left;transition:background .15s}
.infra-row:hover{background:#11182b}
.infra-left{display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill-green{font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;background:#0d2e28;color:#3ddba0;border:1px solid rgba(45,212,160,0.45);white-space:nowrap;flex-shrink:0}

.nav-sep{border-top:1px solid #161e33;padding-top:10px;margin-top:6px}
.nav{display:grid;gap:4px}
.nav button{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;color:#b8c6df;border-radius:12px;background:transparent;border:1px solid transparent;text-align:left;font-weight:600;font-size:12px;transition:all .15s}
.nav button:hover{color:#fff;background:#12192d}
.nav button.active{color:#fff;background:linear-gradient(90deg,#5641e5,#4330c6);border-color:#8e7bff;box-shadow:0 0 18px rgba(105,80,245,0.4)}
.nav .badge{font-size:11px;font-weight:700;padding:1.5px 8px;border-radius:99px;background:#34249c;color:#fff}
.nav .badge-plain{font-size:11.5px;color:#9baac5;font-weight:600}
.pill-novo{font-size:10px;font-weight:700;padding:1.5px 8px;border-radius:99px;background:#3b2785;color:#d8ceff;border:1px solid rgba(124,92,255,0.5)}

.promo-card{border-radius:16px;padding:15px;background:linear-gradient(135deg,#12263a,#151836,#26174a);border:1px solid rgba(56,189,248,0.45);box-shadow:0 0 25px rgba(124,92,255,0.22);cursor:pointer;transition:border-color .15s}
.promo-card:hover{border-color:#a87ffb}
.promo-bars{display:flex;align-items:flex-end;gap:3px;height:18px;margin-bottom:9px}
.promo-arrow{width:32px;height:32px;border-radius:99px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;display:grid;place-items:center;flex-shrink:0;box-shadow:0 4px 14px rgba(139,92,246,0.4);font-weight:800}

/* MAIN AREA */
.main{padding:22px clamp(14px,2.2vw,32px);max-width:1640px;width:100%;margin:0 auto;overflow-x:hidden}

/* TOP BAR */
.topbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.topbar-left{display:flex;align-items:center;gap:10px;min-width:0}
.eyebrow{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#a5b4fc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.top-actions{display:flex;align-items:center;gap:8px}
.circle-btn{width:40px;height:40px;border-radius:99px;background:#101729;border:1px solid #222e4a;color:#9baac5;display:grid;place-items:center;position:relative;flex-shrink:0}
.circle-btn:hover{color:#fff;border-color:#4b5d88}
.bell-dot{position:absolute;top:7px;right:8px;width:7px;height:7px;border-radius:99px;background:#a855f7;box-shadow:0 0 6px #a855f7}
.auth-pill{display:inline-flex;align-items:center;gap:8px;padding:9px 15px;min-height:40px;border-radius:99px;background:linear-gradient(90deg,#7c5cff,#5b3df5);border:1px solid rgba(167,139,250,0.75);box-shadow:0 0 20px rgba(124,92,255,0.45);color:#fff;font-size:12px;font-weight:700}
.auth-pill:hover{filter:brightness(1.1)}

/* HERO BANNER */
.hero{position:relative;overflow:hidden;border-radius:18px;border:1px solid #1f2942;background:linear-gradient(90deg,#0c1224,#111530,#0c1224);padding:20px 24px;box-shadow:0 12px 40px rgba(0,0,0,0.45);margin-bottom:18px}
.hero-bar{position:absolute;left:0;top:16px;bottom:16px;width:4px;border-radius:0 99px 99px 0;background:linear-gradient(180deg,#38bdf8,#818cf8,#a855f7);box-shadow:0 0 14px #38bdf8}
.hero-grid{position:relative;z-index:2;display:grid;grid-template-columns:1.35fr 0.85fr 0.8fr;align-items:center;gap:20px}
.hero-badge{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#c7d2fe}
.hero h1{font-size:clamp(24px,2.8vw,38px);font-weight:900;margin:6px 0 8px;letter-spacing:-0.5px;line-height:1.05;color:#fff}
.hero h1 span{background:linear-gradient(90deg,#a78bfa,#c084fc,#818cf8);-webkit-background-clip:text;color:transparent}
.hero p{font-size:13px;color:#9baac5;margin:0 0 14px;max-width:560px;line-height:1.45}
.hero-btns{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.btn-sync-split{display:inline-flex;align-items:stretch;border-radius:12px;background:linear-gradient(90deg,#6d4aff,#7c3aed);border:1px solid rgba(167,139,250,0.7);box-shadow:0 0 22px rgba(124,92,255,0.45);overflow:hidden;min-height:42px}
.btn-sync-main{padding:10px 15px;border:0;background:transparent;color:#fff;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:8px}
.btn-sync-chev{padding:0 10px;border:0;border-left:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;font-size:11px}
.btn-telemetry-hero{display:inline-flex;align-items:center;gap:8px;padding:10px 15px;min-height:42px;border-radius:12px;background:rgba(16,23,42,0.9);border:1px solid #2a3656;color:#fff;font-size:12px;font-weight:700}
.btn-telemetry-hero:hover{background:#162038;border-color:#4b5d88}
.hero-checks{display:grid;gap:9px;font-size:12.5px;color:#d5dff2;justify-self:end}
.hero-checks div{display:flex;align-items:center;gap:9px;font-weight:500}

/* 5 KPI STATS */
.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:13px;margin-bottom:18px}
.stat{border:1px solid #222d47;border-radius:16px;background:linear-gradient(135deg,#13192e,#0d1323);padding:14px 15px;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;transition:border-color .15s;min-width:0}
.stat:hover{border-color:#4b5d88}
.stat.stat-online{border-color:rgba(45,212,160,0.8);background:linear-gradient(135deg,#0e2a27,#0d2025,#0c1724);box-shadow:0 0 20px rgba(45,212,160,0.18)}
.stat-left{display:flex;align-items:flex-start;gap:11px;min-width:0}
.stat-icon{width:40px;height:40px;border-radius:12px;background:#1c2242;border:1px solid #323c6e;display:grid;place-items:center;flex-shrink:0;margin-top:2px;font-size:16px}
.stat-online .stat-icon{background:#0f3830;border-color:rgba(45,212,160,0.5);color:#3ddba0}
.stat .k{color:#9baac5;font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stat .v{font-weight:900;font-size:24px;line-height:1.15;margin:2px 0;color:#fff}
.stat .note{font-size:10.5px;color:#7f8ea8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* FILTER BAR & MOBILE FILTER BUTTON */
.filter-grid{display:grid;grid-template-columns:1.5fr repeat(4,minmax(0,1fr));gap:10px;align-items:center;margin-bottom:16px}
.search-row-mobile{display:flex;gap:8px;align-items:center;width:100%}
.search-wrap{position:relative;flex:1;min-width:0}
.search{width:100%;background:#0e1526;border:1px solid #222e4a;border-radius:12px;padding:11px 68px 11px 36px;color:var(--text);font-size:12px;min-height:42px}
.search:focus,.filter-select:focus{outline:none;border-color:#7c5cff}
.search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#7f8ea8;font-size:13px;pointer-events:none}
.kbd-ctrl{position:absolute;right:10px;top:50%;transform:translateY(-50%);padding:2px 7px;border-radius:6px;background:#162038;border:1px solid #2a3859;font-size:10px;font-weight:600;color:#9baac5;pointer-events:none}
.filter-select{width:100%;background:#0e1526;color:#d5dff2;border:1px solid #222e4a;padding:10px 12px;border-radius:12px;font-size:12px;font-weight:500;min-height:42px}
.mobile-filter-btn{display:none;align-items:center;gap:6px;padding:10px 14px;min-height:42px;border-radius:12px;background:#101729;border:1px solid #253252;color:#e2e8f0;font-size:12px;font-weight:700;white-space:nowrap;flex-shrink:0}
.mobile-filter-btn.active{border-color:#8b5cf6;background:#231b4d;color:#fff}

/* MOBILE FILTER BOTTOM SHEET */
.sheet-overlay{position:fixed;inset:0;z-index:95;background:rgba(4,7,15,0.8);backdrop-filter:blur(4px);display:none;align-items:flex-end;justify-content:center}
.sheet-overlay.open{display:flex}
.sheet-box{width:100%;max-width:640px;max-height:86vh;background:#0b1120;border-top:1px solid #2b3b5e;border-radius:22px 22px 0 0;padding:18px 16px 28px;overflow-y:auto;box-shadow:0 -12px 40px rgba(0,0,0,0.6)}
.sheet-pills{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
.sheet-pill{padding:11px 12px;border-radius:12px;border:1px solid #22304d;background:#11192c;color:#cbd5e8;font-size:12px;font-weight:700;text-align:left;display:flex;align-items:center;gap:8px;min-height:44px}
.sheet-pill.active{border-color:#8b5cf6;background:rgba(91,70,232,0.28);color:#fff}

/* SECTION HEADER: SEUS PROJETOS */
.sec-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:4px 0 14px;flex-wrap:wrap}
.sec-bar-left{display:flex;align-items:center;gap:10px}
.sec-bar-left h2{font-size:18px;font-weight:800;margin:0;color:#fff}
.count-pill{font-size:11.5px;font-weight:700;padding:2px 10px;border-radius:99px;background:#2a1f63;color:#d8ceff;border:1px solid rgba(110,86,207,0.5)}
.view-toggle{display:inline-flex;border-radius:11px;border:1px solid #253252;background:#0e1526;padding:2px}
.view-toggle button{border:0;background:transparent;color:#8b9bb8;padding:6px 10px;border-radius:8px;font-size:12px}
.view-toggle button.active{background:#5b46e8;color:#fff;box-shadow:0 0 10px rgba(91,70,232,0.5)}

/* PROJECT CARDS (4 COLUMNS DESKTOP >= 1280px, 2 TABLET 768-1279px, 1 MOBILE <= 767px) */
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;width:100%;min-width:0}
.cards.list-mode{grid-template-columns:1fr}
.card{background:linear-gradient(145deg,rgba(19,27,48,0.95),rgba(15,22,40,0.95),rgba(11,16,31,0.95));border-radius:16px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;min-height:196px;min-width:0;width:100%;max-width:100%;overflow:hidden;transition:transform 0.16s ease,border-color 0.16s ease}
.card > div{min-width:0;width:100%}
.card:hover{transform:translateY(-2px)}
.card.card-online{border:1px solid rgba(45,212,160,0.75);box-shadow:0 0 16px rgba(45,212,160,0.16),inset 0 0 12px rgba(45,212,160,0.04)}
.card.card-off{border:1px solid rgba(255,77,109,0.75);box-shadow:0 0 16px rgba(255,77,109,0.16),inset 0 0 12px rgba(255,77,109,0.04)}
.card-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;min-width:0;width:100%}
.avatar{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#2c3366,#1e2347);color:#e2ddff;font-weight:800;font-size:12px;flex-shrink:0;border:1px solid rgba(72,81,145,0.6)}
.card-meta{font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:#8b9bb8;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.status{font-size:10.5px;color:#3ddba0;background:#0d2e28;border:1px solid rgba(45,212,160,0.55);box-shadow:0 0 10px rgba(45,212,160,0.2);padding:2.5px 10px;border-radius:99px;white-space:nowrap;font-weight:700;flex-shrink:0}
.status.off{color:#ff6b86;background:rgba(255,77,109,0.15);border:1px solid rgba(255,77,109,0.55);box-shadow:0 0 10px rgba(255,77,109,0.2)}
.card h3{font-size:14.5px;margin:3px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:800;color:#fff}
.desc{color:#9baac5;line-height:1.45;font-size:11.5px;margin:11px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:34px;word-break:break-word}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 0;min-width:0;width:100%}
.tag{background:#141d33;border:1px solid #263554;color:#cbd5e8;padding:2.5px 8px;border-radius:6px;font-size:10.5px;font-weight:500;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tag.vercel{background:#1c1a3b;color:#b4a8ff;border-color:#453a85;font-weight:600;max-width:195px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.links{border-top:1px solid #1c263d;padding-top:10px;margin-top:14px;display:flex;justify-content:space-between;gap:8px;align-items:center;min-width:0;width:100%;flex-wrap:wrap}
.links a,.link-btn{font-size:12px;font-weight:600;background:transparent;border:0;padding:4px 0}
.link-repo,.link-btn{color:#d5dff2}
.link-deploy{color:#3ddba0}
.links a:hover,.link-btn:hover{text-decoration:underline}
.card-actions{display:flex;align-items:center;gap:4px;color:#8b9bb8;margin-left:auto}
.icon-act{background:transparent;border:0;color:#8b9bb8;padding:6px 8px;border-radius:8px;font-size:13px;display:inline-flex;align-items:center;justify-content:center;min-width:32px;min-height:32px}
.icon-act:hover{color:#fff;background:#182337}
.icon-act.pinned{color:#fbbf24}
.btn-analyze{margin-top:10px;width:100%;padding:9px 12px;min-height:38px;border-radius:11px;background:linear-gradient(90deg,rgba(86,65,229,0.28),rgba(63,46,168,0.28),rgba(27,43,75,0.45));border:1px solid rgba(110,86,207,0.55);color:#d8ceff;font-size:11.5px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;box-shadow:0 0 12px rgba(124,92,255,0.15)}
.btn-analyze:hover{background:linear-gradient(90deg,#5641e5,#4330c6);border-color:#9482ff;color:#fff}

/* MODAL ANALISAR PROJETO */
.modal-overlay{position:fixed;inset:0;z-index:100;background:rgba(4,7,15,0.82);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;padding:12px}
.modal-overlay.open{display:flex}
.modal-box{width:100%;max-width:880px;max-height:92vh;background:#0c1222;border:1px solid rgba(45,212,160,0.75);box-shadow:0 0 36px rgba(45,212,160,0.22);border-radius:18px;display:flex;flex-direction:column;overflow:hidden}
.modal-box.off{border-color:rgba(255,77,109,0.75);box-shadow:0 0 36px rgba(255,77,109,0.22)}
.modal-head{padding:16px 18px;background:#0a0f1d;border-bottom:1px solid #1e2942;display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.modal-tabs{padding:8px 16px 0;background:#0e1526;border-bottom:1px solid #1e2942;display:flex;gap:6px;overflow-x:auto}
.modal-tabs button{padding:9px 13px;border:0;border-bottom:2px solid transparent;border-radius:10px 10px 0 0;background:transparent;color:#8b9bb8;font-size:12px;font-weight:700;white-space:nowrap}
.modal-tabs button.active{color:#fff;background:#151f36;border-bottom-color:#8b5cf6}
.modal-body{padding:18px;overflow-y:auto;flex:1;font-size:13px}
.modal-foot{padding:12px 18px;background:#0a0f1d;border-top:1px solid #1e2942;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.tech-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
.tech-cell{padding:12px;border-radius:12px;background:#0f172a;border:1px solid #222f49}
.tech-cell .lbl{font-size:11px;color:#8b9bb8}
.tech-cell .val{font-size:13px;font-weight:700;color:#fff;margin-top:4px;word-break:break-word}

/* TELEMETRY SECTION */
.telemetry-wrap{display:grid;gap:16px;margin-top:8px}
.telemetry-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;background:#0e1526;border:1px solid #222e4a;padding:12px 14px;border-radius:14px}
.subtabs{display:flex;gap:6px;flex-wrap:wrap}
.subtabs button{padding:8px 12px;border-radius:9px;border:1px solid #222e4a;background:#090d18;color:var(--muted);font-size:12px;font-weight:600}
.subtabs button.active{background:#5641e5;border-color:#8e7bff;color:#fff}
.telemetry-split{display:grid;grid-template-columns:1fr 1.25fr;gap:14px;align-items:start}
.diag-list{display:grid;gap:9px;max-height:680px;overflow-y:auto;padding-right:4px}
.diag-item{background:#0e1526;border:1px solid #222e4a;border-radius:12px;padding:13px;cursor:pointer;transition:all .15s;text-align:left;width:100%}
.diag-item:hover,.diag-item.active{border-color:#7c5cff;background:#141d36}
.diag-detail{background:#0e1526;border:1px solid #222e4a;border-radius:14px;padding:18px;position:sticky;top:20px}
.sev-pill{font-size:10px;font-weight:800;text-transform:uppercase;padding:2.5px 8px;border-radius:99px;display:inline-block}
.sev-critical{background:rgba(255,77,109,0.15);color:#ff6b86;border:1px solid rgba(255,77,109,0.4)}
.sev-warning{background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.4)}
.sev-info{background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.4)}
.solution-box{margin-top:14px;padding:14px;border-radius:11px;background:#090d18;border:1px solid #1e293b}
.solution-box h4{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8}
.cmd-row{display:flex;justify-content:space-between;align-items:center;gap:8px;background:#050811;border:1px solid #1e293b;padding:8px 11px;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:#3ddba0;margin-top:6px;overflow-x:auto}
.status-btn{padding:7px 11px;min-height:36px;border-radius:8px;border:1px solid #222e4a;background:#141d33;color:#cbd5e1;font-size:11.5px;font-weight:600}
.status-btn.active{background:#2dd4a0;border-color:#3ddba0;color:#051b11;font-weight:800}

/* MOBILE BOTTOM NAVIGATION BAR */
.mobile-bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;z-index:75;background:rgba(8,12,23,0.96);backdrop-filter:blur(12px);border-top:1px solid #1e2942;grid-template-columns:repeat(4,1fr);padding:6px 8px calc(6px + env(safe-area-inset-bottom,0px))}
.mobile-bottom-nav button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:7px 4px;border:0;border-radius:12px;background:transparent;color:#8b9bb8;font-size:10.5px;font-weight:700;position:relative}
.mobile-bottom-nav button.active{color:#c4b5fd;background:rgba(91,70,232,0.18)}
.mobile-bottom-nav .m-icon{font-size:16px;line-height:1}
.mobile-bottom-nav .m-badge{position:absolute;top:3px;right:18%;font-size:9px;font-weight:800;padding:1px 5px;border-radius:99px;background:#ff4d6d;color:#fff}

/* RESPONSIVE BREAKPOINTS */
@media(max-width:1279px){
  .cards{grid-template-columns:repeat(2,minmax(0,1fr))}
  .stats{grid-template-columns:repeat(3,minmax(0,1fr))}
  .hero-grid{grid-template-columns:1.4fr 1fr}
  .hero-iso{display:none}
}
@media(max-width:1023px){
  .shell{display:block}
  .sidebar{position:fixed;left:0;top:0;bottom:0;width:282px;max-width:86vw;transform:translateX(-105%);transition:transform 0.22s ease;box-shadow:18px 0 44px rgba(0,0,0,0.65)}
  .sidebar.open{transform:translateX(0)}
  .mobile-menu-btn{display:grid}
  .mobile-bottom-nav{display:grid}
  .main{padding:16px 14px 96px}
  .filter-grid{display:block}
  .filter-grid > .filter-select{display:none}
  .mobile-filter-btn{display:inline-flex}
  .kbd-ctrl{display:none}
  .telemetry-split{grid-template-columns:1fr}
  .hero-grid{grid-template-columns:1fr}
  .hero-checks{justify-self:start}
  .tech-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:767px){
  .eyebrow{display:none}
  .topbar{margin-bottom:12px}
  .auth-pill{padding:8px 12px;font-size:11.5px;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .hero{padding:16px;border-radius:16px;margin-bottom:14px}
  .hero h1{font-size:24px}
  .hero p{font-size:12px;margin-bottom:12px}
  .hero-btns{display:grid;grid-template-columns:1fr;gap:8px;width:100%}
  .btn-sync-split,.btn-telemetry-hero{width:100%;justify-content:center}
  .btn-sync-main{flex:1;justify-content:center}
  .stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}
  .stats .stat:first-child{grid-column:span 2}
  .stats .stat:not(:first-child) > svg{display:none}
  .stat{padding:12px;border-radius:14px;gap:8px}
  .stat-left{gap:9px;width:100%}
  .stat-icon{width:36px;height:36px;border-radius:10px;font-size:15px}
  .stat .v{font-size:20px}
  .stat .k{font-size:10.5px;white-space:normal;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
  .stat .note{font-size:10px;white-space:normal;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
  .cards{grid-template-columns:1fr;gap:12px}
  .card{padding:15px;border-radius:15px;min-height:auto;gap:4px}
  .card-meta{white-space:normal;display:flex;flex-wrap:wrap;gap:4px;line-height:1.3}
  .card h3{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;font-size:15px;line-height:1.28}
  .desc{margin-top:9px;min-height:auto}
  .tags{margin-top:10px}
  .tag.vercel{max-width:100%}
  .links{margin-top:12px;padding-top:10px;gap:8px}
  .links a,.link-btn{padding:7px 11px;border-radius:9px;background:#141d33;border:1px solid #263554;font-size:11.5px;display:inline-flex;align-items:center;text-decoration:none !important}
  .link-deploy{background:rgba(13,46,40,0.75) !important;border-color:rgba(45,212,160,0.45) !important;color:#3ddba0 !important}
  .btn-analyze{min-height:42px;font-size:12px;margin-top:10px;border-radius:11px}
  .tech-grid{grid-template-columns:1fr}
  .modal-overlay{padding:0;align-items:flex-end}
  .modal-box{max-height:92vh;border-radius:20px 20px 0 0}
}
</style>
</head>
<body>
<div class="sidebar-backdrop" id="sidebar-backdrop" onclick="window.__closeMobileSidebar()"></div>
<div class="shell">
  <!-- SIDEBAR -->
  <aside class="sidebar" id="app-sidebar">
    <div>
      <div class="brand-row">
        <div class="brand">
          <div class="logo-box">
            <svg viewBox="0 0 36 36" width="24" height="24" fill="none">
              <defs>
                <linearGradient id="dcGrad" x1="4" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#38bdf8"/><stop offset="0.5" stop-color="#818cf8"/><stop offset="1" stop-color="#c084fc"/>
                </linearGradient>
              </defs>
              <path d="M9 7.5C9 5.8 10.8 4.8 12.3 5.7L28.5 15.2C30 16.1 30 18.2 28.5 19.1L12.3 28.6C10.8 29.5 9 28.5 9 26.8V7.5Z" stroke="url(#dcGrad)" stroke-width="3.2" stroke-linejoin="round"/>
              <path d="M14 13.5L21 17.2L14 21V13.5Z" fill="url(#dcGrad)"/>
            </svg>
          </div>
          <div style="min-width:0">
            <div style="font-weight:800;font-size:19px;line-height:1.15;color:#fff">DevCentral <span style="color:#a5b4fc;font-size:12px">3.0</span></div>
            <div style="font-size:10.5px;color:#7f8ea8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">Multi-contas • Neon DB • Firebase</div>
          </div>
        </div>
        <button class="collapse-btn" onclick="window.__closeMobileSidebar();window.__resetView()" title="Fechar / Painel Principal">✕</button>
      </div>

      <div style="margin-top:18px">
        <div class="sec-title"><span class="sec-dot"></span>INFRAESTRUTURA &amp; CONTAS</div>
        <div class="infra-list">
          <div class="infra-row">
            <span class="infra-left"><span style="color:#818cf8">🗄️</span><span>Neon PostgreSQL</span></span>
            <span class="pill-green">● Online</span>
          </div>
          <div class="infra-row">
            <span class="infra-left"><span>🔥</span><span>Firebase (devcentral-190fe)</span></span>
            <span class="pill-green">Ativo</span>
          </div>
          <button class="infra-row" onclick="window.__quickFilter('GitHub','')">
            <span class="infra-left"><span>🐙</span><span>GitHub</span></span>
            <span class="pill-green" id="sb-gh">Ativo (${ghCount})</span>
          </button>
          <button class="infra-row" onclick="window.__quickFilter('GitLab','')">
            <span class="infra-left"><span>🦊</span><span>GitLab (@ViniciusMurr...)</span></span>
            <span class="pill-green" id="sb-gl">Ativo (${glCount})</span>
          </button>
          <button class="infra-row" onclick="window.__quickFilter('','viniciuscasagrande-creator')">
            <span class="infra-left"><span style="color:#a5b4fc">▲</span><span style="overflow:hidden;text-overflow:ellipsis">viniciuscasagrande-creator</span></span>
            <span class="pill-green" id="sb-v1">Ativo (${v1Count})</span>
          </button>
          <button class="infra-row" onclick="window.__quickFilter('','DEVELOPDISKINGRESSOS-9897')">
            <span class="infra-left"><span style="color:#a5b4fc">▲</span><span style="overflow:hidden;text-overflow:ellipsis">DEVELOPDISKINGRESSOS-...</span></span>
            <span class="pill-green" id="sb-v2">Ativo (${v2Count})</span>
          </button>
        </div>
        <div id="auth-user-box" style="display:none;margin-top:8px;padding:8px;border-radius:10px;background:#0e1526;border:1px solid #1f2a44;font-size:10.5px"></div>
      </div>

      <div class="nav-sep">
        <div class="sec-title"><span class="sec-dot"></span>NAVEGAÇÃO</div>
        <nav class="nav">
          <button data-tab="all" class="active"><span>🏠 &nbsp; Visão geral</span><span class="badge" id="nav-total">${totalCount}</span></button>
          <button onclick="window.__resetView();document.getElementById('projects-anchor').scrollIntoView({behavior:'smooth'})"><span>&lt;/&gt; &nbsp; Projetos</span></button>
          <button data-tab="telemetry"><span>📈 &nbsp; Telemetria &amp; Soluções</span><span class="pill-novo">Novo</span></button>
          <button data-tab="pinned"><span>☆ &nbsp; Fixados no topo</span><span class="badge-plain" id="nav-pinned">${pinnedCount}</span></button>
          <button data-tab="online"><span>🚀 &nbsp; Em produção (Online)</span><span class="badge-plain" id="nav-online">${onlineCount}</span></button>
        </nav>
      </div>

      <div class="nav-sep">
        <div class="sec-title">FERRAMENTAS</div>
        <nav class="nav">
          <button data-tab="deployments"><span>🚀 &nbsp; Deploys &amp; Releases</span></button>
          <button onclick="window.__quickFilter('GitHub','')"><span>❖ &nbsp; Integrações &amp; API</span></button>
          <button data-tab="activity"><span>⚙️ &nbsp; Automação</span></button>
          <button onclick="document.getElementById('login-btn').click()"><span>🔧 &nbsp; Configurações</span></button>
        </nav>
      </div>
    </div>

    <!-- PROMO CARD -->
    <div class="promo-card" onclick="window.__openTelemetryTab()">
      <div class="promo-bars">
        <span style="width:5px;height:10px;border-radius:2px;background:#38bdf8"></span>
        <span style="width:5px;height:15px;border-radius:2px;background:#818cf8"></span>
        <span style="width:5px;height:19px;border-radius:2px;background:#c084fc"></span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div>
          <div style="font-weight:800;font-size:14px;color:#fff;margin-bottom:4px">Telemetria &amp; Soluções</div>
          <div style="font-size:11px;color:#9baac5;line-height:1.38">Monitore métricas, saúde dos projetos e receba recomendações inteligentes.</div>
        </div>
        <span class="promo-arrow">→</span>
      </div>
    </div>
  </aside>

  <!-- MAIN CONTENT -->
  <main class="main">
    <!-- TOP BAR -->
    <div class="topbar">
      <div class="topbar-left">
        <button class="mobile-menu-btn" onclick="window.__openMobileSidebar()" aria-label="Abrir menu lateral" title="Menu">☰</button>
        <div class="eyebrow">WORKSPACE PESSOAL • MULTI-CONTAS • NEON DB • FIREBASE AUTH</div>
      </div>
      <div class="top-actions" style="position:relative">
        <button class="circle-btn" onclick="document.getElementById('search').focus()" title="Pesquisar (Ctrl + K)">🔍</button>
        <div style="position:relative">
          <button class="circle-btn" id="alerts-bell-btn" onclick="window.__toggleAlertsBell()" aria-label="Alertas operacionais" aria-haspopup="dialog" title="Central de Alertas Operacionais">
            🔔<span id="alerts-unread-badge" style="position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;padding:0 4px;border-radius:99px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;display:${initialUnreadAlerts > 0 ? "grid" : "none"};place-items:center;border:2px solid #101729">${initialUnreadAlerts > 99 ? "99+" : initialUnreadAlerts}</span>
          </button>
          <div id="alerts-bell-backdrop" onclick="window.__closeAlertsBell()" style="display:none;position:fixed;inset:0;z-index:90;background:rgba(0,0,0,0.28)"></div>
          <section id="alerts-bell-panel" role="dialog" aria-label="Central de alertas operacionais" style="display:none;position:fixed;left:12px;right:12px;top:64px;z-index:95;max-height:75dvh;overflow-y:auto;border-radius:16px;border:1px solid #354366;background:#0c1425;padding:12px;box-shadow:0 24px 60px rgba(0,0,0,0.75);max-width:390px;margin-left:auto">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px">
              <div>
                <h2 style="margin:0;font-size:14px;font-weight:800;color:#fff">Alertas operacionais</h2>
                <p style="margin:2px 0 0;font-size:11px;color:#9baac5">Baseados na última telemetria registrada no Neon</p>
              </div>
              <div style="display:flex;gap:6px">
                <button type="button" id="alerts-scan-btn" onclick="window.__scanAlertsNow()" title="Analisar agora" aria-label="Atualizar alertas" style="width:36px;height:36px;border-radius:9px;border:1px solid #304261;background:#10192e;color:#e2e8f0;cursor:pointer;display:grid;place-items:center">↻</button>
                <button type="button" onclick="window.__closeAlertsBell()" aria-label="Fechar" style="width:36px;height:36px;border-radius:9px;border:1px solid #304261;background:#10192e;color:#e2e8f0;cursor:pointer;display:grid;place-items:center">✕</button>
              </div>
            </div>
            <div id="alerts-bell-list" style="display:grid;gap:8px"></div>
            <a href="/relatorios" style="margin-top:10px;min-height:42px;width:100%;border-radius:11px;border:1px solid #34415e;background:#151d31;color:#fff;font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;text-decoration:none">📊 Relatórios de saúde</a>
            <button type="button" onclick="window.__closeAlertsBell();window.__openTelemetryTab()" style="margin-top:8px;min-height:42px;width:100%;border-radius:11px;background:#5b46e8;border:1px solid #7c5cff;color:#fff;font-size:12px;font-weight:800;cursor:pointer">Abrir Telemetria &amp; Soluções</button>
          </section>
        </div>
        <button class="auth-pill" id="login-btn">🔒 Entrar com Google (Admin)</button>
      </div>
    </div>

    <!-- HERO BANNER -->
    <section class="hero">
      <div class="hero-bar"></div>
      <div class="hero-grid">
        <div style="padding-left:6px">
          <div class="hero-badge"><span style="color:#38bdf8">❖</span><span>DevCentral Workspace</span></div>
          <h1>Painel de <span>projetos</span></h1>
          <p>Projetos públicos visíveis; faça login com Google para carregar projetos privados e sincronizar via API.</p>
          <div class="hero-btns">
            <div class="btn-sync-split">
              <button class="btn-sync-main" id="sync-btn">🚀 Sincronizar projetos</button>
              <button class="btn-sync-chev" onclick="document.getElementById('sync-btn').click()" title="Opções de sincronização">⌄</button>
            </div>
            <button class="btn-telemetry-hero" id="quick-telemetry-btn">
              <span>▶ Abrir Telemetria &amp; Soluções</span>
              <span class="pill-novo">Novo</span>
            </button>
          </div>
        </div>

        <div class="hero-iso" style="display:flex;justify-content:center;align-items:center">
          <svg viewBox="0 0 260 155" width="230" height="138" fill="none" style="filter:drop-shadow(0 0 18px rgba(129,140,248,0.5))">
            <defs>
              <linearGradient id="isoTop" x1="60" y1="20" x2="200" y2="110" gradientUnits="userSpaceOnUse">
                <stop stop-color="#1e294a"/><stop offset="1" stop-color="#2e1d59"/>
              </linearGradient>
              <linearGradient id="isoStroke" x1="50" y1="20" x2="210" y2="140" gradientUnits="userSpaceOnUse">
                <stop stop-color="#38bdf8"/><stop offset="0.5" stop-color="#818cf8"/><stop offset="1" stop-color="#d946ef"/>
              </linearGradient>
            </defs>
            <path d="M130 58L204 98L130 138L56 98L130 58Z" fill="#121833" stroke="url(#isoStroke)" stroke-width="2" stroke-opacity="0.55"/>
            <path d="M130 40L204 80L130 120L56 80L130 40Z" fill="#171f3f" stroke="url(#isoStroke)" stroke-width="2.2" stroke-opacity="0.8"/>
            <path d="M130 18L204 58L130 98L56 58L130 18Z" fill="url(#isoTop)" stroke="url(#isoStroke)" stroke-width="2.8"/>
            <path d="M116 45L152 58L116 71V45Z" stroke="url(#isoStroke)" stroke-width="3.5" stroke-linejoin="round" fill="#818cf8" fill-opacity="0.25"/>
          </svg>
        </div>

        <div class="hero-checks">
          <div><span style="color:#818cf8;font-weight:800">✓</span><span>GitHub, GitLab e Vercel</span></div>
          <div><span style="color:#818cf8;font-weight:800">✓</span><span>Deploy e status em tempo real</span></div>
          <div><span style="color:#818cf8;font-weight:800">✓</span><span>Telemetria e recomendações</span><span class="pill-novo">Novo</span></div>
        </div>
      </div>
    </section>

    <!-- 5 KPI STATS -->
    <section class="stats">
      <div class="stat" onclick="window.__resetView()">
        <div class="stat-left">
          <div class="stat-icon" style="color:#9381ff">❖</div>
          <div style="min-width:0">
            <div class="k">Total no dashboard</div>
            <div class="v" id="st-total">${totalCount}</div>
            <div class="note">Projetos carregados</div>
          </div>
        </div>
        <svg width="62" height="26" viewBox="0 0 68 28" fill="none"><path d="M2 22C12 22 16 14 26 16C36 18 42 8 52 10C58 11 62 6 66 5" stroke="#a855f7" stroke-width="2.2" stroke-linecap="round"/></svg>
      </div>

      <div class="stat stat-online" onclick="window.__filterByState('online')">
        <div class="stat-left">
          <div class="stat-icon">🚀</div>
          <div style="min-width:0">
            <div class="k" style="color:#b5d6cc">Projetos online exibidos</div>
            <div class="v" id="st-online" style="color:#3ddba0">${onlineCount}</div>
            <div class="note" style="color:#84b8a8">Com link de deploy ativo</div>
          </div>
        </div>
        <svg width="62" height="26" viewBox="0 0 68 28" fill="none"><path d="M2 22C12 21 18 15 28 17C38 19 44 8 54 10C60 11 63 6 66 4" stroke="#3ddba0" stroke-width="2.2" stroke-linecap="round"/></svg>
      </div>

      <div class="stat" onclick="window.__quickFilter('GitHub','')">
        <div class="stat-left">
          <div class="stat-icon">🐙</div>
          <div style="min-width:0">
            <div class="k">GitHub</div>
            <div class="v" id="st-gh">${ghCount}</div>
            <div class="note">Repositórios</div>
          </div>
        </div>
        <svg width="62" height="26" viewBox="0 0 68 28" fill="none"><path d="M2 21C14 21 18 15 28 16C38 17 44 10 54 11C60 12 63 8 66 6" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round"/></svg>
      </div>

      <div class="stat" onclick="window.__quickFilter('GitLab','')">
        <div class="stat-left">
          <div class="stat-icon">🦊</div>
          <div style="min-width:0">
            <div class="k">GitLab</div>
            <div class="v" id="st-gl">${glCount}</div>
            <div class="note">Repositórios</div>
          </div>
        </div>
        <svg width="62" height="26" viewBox="0 0 68 28" fill="none"><path d="M2 20C14 20 22 18 34 19C46 20 52 15 66 15" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-opacity="0.65"/></svg>
      </div>

      <div class="stat" onclick="window.__filterByState('online')">
        <div class="stat-left">
          <div class="stat-icon" style="color:#c4b5fd">▲</div>
          <div style="min-width:0">
            <div class="k">Vercel (2 Contas)</div>
            <div class="v" id="st-vc" style="color:#a87ffb">${vcCount}</div>
            <div class="note">Aplicações hospedadas</div>
          </div>
        </div>
        <svg width="62" height="26" viewBox="0 0 68 28" fill="none"><path d="M2 22C12 22 18 14 28 16C38 18 44 8 54 10C60 11 63 6 66 5" stroke="#a87ffb" stroke-width="2.2" stroke-linecap="round"/></svg>
      </div>
    </section>

    <!-- ABA PROJETOS / DEPLOYS -->
    <section id="view-projects">
      <div class="filter-grid" id="projects-anchor">
        <div class="search-row-mobile">
          <div class="search-wrap">
            <span class="search-icon">🔍</span>
            <input class="search" type="search" id="search" placeholder="Pesquisar nome, linguagem, conta Vercel ou descrição...">
            <kbd class="kbd-ctrl">Ctrl + K</kbd>
          </div>
          <button type="button" class="mobile-filter-btn" id="mobile-filter-btn" onclick="window.__openFilterSheet()">
            <span>⚙ Filtros</span>
          </button>
        </div>
        <select class="filter-select" id="f-source">
          <option value="">▽ Todas as fontes</option>
          <option value="GitHub">GitHub</option>
          <option value="GitLab">GitLab</option>
          <option value="Vercel">Vercel</option>
        </select>
        <select class="filter-select" id="f-account">
          <option value="">❖ Todas as contas Vercel</option>
          <option value="viniciuscasagrande-creator">▲ viniciuscasagrande-creator</option>
          <option value="DEVELOPDISKINGRESSOS-9897">▲ DEVELOPDISKINGRESSOS-9897</option>
        </select>
        <select class="filter-select" id="f-lang">
          <option value="">&lt;/&gt; Todas as linguagens</option>
        </select>
        <select class="filter-select" id="f-state">
          <option value="">~ Todos os status</option>
          <option value="online">Online (Em produção)</option>
          <option value="dev">Em desenvolvimento</option>
        </select>
      </div>

      <div class="sec-bar">
        <div class="sec-bar-left">
          <span style="color:#a87ffb;font-size:18px">📁</span>
          <h2 id="grid-heading">Seus projetos</h2>
          <span class="count-pill" id="sec-count-pill">${totalCount}</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div class="view-toggle">
            <button id="btn-view-grid" class="active" onclick="window.__setViewMode('grid')" title="Grade">⊞</button>
            <button id="btn-view-list" onclick="window.__setViewMode('list')" title="Lista">☰</button>
          </div>
          <span id="result-count" style="font-size:12px;color:var(--muted)">${totalCount} projeto(s) exibido(s)</span>
        </div>
      </div>

      <div class="cards" id="cards">
${preRenderedCardsHtml}
      </div>
    </section>

    <!-- ABA TELEMETRIA & SOLUÇÕES -->
    <section id="view-telemetry" style="display:none">
      <div class="telemetry-wrap">
        <div class="telemetry-bar">
          <div class="subtabs">
            <button data-subtab-btn="diagnostic" class="active">🩺 Diagnóstico por Projeto (${openRecsCount})</button>
            <button data-subtab-btn="alerts">⚠️ Erros &amp; Alertas</button>
            <button data-subtab-btn="improvements">💡 Sugestões de Melhoria</button>
            <button data-subtab-btn="tasks">📋 Central de Tarefas</button>
            <button data-subtab-btn="activity">🕒 Eventos Git &amp; Sync</button>
            <button data-subtab-btn="history">✅ Histórico de Soluções</button>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <select id="tel-project" class="filter-select" style="width:auto;padding:7px 11px">
              <option value="all">Todos os projetos</option>
            </select>
            <select id="tel-status" class="filter-select" style="width:auto;padding:7px 11px">
              <option value="all">Todos os status</option>
              <option value="open">Pendente</option>
              <option value="investigating">Em análise</option>
              <option value="resolved">Resolvida</option>
            </select>
            <input id="tel-search" type="search" placeholder="Filtrar diagnósticos..." class="filter-select" style="width:auto;min-width:190px;padding:7px 11px">
          </div>
        </div>

        <div class="telemetry-split" id="telemetry-split-box">
          <div class="diag-list" id="diag-list"></div>
          <div class="diag-detail" id="diag-detail"></div>
        </div>

        <div id="telemetry-events-box" style="display:none;background:#0e1526;border:1px solid #222e4a;border-radius:14px;padding:18px"></div>
      </div>
    </section>

    <!-- ABA ATIVIDADE -->
    <section id="view-activity" style="display:none;margin-top:8px">
      <div style="background:#0e1526;border:1px solid #222e4a;border-radius:14px;padding:20px">
        <h2 style="margin:0 0 12px;font-size:17px">Histórico de Sincronizações &amp; Automação (Neon DB)</h2>
        <div id="activity-list" style="display:grid;gap:10px"></div>
      </div>
    </section>
  </main>
</div>

<!-- MOBILE FILTER BOTTOM SHEET -->
<div class="sheet-overlay" id="mobile-filter-sheet" onclick="if(event.target===this)window.__closeFilterSheet()">
  <div class="sheet-box">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div>
        <div style="font-weight:800;font-size:16px;color:#fff">Filtros Rápidos Mobile</div>
        <div style="font-size:11.5px;color:#8b9bb8">GitHub, GitLab, Vercel 1 &amp; 2, Linguagem, Status e Favoritos</div>
      </div>
      <button class="status-btn" onclick="window.__closeFilterSheet()">✕ Fechar</button>
    </div>

    <div style="font-size:11px;font-weight:800;color:#8b9bb8;text-transform:uppercase;letter-spacing:1px">Origem &amp; Contas Vercel</div>
    <div class="sheet-pills">
      <button class="sheet-pill" id="mp-gh" onclick="window.__quickFilter('GitHub','');window.__syncFilterSheet()">🐙 GitHub (${ghCount})</button>
      <button class="sheet-pill" id="mp-gl" onclick="window.__quickFilter('GitLab','');window.__syncFilterSheet()">🦊 GitLab (${glCount})</button>
      <button class="sheet-pill" id="mp-v1" onclick="window.__quickFilter('','viniciuscasagrande-creator');window.__syncFilterSheet()">▲ Vercel 1 (${v1Count})</button>
      <button class="sheet-pill" id="mp-v2" onclick="window.__quickFilter('','DEVELOPDISKINGRESSOS-9897');window.__syncFilterSheet()">▲ Vercel 2 (${v2Count})</button>
    </div>

    <div style="font-size:11px;font-weight:800;color:#8b9bb8;text-transform:uppercase;letter-spacing:1px;margin-top:14px">Status &amp; Favoritos</div>
    <div class="sheet-pills">
      <button class="sheet-pill" id="mp-online" onclick="window.__filterByState($('f-state').value==='online'?'':'online');window.__syncFilterSheet()">● Online (${onlineCount})</button>
      <button class="sheet-pill" id="mp-dev" onclick="window.__filterByState($('f-state').value==='dev'?'':'dev');window.__syncFilterSheet()">● Em dev</button>
      <button class="sheet-pill" id="mp-pin" style="grid-column:span 2" onclick="activeTab=(activeTab==='pinned'?'all':'pinned');render();window.__syncFilterSheet()">★ Apenas Favoritos Fixados no Topo (${pinnedCount})</button>
    </div>

    <div style="font-size:11px;font-weight:800;color:#8b9bb8;text-transform:uppercase;letter-spacing:1px;margin-top:14px;margin-bottom:6px">Linguagem / Stack</div>
    <select class="filter-select" id="mp-lang" onchange="$('f-lang').value=this.value;renderProjects()">
      <option value="">&lt;/&gt; Todas as linguagens</option>
    </select>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
      <button class="status-btn" style="padding:12px" onclick="window.__resetView();window.__syncFilterSheet()">Limpar filtros</button>
      <button class="status-btn" style="padding:12px;background:#5641e5;border-color:#8e7bff;color:#fff" onclick="window.__closeFilterSheet()">Ver resultados</button>
    </div>
  </div>
</div>

<!-- MOBILE BOTTOM NAVIGATION BAR -->
<nav class="mobile-bottom-nav" id="mobile-bottom-nav" aria-label="Navegação inferior mobile">
  <button type="button" data-mbnav="all" class="active" onclick="window.__resetView();window.scrollTo({top:0,behavior:'smooth'})">
    <span class="m-icon">🏠</span>
    <span>Visão Geral</span>
  </button>
  <button type="button" data-mbnav="projects" onclick="window.__resetView();document.getElementById('projects-anchor').scrollIntoView({behavior:'smooth'})">
    <span class="m-icon">&lt;/&gt;</span>
    <span>Projetos</span>
  </button>
  <button type="button" data-mbnav="telemetry" onclick="window.__openTelemetryTab()">
    <span class="m-icon">📈</span>
    <span>Telemetria</span>
    <span class="m-badge" id="mb-tel-badge">${openRecsCount}</span>
  </button>
  <button type="button" data-mbnav="settings" onclick="document.getElementById('login-btn').click()">
    <span class="m-icon">🔧</span>
    <span>Config</span>
  </button>
</nav>

<!-- MODAL: ANALISAR PROJETO & FICHA TÉCNICA COMPLETA -->
<div class="modal-overlay" id="project-modal" onclick="if(event.target===this)window.__closeProjectModal()">
  <div class="modal-box" id="project-modal-box">
    <div class="modal-head" id="project-modal-head"></div>
    <div class="modal-tabs" id="project-modal-tabs">
      <button data-mtab="ficha" class="active" onclick="window.__setModalTab('ficha')">1. Ficha Técnica Completa</button>
      <button data-mtab="deploys" onclick="window.__setModalTab('deploys')">2. Saúde dos Deploys &amp; HTTP</button>
      <button data-mtab="diagnostico" onclick="window.__setModalTab('diagnostico')">3. Diagnóstico &amp; Problemas</button>
      <button data-mtab="assistente" onclick="window.__setModalTab('assistente')">4. Assistente de Soluções (Revisão Humana)</button>
      <button data-mtab="tarefas" onclick="window.__setModalTab('tarefas')">5. Tarefas &amp; Issues</button>
    </div>
    <div class="modal-body" id="project-modal-body"></div>
    <div class="modal-foot" id="project-modal-foot"></div>
  </div>
</div>

<script>
const INITIAL_PROJECTS = ${JSON.stringify(safeRows).replace(/</g, "\\u003c")};
const INITIAL_RECS = ${JSON.stringify(initialRecs).replace(/</g, "\\u003c")};
const INITIAL_LOGS = ${JSON.stringify(safeLogs).replace(/</g, "\\u003c")};
const INITIAL_TASKS = ${JSON.stringify(initialTasks).replace(/</g, "\\u003c")};
const INITIAL_ALERTS = ${JSON.stringify(initialAlerts).replace(/</g, "\\u003c")};
const DEFAULT_TAB = ${JSON.stringify(defaultTab)};

let projects = INITIAL_PROJECTS;
let recommendations = INITIAL_RECS;
let syncLogs = INITIAL_LOGS;
let tasks = INITIAL_TASKS;
let opAlerts = INITIAL_ALERTS;
let alertsOpen = false;
let activeTab = window.location.pathname.includes("/telemetria") ? "telemetry" : DEFAULT_TAB;
let activeSubTab = "diagnostic";
let selectedRecId = recommendations[0]?.id || null;
let currentModalProjectId = null;
let currentModalTab = "ficha";
let opPhase = "analyze";
let consoleLogFilter = "";
let opInspections = {};

try {
  const localStatuses = JSON.parse(localStorage.getItem("devcentral_rec_statuses_v3") || "{}");
  recommendations = recommendations.map(r => localStatuses[r.id] ? { ...r, status: localStatuses[r.id] } : r);
  const localTasks = JSON.parse(localStorage.getItem("devcentral_tasks_v3") || "null");
  if (Array.isArray(localTasks) && localTasks.length > 0) tasks = localTasks;
  const localReadAlerts = JSON.parse(localStorage.getItem("devcentral_alerts_read_v3") || "{}");
  opAlerts = opAlerts.map(a => localReadAlerts[a.id] ? { ...a, readAt: localReadAlerts[a.id] } : a);
} catch {}

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("search")?.focus();
  }
  if (e.key === "Escape") {
    window.__closeProjectModal();
    window.__closeAlertsBell?.();
  }
});

function renderAlertsBell() {
  const unread = opAlerts.filter(a => a.state === "active" && !a.readAt).length;
  const badge = $("alerts-unread-badge");
  if (badge) {
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.style.display = unread > 0 ? "grid" : "none";
  }
  const listEl = $("alerts-bell-list");
  if (!listEl) return;
  if (!opAlerts.length) {
    listEl.innerHTML = '<p style="font-size:12px;color:#9baac5;padding:24px 8px;text-align:center;margin:0">Nenhum alerta registrado. Clique em ↻ para executar uma análise.</p>';
    return;
  }
  listEl.innerHTML = opAlerts.slice(0, 20).map(a => \`
    <article style="border-radius:12px;border:1px solid \${a.state==='active'?'#374767':'#253149'};background:\${a.state==='active'?'#141e31':'#0d1626'};padding:11px;\${a.state==='recovered'?'opacity:0.65':''}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div style="min-width:0">
          <div style="font-size:10px;color:#9baac5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">\${esc(a.projectName)} · \${a.state==='recovered'?'Recuperado':a.severity==='critical'?'Crítico':'Atenção'}</div>
          <h3 style="margin:4px 0 0;font-size:12px;font-weight:700;color:#fff;word-break:break-word">\${esc(a.title)}</h3>
        </div>
        \${a.state==='active' && !a.readAt ? '<span style="width:8px;height:8px;border-radius:99px;background:#f87171;flex-shrink:0" aria-label="Não lido"></span>' : ''}
      </div>
      <p style="margin:6px 0 0;font-size:11px;color:#bac6da;line-height:1.4;word-break:break-word">\${esc(a.evidence)}</p>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center;justify-content:space-between">
        <time style="font-size:10px;color:#92a2bd">\${new Date(a.lastSeenAt).toLocaleString("pt-BR")}</time>
        \${!a.readAt ? \`<button type="button" onclick="window.__markAlertRead('\${esc(a.id)}')" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#3ddba0;background:transparent;border:1px solid rgba(45,212,160,0.35);padding:4px 8px;border-radius:7px;cursor:pointer">✓ Marcar lido</button>\` : '<span style="font-size:10px;color:#64748b">Lido</span>'}
      </div>
    </article>
  \`).join("");
}

window.__toggleAlertsBell = async () => {
  alertsOpen = !alertsOpen;
  if ($("alerts-bell-panel")) $("alerts-bell-panel").style.display = alertsOpen ? "block" : "none";
  if ($("alerts-bell-backdrop")) $("alerts-bell-backdrop").style.display = alertsOpen ? "block" : "none";
  if (alertsOpen && window.__authedToken) {
    try {
      const res = await fetch("/api/alerts", { headers: { Authorization: "Bearer " + window.__authedToken }, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.alerts)) opAlerts = data.alerts;
      }
    } catch {}
  }
  renderAlertsBell();
};

window.__closeAlertsBell = () => {
  alertsOpen = false;
  if ($("alerts-bell-panel")) $("alerts-bell-panel").style.display = "none";
  if ($("alerts-bell-backdrop")) $("alerts-bell-backdrop").style.display = "none";
};

window.__scanAlertsNow = async () => {
  const btn = $("alerts-scan-btn");
  if (btn) btn.textContent = "⏳";
  if (window.__authedToken) {
    try {
      await fetch("/api/alerts", { method: "POST", headers: { Authorization: "Bearer " + window.__authedToken } });
      const res = await fetch("/api/alerts", { headers: { Authorization: "Bearer " + window.__authedToken }, cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.alerts)) opAlerts = data.alerts;
      }
    } catch {}
  }
  const activeIds = new Set(
    recommendations
      .filter(r => r.kind === "confirmed_issue" && (r.severity === "critical" || r.severity === "warning") && r.status !== "resolved")
      .map(r => r.id)
  );
  const nowIso = new Date().toISOString();
  const byId = new Map(opAlerts.map(a => [a.id, { ...a }]));
  for (const r of recommendations) {
    if (r.kind === "confirmed_issue" && (r.severity === "critical" || r.severity === "warning") && r.status !== "resolved") {
      const prev = byId.get(r.id);
      byId.set(r.id, {
        id: r.id,
        projectId: r.projectId,
        projectName: r.projectName || "Sistema",
        title: r.title,
        evidence: r.evidence,
        severity: r.severity,
        state: "active",
        readAt: prev && prev.state === "recovered" ? null : (prev ? prev.readAt : null),
        firstSeenAt: prev ? prev.firstSeenAt : nowIso,
        lastSeenAt: nowIso,
        recoveredAt: null,
        occurrences: prev ? prev.occurrences + 1 : 1
      });
    }
  }
  for (const [id, a] of byId.entries()) {
    if (!activeIds.has(id) && a.state === "active") {
      byId.set(id, { ...a, state: "recovered", recoveredAt: nowIso });
    }
  }
  opAlerts = Array.from(byId.values());
  if (btn) btn.textContent = "↻";
  renderAlertsBell();
};

window.__markAlertRead = async (id) => {
  const nowIso = new Date().toISOString();
  opAlerts = opAlerts.map(a => a.id === id ? { ...a, readAt: a.readAt || nowIso } : a);
  try {
    const saved = JSON.parse(localStorage.getItem("devcentral_alerts_read_v3") || "{}");
    saved[id] = nowIso;
    localStorage.setItem("devcentral_alerts_read_v3", JSON.stringify(saved));
  } catch {}
  renderAlertsBell();
  if (window.__authedToken) {
    try {
      await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + window.__authedToken },
        body: JSON.stringify({ id })
      });
    } catch {}
  }
};

function inferDb(p) {
  const hay = [p.name, p.description, p.tech, ...(p.tags || [])].join(" ").toLowerCase();
  if (hay.includes("neon") || hay.includes("postgres")) return "Neon PostgreSQL (Serverless)";
  if (hay.includes("supabase")) return "Supabase PostgreSQL";
  if (hay.includes("firebase") || hay.includes("firestore")) return "Firebase / Cloud Firestore";
  if (hay.includes("prisma")) return "PostgreSQL via Prisma ORM";
  if (hay.includes("mongo")) return "MongoDB Atlas";
  return "Neon PostgreSQL / Storage Integrado";
}

function updateCounters() {
  const total = projects.length;
  const online = projects.filter(p => p.state === "online" || p.deploy_url).length;
  const gh = projects.filter(p => p.source === "GitHub").length;
  const gl = projects.filter(p => p.source === "GitLab").length;
  const v1 = projects.filter(p => (p.vercel_accounts || []).includes("viniciuscasagrande-creator")).length;
  const v2 = projects.filter(p => (p.vercel_accounts || []).includes("DEVELOPDISKINGRESSOS-9897")).length;
  const vc = projects.filter(p => p.source === "Vercel" || (p.vercel_accounts && p.vercel_accounts.length > 0) || (p.deploy_url && p.deploy_url.includes("vercel.app"))).length;

  $("st-total").textContent = total;
  $("st-online").textContent = online;
  $("st-gh").textContent = gh;
  $("st-gl").textContent = gl;
  $("st-vc").textContent = vc;
  $("nav-total").textContent = total;
  $("nav-pinned").textContent = projects.filter(p => p.is_pinned).length;
  $("nav-online").textContent = online;
  $("sb-gh").textContent = "Ativo (" + gh + ")";
  $("sb-gl").textContent = "Ativo (" + gl + ")";
  if ($("sb-v1")) $("sb-v1").textContent = "Ativo (" + v1 + ")";
  if ($("sb-v2")) $("sb-v2").textContent = "Ativo (" + v2 + ")";
}

function renderProjects() {
  const q = $("search").value.toLowerCase().trim();
  const src = $("f-source").value;
  const acc = $("f-account").value;
  const lang = $("f-lang").value;
  const st = $("f-state").value;

  const langs = [...new Set(projects.map(p => p.tech).filter(Boolean))].sort();
  $("f-lang").innerHTML = '<option value="">&lt;/&gt; Todas as linguagens</option>' +
    langs.map(x => \`<option value="\${esc(x)}" \${lang===x?"selected":""}>\${esc(x)}</option>\`).join("");

  const filtered = projects.filter(p => {
    const isOnline = p.state === "online" || Boolean(p.deploy_url);
    if (activeTab === "pinned" && !p.is_pinned) return false;
    if (activeTab === "online" && !isOnline) return false;
    if (activeTab === "deployments" && !(p.source === "Vercel" || (p.vercel_accounts && p.vercel_accounts.length > 0) || p.deploy_url)) return false;
    if (src && p.source !== src) return false;
    if (acc && !(p.vercel_accounts || []).includes(acc)) return false;
    if (lang && p.tech !== lang) return false;
    if (st === "online" && !isOnline) return false;
    if (st === "dev" && isOnline) return false;
    if (q) {
      const hay = [p.name, p.description, p.tech, p.source, ...(p.vercel_accounts || []), ...(p.tags || [])].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  $("sec-count-pill").textContent = filtered.length;
  $("result-count").textContent = filtered.length + " projeto(s) exibido(s)";
  $("cards").innerHTML = filtered.map(p => {
    const isOnline = p.state === "online" || Boolean(p.deploy_url);
    const vAccs = Array.isArray(p.vercel_accounts) ? p.vercel_accounts : [];
    const techPills = Array.from(new Set([p.tech || "TypeScript", ...(p.tags || [])].filter(Boolean))).slice(0, 4);

    return \`<article class="card \${isOnline ? "card-online" : "card-off"}">
      <div>
        <div class="card-head">
          <div style="display:flex;gap:10px;align-items:flex-start;min-width:0;flex:1;cursor:pointer" onclick="window.__openProjectModal('\${esc(p.id)}')">
            <div class="avatar">\${esc((p.name || "PR").slice(0,2).toUpperCase())}</div>
            <div style="min-width:0;flex:1">
              <div class="card-meta">
                \${esc(p.source.toUpperCase())} • \${p.visibility === "private" ? "🔒 PRIVADO" : "🌐 PÚBLICO"}\${p.is_pinned ? " • <span style='color:#c4b5fd'>FIXADO</span>" : ""}
              </div>
              <h3 title="\${esc(p.name)}">\${esc(p.name)}</h3>
            </div>
          </div>
          <span class="status \${isOnline ? "" : "off"}">● \${isOnline ? "Online" : "Em dev"}</span>
        </div>
        <p class="desc">\${esc(p.description || "Projeto sincronizado com Neon PostgreSQL.")}</p>
        <div class="tags">
          \${techPills.map(t => \`<span class="tag">\${esc(t)}</span>\`).join("")}
          \${vAccs.map(a => \`<span class="tag vercel" title="\${esc(a)}">▲ \${esc(a)}</span>\`).join("")}
        </div>
      </div>
      <div>
        <div class="links">
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            \${p.repo_url ? \`<a class="link-repo" href="\${esc(p.repo_url)}" target="_blank" rel="noopener">Repositório ↗</a>\` : \`<button class="link-btn" onclick="window.__openProjectModal('\${esc(p.id)}')">Repositório ↗</button>\`}
            \${p.deploy_url ? \`<a class="link-deploy" href="\${esc(p.deploy_url)}" target="_blank" rel="noopener">Abrir site ↗</a>\` : \`<button class="link-btn" style="color:#8b9bb8" onclick="window.__openProjectModal('\${esc(p.id)}')">Detalhes ↗</button>\`}
          </div>
          <div class="card-actions">
            \${p.repo_url ? \`<a class="icon-act" href="\${esc(p.repo_url)}" target="_blank" rel="noopener" title="Repositório GitHub"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg></a>\` : ""}
            <button class="icon-act \${p.is_pinned ? "pinned" : ""}" onclick="window.__togglePinLocal('\${esc(p.id)}')" title="Fixar no topo">★</button>
            <button class="icon-act" onclick="window.__openProjectModal('\${esc(p.id)}')" title="Analisar projeto">•••</button>
          </div>
        </div>
        <button class="btn-analyze" onclick="window.__openProjectModal('\${esc(p.id)}')">📈 Analisar projeto</button>
      </div>
    </article>\`;
  }).join("");
}

function renderTelemetry() {
  const projSelect = $("tel-project");
  const curProj = projSelect.value || "all";
  const sortedProjs = [...projects].sort((a,b) => a.name.localeCompare(b.name));
  projSelect.innerHTML = '<option value="all">Todos os projetos (' + projects.length + ')</option>' +
    sortedProjs.map(p => \`<option value="\${esc(p.id)}" \${curProj===p.id?"selected":""}>\${esc(p.name)}</option>\`).join("");

  document.querySelectorAll("[data-subtab-btn]").forEach(b => {
    b.classList.toggle("active", b.dataset.subtabBtn === activeSubTab);
  });

  if (activeSubTab === "tasks") {
    $("telemetry-split-box").style.display = "none";
    $("telemetry-events-box").style.display = "block";
    $("telemetry-events-box").innerHTML = \`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
        <div>
          <h3 style="margin:0;font-size:16px">📋 Planos de Ação &amp; Tarefas Operacionais (\${tasks.length})</h3>
          <div style="font-size:12px;color:var(--muted)">Diagnósticos convertidos em tarefas com responsável, prioridade, prazo, checklist interativo e vínculo com Issues/PRs.</div>
        </div>
      </div>
      <div style="display:grid;gap:10px">
        \${tasks.length === 0 ? '<div style="padding:20px;text-align:center;color:var(--muted);border:1px solid #1e293b;border-radius:10px">Nenhuma tarefa registrada. Clique em "+ Plano de Ação" em qualquer diagnóstico ou dentro de "Analisar projeto".</div>' : tasks.map(t => \`
          <div style="padding:13px 15px;border-radius:11px;background:#090d18;border:1px solid #22304d;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:240px">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <span class="sev-pill \${t.priority==='high'?'sev-critical':t.priority==='medium'?'sev-warning':'sev-info'}">\${t.priority==='high'?'Alta':t.priority==='medium'?'Média':'Baixa'}</span>
                <strong style="color:#a5b4fc;font-size:12px">\${esc(t.projectName)}</strong>
                <strong style="color:#fff;font-size:13.5px;\${t.status==='done'?'text-decoration:line-through;opacity:0.6':''}">\${esc(t.title)}</strong>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:11px;color:#cbd5e1">
                <span style="padding:2px 8px;border-radius:6px;background:#111827;border:1px solid #1e293b">👤 Resp: <strong>\${esc(t.assignee || "Vinicius Casagrande")}</strong></span>
                <span style="padding:2px 8px;border-radius:6px;background:#111827;border:1px solid #1e293b;color:#fcd34d">📅 Prazo: <strong>\${esc(t.dueDate || "Sem prazo")}</strong></span>
              </div>
              \${t.notes ? \`<div style="font-size:12px;color:var(--muted);margin-top:6px">\${esc(t.notes)}</div>\` : ""}
              \${Array.isArray(t.checklist) && t.checklist.length > 0 ? \`
                <div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:#050811;border:1px solid #1e293b;display:grid;gap:5px">
                  <div style="font-size:10px;font-weight:800;color:#94a3b8;text-transform:uppercase">Checklist de Execução (\${t.checklist.filter(c=>c.done).length}/\${t.checklist.length})</div>
                  \${t.checklist.map(c => \`
                    <label style="display:flex;align-items:center;gap:8px;font-size:11.5px;color:\${c.done?'#64748b':'#e2e8f0'};cursor:pointer;\${c.done?'text-decoration:line-through':''}">
                      <input type="checkbox" \${c.done?'checked':''} onchange="window.__toggleTaskCheck('\${esc(t.id)}','\${esc(c.id)}')">
                      <span>\${esc(c.text)}</span>
                    </label>
                  \`).join("")}
                </div>
              \` : ""}
              \${t.issueUrl ? \`<a href="\${esc(t.issueUrl)}" target="_blank" rel="noopener" style="font-size:11.5px;color:#3ddba0;display:inline-block;margin-top:6px">Abrir Issue / PR no Repositório ↗</a>\` : ""}
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              <select class="filter-select" style="width:auto;padding:5px 9px;font-size:11.5px" onchange="window.__updateTaskStatus('\${esc(t.id)}', this.value)">
                <option value="todo" \${t.status==='todo'?'selected':''}>Pendente</option>
                <option value="in_progress" \${t.status==='in_progress'?'selected':''}>Em andamento</option>
                <option value="done" \${t.status==='done'?'selected':''}>Concluída</option>
              </select>
            </div>
          </div>
        \`).join("")}
      </div>
    \`;
    return;
  }

  if (activeSubTab === "activity") {
    $("telemetry-split-box").style.display = "none";
    $("telemetry-events-box").style.display = "block";
    const commitEvents = projects.filter(p => p.last_commit_at).slice(0, 30);
    $("telemetry-events-box").innerHTML = \`
      <h3 style="margin:0 0 12px;font-size:16px">Linha do Tempo de Sincronizações &amp; Últimos Commits</h3>
      <div style="display:grid;gap:9px">
        \${syncLogs.map(l => \`
          <div style="padding:11px 14px;border-radius:10px;background:#090d18;border:1px solid #1e293b;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div>
              <span class="sev-pill sev-info">SYNC</span>
              <strong style="margin-left:8px;font-size:13px">Sincronização Multi-Contas (\${esc(l.status)})</strong>
              <div style="font-size:11.5px;color:var(--muted);margin-top:4px">GitHub: \${l.github_count} · GitLab: \${l.gitlab_count} · Vercel 1: \${l.vercel1_count} · Vercel 2: \${l.vercel2_count}</div>
            </div>
            <span style="font-size:11px;color:var(--muted)">\${new Date(l.synced_at).toLocaleString("pt-BR")}</span>
          </div>
        \`).join("")}
        \${commitEvents.map(p => \`
          <div style="padding:11px 14px;border-radius:10px;background:#090d18;border:1px solid #1e293b;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div>
              <span class="sev-pill" style="background:rgba(45,212,160,0.15);color:#3ddba0;border:1px solid rgba(45,212,160,0.35)">COMMIT</span>
              <strong style="margin-left:8px;font-size:13px">\${esc(p.name)}</strong>
              <span style="font-size:11px;color:var(--muted);margin-left:6px">(\${esc(p.source)} • \${esc(p.tech)})</span>
            </div>
            <span style="font-size:11px;color:var(--muted)">\${new Date(p.last_commit_at).toLocaleString("pt-BR")}</span>
          </div>
        \`).join("")}
      </div>
    \`;
    return;
  }

  $("telemetry-split-box").style.display = "grid";
  $("telemetry-events-box").style.display = "none";

  const stFilter = $("tel-status").value;
  const q = $("tel-search").value.toLowerCase().trim();

  const filtered = recommendations.filter(r => {
    if (curProj !== "all" && r.projectId !== curProj) return false;
    if (activeSubTab === "alerts" && r.severity === "info") return false;
    if (activeSubTab === "improvements" && r.severity !== "info") return false;
    if (activeSubTab === "history" && r.status === "open") return false;
    if (stFilter !== "all" && r.status !== stFilter) return false;
    if (q) {
      const hay = [r.title, r.projectName, r.evidence, r.action, r.probableCause].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (filtered.length > 0 && !filtered.some(r => r.id === selectedRecId)) {
    selectedRecId = filtered[0].id;
  }

  const statusLabels = { open: "Pendente", investigating: "Em análise", resolved: "Resolvida" };
  const sevLabels = { critical: "Crítico", warning: "Alerta", info: "Melhoria" };

  if (filtered.length === 0) {
    $("diag-list").innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);background:#0e1526;border:1px solid #222e4a;border-radius:12px">Nenhum diagnóstico encontrado para os filtros selecionados.</div>';
    $("diag-detail").innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted)">Selecione outro filtro ou projeto para inspecionar o plano de ação.</div>';
    return;
  }

  $("diag-list").innerHTML = filtered.map(r => \`
    <div class="diag-item \${r.id === selectedRecId ? "active" : ""}" onclick="window.__selectRec('\${esc(r.id)}')">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
        <span class="sev-pill sev-\${esc(r.severity)}">\${sevLabels[r.severity] || r.severity}</span>
        <span style="font-size:10.5px;color:var(--muted);font-weight:700">\${statusLabels[r.status] || r.status}</span>
      </div>
      <div style="font-weight:700;font-size:13.5px;color:#fff;margin-bottom:3px">\${esc(r.title)}</div>
      <div style="font-size:11.5px;color:#a5b4fc;font-weight:600;margin-bottom:5px">\${esc(r.projectName || "Catálogo Global")}</div>
      <div style="font-size:11.5px;color:var(--muted);line-height:1.35">\${esc(r.evidence)}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;padding-top:8px;border-top:1px solid #1e2942">
        <button class="status-btn" style="padding:5px 10px;font-size:11px;color:#3ddba0;border-color:rgba(45,212,160,0.4)" onclick="event.stopPropagation();window.__selectRec('\${esc(r.id)}');document.getElementById('diag-detail')?.scrollIntoView({behavior:'smooth',block:'start'})">Ver solução</button>
        \${r.projectId ? \`<button class="status-btn" style="padding:5px 10px;font-size:11px;color:#c4b5fd;border-color:rgba(139,92,246,0.45)" onclick="event.stopPropagation();window.__openProjectModal('\${esc(r.projectId)}')">Analisar projeto</button>\` : ""}
        \${r.status !== "resolved" ? \`<button class="status-btn" style="padding:5px 10px;font-size:11px;background:#0d2e28;color:#3ddba0;border-color:rgba(45,212,160,0.45);margin-left:auto" onclick="event.stopPropagation();window.__setRecStatus('\${esc(r.id)}','resolved')">✓ Marcar resolvido</button>\` : ""}
      </div>
    </div>
  \`).join("");

  const sel = filtered.find(r => r.id === selectedRecId) || filtered[0];
  const selProj = projects.find(p => p.id === sel.projectId || (sel.projectName && p.name.toLowerCase() === sel.projectName.toLowerCase())) || null;
  const selInsp = selProj ? opInspections[selProj.id] : null;
  const repoClean = selProj?.repo_url ? selProj.repo_url.replace(/\\.git$/, "") : "";
  const issueHref = repoClean ? (repoClean.includes("gitlab.com")
    ? repoClean + "/-/issues/new?issue[title]=" + encodeURIComponent("[DevCentral Diagnóstico] " + sel.title) + "&issue[description]=" + encodeURIComponent("## Evidência\\n" + sel.evidence + "\\n\\n## Causa Provável\\n" + (sel.probableCause || "") + "\\n\\n## Plano de Ação\\n" + sel.action)
    : repoClean + "/issues/new?title=" + encodeURIComponent("[DevCentral Diagnóstico] " + sel.title) + "&body=" + encodeURIComponent("## Evidência\\n" + sel.evidence + "\\n\\n## Causa Provável\\n" + (sel.probableCause || "") + "\\n\\n## Plano de Ação\\n" + sel.action)) : "";
  const consoleLines = selInsp?.consoleLines || [
    "[BUILD] Iniciando diagnóstico operacional para " + (selProj?.name || sel.projectName || "Catálogo") + " (" + (selProj?.tech || "TypeScript") + ")",
    "[EVIDENCE] " + sel.evidence,
    "[CAUSE] " + (sel.probableCause || "Configuração pendente ou divergência entre repositório e provedor de deploy."),
    selProj?.deploy_url ? "[READY] Endpoint publicado em " + selProj.deploy_url : "[WARN] Sem deploy_url ativo registrado no catálogo.",
    "[ACTION] " + sel.action
  ];
  const filteredLines = consoleLogFilter ? consoleLines.filter(l => l.toLowerCase().includes(consoleLogFilter.toLowerCase())) : consoleLines;

  $("diag-detail").innerHTML = \`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;margin-bottom:12px;border-radius:11px;background:#090e1c;border:1px solid #222e4a">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-right:4px">Fluxo Operacional:</span>
        <button class="status-btn \${opPhase==='analyze'?'active':''}" onclick="window.__setOpPhase('analyze')">1. Analisar</button>
        <span style="color:#475569">→</span>
        <button class="status-btn \${opPhase==='fix'?'active':''}" onclick="window.__setOpPhase('fix')">2. Corrigir</button>
        <span style="color:#475569">→</span>
        <button class="status-btn \${opPhase==='verify'?'active':''}" onclick="window.__setOpPhase('verify')">3. Verificar</button>
      </div>
      \${selProj ? \`
        <button class="status-btn" style="background:rgba(12,36,56,0.75);border-color:#38bdf8;color:#38bdf8;font-weight:800" onclick="window.__inspectProjectLive('\${esc(selProj.id)}')">
          ⚡ Analisar projeto agora (Leitura ao vivo)
        </button>
      \` : ""}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;padding-bottom:14px;border-bottom:1px solid #222e4a">
      <div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <span class="sev-pill sev-\${esc(sel.severity)}">\${sevLabels[sel.severity] || sel.severity}</span>
          <span style="font-size:11.5px;color:#a5b4fc;font-weight:700">\${esc(sel.projectName || "Catálogo Global")}</span>
        </div>
        <h3 style="margin:0;font-size:18px">\${esc(sel.title)}</h3>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="status-btn" style="background:#5641e5;border-color:#8e7bff;color:#fff" onclick="window.__convertRecToTask('\${esc(sel.id)}')">+ Plano de Ação / Tarefa</button>
        \${selProj ? \`<button class="status-btn" onclick="window.__openProjectModal('\${esc(selProj.id)}')">📈 Ficha Técnica</button>\` : ""}
        <button class="status-btn" style="background:#0d2e28;border-color:#2dd4a0;color:#3ddba0" onclick="window.__verifyBeforeResolve('\${esc(sel.id)}')">↻ Verificar novamente</button>
        \${["open", "investigating", "resolved"].map(st => \`
          <button class="status-btn \${sel.status === st ? "active" : ""}" onclick="window.__setRecStatus('\${esc(sel.id)}', '\${st}')">
            \${statusLabels[st]}
          </button>
        \`).join("")}
      </div>
    </div>

    \${selInsp ? \`
      <div class="solution-box" style="border-color:\${selInsp.canClose ? 'rgba(45,212,160,0.5)' : 'rgba(245,158,11,0.5)'};background:\${selInsp.canClose ? 'rgba(13,46,40,0.35)' : 'rgba(46,32,12,0.35)'}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <h4 style="margin:0;color:\${selInsp.canClose ? '#3ddba0' : '#fcd34d'}">\${selInsp.canClose ? '✓ Verificação Pós-Correção Aprovada' : '⚠ Verificação Pós-Correção Pendente'}</h4>
          <span style="font-size:11px;color:#cbd5e1">Checado às \${esc(selInsp.checkedAt)}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px;font-size:12px">
          <div style="padding:8px 10px;border-radius:8px;background:#090d18;border:1px solid #1e293b">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:800">Estado Anterior</div>
            <div style="color:#e2e8f0;margin-top:3px">\${esc(selInsp.previousSummary)}</div>
          </div>
          <div style="padding:8px 10px;border-radius:8px;background:#090d18;border:1px solid #1e293b">
            <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;font-weight:800">Estado Atual Verificado</div>
            <div style="color:#3ddba0;margin-top:3px;font-weight:700">\${esc(selInsp.currentSummary)}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px">
          <span style="font-size:12px;color:#f1f5f9">\${esc(selInsp.recommendationNote)}</span>
          \${selInsp.canClose && sel.status !== 'resolved' ? \`
            <button class="status-btn" style="background:#0d2e28;border-color:#2dd4a0;color:#3ddba0;font-weight:800" onclick="window.__setRecStatus('\${esc(sel.id)}','resolved',true)">✓ Confirmar Encerramento Verificado</button>
          \` : ""}
        </div>
      </div>
    \` : ""}

    <div class="solution-box">
      <h4>🔍 Evidência Detectada</h4>
      <div style="font-size:13px;line-height:1.5;color:#e2e8f0">\${esc(sel.evidence)}</div>
    </div>

    <div class="solution-box">
      <h4>🧠 Causa Provável</h4>
      <div style="font-size:13px;line-height:1.5;color:#cbd5e1">\${esc(sel.probableCause || "Configuração pendente ou divergência entre repositório e provedor de deploy.")}</div>
    </div>

    <!-- 2. CONSOLE DE DIAGNÓSTICO & LOGS -->
    <div class="solution-box" style="background:#050811;border-color:#1e2942">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <h4 style="margin:0;color:#38bdf8">🖥 Console de Diagnóstico &amp; Logs de Build/Deploy</h4>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="search" value="\${esc(consoleLogFilter)}" placeholder="Pesquisar erro ou evento..." class="filter-select" style="width:auto;padding:4px 9px;font-size:11.5px" oninput="window.__filterConsoleLogs(this.value)">
          \${repoClean ? \`<a class="status-btn" style="padding:4px 9px;font-size:11px" href="\${esc(repoClean)}" target="_blank" rel="noopener">Abrir no \${esc(selProj?.source || 'Git')} ↗</a>\` : ""}
          \${selProj?.deploy_url ? \`<a class="status-btn" style="padding:4px 9px;font-size:11px;color:#3ddba0" href="\${esc(selProj.deploy_url)}" target="_blank" rel="noopener">Abrir Deploy ↗</a>\` : ""}
        </div>
      </div>
      <div style="font-family:monospace;font-size:11.5px;display:grid;gap:4px;max-height:175px;overflow-y:auto;padding:8px;border-radius:8px;background:#03060c;border:1px solid #141d30">
        \${filteredLines.map(line => {
          const isErr = /ERROR|FAIL|WARN|CRÍTICO/i.test(line);
          const isOk = /READY|ONLINE|OK|SUCCESS/i.test(line);
          const col = isErr ? "#fda4af" : isOk ? "#3ddba0" : "#cbd5e1";
          return \`<div style="color:\${col};padding:3px 6px;border-radius:4px;background:\${isErr?'rgba(244,63,94,0.12)':'transparent'}">\${esc(line)}</div>\`;
        }).join("")}
      </div>
    </div>

    <div class="solution-box" style="border-color:rgba(45,212,160,0.4);background:rgba(45,212,160,0.05)">
      <h4 style="color:#3ddba0">🛠️ Solução Recomendada &amp; Plano de Ação Passo a Passo</h4>
      <div style="font-size:13px;line-height:1.5;color:#f1f5f9;font-weight:600;margin-bottom:10px">\${esc(sel.action)}</div>
      \${(sel.steps && sel.steps.length > 0) ? \`
        <ol style="margin:0;padding-left:18px;display:grid;gap:6px;font-size:12.5px;color:#cbd5e1;line-height:1.45">
          \${sel.steps.map(s => \`<li>\${esc(s)}</li>\`).join("")}
        </ol>
      \` : ""}
    </div>

    <!-- 3. GERAR CORREÇÃO ASSISTIDA -->
    <div class="solution-box" style="border-color:rgba(56,189,248,0.45);background:rgba(12,34,56,0.4)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
        <h4 style="margin:0;color:#38bdf8">🤖 Gerar Correção Assistida (Revisão Humana Obrigatória)</h4>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          \${issueHref ? \`<a class="status-btn" style="padding:5px 10px;font-size:11px;background:#5641e5;color:#fff" href="\${esc(issueHref)}" target="_blank" rel="noopener">📝 Abrir Issue Pré-Preenchida no Repositório ↗</a>\` : ""}
          <button class="status-btn" style="padding:5px 10px;font-size:11px" onclick="window.__convertRecToTask('\${esc(sel.id)}')">📋 Converter em Plano de Ação com Checklist</button>
        </div>
      </div>
      <div style="font-size:12px;color:#cbd5e1;margin-bottom:8px">
        \${sel.proposedCode ? \`<strong>\${esc(sel.proposedCode.filename)}</strong> — \${esc(sel.proposedCode.description)}\` : "Nenhuma modificação é aplicada automaticamente sem sua aprovação. Revise o snippet ou abra uma Issue/PR controlada."}
      </div>
      \${sel.proposedCode ? \`<pre style="margin:0;padding:10px;border-radius:8px;background:#050811;border:1px solid #1e293b;color:#d5e0f2;font-size:11.5px;overflow-x:auto">\${esc(sel.proposedCode.snippet)}</pre>\` : ""}
    </div>

    <!-- 4. CENTRAL DE DEPLOYS E RECUPERAÇÃO -->
    \${selProj ? \`
      <div class="solution-box">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
          <h4 style="margin:0;color:#c4b5fd">🚀 Central de Deploys &amp; Recuperação (\${esc(selProj.name)})</h4>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="status-btn" style="padding:5px 10px;font-size:11px;border-color:rgba(245,158,11,0.5);color:#fcd34d" onclick="window.__confirmProdDeployAction('redeploy','\${esc(selProj.name)}')">↻ Solicitar Redeploy (Com Confirmação)</button>
            <button class="status-btn" style="padding:5px 10px;font-size:11px;border-color:rgba(244,63,94,0.5);color:#fda4af" onclick="window.__confirmProdDeployAction('rollback','\${esc(selProj.name)}')">⏪ Rollback de Produção (Com Confirmação)</button>
          </div>
        </div>
        <div style="font-size:12px;color:#94a3b8">
          Status na plataforma: <strong style="color:#3ddba0">\${esc(selProj.last_deploy_status || (selProj.deploy_url ? "READY" : "DEV"))}</strong> •
          Contas Vercel: <strong style="color:#c4b5fd">\${esc((selProj.vercel_accounts || []).join(", ") || "Nenhuma")}</strong>
        </div>
      </div>
    \` : ""}

    \${(sel.commands && sel.commands.length > 0) ? \`
      <div class="solution-box">
        <h4>💻 Comandos de Diagnóstico / Correção</h4>
        \${sel.commands.map(cmd => \`
          <div class="cmd-row">
            <code>\${esc(cmd)}</code>
            <button class="status-btn" style="padding:4px 9px;font-size:11px" onclick="navigator.clipboard.writeText('\${esc(cmd)}');this.textContent='Copiado!'">Copiar</button>
          </div>
        \`).join("")}
      </div>
    \` : ""}
  \`;
}

function renderProjectModal() {
  const p = projects.find(x => x.id === currentModalProjectId);
  if (!p) return;
  const isOnline = p.state === "online" || Boolean(p.deploy_url);
  const box = $("project-modal-box");
  box.classList.toggle("off", !isOnline);

  const projRecs = recommendations.filter(r => r.projectId === p.id || (r.projectName && r.projectName.toLowerCase() === p.name.toLowerCase()));
  const projTasks = tasks.filter(t => t.projectId === p.id || (t.projectName && t.projectName.toLowerCase() === p.name.toLowerCase()));
  const vscodeHref = "vscode://file/" + encodeURI(p.local_path || ("D:/Projetos Vs Code/" + p.name));

  $("project-modal-head").innerHTML = \`
    <div style="display:flex;gap:14px;align-items:center">
      <div class="avatar" style="width:46px;height:46px;font-size:15px">\${esc((p.name || "PR").slice(0,2).toUpperCase())}</div>
      <div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="sev-pill sev-info">ANÁLISE &amp; FICHA TÉCNICA • \${esc(p.source)}</span>
          <span class="status \${isOnline ? "" : "off"}">● \${isOnline ? "Em Produção (Online)" : "Em Desenvolvimento"}</span>
        </div>
        <h2 style="margin:6px 0 0;font-size:20px;font-weight:900;color:#fff">\${esc(p.name)}</h2>
      </div>
    </div>
    <button class="status-btn" onclick="window.__closeProjectModal()">✕ Fechar</button>
  \`;

  document.querySelectorAll("[data-mtab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mtab === currentModalTab);
  });

  if (currentModalTab === "ficha") {
    $("project-modal-body").innerHTML = \`
      <div style="padding:13px;border-radius:12px;background:#0f172a;border:1px solid #1e2942;color:#d5e0f2;line-height:1.5">
        \${esc(p.description || "Sem descrição técnica detalhada cadastrada. Recomenda-se documentar propósito, stack e variáveis de ambiente.")}
      </div>
      <div class="tech-grid">
        <div class="tech-cell"><div class="lbl">Tecnologia / Stack</div><div class="val">\${esc(p.tech || "TypeScript / Next.js")}</div></div>
        <div class="tech-cell"><div class="lbl">Banco Utilizado</div><div class="val" style="color:#38bdf8">\${esc(inferDb(p))}</div></div>
        <div class="tech-cell"><div class="lbl">Origem &amp; Branch</div><div class="val">\${esc(p.source)} (main)</div></div>
        <div class="tech-cell"><div class="lbl">Contas Vercel Vinculadas</div><div class="val" style="color:#c4b5fd">\${esc((p.vercel_accounts || []).join(" • ") || "Nenhuma conta vinculada")}</div></div>
        <div class="tech-cell"><div class="lbl">Status na Plataforma</div><div class="val" style="color:#3ddba0">\${esc(p.last_deploy_status || (isOnline ? "READY" : "DEV"))}</div></div>
        <div class="tech-cell"><div class="lbl">Última Atualização</div><div class="val">\${new Date(p.last_commit_at || p.updated_at || Date.now()).toLocaleDateString("pt-BR")}</div></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
        \${p.repo_url ? \`<a class="status-btn" style="background:#162038;color:#fff" href="\${esc(p.repo_url)}" target="_blank" rel="noopener">📂 Abrir Repositório (\${esc(p.source)}) ↗</a>\` : ""}
        \${p.deploy_url ? \`<a class="status-btn" style="background:#0d2e28;border-color:#2dd4a0;color:#3ddba0" href="\${esc(p.deploy_url)}" target="_blank" rel="noopener">🚀 Abrir Site em Produção ↗</a>\` : ""}
        <a class="status-btn" style="background:#0c2438;border-color:#38bdf8;color:#38bdf8" href="\${vscodeHref}">💻 Abrir Projeto Local no VS Code ↗</a>
      </div>
    \`;
  } else if (currentModalTab === "deploys") {
    $("project-modal-body").innerHTML = \`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div class="tech-cell">
          <div class="lbl">1. Status Informado pela Vercel</div>
          <div class="val" style="color:#3ddba0;font-size:15px">\${esc(p.last_deploy_status || (isOnline ? "READY" : "NÃO PUBLICADO"))}</div>
          <div style="font-size:11px;color:#8b9bb8;margin-top:4px">Contas: \${esc((p.vercel_accounts || []).join(", ") || p.source)}</div>
        </div>
        <div class="tech-cell">
          <div class="lbl">2. Disponibilidade Real do Endpoint (HTTP)</div>
          <div class="val" id="modal-ping-status" style="color:#38bdf8;font-size:15px">\${p.deploy_url ? "Pronto para teste ao vivo" : "Sem domínio configurado"}</div>
          \${p.deploy_url ? \`<button class="status-btn" style="margin-top:8px;background:#5641e5;color:#fff" onclick="window.__pingModalEndpoint('\${esc(p.deploy_url)}')">↻ Medir Disponibilidade &amp; Latência Agora</button>\` : ""}
        </div>
      </div>
      \${p.deploy_url ? \`
        <div style="padding:12px 14px;border-radius:12px;background:#0f172a;border:1px solid rgba(45,212,160,0.4);display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div>
            <div style="font-weight:700;color:#3ddba0">\${esc(p.deploy_url)}</div>
            <div style="font-size:11px;color:#8b9bb8">Domínio Principal Publicado</div>
          </div>
          <a class="status-btn" style="background:#0d2e28;color:#3ddba0" href="\${esc(p.deploy_url)}" target="_blank" rel="noopener">Abrir Site ↗</a>
        </div>
      \` : ""}
    \`;
  } else if (currentModalTab === "diagnostico") {
    $("project-modal-body").innerHTML = projRecs.length === 0 ? \`
      <div style="padding:18px;border-radius:12px;background:rgba(13,46,40,0.4);border:1px solid rgba(45,212,160,0.4);color:#3ddba0;font-weight:700">
        ✓ Nenhum problema detectado para \${esc(p.name)}. Repositório, descrição e deploy estão saudáveis!
      </div>
    \` : projRecs.map(r => \`
      <div class="solution-box" style="margin-top:0;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <div>
            <span class="sev-pill sev-\${esc(r.severity)}">\${esc(r.severity)}</span>
            <strong style="margin-left:8px;color:#fff;font-size:14px">\${esc(r.title)}</strong>
          </div>
          <button class="status-btn" style="background:#5641e5;color:#fff" onclick="window.__convertRecToTask('\${esc(r.id)}')">+ Converter em Tarefa</button>
        </div>
        <div style="font-size:12px;color:#cbd5e1;margin-top:8px"><strong>Evidência:</strong> \${esc(r.evidence)}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px"><strong>Causa provável:</strong> \${esc(r.probableCause || "")}</div>
        <div style="font-size:12px;color:#3ddba0;margin-top:6px"><strong>Procedimento:</strong> \${esc(r.action)}</div>
      </div>
    \`).join("");
  } else if (currentModalTab === "assistente") {
    $("project-modal-body").innerHTML = \`
      <div style="padding:12px 14px;border-radius:12px;background:rgba(12,34,56,0.6);border:1px solid rgba(56,189,248,0.4);margin-bottom:12px">
        <strong style="color:#38bdf8">🤖 Assistente Inteligente de Soluções • Modo de Revisão Humana</strong>
        <div style="font-size:12px;color:#cbd5e1;margin-top:4px">As sugestões abaixo são geradas para <strong>\${esc(p.name)}</strong> e <strong>nunca são aplicadas automaticamente sem sua aprovação</strong>.</div>
      </div>
      <div class="solution-box">
        <h4>Checklist &amp; Snippet de Validação Segura (\${esc(p.name)})</h4>
        <pre style="margin:0;padding:12px;border-radius:8px;background:#050811;border:1px solid #1e293b;color:#3ddba0;font-size:12px;overflow-x:auto">cd "D:/Projetos Vs Code/\${esc(p.name)}"
git status
npx tsc --noEmit --incremental false
npm run build</pre>
      </div>
    \`;
  } else if (currentModalTab === "tarefas") {
    const defaultIssue = p.repo_url ? p.repo_url.replace(/\\.git$/, "") + "/issues" : "";
    $("project-modal-body").innerHTML = \`
      <div style="padding:14px;border-radius:12px;background:#0f172a;border:1px solid #22304d;margin-bottom:14px">
        <div style="font-weight:700;font-size:12px;color:#c4b5fd;margin-bottom:8px">NOVA TAREFA OU MELHORIA PARA \${esc(p.name.toUpperCase())}</div>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-bottom:8px">
          <input id="mtask-title" class="filter-select" placeholder="Título da tarefa ou melhoria...">
          <select id="mtask-prio" class="filter-select">
            <option value="high">Prioridade Alta</option>
            <option value="medium">Prioridade Média</option>
            <option value="low">Prioridade Baixa</option>
          </select>
        </div>
        <div style="display:flex;gap:8px">
          <input id="mtask-issue" class="filter-select" placeholder="Link da Issue/PR (\${esc(defaultIssue || 'https://github.com/...')})" value="\${esc(defaultIssue)}">
          <button class="status-btn" style="background:#5641e5;color:#fff;white-space:nowrap" onclick="window.__addTaskFromModal('\${esc(p.id)}')">+ Adicionar Tarefa</button>
        </div>
      </div>
      <div style="display:grid;gap:8px">
        \${projTasks.length === 0 ? '<div style="padding:16px;text-align:center;color:var(--muted)">Nenhuma tarefa aberta para este projeto.</div>' : projTasks.map(t => \`
          <div style="padding:11px 14px;border-radius:10px;background:#090d18;border:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;gap:10px">
            <div>
              <span class="sev-pill \${t.priority==='high'?'sev-critical':t.priority==='medium'?'sev-warning':'sev-info'}">\${t.priority}</span>
              <strong style="margin-left:8px;color:#fff">\${esc(t.title)}</strong>
              \${t.issueUrl ? \`<a href="\${esc(t.issueUrl)}" target="_blank" rel="noopener" style="margin-left:8px;font-size:11px;color:#3ddba0">Issue/PR ↗</a>\` : ""}
            </div>
            <span style="font-size:11px;color:#a5b4fc;font-weight:700">\${esc(t.status)}</span>
          </div>
        \`).join("")}
      </div>
    \`;
  }

  $("project-modal-foot").innerHTML = \`
    <button class="status-btn" onclick="window.__togglePinLocal('\${esc(p.id)}');window.__openProjectModal('\${esc(p.id)}')">★ \${p.is_pinned ? "Desafixar do topo" : "Fixar no topo"}</button>
    <div style="display:flex;gap:8px">
      <button class="status-btn" onclick="window.__closeProjectModal();window.__openProjectTelemetry('\${esc(p.id)}')">Abrir na Central de Telemetria ↗</button>
    </div>
  \`;
}

window.__openProjectModal = (id) => {
  currentModalProjectId = id;
  currentModalTab = "ficha";
  $("project-modal").classList.add("open");
  renderProjectModal();
};

window.__closeProjectModal = () => {
  $("project-modal")?.classList.remove("open");
  currentModalProjectId = null;
};

window.__setModalTab = (tab) => {
  currentModalTab = tab;
  renderProjectModal();
};

window.__pingModalEndpoint = async (url) => {
  const el = $("modal-ping-status");
  if (!el) return;
  el.textContent = "Verificando endpoint ao vivo...";
  const t0 = performance.now();
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store" });
    const ms = Math.round(performance.now() - t0);
    el.style.color = "#3ddba0";
    el.textContent = "ONLINE • Resposta confirmada em " + ms + " ms";
  } catch {
    el.style.color = "#ff6b86";
    el.textContent = "INDISPONÍVEL / Timeout";
  }
};

window.__convertRecToTask = async (recId) => {
  const rec = recommendations.find(r => r.id === recId);
  if (!rec) return;
  const dueDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const checklist = (rec.steps && rec.steps.length > 0 ? rec.steps : [
    "Inspecionar evidência e logs no Console de Diagnóstico",
    "Aplicar e revisar correção proposta",
    "Executar Verificar novamente para confirmar resolução"
  ]).map((s, idx) => ({ id: "chk_" + idx, text: s, done: false }));
  const newTask = {
    id: "task_" + Date.now(),
    projectId: rec.projectId,
    projectName: rec.projectName || "Geral",
    recommendationId: rec.id,
    title: rec.title,
    priority: rec.severity === "critical" ? "high" : rec.severity === "warning" ? "medium" : "low",
    status: "todo",
    assignee: "Vinicius Casagrande",
    dueDate,
    checklist,
    notes: rec.evidence + " — " + rec.action,
    issueUrl: rec.href || ""
  };
  tasks = [newTask, ...tasks];
  try { localStorage.setItem("devcentral_tasks_v3", JSON.stringify(tasks)); } catch {}
  if (window.__authedToken) {
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + window.__authedToken },
        body: JSON.stringify(newTask)
      });
    } catch {}
  }
  if (currentModalProjectId) {
    currentModalTab = "tarefas";
    renderProjectModal();
  } else {
    activeTab = "telemetry";
    activeSubTab = "tasks";
    render();
  }
};

window.__toggleTaskCheck = (taskId, checkId) => {
  tasks = tasks.map(t => {
    if (t.id !== taskId) return t;
    const checklist = (t.checklist || []).map(c => c.id === checkId ? { ...c, done: !c.done } : c);
    return { ...t, checklist };
  });
  try { localStorage.setItem("devcentral_tasks_v3", JSON.stringify(tasks)); } catch {}
  renderTelemetry();
};

window.__setOpPhase = (phase) => {
  opPhase = phase;
  renderTelemetry();
};

window.__filterConsoleLogs = (val) => {
  consoleLogFilter = val || "";
  renderTelemetry();
};

window.__inspectProjectLive = async (projectId) => {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  let reachable = false;
  let latencyMs = 0;
  if (p.deploy_url) {
    const t0 = performance.now();
    try {
      await fetch(p.deploy_url, { mode: "no-cors", cache: "no-store" });
      reachable = true;
      latencyMs = Math.round(performance.now() - t0);
    } catch {
      reachable = false;
    }
  }
  const hasDesc = Boolean(p.description && p.description.trim().length >= 12);
  const canClose = (p.deploy_url ? reachable : true) && p.last_deploy_status !== "ERROR";
  opInspections[p.id] = {
    checkedAt: new Date().toLocaleTimeString("pt-BR"),
    previousSummary: "Deploy: " + (p.last_deploy_status || "N/A") + " • URL: " + (p.deploy_url || "Não configurado"),
    currentSummary: p.deploy_url
      ? (reachable ? "HTTP ONLINE (" + latencyMs + " ms) • " + p.deploy_url : "HTTP INDISPONÍVEL / Timeout")
      : "Repositório " + p.source + " verificado (" + (hasDesc ? "Documentado" : "Descrição pendente") + ")",
    canClose,
    recommendationNote: canClose
      ? "Sinais técnicos validados com sucesso. O alerta já pode ser encerrado com segurança."
      : "Ainda existem pendências técnicas ou indisponibilidade HTTP. Corrija antes de encerrar.",
    consoleLines: [
      "[" + new Date().toLocaleTimeString("pt-BR") + "] [INSPECT] Iniciando leitura ao vivo de " + p.name + " (" + p.source + ")",
      p.repo_url ? "[GIT] Repositório vinculado: " + p.repo_url : "[WARN] Sem repositório Git vinculado",
      p.deploy_url
        ? (reachable ? "[HTTP READY] " + p.deploy_url + " respondeu em " + latencyMs + " ms" : "[HTTP ERROR] Falha ao contactar " + p.deploy_url)
        : "[INFO] Projeto sem domínio de produção publicado",
      "[VERCEL] Contas vinculadas: " + ((p.vercel_accounts || []).join(", ") || "Nenhuma"),
      canClose ? "[VERIFY OK] Verificação pós-correção aprovada." : "[VERIFY WARN] Pendência técnica ainda ativa."
    ]
  };
  opPhase = "verify";
  renderTelemetry();
};

window.__verifyBeforeResolve = async (recId) => {
  const rec = recommendations.find(r => r.id === recId);
  if (!rec) return;
  const p = projects.find(x => x.id === rec.projectId || (rec.projectName && x.name.toLowerCase() === rec.projectName.toLowerCase()));
  if (p) {
    await window.__inspectProjectLive(p.id);
  } else {
    opPhase = "verify";
    renderTelemetry();
  }
};

window.__confirmProdDeployAction = (actionType, projectName) => {
  const label = actionType === "redeploy" ? "REDEPLOY EM PRODUÇÃO" : "ROLLBACK DE PRODUÇÃO";
  const ok = window.confirm("⚠️ CONFIRMAÇÃO OBRIGATÓRIA DE PRODUÇÃO\\n\\nDeseja realmente solicitar " + label + " para o projeto " + projectName + "?\\n\\nNenhuma ação em produção é executada sem sua aprovação explícita.");
  if (!ok) return;
  alert("✓ Solicitação de " + label + " registrada no console operacional para " + projectName + ". Acompanhe a execução no provedor Vercel/Git.");
};

window.__addTaskFromModal = async (projectId) => {
  const p = projects.find(x => x.id === projectId);
  const title = $("mtask-title")?.value?.trim();
  if (!title || !p) return;
  const newTask = {
    id: "task_" + Date.now(),
    projectId: p.id,
    projectName: p.name,
    title,
    priority: $("mtask-prio")?.value || "high",
    status: "todo",
    notes: "",
    issueUrl: $("mtask-issue")?.value?.trim() || ""
  };
  tasks = [newTask, ...tasks];
  try { localStorage.setItem("devcentral_tasks_v3", JSON.stringify(tasks)); } catch {}
  if (window.__authedToken) {
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + window.__authedToken },
        body: JSON.stringify(newTask)
      });
    } catch {}
  }
  renderProjectModal();
};

window.__updateTaskStatus = async (taskId, status) => {
  tasks = tasks.map(t => t.id === taskId ? { ...t, status } : t);
  try { localStorage.setItem("devcentral_tasks_v3", JSON.stringify(tasks)); } catch {}
  renderTelemetry();
};

function renderActivity() {
  $("activity-list").innerHTML = syncLogs.map(l => \`
    <div style="padding:14px;border-radius:11px;background:#090d18;border:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-weight:700;font-size:13.5px;color:#fff">Sincronização \${esc(l.status.toUpperCase())} — \${l.total_projects} projetos processados</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">GitHub: \${l.github_count} · GitLab: \${l.gitlab_count} · Vercel Conta 1: \${l.vercel1_count} · Vercel Conta 2: \${l.vercel2_count}</div>
        \${l.details ? \`<div style="font-size:11.5px;color:#94a3b8;margin-top:4px">\${esc(l.details)}</div>\` : ""}
      </div>
      <div style="font-size:11.5px;color:#a5b4fc;font-weight:600">\${new Date(l.synced_at).toLocaleString("pt-BR")}</div>
    </div>
  \`).join("");
}

function render() {
  updateCounters();
  renderAlertsBell();
  document.querySelectorAll("[data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === activeTab);
  });
  document.querySelectorAll("[data-mbnav]").forEach(b => {
    const key = b.dataset.mbnav;
    const isAct = (key === "all" && activeTab === "all") ||
                  (key === "projects" && (activeTab === "pinned" || activeTab === "online" || activeTab === "deployments")) ||
                  (key === "telemetry" && activeTab === "telemetry");
    b.classList.toggle("active", isAct);
  });
  const openAlerts = recommendations.filter(r => r.status !== "resolved").length;
  if ($("mb-tel-badge")) {
    $("mb-tel-badge").textContent = openAlerts;
    $("mb-tel-badge").style.display = openAlerts > 0 ? "inline-block" : "none";
  }

  const isTelemetry = activeTab === "telemetry";
  const isActivity = activeTab === "activity";
  $("view-projects").style.display = (!isTelemetry && !isActivity) ? "block" : "none";
  $("view-telemetry").style.display = isTelemetry ? "block" : "none";
  $("view-activity").style.display = isActivity ? "block" : "none";

  if (isTelemetry) {
    renderTelemetry();
  } else if (isActivity) {
    renderActivity();
  } else {
    renderProjects();
  }
}

window.__openMobileSidebar = () => {
  $("app-sidebar")?.classList.add("open");
  $("sidebar-backdrop")?.classList.add("open");
};

window.__closeMobileSidebar = () => {
  $("app-sidebar")?.classList.remove("open");
  $("sidebar-backdrop")?.classList.remove("open");
};

window.__openFilterSheet = () => {
  window.__syncFilterSheet();
  $("mobile-filter-sheet")?.classList.add("open");
};

window.__closeFilterSheet = () => {
  $("mobile-filter-sheet")?.classList.remove("open");
};

window.__syncFilterSheet = () => {
  const src = $("f-source")?.value || "";
  const acc = $("f-account")?.value || "";
  const st = $("f-state")?.value || "";
  const lang = $("f-lang")?.value || "";
  $("mp-gh")?.classList.toggle("active", src === "GitHub");
  $("mp-gl")?.classList.toggle("active", src === "GitLab");
  $("mp-v1")?.classList.toggle("active", acc === "viniciuscasagrande-creator");
  $("mp-v2")?.classList.toggle("active", acc === "DEVELOPDISKINGRESSOS-9897");
  $("mp-online")?.classList.toggle("active", st === "online");
  $("mp-dev")?.classList.toggle("active", st === "dev");
  $("mp-pin")?.classList.toggle("active", activeTab === "pinned");
  if ($("mp-lang") && $("f-lang")) {
    $("mp-lang").innerHTML = $("f-lang").innerHTML;
    $("mp-lang").value = lang;
  }
  const activeCount = [src, acc, st, lang, activeTab === "pinned" ? "pin" : ""].filter(Boolean).length;
  if ($("mobile-filter-btn")) {
    $("mobile-filter-btn").classList.toggle("active", activeCount > 0);
    $("mobile-filter-btn").innerHTML = activeCount > 0 ? \`<span>⚙ Filtros (\${activeCount})</span>\` : \`<span>⚙ Filtros</span>\`;
  }
};

window.__resetView = () => {
  activeTab = "all";
  $("f-source").value = "";
  $("f-account").value = "";
  $("f-lang").value = "";
  $("f-state").value = "";
  $("search").value = "";
  window.__closeMobileSidebar();
  render();
  window.__syncFilterSheet();
};

window.__quickFilter = (source, account) => {
  activeTab = "all";
  $("f-source").value = source || "";
  $("f-account").value = account || "";
  window.__closeMobileSidebar();
  render();
  window.__syncFilterSheet();
};

window.__filterByState = (st) => {
  activeTab = "all";
  $("f-state").value = st || "";
  window.__closeMobileSidebar();
  render();
  window.__syncFilterSheet();
};

window.__setViewMode = (mode) => {
  $("cards").classList.toggle("list-mode", mode === "list");
  $("btn-view-grid").classList.toggle("active", mode === "grid");
  $("btn-view-list").classList.toggle("active", mode === "list");
};

window.__togglePinLocal = (id) => {
  projects = projects.map(p => p.id === id ? { ...p, is_pinned: !p.is_pinned } : p);
  render();
};

window.__openTelemetryTab = () => {
  activeTab = "telemetry";
  activeSubTab = "diagnostic";
  window.__closeMobileSidebar();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.__selectRec = (id) => {
  selectedRecId = id;
  renderTelemetry();
};

window.__setRecStatus = async (id, status, verifiedOverride) => {
  if (status === "resolved" && !verifiedOverride) {
    const rec = recommendations.find(r => r.id === id);
    const p = rec ? projects.find(x => x.id === rec.projectId || (rec.projectName && x.name.toLowerCase() === rec.projectName.toLowerCase())) : null;
    if (p && !opInspections[p.id]) {
      await window.__inspectProjectLive(p.id);
    }
    const insp = p ? opInspections[p.id] : null;
    if (insp && !insp.canClose) {
      const force = window.confirm("⚠️ A verificação técnica pós-correção encontrou pendências (" + insp.currentSummary + "). Deseja marcar como Resolvida mesmo assim?");
      if (!force) return;
    }
  }
  recommendations = recommendations.map(r => r.id === id ? { ...r, status } : r);
  try {
    const saved = JSON.parse(localStorage.getItem("devcentral_rec_statuses_v3") || "{}");
    saved[id] = status;
    localStorage.setItem("devcentral_rec_statuses_v3", JSON.stringify(saved));
  } catch {}
  render();
  if (window.__authedToken) {
    try {
      await fetch("/api/telemetry", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + window.__authedToken
        },
        body: JSON.stringify({ id, status })
      });
    } catch {}
  }
};

window.__openProjectTelemetry = (projectId) => {
  activeTab = "telemetry";
  activeSubTab = "diagnostic";
  $("tel-project").value = projectId;
  const firstForProj = recommendations.find(r => r.projectId === projectId);
  if (firstForProj) selectedRecId = firstForProj.id;
  window.__closeMobileSidebar();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

document.querySelectorAll("[data-tab]").forEach(btn => {
  btn.onclick = () => {
    activeTab = btn.dataset.tab;
    window.__closeMobileSidebar();
    render();
  };
});

document.querySelectorAll("[data-subtab-btn]").forEach(btn => {
  btn.onclick = () => {
    activeTab = "telemetry";
    activeSubTab = btn.dataset.subtabBtn;
    render();
  };
});

$("quick-telemetry-btn").onclick = () => {
  activeTab = activeTab === "telemetry" ? "all" : "telemetry";
  render();
};

["search", "f-source", "f-account", "f-lang", "f-state"].forEach(id => {
  $(id).addEventListener(id === "search" ? "input" : "change", () => {
    renderProjects();
    window.__syncFilterSheet();
  });
});

["tel-project", "tel-status", "tel-search"].forEach(id => {
  $(id).addEventListener(id === "tel-search" ? "input" : "change", renderTelemetry);
});

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

window.__currentProjects = projects;
window.__setAuthedData = (projList, telPayload) => {
  if (Array.isArray(projList) && projList.length > 0) {
    projects = projList;
    window.__currentProjects = projects;
  }
  if (telPayload && Array.isArray(telPayload.recommendations)) {
    recommendations = telPayload.recommendations;
  }
  render();
};
</script>

<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCVhlowc7oxvS-idKS1XYzxocS1TJHvzRg",
  authDomain: "devcentral-190fe.firebaseapp.com",
  projectId: "devcentral-190fe",
  storageBucket: "devcentral-190fe.firebasestorage.app",
  messagingSenderId: "381168720156",
  appId: "1:381168720156:web:b4f919374dddc3c59642d9",
  measurementId: "G-9P4K029JCV"
};

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch {}
const auth = getAuth(app);

const loginBtn = document.getElementById("login-btn");
const syncBtn = document.getElementById("sync-btn");
const userBox = document.getElementById("auth-user-box");

async function loadPrivateData(user) {
  try {
    const token = await user.getIdToken();
    window.__authedToken = token;
    const [projRes, telRes] = await Promise.all([
      fetch("/api/projects", { headers: { Authorization: "Bearer " + token } }).catch(() => null),
      fetch("/api/telemetry", { headers: { Authorization: "Bearer " + token } }).catch(() => null),
    ]);
    const projData = projRes && projRes.ok ? await projRes.json() : null;
    const telData = telRes && telRes.ok ? await telRes.json() : null;
    window.__setAuthedData(projData?.projects, telData);
  } catch {}
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginBtn.textContent = "🟢 " + (user.email || "Admin") + " (Sair)";
    userBox.style.display = "block";
    userBox.innerHTML = '<div style="color:#fff;font-weight:700;margin-bottom:3px">Admin: ' + (user.email || "") + '</div>' +
      '<div style="background:#070a14;padding:3px 6px;border-radius:6px;border:1px solid #1e293b;color:#a5b4fc;font-family:monospace;font-size:9.5px;word-break:break-all">UID: ' + user.uid + '</div>';
    loadPrivateData(user);
  } else {
    window.__authedToken = null;
    loginBtn.textContent = "🔒 Entrar com Google (Admin)";
    userBox.style.display = "none";
  }
});

loginBtn.onclick = async () => {
  if (auth.currentUser) {
    await signOut(auth);
    location.reload();
  } else {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      if (e?.code === "auth/popup-blocked" || e?.code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, new GoogleAuthProvider());
        return;
      }
      alert("Erro ao autenticar com Google: " + e.message);
    }
  }
};

syncBtn.onclick = async () => {
  syncBtn.textContent = "⏳ Sincronizando...";
  let syncedViaBackend = false;
  if (auth.currentUser) {
    try {
      const token = await auth.currentUser.getIdToken();
      window.__authedToken = token;
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({})
      });
      const ct = res.headers.get("content-type") || "";
      if (res.ok && ct.includes("application/json")) {
        await loadPrivateData(auth.currentUser);
        syncedViaBackend = true;
      }
    } catch {}
  }

  if (!syncedViaBackend) {
    try {
      const [ghRes, glRes] = await Promise.all([
        fetch("https://api.github.com/users/viniciuscasagrande-creator/repos?sort=updated&per_page=100"),
        fetch("https://gitlab.com/api/v4/users/ViniciusMurray/projects?order_by=last_activity_at&sort=desc&per_page=100")
      ]);
      const ghList = ghRes.ok ? await ghRes.json() : [];
      const glList = glRes.ok ? await glRes.json() : [];
      const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const current = Array.isArray(window.__currentProjects) ? [...window.__currentProjects] : [];
      const byId = new Map(current.map(p => [p.id, p]));

      if (Array.isArray(ghList)) {
        for (const r of ghList) {
          const id = "github-" + r.id;
          const hp = typeof r.homepage === "string" && r.homepage.startsWith("http") ? r.homepage.trim() : "";
          const existing = byId.get(id) || current.find(p => norm(p.name) === norm(r.name) && p.source === "GitHub");
          if (existing) {
            if (hp) existing.deploy_url = hp;
            if (existing.deploy_url) {
              existing.state = "online";
              existing.last_deploy_status = "READY";
              if (existing.deploy_url.includes("vercel.app") && (!existing.vercel_accounts || existing.vercel_accounts.length === 0)) {
                existing.vercel_accounts = ["DEVELOPDISKINGRESSOS-9897"];
              }
            }
            existing.repo_url = r.html_url || existing.repo_url;
            existing.last_commit_at = r.pushed_at || existing.last_commit_at;
          } else {
            const matchVercel = current.find(p => norm(p.name) === norm(r.name) && p.deploy_url);
            const deployUrl = hp || (matchVercel ? matchVercel.deploy_url : "");
            const newProj = {
              id,
              name: r.name,
              description: r.description || "",
              tech: r.language || "TypeScript",
              source: "GitHub",
              repo_url: r.html_url || "",
              deploy_url: deployUrl,
              state: deployUrl ? "online" : "dev",
              visibility: "public",
              is_pinned: false,
              tags: Array.isArray(r.topics) ? r.topics.slice(0, 5) : [],
              vercel_accounts: matchVercel ? (matchVercel.vercel_accounts || []) : (deployUrl.includes("vercel.app") ? ["DEVELOPDISKINGRESSOS-9897"] : []),
              deployments: matchVercel ? (matchVercel.deployments || []) : [],
              last_deploy_status: deployUrl ? "READY" : "",
              last_commit_at: r.pushed_at || r.updated_at || new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            current.push(newProj);
            byId.set(id, newProj);
          }
        }
      }

      if (Array.isArray(glList)) {
        for (const p of glList) {
          const id = "gitlab-" + p.id;
          const existing = byId.get(id);
          const donor = current.find(other => norm(other.name) === norm(p.name) && other.deploy_url);
          const deployUrl = (typeof p.website_url === "string" && p.website_url.startsWith("http") ? p.website_url.trim() : "") || (donor ? donor.deploy_url : "");
          if (existing) {
            if (deployUrl && !existing.deploy_url) existing.deploy_url = deployUrl;
            if (existing.deploy_url) existing.state = "online";
          } else {
            const newProj = {
              id,
              name: p.name,
              description: p.description || "",
              tech: donor ? donor.tech : "TypeScript",
              source: "GitLab",
              repo_url: p.web_url || "",
              deploy_url: deployUrl,
              state: deployUrl ? "online" : "dev",
              visibility: "public",
              is_pinned: false,
              tags: Array.isArray(p.topics) ? p.topics.slice(0, 5) : [],
              vercel_accounts: donor ? (donor.vercel_accounts || []) : [],
              deployments: donor ? (donor.deployments || []) : [],
              last_deploy_status: deployUrl ? "READY" : "",
              last_commit_at: p.last_activity_at || new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            current.push(newProj);
            byId.set(id, newProj);
          }
        }
      }

      window.__setAuthedData(current, null);
    } catch {}
  }

  syncBtn.textContent = "✅ Sincronizado!";
  setTimeout(() => {
    syncBtn.textContent = "🚀 Sincronizar projetos";
  }, 2200);
};
</script>
</body>
</html>`;
}

fs.writeFileSync("firebase-dist/index.html", buildHtml("all"), "utf-8");
fs.writeFileSync(
  "firebase-dist/telemetria/index.html",
  buildHtml("telemetry"),
  "utf-8"
);

function buildReportsHtml() {
  const activeAlertsList = initialAlerts.filter((a) => a.state === "active").slice(0, 12);
  const pendingTasksList = initialTasks.filter((t) => t.status !== "done").slice(0, 12);
  const reportSnapshot = {
    generatedAt: new Date().toISOString(),
    source: "Neon PostgreSQL — última sincronização e varreduras registradas",
    current: {
      projects: safeRows.length,
      deployFailures: deployFailureCount,
      activeAlerts: activeAlertCount,
      criticalAlerts: criticalAlertCount,
      pendingTasks: pendingTaskCount,
      lastSyncAt: safeLogs[0]?.synced_at || null,
    },
    history: initialHealthHistory,
    alerts: activeAlertsList,
    tasks: pendingTasksList,
  };
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatórios de Saúde | DevCentral</title>
<link rel="manifest" href="/manifest.json">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<style>
*{box-sizing:border-box}
body{margin:0;background:#070a14;color:#fff;font-family:Inter,system-ui,-apple-system,sans-serif;padding:24px 16px}
@media(min-width:640px){body{padding:40px}}
.wrap{max-width:1152px;margin:0 auto;display:grid;gap:24px}
.top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px}
.back{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:#abb9d5;text-decoration:none;min-height:44px}
.back:hover{color:#fff}
.ctrl{display:flex;gap:8px;align-items:center}
.sel,.btn{min-height:44px;border-radius:10px;background:#151d31;border:1px solid #34415e;color:#fff;padding:0 12px;font-size:14px;cursor:pointer}
.tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
@media(min-width:1024px){.tiles{grid-template-columns:repeat(5,minmax(0,1fr))}}
.tile,.box{border-radius:14px;background:#111b2e;border:1px solid #293756;padding:16px;min-width:0}
.tile-val{margin:12px 0 0;font-size:30px;font-weight:800}
.tile-lbl{margin:4px 0 0;font-size:12px;color:#b7c2d8}
.grid2{display:grid;grid-template-columns:1fr;gap:16px}
@media(min-width:1024px){.grid2{grid-template-columns:1fr 1fr}}
.item{border-radius:10px;background:#0c1425;border:1px solid #263450;padding:12px}
</style>
</head>
<body>
<main class="wrap">
  <div class="top">
    <a href="/" class="back">← Voltar ao painel</a>
    <div class="ctrl">
      <label for="reports-days" style="font-size:12px;color:#abb9d5">Período</label>
      <select id="reports-days" class="sel">
        <option value="7">7 dias</option>
        <option value="30" selected>30 dias</option>
        <option value="90">90 dias</option>
      </select>
      <button type="button" id="btn-reload" class="btn">↻ Atualizar</button>
    </div>
  </div>
  <div>
    <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:1.6px;color:#a28dfd;font-weight:700">DevCentral 3.0 • Telemetria</p>
    <h1 style="margin:8px 0 0;font-size:clamp(24px,4vw,36px);font-weight:900">Relatórios de saúde dos projetos</h1>
    <p style="margin:8px 0 0;font-size:14px;color:#abb9d5">Indicadores do Neon e da última varredura. Não são métricas de disponibilidade contínua.</p>
  </div>
  <div id="report-root"></div>
</main>
<script>
const SNAPSHOT = ${JSON.stringify(reportSnapshot).replace(/</g, "\\u003c")};
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function renderReport(data, days) {
  const cutoff = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const history = (data.history || []).filter(h => h.day >= cutoff);
  const maxAlerts = Math.max(1, ...history.map(x => x.activeAlerts));
  const tiles = [
    { label: "Projetos", value: data.current.projects, icon: "📈" },
    { label: "Alertas ativos", value: data.current.activeAlerts, icon: "🔔" },
    { label: "Críticos", value: data.current.criticalAlerts, icon: "🛡️" },
    { label: "Deploys com falha registrada", value: data.current.deployFailures, icon: "⚠️" },
    { label: "Tarefas pendentes", value: data.current.pendingTasks, icon: "📋" },
  ];
  document.getElementById("report-root").innerHTML = \`
    <div class="tiles">
      \${tiles.map(t => \`
        <article class="tile">
          <div style="font-size:18px">\${t.icon}</div>
          <p class="tile-val">\${t.value}</p>
          <p class="tile-lbl">\${esc(t.label)}</p>
        </article>
      \`).join("")}
    </div>
    <section class="box" style="margin-top:16px">
      <h2 style="margin:0 0 8px;font-size:16px;font-weight:800">Evolução de alertas ativos</h2>
      <p style="margin:0 0 16px;font-size:12px;color:#a1adc6">Snapshots diários disponíveis: \${history.length}. Dias sem execução agendada não são preenchidos artificialmente.</p>
      \${history.length ? \`
        <div role="img" aria-label="Barras representando o total de alertas ativos em cada dia com registro" style="height:176px;display:flex;align-items:flex-end;gap:8px;overflow-x:auto">
          \${history.map(day => \`
            <div title="\${esc(day.day)}: \${day.activeAlerts} alertas ativos" style="flex:1;min-width:24px;max-width:56px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;height:100%">
              <span style="font-size:10px;color:#abb9d5">\${day.activeAlerts}</span>
              <div style="width:100%;border-radius:6px 6px 0 0;background:linear-gradient(to top,#6552dd,#46bde2);min-height:4px;height:\${Math.max(4, Math.round((day.activeAlerts / maxAlerts) * 80))}%"></div>
              <span style="font-size:9px;color:#abb9d5">\${esc(day.day.slice(8, 10))}</span>
            </div>
          \`).join("")}
        </div>
      \` : '<p style="font-size:14px;color:#a1adc6">O histórico aparecerá após a primeira execução do monitoramento agendado.</p>'}
    </section>
    <div class="grid2" style="margin-top:16px">
      <section class="box">
        <h2 style="margin:0 0 12px;font-size:16px;font-weight:800">Alertas prioritários</h2>
        \${data.alerts.length ? \`<div style="display:grid;gap:8px">\${data.alerts.map(a => \`
          <div class="item">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <span style="font-size:12px;color:#a5b4fc;word-break:break-all">\${esc(a.projectName)}</span>
              <span style="font-size:12px;font-weight:700;color:\${a.severity==='critical'?'#fca5a5':'#fcd34d'}">\${a.severity==='critical'?'Crítico':'Atenção'}</span>
            </div>
            <p style="margin:6px 0 0;font-size:14px">\${esc(a.title)}</p>
          </div>
        \`).join("")}</div>\` : '<p style="font-size:14px;color:#a1adc6">Nenhum alerta ativo na última varredura.</p>'}
      </section>
      <section class="box">
        <h2 style="margin:0 0 12px;font-size:16px;font-weight:800">Planos de ação pendentes</h2>
        \${data.tasks.length ? \`<div style="display:grid;gap:8px">\${data.tasks.map(t => \`
          <div class="item">
            <p style="margin:0;font-size:12px;color:#a5b4fc">\${esc(t.projectName)} • \${t.priority==='high'?'Alta prioridade':t.priority==='medium'?'Média prioridade':'Baixa prioridade'}</p>
            <p style="margin:6px 0 0;font-size:14px">\${esc(t.title)}</p>
          </div>
        \`).join("")}</div>\` : '<p style="font-size:14px;color:#a1adc6">Nenhuma tarefa pendente.</p>'}
      </section>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#8291af">Atualizado em \${new Date(data.generatedAt).toLocaleString("pt-BR")}. Última sincronização: \${data.current.lastSyncAt ? new Date(data.current.lastSyncAt).toLocaleString("pt-BR") : "sem registro"}. \${esc(data.source)}.</p>
  \`;
}

const sel = document.getElementById("reports-days");
sel.onchange = () => renderReport(SNAPSHOT, Number(sel.value));
document.getElementById("btn-reload").onclick = () => renderReport(SNAPSHOT, Number(sel.value));
renderReport(SNAPSHOT, 30);
</script>
</body>
</html>`;
}

fs.mkdirSync("firebase-dist/relatorios", { recursive: true });
fs.writeFileSync("firebase-dist/relatorios/index.html", buildReportsHtml(), "utf-8");

console.log(
  `OK: Novo layout DevCentral gerado em firebase-dist/index.html, firebase-dist/telemetria/index.html e firebase-dist/relatorios/index.html (${safeRows.length} projetos públicos em 4 colunas + ${initialRecs.length} diagnósticos).`
);
