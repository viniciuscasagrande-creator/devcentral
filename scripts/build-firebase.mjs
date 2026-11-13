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
const statusMap = new Map(savedStatuses.map((r) => [String(r.id), String(r.status)]));

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
  last_commit_at: p.last_commit_at ? new Date(p.last_commit_at).toISOString() : null,
  updated_at: p.updated_at ? new Date(p.updated_at).toISOString() : null,
  custom_notes: "",
  local_path: "",
}));

const safeLogs = syncLogs.map((l) => ({
  id: Number(l.id),
  synced_at: l.synced_at ? new Date(l.synced_at).toISOString() : new Date().toISOString(),
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
      probableCause: "A sincronização com GitHub, GitLab e as 2 contas Vercel é executada sob demanda pelo administrador.",
      action: "Autentique-se com Google no cabeçalho e clique em 'Sincronizar Tudo' para atualizar repositórios e deploys.",
      steps: [
        "Clique em 'Entrar com Google (Admin)' no topo do painel.",
        "Acione o botão 'Sincronizar Tudo' para consultar GitHub, GitLab e as 2 contas Vercel.",
        "Verifique o log atualizado na aba Atividade."
      ],
      commands: ["npm run dev"],
      href: "/",
      status: statusMap.get(id) || "open",
      detectedAt,
    });
  }

  for (const p of projects) {
    const st = String(p.last_deploy_status || "").toUpperCase();
    const failed = ["ERROR", "FAILED", "FAILURE", "CANCELED", "CANCELLED"].some((x) => st.includes(x));
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
        probableCause: "Erro de compilação TypeScript/Next.js, variável de ambiente ausente na Vercel ou falha no comando de build.",
        action: "Reproduza o build localmente, revise as variáveis de ambiente na conta Vercel vinculada e republique.",
        steps: [
          `Execute o build local do projeto (${p.name}) para inspecionar erros de compilação.`,
          "Confira se todas as variáveis (.env) estão definidas nas configurações da Vercel.",
          "Faça novo commit/push para disparar um deploy limpo."
        ],
        commands: ["npm run build", "npx tsc --noEmit"],
        href: p.deploy_url || p.repo_url || null,
        status: statusMap.get(id) || "open",
        detectedAt,
      });
    }

    if (p.state === "online" && !p.deploy_url && !(p.deployments || []).some((d) => d.url)) {
      const id = `deploy:missing-link:${p.id}`;
      recs.push({
        id,
        projectId: p.id,
        projectName: p.name,
        category: "deploy",
        severity: "warning",
        kind: "confirmed_issue",
        title: "Projeto marcado como Online sem URL de publicação",
        evidence: "O projeto consta como online, mas não possui URL principal de produção registrada.",
        probableCause: "O nome do projeto na Vercel diverge do repositório ou o domínio público não foi associado.",
        action: "Vincule a URL HTTPS de produção no cadastro do projeto ou sincronize novamente as contas Vercel.",
        steps: [
          "Abra os detalhes do card no painel e verifique as contas Vercel associadas.",
          "Preencha o campo URL de Deploy ou sincronize as contas Vercel."
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
        evidence: "Projeto detectado apenas na hospedagem (Vercel) sem URL de repositório GitHub/GitLab.",
        probableCause: "Deploy avulso via CLI ou repositório com nome divergente entre GitHub/GitLab e Vercel.",
        action: "Associe a URL do repositório Git correspondente para unificar o rastreamento.",
        steps: [
          "Verifique na Vercel qual repositório Git está conectado ao projeto.",
          "Cadastre a URL do repositório no card do projeto no DevCentral."
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
        action: "Adicione uma descrição objetiva com propósito, stack e link de produção.",
        steps: [
          "Preencha a descrição no repositório GitHub/GitLab ou diretamente no editor do DevCentral."
        ],
        commands: [],
        href: p.repo_url || null,
        status: statusMap.get(id) || "open",
        detectedAt,
      });
    }
  }

  const weight = { critical: 0, warning: 1, info: 2 };
  return recs.sort((a, b) => weight[a.severity] - weight[b.severity] || a.title.localeCompare(b.title));
}

const initialRecs = buildPublicRecommendations(safeRows, safeLogs[0]?.synced_at || null);

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
const onlineCount = safeRows.filter((p) => p.state === "online" || Boolean(p.deploy_url)).length;
const pinnedCount = safeRows.filter((p) => p.is_pinned).length;
const ghCount = safeRows.filter((p) => p.source === "GitHub").length;
const glCount = safeRows.filter((p) => p.source === "GitLab").length;
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
  const deps = Array.isArray(p.deployments)
    ? p.deployments.filter((d) => d.url && d.url !== p.deploy_url)
    : [];

  return `<article class="card ${isOnline ? "card-online" : "card-off"}" data-card-id="${esc(p.id)}">
      <div>
        <div class="card-head">
          <div style="display:flex;gap:8px;align-items:center;min-width:0">
            <div class="avatar">${esc((p.name || "PR").slice(0, 2).toUpperCase())}</div>
            <div style="min-width:0">
              <div class="card-meta">
                ${esc(p.source)}${p.visibility === "private" ? " • 🔒" : " • 🌐"}${p.is_pinned ? " • ★" : ""}
              </div>
              <h3 title="${esc(p.name)}">${esc(p.name)}</h3>
            </div>
          </div>
          <span class="status ${isOnline ? "" : "off"}">● ${isOnline ? "Online" : "Dev"}</span>
        </div>
        <p class="desc">${esc(p.description || "Projeto sincronizado com Neon PostgreSQL.")}</p>
        <div class="tags">
          <span class="tag">${esc(p.tech || "TypeScript")}</span>
          ${vAccs.map((a) => `<span class="tag vercel">▲ ${esc(a === "viniciuscasagrande-creator" ? "Vercel 1" : a === "DEVELOPDISKINGRESSOS-9897" ? "Vercel 2" : a)}</span>`).join("")}
          ${(p.tags || [])
            .slice(0, 2)
            .map((t) => `<span class="tag">${esc(t)}</span>`)
            .join("")}
        </div>
      </div>
      <div class="links">
        ${
          p.repo_url
            ? `<a class="link-repo" href="${esc(p.repo_url)}" target="_blank" rel="noopener">Repo ↗</a>`
            : '<span style="font-size:10.5px;color:#667794">Sem repo</span>'
        }
        ${
          p.deploy_url
            ? `<a class="link-deploy" href="${esc(p.deploy_url)}" target="_blank" rel="noopener">Site ↗</a>`
            : ""
        }
        ${deps
          .slice(0, 1)
          .map(
            (d) =>
              `<a class="link-extra" href="${esc(d.url)}" target="_blank" rel="noopener">Deploy ↗</a>`
          )
          .join("")}
        <button class="btn-diag" onclick="window.__openProjectTelemetry('${esc(p.id)}')" title="Ver Diagnóstico & Soluções">🩺 Diagnóstico</button>
      </div>
    </article>`;
}

const preRenderedCardsHtml = safeRows.map(renderCardHtml).join("\n");

fs.mkdirSync("firebase-dist", { recursive: true });
fs.mkdirSync("firebase-dist/telemetria", { recursive: true });
if (fs.existsSync("firebase-dist/projects.json")) {
  fs.unlinkSync("firebase-dist/projects.json");
}

function buildHtml(defaultTab = "all") {
  return `<!doctype html>
<html lang="pt-BR" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DevCentral 3.0 — Cockpit de Projetos &amp; Telemetria</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color-scheme:dark;--bg:#070b14;--surface:#0f172a;--surface2:#162038;--border:#1e293b;--text:#f1f5f9;--muted:#94a3b8;--accent:#818cf8;--green:#10b981;--red:#f43f5e;--amber:#f59e0b}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(ellipse 1100px 550px at 65% -25%,#1e295b 0%,transparent 70%),var(--bg);color:var(--text);min-height:100vh}
button,input,select,textarea{font:inherit}
button{cursor:pointer}
a{color:inherit;text-decoration:none}
.shell{display:grid;grid-template-columns:280px 1fr;min-height:100vh}
.sidebar{border-right:1px solid var(--border);background:#090d16f2;padding:18px 14px;display:flex;flex-direction:column;gap:14px;position:sticky;top:0;height:100vh;overflow-y:auto}
.brand{display:flex;gap:11px;align-items:center;padding:2px 4px}
.logo{background:linear-gradient(135deg,#6366f1,#10b981);padding:9px 11px;border-radius:11px;color:#070b14;font-weight:900;font-size:17px;flex-shrink:0}
.neon-box{padding:12px;border:1px solid rgba(16,185,129,0.5);box-shadow:0 0 14px rgba(16,185,129,0.14),inset 0 0 8px rgba(16,185,129,0.05);border-radius:14px;background:#0c1322f5;font-size:11.5px;display:flex;flex-direction:column;gap:7px}
.neon-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:7px;border-bottom:1px solid #1e293b;font-weight:700;color:#fff}
.neon-row{display:grid;grid-template-columns:16px minmax(0,1fr) auto;align-items:center;gap:6px;color:var(--muted);line-height:1.2}
.neon-icon{display:inline-flex;justify-content:center;align-items:center;font-size:11px;width:16px;text-align:center}
.neon-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:#cbd5e1}
.neon-badge{white-space:nowrap;text-align:right;font-weight:700;font-size:10px;color:#34d399;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.35);padding:1.5px 7px;border-radius:99px}
.pill-ok{background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.5);color:#34d399;padding:2px 8px;border-radius:99px;font-weight:700;font-size:10px;white-space:nowrap}
.nav-section{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:#64748b;font-weight:700;padding:4px 8px 2px}
.nav{display:grid;gap:4px}
.nav button{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;color:var(--muted);border-radius:10px;background:transparent;border:1px solid transparent;text-align:left;font-weight:600;font-size:12.5px;transition:all .15s}
.nav button.active,.nav button:hover{color:#fff;background:#1e1b4b;border-color:rgba(129,140,248,0.35)}
.nav button .badge{font-size:10.5px;padding:1px 7px;border-radius:99px;background:#1e293b;color:#cbd5e1}
.nav button .badge-warn{background:rgba(245,158,11,0.18);color:#fbbf24;border:1px solid rgba(245,158,11,0.4)}
.subnav{display:grid;gap:3px;padding-left:12px;border-left:1px solid #1e293b;margin-left:10px}
.subnav button{padding:6px 10px;font-size:11.5px;font-weight:500;color:#94a3b8;border-radius:8px;background:transparent;border:0;text-align:left;display:flex;justify-content:space-between;align-items:center}
.subnav button.active,.subnav button:hover{color:#c7d2fe;background:rgba(99,102,241,0.14)}
.main{padding:24px clamp(16px,2.5vw,38px);max-width:1680px;width:100%;margin:0 auto}
.topline{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;padding-bottom:16px;border-bottom:1px solid var(--border)}
.eyebrow{color:#818cf8;font-size:11px;text-transform:uppercase;letter-spacing:1.6px;font-weight:700}
.topline h1{font-size:clamp(22px,2.4vw,30px);margin:5px 0}
.sub{color:var(--muted);margin:0;font-size:13px}
.btn{border:1px solid var(--border);padding:9px 14px;color:var(--text);border-radius:10px;background:var(--surface2);font-weight:600;font-size:12.5px;display:inline-flex;align-items:center;gap:6px}
.btn.primary{background:#4f46e5;border:1px solid #6366f1;color:#fff;font-weight:700}
.btn.emerald{background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.45);color:#34d399;font-weight:700}
.btn:hover{filter:brightness(1.12)}
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin:18px 0}
.stat{border:1px solid var(--border);border-radius:13px;background:#0f172acc;padding:13px 15px}
.stat .k{color:var(--muted);font-size:11px;font-weight:600}
.stat .v{font-weight:800;font-size:24px;margin:5px 0 2px}
.stat .note{font-size:10.5px;color:#64748b}
.tools{display:flex;gap:10px;justify-content:space-between;align-items:center;margin:16px 0;flex-wrap:wrap}
.search{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:9px 13px;color:var(--text);min-width:220px;flex:1;max-width:420px;font-size:12.5px}
.filters{display:flex;gap:7px;flex-wrap:wrap}
.filters select{background:var(--surface);color:var(--text);border:1px solid var(--border);padding:8px 11px;border-radius:9px;font-size:12px}
/* Grade Compacta 4 por linha (DevCentral 3.0) */
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.card{background:linear-gradient(145deg,#11192c,#0c1322);border-radius:13px;padding:13px 14px;display:flex;flex-direction:column;justify-content:space-between;min-height:178px;transition:transform 0.16s ease,box-shadow 0.16s ease}
.card:hover{transform:translateY(-2px)}
.card.card-online{border:1.5px solid #10b981;box-shadow:0 0 12px rgba(16,185,129,0.22),inset 0 0 8px rgba(16,185,129,0.05)}
.card.card-off{border:1.5px solid #f43f5e;box-shadow:0 0 12px rgba(244,63,94,0.22),inset 0 0 8px rgba(244,63,94,0.05)}
.card-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.avatar{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:#1e1b4b;color:#a5b4fc;font-weight:800;font-size:11.5px;flex-shrink:0;border:1px solid rgba(99,102,241,0.3)}
.card-meta{font-size:9.5px;text-transform:uppercase;letter-spacing:0.7px;color:var(--muted);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.status{font-size:10px;color:#34d399;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.4);padding:3px 8px;border-radius:99px;white-space:nowrap;font-weight:700;flex-shrink:0}
.status.off{color:#fb7185;background:rgba(244,63,94,0.14);border:1px solid rgba(244,63,94,0.4)}
.card h3{font-size:13.5px;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700}
.desc{color:var(--muted);line-height:1.38;font-size:11.5px;margin:8px 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;flex:1}
.tags{display:flex;gap:5px;flex-wrap:wrap;margin:6px 0 10px}
.tag{border:1px solid #26334d;color:#cbd5e1;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:600}
.tag.vercel{background:#172036;color:#a5b4fc;border-color:rgba(129,140,248,0.35)}
.links{border-top:1px solid #1e293b;padding-top:9px;display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.links a{font-size:11px;font-weight:600}
.link-repo{color:#a5b4fc}
.link-deploy{color:#34d399}
.link-extra{color:#c084fc}
.links a:hover{text-decoration:underline}
.btn-diag{margin-left:auto;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;padding:3px 7px;border-radius:6px;font-size:10px;font-weight:600}
.btn-diag:hover{background:rgba(99,102,241,0.25);color:#fff}

/* Central de Telemetria & Soluções */
.telemetry-wrap{display:grid;gap:16px;margin-top:16px}
.telemetry-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;background:#0f172acc;border:1px solid var(--border);padding:12px 16px;border-radius:13px}
.subtabs{display:flex;gap:6px;flex-wrap:wrap}
.subtabs button{padding:7px 12px;border-radius:9px;border:1px solid var(--border);background:#0b1120;color:var(--muted);font-size:12px;font-weight:600}
.subtabs button.active{background:#4f46e5;border-color:#6366f1;color:#fff}
.telemetry-split{display:grid;grid-template-columns:1fr 1.25fr;gap:14px;align-items:start}
.diag-list{display:grid;gap:9px;max-height:680px;overflow-y:auto;padding-right:4px}
.diag-item{background:#0f172a;border:1px solid var(--border);border-radius:12px;padding:13px;cursor:pointer;transition:all .15s;text-align:left;width:100%}
.diag-item:hover,.diag-item.active{border-color:#6366f1;background:#131c36}
.diag-detail{background:#0f172a;border:1px solid var(--border);border-radius:14px;padding:20px;position:sticky;top:20px}
.sev-pill{font-size:10px;font-weight:800;text-transform:uppercase;padding:2.5px 8px;border-radius:99px;display:inline-block}
.sev-critical{background:rgba(244,63,94,0.15);color:#fb7185;border:1px solid rgba(244,63,94,0.4)}
.sev-warning{background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.4)}
.sev-info{background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.4)}
.solution-box{margin-top:14px;padding:14px;border-radius:11px;background:#090e1a;border:1px solid #1e293b}
.solution-box h4{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8}
.cmd-row{display:flex;justify-content:space-between;align-items:center;gap:8px;background:#050811;border:1px solid #1e293b;padding:8px 11px;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:#34d399;margin-top:6px}
.status-btn{padding:6px 11px;border-radius:8px;border:1px solid var(--border);background:#162038;color:#cbd5e1;font-size:11.5px;font-weight:600}
.status-btn.active{background:#10b981;border-color:#34d399;color:#051b11;font-weight:800}

@media(max-width:1360px){.cards{grid-template-columns:repeat(3,minmax(0,1fr))}.stats{grid-template-columns:repeat(3,1fr)}}
@media(max-width:1024px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.telemetry-split{grid-template-columns:1fr}}
@media(max-width:760px){.shell{display:block}.sidebar{position:static;height:auto}.cards,.stats{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <span class="logo">⌘</span>
      <div style="min-width:0">
        <div style="font-weight:800;font-size:18px;line-height:1.15">DevCentral <span style="color:#818cf8;font-size:11.5px">3.0</span></div>
        <div style="font-size:10.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">Cockpit &amp; Telemetria Multi-Contas</div>
      </div>
    </div>

    <div class="neon-box">
      <div class="neon-head">
        <span style="display:flex;align-items:center;gap:6px"><span>🗄️</span><span>Neon PostgreSQL</span></span>
        <span class="pill-ok">● Online</span>
      </div>
      <div class="neon-row">
        <span class="neon-icon">🔥</span>
        <span class="neon-label" title="Firebase (devcentral-190fe)">Firebase (devcentral-190fe)</span>
        <span class="neon-badge">Ativo</span>
      </div>
      <div class="neon-row">
        <span class="neon-icon">⌘</span>
        <span class="neon-label" title="GitHub">GitHub</span>
        <span class="neon-badge" id="sb-gh">Ativo (${ghCount})</span>
      </div>
      <div class="neon-row">
        <span class="neon-icon">◇</span>
        <span class="neon-label" title="GitLab">GitLab (@ViniciusMurray)</span>
        <span class="neon-badge" id="sb-gl">Ativo (${glCount})</span>
      </div>
      <div class="neon-row">
        <span class="neon-icon">▲</span>
        <span class="neon-label" title="Vercel Conta 1">viniciuscasagrande-creator</span>
        <span class="neon-badge">Ativo</span>
      </div>
      <div class="neon-row">
        <span class="neon-icon">▲</span>
        <span class="neon-label" title="Vercel Conta 2">DEVELOPDISKINGRESSOS-9897</span>
        <span class="neon-badge">Ativo</span>
      </div>
      <div id="auth-user-box" style="display:none;padding-top:7px;border-top:1px solid #1e293b;font-size:10.5px"></div>
    </div>

    <div class="nav-section">Navegação Principal</div>
    <nav class="nav">
      <button data-tab="all"><span>▦ &nbsp; Visão geral (4 col)</span><span class="badge" id="nav-total">${totalCount}</span></button>
      <button data-tab="pinned"><span>★ &nbsp; Fixados no topo</span><span class="badge" id="nav-pinned">${pinnedCount}</span></button>
      <button data-tab="online"><span>● &nbsp; Em produção (Online)</span><span class="badge" id="nav-online">${onlineCount}</span></button>
      <button data-tab="deployments"><span>🚀 &nbsp; Deploys (Vercel x2)</span><span class="badge" id="nav-vc">${vcCount}</span></button>
      <button data-tab="telemetry"><span>🩺 &nbsp; Telemetria &amp; Soluções</span><span class="badge badge-warn" id="nav-telemetry">${openRecsCount}</span></button>
      <div class="subnav" id="telemetry-subnav">
        <button data-subtab="diagnostic" class="active"><span>• Diagnóstico por Projeto</span></button>
        <button data-subtab="alerts"><span>• Erros &amp; Alertas</span></button>
        <button data-subtab="improvements"><span>• Sugestões de Melhoria</span></button>
        <button data-subtab="activity"><span>• Eventos Git &amp; Sync</span></button>
        <button data-subtab="history"><span>• Histórico de Soluções</span></button>
      </div>
      <button data-tab="activity"><span>⚡ &nbsp; Atividade Recente</span><span class="badge" id="nav-logs">${safeLogs.length}</span></button>
    </nav>
  </aside>

  <main class="main">
    <header class="topline">
      <div>
        <div class="eyebrow">DevCentral 3.0 • Grade Compacta 4 Colunas + Central de Telemetria &amp; Soluções</div>
        <h1 id="page-title">Painel de Projetos &amp; Telemetria</h1>
        <p class="sub" id="page-sub">Catálogo sincronizado com Neon PostgreSQL. Use a aba Telemetria &amp; Soluções para diagnósticos e planos de ação passo a passo.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button class="btn emerald" id="quick-telemetry-btn">🩺 Telemetria &amp; Soluções (${openRecsCount})</button>
        <button class="btn primary" id="login-btn">🔐 Entrar com Google (Admin)</button>
        <button class="btn" id="sync-btn" style="display:none">🔄 Sincronizar Tudo</button>
      </div>
    </header>

    <section class="stats">
      <div class="stat"><div class="k">Total no Catálogo</div><div class="v" id="st-total">${totalCount}</div><div class="note">Projetos carregados</div></div>
      <div class="stat" style="border-color:rgba(16,185,129,0.4)"><div class="k">Online em Produção</div><div class="v" id="st-online" style="color:var(--green)">${onlineCount}</div><div class="note">Com deploy ativo</div></div>
      <div class="stat"><div class="k">GitHub</div><div class="v" id="st-gh">${ghCount}</div><div class="note">Repositórios</div></div>
      <div class="stat"><div class="k">GitLab</div><div class="v" id="st-gl">${glCount}</div><div class="note">Repositórios</div></div>
      <div class="stat"><div class="k">Vercel (2 Contas)</div><div class="v" id="st-vc" style="color:#818cf8">${vcCount}</div><div class="note">Apps monitoradas</div></div>
      <div class="stat" style="border-color:rgba(245,158,11,0.4);cursor:pointer" id="stat-telemetry-card"><div class="k">Diagnósticos Abertos</div><div class="v" id="st-recs" style="color:var(--amber)">${openRecsCount}</div><div class="note">Ver plano de ação →</div></div>
    </section>

    <!-- ABA PROJETOS / DEPLOYS -->
    <section id="view-projects">
      <div class="tools">
        <input class="search" type="search" id="search" placeholder="⌕ Pesquisar nome, stack, conta Vercel ou tag...">
        <div class="filters">
          <select id="f-source">
            <option value="">Todas as fontes</option>
            <option value="GitHub">GitHub</option>
            <option value="GitLab">GitLab</option>
            <option value="Vercel">Vercel</option>
          </select>
          <select id="f-account">
            <option value="">Todas as contas Vercel</option>
            <option value="viniciuscasagrande-creator">viniciuscasagrande-creator</option>
            <option value="DEVELOPDISKINGRESSOS-9897">DEVELOPDISKINGRESSOS-9897</option>
          </select>
          <select id="f-lang"><option value="">Todas as stacks</option></select>
          <select id="f-state">
            <option value="">Todos os status</option>
            <option value="online">Online (Verde Neon)</option>
            <option value="dev">Em dev / Off (Vermelho Neon)</option>
          </select>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0">
        <h2 style="font-size:15px;margin:0;color:#cbd5e1" id="grid-heading">Grade compacta (4 projetos por linha)</h2>
        <span id="result-count" style="font-size:11.5px;color:var(--muted)">${totalCount} projeto(s) exibido(s)</span>
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
            <button data-subtab-btn="diagnostic" class="active">🩺 Diagnóstico por Projeto</button>
            <button data-subtab-btn="alerts">⚠️ Erros &amp; Alertas</button>
            <button data-subtab-btn="improvements">💡 Sugestões de Melhoria</button>
            <button data-subtab-btn="activity">🕒 Eventos Git &amp; Sync</button>
            <button data-subtab-btn="history">✅ Histórico de Soluções</button>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <select id="tel-project" style="background:var(--surface);color:var(--text);border:1px solid var(--border);padding:7px 10px;border-radius:8px;font-size:12px">
              <option value="all">Todos os projetos</option>
            </select>
            <select id="tel-status" style="background:var(--surface);color:var(--text);border:1px solid var(--border);padding:7px 10px;border-radius:8px;font-size:12px">
              <option value="all">Todos os status</option>
              <option value="open">Pendente</option>
              <option value="investigating">Em análise</option>
              <option value="resolved">Resolvida</option>
            </select>
            <input id="tel-search" type="search" placeholder="Filtrar diagnósticos..." style="background:var(--surface);color:var(--text);border:1px solid var(--border);padding:7px 11px;border-radius:8px;font-size:12px;min-width:190px">
          </div>
        </div>

        <div class="telemetry-split" id="telemetry-split-box">
          <div class="diag-list" id="diag-list"></div>
          <div class="diag-detail" id="diag-detail"></div>
        </div>

        <div id="telemetry-events-box" style="display:none;background:#0f172a;border:1px solid var(--border);border-radius:14px;padding:18px"></div>
      </div>
    </section>

    <!-- ABA ATIVIDADE -->
    <section id="view-activity" style="display:none;margin-top:16px">
      <div style="background:#0f172a;border:1px solid var(--border);border-radius:14px;padding:20px">
        <h2 style="margin:0 0 12px;font-size:17px">Histórico de Sincronizações (Neon DB)</h2>
        <div id="activity-list" style="display:grid;gap:10px"></div>
      </div>
    </section>
  </main>
</div>

<script>
const INITIAL_PROJECTS = ${JSON.stringify(safeRows).replace(/</g, "\\u003c")};
const INITIAL_RECS = ${JSON.stringify(initialRecs).replace(/</g, "\\u003c")};
const INITIAL_LOGS = ${JSON.stringify(safeLogs).replace(/</g, "\\u003c")};
const DEFAULT_TAB = ${JSON.stringify(defaultTab)};

let projects = INITIAL_PROJECTS;
let recommendations = INITIAL_RECS;
let syncLogs = INITIAL_LOGS;
let activeTab = window.location.pathname.includes("/telemetria") ? "telemetry" : DEFAULT_TAB;
let activeSubTab = "diagnostic";
let selectedRecId = recommendations[0]?.id || null;

// Carrega status salvos localmente pelo usuário
try {
  const localStatuses = JSON.parse(localStorage.getItem("devcentral_rec_statuses_v3") || "{}");
  recommendations = recommendations.map(r => localStatuses[r.id] ? { ...r, status: localStatuses[r.id] } : r);
} catch {}

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function updateCounters() {
  const total = projects.length;
  const online = projects.filter(p => p.state === "online" || p.deploy_url).length;
  const gh = projects.filter(p => p.source === "GitHub").length;
  const gl = projects.filter(p => p.source === "GitLab").length;
  const vc = projects.filter(p => p.source === "Vercel" || (p.vercel_accounts && p.vercel_accounts.length > 0) || (p.deploy_url && p.deploy_url.includes("vercel.app"))).length;
  const openRecs = recommendations.filter(r => r.status !== "resolved").length;

  $("st-total").textContent = total;
  $("st-online").textContent = online;
  $("st-gh").textContent = gh;
  $("st-gl").textContent = gl;
  $("st-vc").textContent = vc;
  $("st-recs").textContent = openRecs;
  $("nav-total").textContent = total;
  $("nav-pinned").textContent = projects.filter(p => p.is_pinned).length;
  $("nav-online").textContent = online;
  $("nav-vc").textContent = vc;
  $("nav-telemetry").textContent = openRecs;
  $("quick-telemetry-btn").textContent = "🩺 Telemetria & Soluções (" + openRecs + ")";
  $("sb-gh").textContent = "Ativo (" + gh + ")";
  $("sb-gl").textContent = "Ativo (" + gl + ")";
}

function renderProjects() {
  const q = $("search").value.toLowerCase().trim();
  const src = $("f-source").value;
  const acc = $("f-account").value;
  const lang = $("f-lang").value;
  const st = $("f-state").value;

  const langs = [...new Set(projects.map(p => p.tech).filter(Boolean))].sort();
  $("f-lang").innerHTML = '<option value="">Todas as stacks</option>' +
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

  $("result-count").textContent = filtered.length + " projeto(s) exibido(s)";
  $("cards").innerHTML = filtered.map(p => {
    const isOnline = p.state === "online" || Boolean(p.deploy_url);
    const vAccs = Array.isArray(p.vercel_accounts) ? p.vercel_accounts : [];
    const deps = Array.isArray(p.deployments) ? p.deployments.filter(d => d.url && d.url !== p.deploy_url) : [];

    return \`<article class="card \${isOnline ? "card-online" : "card-off"}">
      <div>
        <div class="card-head">
          <div style="display:flex;gap:8px;align-items:center;min-width:0">
            <div class="avatar">\${esc((p.name || "PR").slice(0,2).toUpperCase())}</div>
            <div style="min-width:0">
              <div class="card-meta">
                \${esc(p.source)}\${p.visibility === "private" ? " • 🔒" : " • 🌐"}\${p.is_pinned ? " • ★" : ""}
              </div>
              <h3 title="\${esc(p.name)}">\${esc(p.name)}</h3>
            </div>
          </div>
          <span class="status \${isOnline ? "" : "off"}">● \${isOnline ? "Online" : "Dev"}</span>
        </div>
        <p class="desc">\${esc(p.description || "Projeto sincronizado com Neon PostgreSQL.")}</p>
        <div class="tags">
          <span class="tag">\${esc(p.tech || "TypeScript")}</span>
          \${vAccs.map(a => \`<span class="tag vercel">▲ \${esc(a === "viniciuscasagrande-creator" ? "Vercel 1" : a === "DEVELOPDISKINGRESSOS-9897" ? "Vercel 2" : a)}</span>\`).join("")}
          \${(p.tags || []).slice(0, 2).map(t => \`<span class="tag">\${esc(t)}</span>\`).join("")}
        </div>
      </div>
      <div class="links">
        \${p.repo_url ? \`<a class="link-repo" href="\${esc(p.repo_url)}" target="_blank" rel="noopener">Repo ↗</a>\` : '<span style="font-size:10.5px;color:#667794">Sem repo</span>'}
        \${p.deploy_url ? \`<a class="link-deploy" href="\${esc(p.deploy_url)}" target="_blank" rel="noopener">Site ↗</a>\` : ""}
        \${deps.slice(0, 1).map(d => \`<a class="link-extra" href="\${esc(d.url)}" target="_blank" rel="noopener">Deploy ↗</a>\`).join("")}
        <button class="btn-diag" onclick="window.__openProjectTelemetry('\${esc(p.id)}')" title="Ver Diagnóstico & Soluções">🩺 Diagnóstico</button>
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

  document.querySelectorAll("[data-subtab-btn], [data-subtab]").forEach(b => {
    const val = b.dataset.subtabBtn || b.dataset.subtab;
    b.classList.toggle("active", val === activeSubTab);
  });

  if (activeSubTab === "activity") {
    $("telemetry-split-box").style.display = "none";
    $("telemetry-events-box").style.display = "block";
    const commitEvents = projects.filter(p => p.last_commit_at).slice(0, 30);
    $("telemetry-events-box").innerHTML = \`
      <h3 style="margin:0 0 12px;font-size:16px">Linha do Tempo de Sincronizações &amp; Últimos Commits</h3>
      <div style="display:grid;gap:9px">
        \${syncLogs.map(l => \`
          <div style="padding:11px 14px;border-radius:10px;background:#090e1a;border:1px solid #1e293b;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div>
              <span class="sev-pill sev-info">SYNC</span>
              <strong style="margin-left:8px;font-size:13px">Sincronização Multi-Contas (\${esc(l.status)})</strong>
              <div style="font-size:11.5px;color:var(--muted);margin-top:4px">GitHub: \${l.github_count} · GitLab: \${l.gitlab_count} · Vercel 1: \${l.vercel1_count} · Vercel 2: \${l.vercel2_count}</div>
            </div>
            <span style="font-size:11px;color:var(--muted)">\${new Date(l.synced_at).toLocaleString("pt-BR")}</span>
          </div>
        \`).join("")}
        \${commitEvents.map(p => \`
          <div style="padding:11px 14px;border-radius:10px;background:#090e1a;border:1px solid #1e293b;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div>
              <span class="sev-pill" style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.35)">COMMIT</span>
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
    $("diag-list").innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);background:#0f172a;border:1px solid var(--border);border-radius:12px">Nenhum diagnóstico encontrado para os filtros selecionados.</div>';
    $("diag-detail").innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted)">Selecione outro filtro ou projeto para inspecionar o plano de ação.</div>';
    return;
  }

  $("diag-list").innerHTML = filtered.map(r => \`
    <button class="diag-item \${r.id === selectedRecId ? "active" : ""}" onclick="window.__selectRec('\${esc(r.id)}')">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
        <span class="sev-pill sev-\${esc(r.severity)}">\${sevLabels[r.severity] || r.severity}</span>
        <span style="font-size:10.5px;color:var(--muted);font-weight:700">\${statusLabels[r.status] || r.status}</span>
      </div>
      <div style="font-weight:700;font-size:13.5px;color:#fff;margin-bottom:3px">\${esc(r.title)}</div>
      <div style="font-size:11.5px;color:#818cf8;font-weight:600;margin-bottom:5px">\${esc(r.projectName || "Catálogo Global")}</div>
      <div style="font-size:11.5px;color:var(--muted);line-height:1.35">\${esc(r.evidence)}</div>
    </button>
  \`).join("");

  const sel = filtered.find(r => r.id === selectedRecId) || filtered[0];
  $("diag-detail").innerHTML = \`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;padding-bottom:14px;border-bottom:1px solid var(--border)">
      <div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
          <span class="sev-pill sev-\${esc(sel.severity)}">\${sevLabels[sel.severity] || sel.severity}</span>
          <span style="font-size:11.5px;color:#a5b4fc;font-weight:700">\${esc(sel.projectName || "Catálogo Global")}</span>
        </div>
        <h3 style="margin:0;font-size:18px">\${esc(sel.title)}</h3>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        \${["open", "investigating", "resolved"].map(st => \`
          <button class="status-btn \${sel.status === st ? "active" : ""}" onclick="window.__setRecStatus('\${esc(sel.id)}', '\${st}')">
            \${statusLabels[st]}
          </button>
        \`).join("")}
      </div>
    </div>

    <div class="solution-box">
      <h4>🔍 Evidência Detectada</h4>
      <div style="font-size:13px;line-height:1.5;color:#e2e8f0">\${esc(sel.evidence)}</div>
    </div>

    <div class="solution-box">
      <h4>🧠 Causa Provável</h4>
      <div style="font-size:13px;line-height:1.5;color:#cbd5e1">\${esc(sel.probableCause || "Configuração pendente ou divergência entre repositório e provedor de deploy.")}</div>
    </div>

    <div class="solution-box" style="border-color:rgba(16,185,129,0.4);background:rgba(16,185,129,0.05)">
      <h4 style="color:#34d399">🛠️ Solução Recomendada &amp; Plano de Ação Passo a Passo</h4>
      <div style="font-size:13px;line-height:1.5;color:#f1f5f9;font-weight:600;margin-bottom:10px">\${esc(sel.action)}</div>
      \${(sel.steps && sel.steps.length > 0) ? \`
        <ol style="margin:0;padding-left:18px;display:grid;gap:6px;font-size:12.5px;color:#cbd5e1;line-height:1.45">
          \${sel.steps.map(s => \`<li>\${esc(s)}</li>\`).join("")}
        </ol>
      \` : ""}
    </div>

    \${(sel.commands && sel.commands.length > 0) ? \`
      <div class="solution-box">
        <h4>💻 Comandos de Diagnóstico / Correção</h4>
        \${sel.commands.map(cmd => \`
          <div class="cmd-row">
            <code>\${esc(cmd)}</code>
            <button class="btn" style="padding:4px 9px;font-size:11px" onclick="navigator.clipboard.writeText('\${esc(cmd)}');this.textContent='Copiado!'">Copiar</button>
          </div>
        \`).join("")}
      </div>
    \` : ""}

    \${sel.href ? \`
      <div style="margin-top:14px;display:flex;justify-content:flex-end">
        <a class="btn primary" href="\${esc(sel.href)}" target="_blank" rel="noopener">Abrir Recurso Vinculado ↗</a>
      </div>
    \` : ""}
  \`;
}

function renderActivity() {
  $("activity-list").innerHTML = syncLogs.map(l => \`
    <div style="padding:14px;border-radius:11px;background:#090e1a;border:1px solid #1e293b;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <div style="font-weight:700;font-size:13.5px;color:#fff">Sincronização \${esc(l.status.toUpperCase())} — \${l.total_projects} projetos processados</div>
        <div style="font-size:12px;color:var(--muted);margin-top:4px">GitHub: \${l.github_count} · GitLab: \${l.gitlab_count} · Vercel Conta 1: \${l.vercel1_count} · Vercel Conta 2: \${l.vercel2_count}</div>
        \${l.details ? \`<div style="font-size:11.5px;color:#94a3b8;margin-top:4px">\${esc(l.details)}</div>\` : ""}
      </div>
      <div style="font-size:11.5px;color:#818cf8;font-weight:600">\${new Date(l.synced_at).toLocaleString("pt-BR")}</div>
    </div>
  \`).join("");
}

function render() {
  updateCounters();
  document.querySelectorAll("[data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === activeTab);
  });

  const isTelemetry = activeTab === "telemetry";
  const isActivity = activeTab === "activity";
  $("view-projects").style.display = (!isTelemetry && !isActivity) ? "block" : "none";
  $("view-telemetry").style.display = isTelemetry ? "block" : "none";
  $("view-activity").style.display = isActivity ? "block" : "none";

  if (isTelemetry) {
    $("page-title").textContent = "Central de Telemetria & Soluções";
    $("page-sub").textContent = "Diagnóstico automatizado por projeto, causa provável e plano de ação passo a passo.";
    renderTelemetry();
  } else if (isActivity) {
    $("page-title").textContent = "Atividade & Logs de Sincronização";
    $("page-sub").textContent = "Histórico de importações de repositórios GitHub, GitLab e contas Vercel.";
    renderActivity();
  } else {
    $("page-title").textContent = activeTab === "deployments" ? "Deploys Ativos (Vercel Multi-Contas)" : "Painel de Projetos (Grade 4 Colunas)";
    $("page-sub").textContent = "Visualização compacta 4 por linha com status neon em tempo real e atalho direto para diagnóstico.";
    renderProjects();
  }
}

window.__selectRec = (id) => {
  selectedRecId = id;
  renderTelemetry();
};

window.__setRecStatus = async (id, status) => {
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
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

document.querySelectorAll("[data-tab]").forEach(btn => {
  btn.onclick = () => {
    activeTab = btn.dataset.tab;
    render();
  };
});

document.querySelectorAll("[data-subtab], [data-subtab-btn]").forEach(btn => {
  btn.onclick = () => {
    activeTab = "telemetry";
    activeSubTab = btn.dataset.subtab || btn.dataset.subtabBtn;
    render();
  };
});

$("quick-telemetry-btn").onclick = () => {
  activeTab = activeTab === "telemetry" ? "all" : "telemetry";
  render();
};

$("stat-telemetry-card").onclick = () => {
  activeTab = "telemetry";
  render();
};

["search", "f-source", "f-account", "f-lang", "f-state"].forEach(id => {
  $(id).addEventListener(id === "search" ? "input" : "change", renderProjects);
});

["tel-project", "tel-status", "tel-search"].forEach(id => {
  $(id).addEventListener(id === "tel-search" ? "input" : "change", renderTelemetry);
});

render();

window.__setAuthedData = (projList, telPayload) => {
  if (Array.isArray(projList) && projList.length > 0) {
    projects = projList;
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
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";

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
    loginBtn.textContent = "Sair (" + (user.email || "Admin") + ")";
    syncBtn.style.display = "inline-flex";
    userBox.style.display = "block";
    userBox.innerHTML = '<div style="color:#fff;font-weight:700;margin-bottom:3px">Admin: ' + (user.email || "") + '</div>' +
      '<div style="background:#070b14;padding:3px 6px;border-radius:6px;border:1px solid #1e293b;color:#818cf8;font-family:monospace;font-size:9.5px;word-break:break-all">UID: ' + user.uid + '</div>';
    loadPrivateData(user);
  } else {
    window.__authedToken = null;
    loginBtn.textContent = "🔐 Entrar com Google (Admin)";
    syncBtn.style.display = "none";
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
      alert("Ative o provedor Google no Firebase Console (Authentication -> Sign-in method): " + e.message);
    }
  }
};
</script>
</body>
</html>`;
}

fs.writeFileSync("firebase-dist/index.html", buildHtml("all"), "utf-8");
fs.writeFileSync("firebase-dist/telemetria/index.html", buildHtml("telemetry"), "utf-8");
console.log(
  `OK: DevCentral 3.0 gerado em firebase-dist/index.html e firebase-dist/telemetria/index.html (${safeRows.length} projetos públicos em 4 colunas + ${initialRecs.length} diagnósticos de telemetria).`
);
