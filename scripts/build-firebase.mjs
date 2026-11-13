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
          <div style="display:flex;gap:10px;align-items:flex-start;min-width:0;flex:1">
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
      <div class="links">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          ${
            p.repo_url
              ? `<a class="link-repo" href="${esc(p.repo_url)}" target="_blank" rel="noopener">Repositório ↗</a>`
              : `<button class="link-btn" onclick="window.__openProjectTelemetry('${esc(p.id)}')">Repositório ↗</button>`
          }
          ${
            p.deploy_url
              ? `<a class="link-deploy" href="${esc(p.deploy_url)}" target="_blank" rel="noopener">Abrir site ↗</a>`
              : `<button class="link-btn" style="color:#8b9bb8" onclick="window.__openProjectTelemetry('${esc(p.id)}')">Detalhes ↗</button>`
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
          <button class="icon-act" onclick="window.__openProjectTelemetry('${esc(p.id)}')" title="Diagnóstico & Soluções">•••</button>
        </div>
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
<title>DevCentral 2.1 — Workspace Pessoal &amp; Telemetria</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color-scheme:dark;--bg:#070a14;--surface:#0e1526;--surface2:#141d33;--border:#1f2a44;--text:#f1f5f9;--muted:#8b9bb8;--accent:#818cf8;--green:#3ddba0;--red:#ff4d6d;--amber:#f59e0b}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(ellipse 1100px 550px at 65% -15%,rgba(91,70,232,0.18) 0%,transparent 70%),var(--bg);color:var(--text);min-height:100vh}
button,input,select,textarea{font:inherit}
button{cursor:pointer}
a{color:inherit;text-decoration:none}

.shell{display:grid;grid-template-columns:268px 1fr;min-height:100vh}

/* SIDEBAR */
.sidebar{border-right:1px solid #1c243b;background:#080c17;padding:20px 14px;display:flex;flex-direction:column;justify-content:space-between;gap:18px;position:sticky;top:0;height:100vh;overflow-y:auto;user-select:none}
.brand-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 4px}
.brand{display:flex;gap:11px;align-items:center;min-width:0}
.logo-box{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#2d1f66,#1c2347,#0e3240);border:1px solid rgba(110,86,207,0.65);box-shadow:0 0 20px rgba(124,92,255,0.45);display:grid;place-items:center;flex-shrink:0}
.collapse-btn{width:28px;height:28px;border-radius:8px;background:#111729;border:1px solid #222c46;color:#8b9bb8;display:grid;place-items:center;font-size:11px}
.collapse-btn:hover{color:#fff}

.sec-title{display:flex;align-items:center;gap:6px;padding:6px 8px 4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.3px;color:#7f8ea8}
.sec-dot{width:6px;height:6px;border-radius:99px;background:#2dd4a0}

.infra-list{display:grid;gap:3px;font-size:11.5px}
.infra-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:9px;color:#c8d4eb;background:transparent;border:0;width:100%;text-align:left;transition:background .15s}
.infra-row:hover{background:#11182b}
.infra-left{display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill-green{font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;background:#0d2e28;color:#3ddba0;border:1px solid rgba(45,212,160,0.45);white-space:nowrap;flex-shrink:0}

.nav-sep{border-top:1px solid #161e33;padding-top:10px;margin-top:6px}
.nav{display:grid;gap:4px}
.nav button{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;color:#b8c6df;border-radius:12px;background:transparent;border:1px solid transparent;text-align:left;font-weight:600;font-size:12px;transition:all .15s}
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
.main{padding:22px clamp(16px,2.2vw,32px);max-width:1640px;width:100%;margin:0 auto}

/* TOP BAR */
.topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.eyebrow{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:#a5b4fc}
.top-actions{display:flex;align-items:center;gap:10px}
.circle-btn{width:36px;height:36px;border-radius:99px;background:#101729;border:1px solid #222e4a;color:#9baac5;display:grid;place-items:center;position:relative}
.circle-btn:hover{color:#fff;border-color:#4b5d88}
.bell-dot{position:absolute;top:6px;right:7px;width:7px;height:7px;border-radius:99px;background:#a855f7;box-shadow:0 0 6px #a855f7}
.auth-pill{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:99px;background:linear-gradient(90deg,#7c5cff,#5b3df5);border:1px solid rgba(167,139,250,0.75);box-shadow:0 0 20px rgba(124,92,255,0.45);color:#fff;font-size:12px;font-weight:700}
.auth-pill:hover{filter:brightness(1.1)}

/* HERO BANNER */
.hero{position:relative;overflow:hidden;border-radius:18px;border:1px solid #1f2942;background:linear-gradient(90deg,#0c1224,#111530,#0c1224);padding:22px 26px;box-shadow:0 12px 40px rgba(0,0,0,0.45);margin-bottom:18px}
.hero-bar{position:absolute;left:0;top:16px;bottom:16px;width:4px;border-radius:0 99px 99px 0;background:linear-gradient(180deg,#38bdf8,#818cf8,#a855f7);box-shadow:0 0 14px #38bdf8}
.hero-grid{position:relative;z-index:2;display:grid;grid-template-columns:1.35fr 0.85fr 0.8fr;align-items:center;gap:20px}
.hero-badge{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:#c7d2fe}
.hero h1{font-size:clamp(26px,2.8vw,38px);font-weight:900;margin:6px 0 8px;letter-spacing:-0.5px;line-height:1.05;color:#fff}
.hero h1 span{background:linear-gradient(90deg,#a78bfa,#c084fc,#818cf8);-webkit-background-clip:text;color:transparent}
.hero p{font-size:13px;color:#9baac5;margin:0 0 14px;max-width:560px;line-height:1.45}
.hero-btns{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.btn-sync-split{display:inline-flex;align-items:stretch;border-radius:12px;background:linear-gradient(90deg,#6d4aff,#7c3aed);border:1px solid rgba(167,139,250,0.7);box-shadow:0 0 22px rgba(124,92,255,0.45);overflow:hidden}
.btn-sync-main{padding:10px 15px;border:0;background:transparent;color:#fff;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:8px}
.btn-sync-chev{padding:0 10px;border:0;border-left:1px solid rgba(255,255,255,0.2);background:transparent;color:#fff;font-size:11px}
.btn-telemetry-hero{display:inline-flex;align-items:center;gap:8px;padding:10px 15px;border-radius:12px;background:rgba(16,23,42,0.9);border:1px solid #2a3656;color:#fff;font-size:12px;font-weight:700}
.btn-telemetry-hero:hover{background:#162038;border-color:#4b5d88}
.hero-checks{display:grid;gap:9px;font-size:12.5px;color:#d5dff2;justify-self:end}
.hero-checks div{display:flex;align-items:center;gap:9px;font-weight:500}

/* 5 KPI STATS */
.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:13px;margin-bottom:18px}
.stat{border:1px solid #222d47;border-radius:16px;background:linear-gradient(135deg,#13192e,#0d1323);padding:15px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;transition:border-color .15s}
.stat:hover{border-color:#4b5d88}
.stat.stat-online{border-color:rgba(45,212,160,0.8);background:linear-gradient(135deg,#0e2a27,#0d2025,#0c1724);box-shadow:0 0 20px rgba(45,212,160,0.18)}
.stat-left{display:flex;align-items:flex-start;gap:12px;min-width:0}
.stat-icon{width:40px;height:40px;border-radius:12px;background:#1c2242;border:1px solid #323c6e;display:grid;place-items:center;flex-shrink:0;margin-top:2px;font-size:16px}
.stat-online .stat-icon{background:#0f3830;border-color:rgba(45,212,160,0.5);color:#3ddba0}
.stat .k{color:#9baac5;font-size:11px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stat .v{font-weight:900;font-size:25px;line-height:1.15;margin:2px 0;color:#fff}
.stat .note{font-size:10.5px;color:#7f8ea8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* FILTER BAR */
.filter-grid{display:grid;grid-template-columns:1.5fr repeat(4,minmax(0,1fr));gap:10px;align-items:center;margin-bottom:16px}
.search-wrap{position:relative}
.search{width:100%;background:#0e1526;border:1px solid #222e4a;border-radius:12px;padding:10px 68px 10px 36px;color:var(--text);font-size:12px}
.search:focus,.filter-select:focus{outline:none;border-color:#7c5cff}
.search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#7f8ea8;font-size:13px;pointer-events:none}
.kbd-ctrl{position:absolute;right:10px;top:50%;transform:translateY(-50%);padding:2px 7px;border-radius:6px;background:#162038;border:1px solid #2a3859;font-size:10px;font-weight:600;color:#9baac5;pointer-events:none}
.filter-select{width:100%;background:#0e1526;color:#d5dff2;border:1px solid #222e4a;padding:10px 12px;border-radius:12px;font-size:12px;font-weight:500}

/* SECTION HEADER: SEUS PROJETOS */
.sec-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:4px 0 14px;flex-wrap:wrap}
.sec-bar-left{display:flex;align-items:center;gap:10px}
.sec-bar-left h2{font-size:18px;font-weight:800;margin:0;color:#fff}
.count-pill{font-size:11.5px;font-weight:700;padding:2px 10px;border-radius:99px;background:#2a1f63;color:#d8ceff;border:1px solid rgba(110,86,207,0.5)}
.view-toggle{display:inline-flex;border-radius:11px;border:1px solid #253252;background:#0e1526;padding:2px}
.view-toggle button{border:0;background:transparent;color:#8b9bb8;padding:5px 8px;border-radius:8px;font-size:12px}
.view-toggle button.active{background:#5b46e8;color:#fff;box-shadow:0 0 10px rgba(91,70,232,0.5)}

/* PROJECT CARDS (4 COLUMNS) */
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.cards.list-mode{grid-template-columns:1fr}
.card{background:linear-gradient(145deg,rgba(19,27,48,0.95),rgba(15,22,40,0.95),rgba(11,16,31,0.95));border-radius:16px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;min-height:196px;transition:transform 0.16s ease,border-color 0.16s ease}
.card:hover{transform:translateY(-2px)}
.card.card-online{border:1px solid rgba(45,212,160,0.75);box-shadow:0 0 16px rgba(45,212,160,0.16),inset 0 0 12px rgba(45,212,160,0.04)}
.card.card-off{border:1px solid rgba(255,77,109,0.75);box-shadow:0 0 16px rgba(255,77,109,0.16),inset 0 0 12px rgba(255,77,109,0.04)}
.card-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.avatar{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:linear-gradient(135deg,#2c3366,#1e2347);color:#e2ddff;font-weight:800;font-size:12px;flex-shrink:0;border:1px solid rgba(72,81,145,0.6)}
.card-meta{font-size:10px;text-transform:uppercase;letter-spacing:0.7px;color:#8b9bb8;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.status{font-size:10.5px;color:#3ddba0;background:#0d2e28;border:1px solid rgba(45,212,160,0.55);box-shadow:0 0 10px rgba(45,212,160,0.2);padding:2.5px 10px;border-radius:99px;white-space:nowrap;font-weight:700;flex-shrink:0}
.status.off{color:#ff6b86;background:rgba(255,77,109,0.15);border:1px solid rgba(255,77,109,0.55);box-shadow:0 0 10px rgba(255,77,109,0.2)}
.card h3{font-size:14.5px;margin:3px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:800;color:#fff}
.desc{color:#9baac5;line-height:1.45;font-size:11.5px;margin:11px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:34px}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0 0}
.tag{background:#141d33;border:1px solid #263554;color:#cbd5e8;padding:2.5px 8px;border-radius:6px;font-size:10.5px;font-weight:500}
.tag.vercel{background:#1c1a3b;color:#b4a8ff;border-color:#453a85;font-weight:600;max-width:195px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.links{border-top:1px solid #1c263d;padding-top:10px;margin-top:14px;display:flex;justify-content:space-between;gap:8px;align-items:center}
.links a,.link-btn{font-size:12px;font-weight:600;background:transparent;border:0;padding:0}
.link-repo,.link-btn{color:#d5dff2}
.link-deploy{color:#3ddba0}
.links a:hover,.link-btn:hover{text-decoration:underline}
.card-actions{display:flex;align-items:center;gap:4px;color:#8b9bb8}
.icon-act{background:transparent;border:0;color:#8b9bb8;padding:4px 6px;border-radius:6px;font-size:12px;display:inline-flex;align-items:center;justify-content:center}
.icon-act:hover{color:#fff;background:#182337}
.icon-act.pinned{color:#fbbf24}

/* TELEMETRY SECTION */
.telemetry-wrap{display:grid;gap:16px;margin-top:8px}
.telemetry-bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;background:#0e1526;border:1px solid #222e4a;padding:12px 16px;border-radius:14px}
.subtabs{display:flex;gap:6px;flex-wrap:wrap}
.subtabs button{padding:7px 12px;border-radius:9px;border:1px solid #222e4a;background:#090d18;color:var(--muted);font-size:12px;font-weight:600}
.subtabs button.active{background:#5641e5;border-color:#8e7bff;color:#fff}
.telemetry-split{display:grid;grid-template-columns:1fr 1.25fr;gap:14px;align-items:start}
.diag-list{display:grid;gap:9px;max-height:680px;overflow-y:auto;padding-right:4px}
.diag-item{background:#0e1526;border:1px solid #222e4a;border-radius:12px;padding:13px;cursor:pointer;transition:all .15s;text-align:left;width:100%}
.diag-item:hover,.diag-item.active{border-color:#7c5cff;background:#141d36}
.diag-detail{background:#0e1526;border:1px solid #222e4a;border-radius:14px;padding:20px;position:sticky;top:20px}
.sev-pill{font-size:10px;font-weight:800;text-transform:uppercase;padding:2.5px 8px;border-radius:99px;display:inline-block}
.sev-critical{background:rgba(255,77,109,0.15);color:#ff6b86;border:1px solid rgba(255,77,109,0.4)}
.sev-warning{background:rgba(245,158,11,0.15);color:#fbbf24;border:1px solid rgba(245,158,11,0.4)}
.sev-info{background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.4)}
.solution-box{margin-top:14px;padding:14px;border-radius:11px;background:#090d18;border:1px solid #1e293b}
.solution-box h4{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:#94a3b8}
.cmd-row{display:flex;justify-content:space-between;align-items:center;gap:8px;background:#050811;border:1px solid #1e293b;padding:8px 11px;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:#3ddba0;margin-top:6px}
.status-btn{padding:6px 11px;border-radius:8px;border:1px solid #222e4a;background:#141d33;color:#cbd5e1;font-size:11.5px;font-weight:600}
.status-btn.active{background:#2dd4a0;border-color:#3ddba0;color:#051b11;font-weight:800}

@media(max-width:1360px){.cards{grid-template-columns:repeat(3,minmax(0,1fr))}.stats{grid-template-columns:repeat(3,1fr)}.hero-grid{grid-template-columns:1.4fr 1fr}.hero-iso{display:none}}
@media(max-width:1024px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.filter-grid{grid-template-columns:1fr 1fr}.telemetry-split{grid-template-columns:1fr}.hero-grid{grid-template-columns:1fr}.hero-checks{justify-self:start}}
@media(max-width:760px){.shell{display:block}.sidebar{position:static;height:auto}.cards,.stats,.filter-grid{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="shell">
  <!-- SIDEBAR -->
  <aside class="sidebar">
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
            <div style="font-weight:800;font-size:19px;line-height:1.15;color:#fff">DevCentral <span style="color:#a5b4fc;font-size:12px">2.1</span></div>
            <div style="font-size:10.5px;color:#7f8ea8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">Multi-contas • Neon DB • Firebase</div>
          </div>
        </div>
        <button class="collapse-btn" onclick="window.__resetView()" title="Painel Principal">«-</button>
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
            <span class="pill-green">Ativo</span>
          </button>
          <button class="infra-row" onclick="window.__quickFilter('','DEVELOPDISKINGRESSOS-9897')">
            <span class="infra-left"><span style="color:#a5b4fc">▲</span><span style="overflow:hidden;text-overflow:ellipsis">DEVELOPDISKINGRESSOS-...</span></span>
            <span class="pill-green">Ativo</span>
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
      <div class="eyebrow">WORKSPACE PESSOAL • MULTI-CONTAS • NEON DB • FIREBASE AUTH</div>
      <div class="top-actions">
        <button class="circle-btn" onclick="document.getElementById('search').focus()" title="Pesquisar (Ctrl + K)">🔍</button>
        <button class="circle-btn" onclick="window.__openTelemetryTab()" title="Telemetria &amp; Soluções">
          🔔<span class="bell-dot"></span>
        </button>
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
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input class="search" type="search" id="search" placeholder="Pesquisar nome, linguagem, conta Vercel ou descrição...">
          <kbd class="kbd-ctrl">Ctrl + K</kbd>
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
            <button id="btn-view-grid" class="active" onclick="window.__setViewMode('grid')" title="Grade 4 colunas">⊞</button>
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

try {
  const localStatuses = JSON.parse(localStorage.getItem("devcentral_rec_statuses_v3") || "{}");
  recommendations = recommendations.map(r => localStatuses[r.id] ? { ...r, status: localStatuses[r.id] } : r);
} catch {}

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("search")?.focus();
  }
});

function updateCounters() {
  const total = projects.length;
  const online = projects.filter(p => p.state === "online" || p.deploy_url).length;
  const gh = projects.filter(p => p.source === "GitHub").length;
  const gl = projects.filter(p => p.source === "GitLab").length;
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
          <div style="display:flex;gap:10px;align-items:flex-start;min-width:0;flex:1">
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
      <div class="links">
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
          \${p.repo_url ? \`<a class="link-repo" href="\${esc(p.repo_url)}" target="_blank" rel="noopener">Repositório ↗</a>\` : \`<button class="link-btn" onclick="window.__openProjectTelemetry('\${esc(p.id)}')">Repositório ↗</button>\`}
          \${p.deploy_url ? \`<a class="link-deploy" href="\${esc(p.deploy_url)}" target="_blank" rel="noopener">Abrir site ↗</a>\` : \`<button class="link-btn" style="color:#8b9bb8" onclick="window.__openProjectTelemetry('\${esc(p.id)}')">Detalhes ↗</button>\`}
        </div>
        <div class="card-actions">
          \${p.repo_url ? \`<a class="icon-act" href="\${esc(p.repo_url)}" target="_blank" rel="noopener" title="Repositório GitHub"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.26 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg></a>\` : ""}
          <button class="icon-act \${p.is_pinned ? "pinned" : ""}" onclick="window.__togglePinLocal('\${esc(p.id)}')" title="Fixar no topo">★</button>
          <button class="icon-act" onclick="window.__openProjectTelemetry('\${esc(p.id)}')" title="Diagnóstico & Soluções">•••</button>
        </div>
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
    <button class="diag-item \${r.id === selectedRecId ? "active" : ""}" onclick="window.__selectRec('\${esc(r.id)}')">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">
        <span class="sev-pill sev-\${esc(r.severity)}">\${sevLabels[r.severity] || r.severity}</span>
        <span style="font-size:10.5px;color:var(--muted);font-weight:700">\${statusLabels[r.status] || r.status}</span>
      </div>
      <div style="font-weight:700;font-size:13.5px;color:#fff;margin-bottom:3px">\${esc(r.title)}</div>
      <div style="font-size:11.5px;color:#a5b4fc;font-weight:600;margin-bottom:5px">\${esc(r.projectName || "Catálogo Global")}</div>
      <div style="font-size:11.5px;color:var(--muted);line-height:1.35">\${esc(r.evidence)}</div>
    </button>
  \`).join("");

  const sel = filtered.find(r => r.id === selectedRecId) || filtered[0];
  $("diag-detail").innerHTML = \`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;padding-bottom:14px;border-bottom:1px solid #222e4a">
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

    <div class="solution-box" style="border-color:rgba(45,212,160,0.4);background:rgba(45,212,160,0.05)">
      <h4 style="color:#3ddba0">🛠️ Solução Recomendada &amp; Plano de Ação Passo a Passo</h4>
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
            <button class="status-btn" style="padding:4px 9px;font-size:11px" onclick="navigator.clipboard.writeText('\${esc(cmd)}');this.textContent='Copiado!'">Copiar</button>
          </div>
        \`).join("")}
      </div>
    \` : ""}
  \`;
}

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
  document.querySelectorAll("[data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === activeTab);
  });

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

window.__resetView = () => {
  activeTab = "all";
  $("f-source").value = "";
  $("f-account").value = "";
  $("f-lang").value = "";
  $("f-state").value = "";
  $("search").value = "";
  render();
};

window.__quickFilter = (source, account) => {
  activeTab = "all";
  $("f-source").value = source || "";
  $("f-account").value = account || "";
  render();
};

window.__filterByState = (st) => {
  activeTab = "all";
  $("f-state").value = st || "";
  render();
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
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

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
      alert("Ative o provedor Google no Firebase Console (Authentication -> Sign-in method): " + e.message);
    }
  }
};

syncBtn.onclick = async () => {
  if (!auth.currentUser) {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      alert("Faça login com Google (Admin) para sincronizar projetos via API.");
      return;
    }
  }
  if (window.__authedToken) {
    syncBtn.textContent = "⏳ Sincronizando...";
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + window.__authedToken
        },
        body: JSON.stringify({})
      });
      if (res.ok) {
        await loadPrivateData(auth.currentUser);
      }
    } catch {}
    syncBtn.textContent = "🚀 Sincronizar projetos";
  }
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
console.log(
  `OK: Novo layout DevCentral gerado em firebase-dist/index.html e firebase-dist/telemetria/index.html (${safeRows.length} projetos públicos em 4 colunas + ${initialRecs.length} diagnósticos).`
);
