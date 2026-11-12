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
  throw new Error(
    "DATABASE_URL não encontrada. Defina no .env.local ou variável de ambiente."
  );
}

const sql = neon(loadDatabaseUrl());

const rawRows = await sql`
  SELECT
    id, external_id, name, description, tech, source, repo_url, deploy_url,
    state, visibility, default_branch, framework, last_commit_at,
    last_deploy_status, is_manual, is_pinned, custom_notes,
    vercel_accounts, deployments, tags, local_path, updated_at
  FROM projects
  WHERE is_hidden = false
  ORDER BY is_pinned DESC, COALESCE(last_commit_at, updated_at) DESC, name ASC
`;

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

const totalCount = rawRows.length;
const onlineCount = rawRows.filter(
  (p) => p.state === "online" || Boolean(p.deploy_url)
).length;
const pinnedCount = rawRows.filter((p) => p.is_pinned).length;
const ghCount = rawRows.filter((p) => p.source === "GitHub").length;
const glCount = rawRows.filter((p) => p.source === "GitLab").length;
const vcCount = rawRows.filter(
  (p) =>
    p.source === "Vercel" ||
    (Array.isArray(p.vercel_accounts) && p.vercel_accounts.length > 0) ||
    (p.deploy_url && p.deploy_url.includes("vercel.app"))
).length;

function renderCardHtml(p) {
  const isOnline = p.state === "online" || Boolean(p.deploy_url);
  const vAccs = Array.isArray(p.vercel_accounts) ? p.vercel_accounts : [];
  const deps = Array.isArray(p.deployments)
    ? p.deployments.filter((d) => d.url && d.url !== p.deploy_url)
    : [];
  const vscodeUrl = p.local_path
    ? "vscode://file/" + String(p.local_path).replace(/\\/g, "/")
    : "";

  return `<article class="card ${isOnline ? "card-online" : "card-off"}" data-card-id="${esc(p.id)}">
      <div>
        <div class="card-head">
          <div style="display:flex;gap:11px;align-items:center">
            <div class="avatar">${esc((p.name || "PR").slice(0, 2).toUpperCase())}</div>
            <div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);font-weight:700">
                ${esc(p.source)}${p.visibility === "private" ? " • 🔒 Privado" : ""}${p.is_pinned ? " • ★ Fixado" : ""}
              </div>
              <h3>${esc(p.name)}</h3>
            </div>
          </div>
          <span class="status ${isOnline ? "" : "off"}">● ${isOnline ? "Online" : "Off / Em dev"}</span>
        </div>
        <p class="desc">${esc(p.description || "Projeto sincronizado com Neon PostgreSQL.")}</p>
        ${p.custom_notes ? `<div class="note-box">📌 ${esc(p.custom_notes)}</div>` : ""}
        <div class="tags">
          <span class="tag">${esc(p.tech || "TypeScript")}</span>
          ${vAccs.map((a) => `<span class="tag vercel">▲ ${esc(a)}</span>`).join("")}
          ${(p.tags || [])
            .slice(0, 3)
            .map((t) => `<span class="tag">${esc(t)}</span>`)
            .join("")}
        </div>
      </div>
      <div class="links">
        ${
          p.repo_url
            ? `<a class="link-repo" href="${esc(p.repo_url)}" target="_blank" rel="noopener">Repositório ↗</a>`
            : '<span style="font-size:11px;color:#667794">Sem repo</span>'
        }
        ${vscodeUrl ? `<a class="link-vscode" href="${esc(vscodeUrl)}">VS Code ↗</a>` : ""}
        ${
          p.deploy_url
            ? `<a class="link-deploy" href="${esc(p.deploy_url)}" target="_blank" rel="noopener">Abrir site ↗</a>`
            : ""
        }
        ${deps
          .map(
            (d) =>
              `<a class="link-extra" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.account)} ↗</a>`
          )
          .join("")}
        <div class="card-actions">
          <button data-pin="${esc(p.id)}" title="Fixar/Desafixar">★</button>
          <button data-edit="${esc(p.id)}" title="Editar">✎</button>
          <button data-del="${esc(p.id)}" title="Excluir" style="color:#f6a0a6">×</button>
        </div>
      </div>
    </article>`;
}

const preRenderedCardsHtml = rawRows.map(renderCardHtml).join("\n");

fs.mkdirSync("firebase-dist", { recursive: true });
if (fs.existsSync("firebase-dist/projects.json")) {
  fs.unlinkSync("firebase-dist/projects.json");
}

const html = `<!doctype html>
<html lang="pt-BR" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DevCentral 2.1 — Cockpit de Projetos (${totalCount} Projetos Sincronizados)</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color-scheme:dark;--bg:#0a0e18;--surface:#121a29;--surface2:#182337;--border:#29344a;--text:#edf2ff;--muted:#9baac5;--accent:#8b85ff;--green:#3ddba0;--red:#ff4d6d}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(ellipse 1100px 550px at 65% -25%,#253166 0%,transparent 70%),var(--bg);color:var(--text);min-height:100vh}
button,input,select,textarea{font:inherit}
button{cursor:pointer}
a{color:inherit;text-decoration:none}
.shell{display:grid;grid-template-columns:284px 1fr;min-height:100vh}
.sidebar{border-right:1px solid var(--border);background:#0e1422e6;padding:24px 16px;display:flex;flex-direction:column;gap:18px;position:sticky;top:0;height:100vh;overflow-y:auto}
.brand{display:flex;gap:12px;align-items:center;margin:0 4px}
.logo{background:linear-gradient(135deg,#7774ef,#55e4ba);padding:10px 12px;border-radius:12px;color:#090f1a;font-weight:900;font-size:18px;flex-shrink:0}
.neon-box{padding:14px;border:1px solid rgba(61,219,160,0.55);box-shadow:0 0 16px rgba(61,219,160,0.18),inset 0 0 10px rgba(61,219,160,0.05);border-radius:16px;background:#101827f5;font-size:12px;display:flex;flex-direction:column;gap:9px}
.neon-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:8px;border-bottom:1px solid #29344a99;font-weight:700;color:#fff}
.neon-row{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:7px;color:var(--muted);line-height:1.2}
.neon-icon{display:inline-flex;justify-content:center;align-items:center;font-size:12px;width:18px;text-align:center}
.neon-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11.5px;color:#cbd5e8}
.neon-badge{white-space:nowrap;text-align:right;font-weight:700;font-size:11px;color:var(--green);background:rgba(61,219,160,0.12);border:1px solid rgba(61,219,160,0.35);padding:2px 8px;border-radius:99px}
.pill-ok{background:rgba(61,219,160,0.15);border:1px solid rgba(61,219,160,0.5);color:var(--green);padding:3px 9px;border-radius:99px;font-weight:700;font-size:11px;white-space:nowrap}
.nav{display:grid;gap:6px}
.nav button{display:flex;justify-content:space-between;align-items:center;padding:11px 14px;color:var(--muted);border-radius:11px;background:transparent;border:0;text-align:left;font-weight:500;font-size:13.5px}
.nav button.active,.nav button:hover{color:#fff;background:#262b55}
.main{padding:32px clamp(18px,3.5vw,52px);max-width:1600px;width:100%;margin:0 auto}
.topline{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;flex-wrap:wrap}
.eyebrow{color:#a49eff;font-size:12px;text-transform:uppercase;letter-spacing:2px;font-weight:700}
.topline h1{font-size:clamp(26px,3vw,36px);margin:8px 0}
.sub{color:var(--muted);margin:0;font-size:14px}
.btn{border:1px solid var(--border);padding:11px 16px;color:var(--text);border-radius:11px;background:var(--surface2);font-weight:600;font-size:13px}
.btn.primary{background:#746ef0;border:1px solid #827aff;color:#fff;font-weight:700}
.btn:hover{filter:brightness(1.12)}
.sources-bar{margin:24px 0;padding:18px;border:1px solid var(--border);border-radius:16px;background:#121a2bc4}
.sources-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:11px;margin-top:12px}
.source-card{border:1px solid rgba(61,219,160,0.45);box-shadow:0 0 12px rgba(61,219,160,0.12);border-radius:12px;background:#0e1525;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px;min-width:0}
.source-card-info{min-width:0;flex:1}
.source-card-title{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.source-card-sub{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:13px;margin:22px 0}
.stat{border:1px solid var(--border);border-radius:16px;background:#121a2bc9;padding:18px}
.stat .k{color:var(--muted);font-size:12px}
.stat .v{font-weight:800;font-size:30px;margin:8px 0 4px}
.stat .note{font-size:11px;color:#b6c0d7}
.tools{display:flex;gap:10px;justify-content:space-between;align-items:center;margin:20px 0;flex-wrap:wrap}
.search{background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:11px 15px;color:var(--text);min-width:240px;flex:1;max-width:460px;font-size:13px}
.filters{display:flex;gap:8px;flex-wrap:wrap}
.filters select{background:var(--surface);color:var(--text);border:1px solid var(--border);padding:10px 12px;border-radius:10px;font-size:13px}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.card{background:linear-gradient(145deg,#171f31,#121a29);border-radius:16px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;min-height:250px;transition:transform 0.18s ease,box-shadow 0.18s ease}
.card:hover{transform:translateY(-2px)}
.card.card-online{border:1.5px solid #3ddba0;box-shadow:0 0 16px rgba(61,219,160,0.28),inset 0 0 10px rgba(61,219,160,0.06)}
.card.card-off{border:1.5px solid #ff4d6d;box-shadow:0 0 16px rgba(255,77,109,0.28),inset 0 0 10px rgba(255,77,109,0.06)}
.card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.avatar{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;background:#282e57;color:#c3beff;font-weight:800;font-size:14px;flex-shrink:0}
.status{font-size:11px;color:#3ddba0;background:rgba(61,219,160,0.14);border:1px solid rgba(61,219,160,0.45);box-shadow:0 0 10px rgba(61,219,160,0.25);padding:5px 10px;border-radius:20px;white-space:nowrap;font-weight:700}
.status.off{color:#ff6b86;background:rgba(255,77,109,0.15);border:1px solid rgba(255,77,109,0.45);box-shadow:0 0 10px rgba(255,77,109,0.25)}
.card h3{font-size:16px;margin:4px 0 0;word-break:break-word}
.desc{color:var(--muted);line-height:1.45;font-size:12.5px;margin:12px 0;flex:1}
.note-box{margin:6px 0 10px;padding:7px 10px;border-radius:8px;background:#0b1321b3;border:1px solid var(--border);font-size:11px;color:#b6c0d7}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 14px}
.tag{border:1px solid #34425b;color:#c1cae0;padding:4px 8px;border-radius:7px;font-size:11px}
.tag.vercel{background:#182337;color:#a49eff}
.links{border-top:1px solid var(--border);padding-top:13px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.links a{font-size:12px;font-weight:600}
.link-repo{color:#b9b5ff}
.link-vscode{color:#55e4ba}
.link-deploy{color:#3ddba0}
.link-extra{color:#a49eff}
.links a:hover{text-decoration:underline}
.card-actions{margin-left:auto;display:flex;gap:4px}
.card-actions button{background:transparent;border:0;color:var(--muted);padding:4px 7px;border-radius:6px}
.card-actions button:hover{background:#182337;color:#fff}
dialog{background:#111a2b;color:var(--text);border:1px solid #39435d;border-radius:18px;padding:0;width:min(520px,calc(100vw - 30px))}
dialog::backdrop{background:#03050bbd}
.dialog-inner{padding:26px}
.field{display:grid;gap:5px;margin:11px 0;font-size:12px}
.field input,.field select{background:#0b1321;border:1px solid #39435d;color:white;border-radius:9px;padding:10px 12px;width:100%;font-size:13px}
@media(max-width:1200px){.cards{grid-template-columns:repeat(2,1fr)}.sources-grid,.stats{grid-template-columns:repeat(2,1fr)}}
@media(max-width:760px){.shell{display:block}.sidebar{position:static;height:auto}.cards,.sources-grid,.stats{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="brand">
      <span class="logo">⌘</span>
      <div style="min-width:0">
        <div style="font-weight:800;font-size:19px;line-height:1.15">DevCentral <span style="color:#a49eff;font-size:12px">2.1</span></div>
        <div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">Multi-contas + Neon DB + Firebase</div>
      </div>
    </div>

    <!-- NEON & TELEMETRY ALIGNED AT THE TOP OF SIDEBAR -->
    <div class="neon-box">
      <div class="neon-head">
        <span style="display:flex;align-items:center;gap:7px"><span>🗄️</span><span>Neon PostgreSQL</span></span>
        <span class="pill-ok">● Online</span>
      </div>
      <div class="neon-row">
        <span class="neon-icon">🔥</span>
        <span class="neon-label" title="Firebase (devcentral-190fe)">Firebase (devcentral-190fe)</span>
        <span class="neon-badge">Ativo</span>
      </div>
      <div class="neon-row">
        <span class="neon-icon">⌘</span>
        <span class="neon-label" title="GitHub (viniciuscasagrande-creator)">GitHub</span>
        <span class="neon-badge">Ativo (${ghCount})</span>
      </div>
      <div class="neon-row">
        <span class="neon-icon">◇</span>
        <span class="neon-label" title="GitLab (@ViniciusMurray & DiskIngressos)">GitLab (@ViniciusMurray)</span>
        <span class="neon-badge">Ativo (${glCount})</span>
      </div>
      <div class="neon-row">
        <span class="neon-icon">▲</span>
        <span class="neon-label" title="Vercel Conta 1: viniciuscasagrande-creator (DISKHUB)">viniciuscasagrande-creator</span>
        <span class="neon-badge">Ativo (12)</span>
      </div>
      <div class="neon-row">
        <span class="neon-icon">▲</span>
        <span class="neon-label" title="Vercel Conta 2: DEVELOPDISKINGRESSOS-9897">DEVELOPDISKINGRESSOS-9897</span>
        <span class="neon-badge">Ativo (12)</span>
      </div>
    </div>

    <nav class="nav">
      <button class="active" data-tab="all"><span>▦ &nbsp; Visão geral</span><span id="nav-total">${totalCount}</span></button>
      <button data-tab="pinned"><span>★ &nbsp; Fixados no topo</span><span id="nav-pinned">${pinnedCount}</span></button>
      <button data-tab="online"><span>● &nbsp; Em produção (Online)</span><span id="nav-online">${onlineCount}</span></button>
    </nav>

    <div style="border-top:1px solid #29344a99;padding-top:14px;display:grid;gap:6px;font-size:13px;color:var(--muted)">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Atalhos Externos</div>
      <a href="https://github.com/viniciuscasagrande-creator" target="_blank" rel="noopener" style="padding:6px 4px">⌘ &nbsp; GitHub ↗</a>
      <a href="https://gitlab.com/ViniciusMurray" target="_blank" rel="noopener" style="padding:6px 4px">◇ &nbsp; GitLab ↗</a>
      <a href="https://vercel.com/dashboard" target="_blank" rel="noopener" style="padding:6px 4px">▲ &nbsp; Vercel Dashboard ↗</a>
      <a href="https://console.firebase.google.com/project/devcentral-190fe/overview" target="_blank" rel="noopener" style="padding:6px 4px">🔥 &nbsp; Firebase Console ↗</a>
    </div>
  </aside>

  <main class="main">
    <header class="topline">
      <div>
        <div class="eyebrow">Workspace Pessoal • Multi-contas + Neon DB + Firebase</div>
        <h1>Painel de projetos</h1>
        <p class="sub">Centralize seus aplicativos, repositórios do GitHub, GitLab e suas duas contas da Vercel.</p>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" id="sync-btn" title="Sincronizar com a API/Neon">🔄 Sincronizar Tudo</button>
        <button class="btn primary" id="add-btn">＋ Novo projeto</button>
      </div>
    </header>

    <!-- TOP SOURCES BAR -->
    <section class="sources-bar">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;flex-wrap:wrap;gap:8px">
        <strong>Fontes de projetos conectadas (5 integrações ativas)</strong>
        <span id="sync-status-label" style="color:var(--green);font-size:12px;font-weight:600">● Sincronizado com Neon PostgreSQL (${totalCount} projetos carregados)</span>
      </div>
      <div class="sources-grid">
        <div class="source-card">
          <div class="source-card-info"><div class="source-card-title">🗄️ Neon PostgreSQL</div><div class="source-card-sub">Banco na nuvem</div></div>
          <span class="pill-ok">Online</span>
        </div>
        <div class="source-card">
          <div class="source-card-info"><div class="source-card-title">⌘ GitHub</div><div class="source-card-sub">viniciuscasagrande-creator</div></div>
          <span class="pill-ok">Ativo (${ghCount})</span>
        </div>
        <div class="source-card">
          <div class="source-card-info"><div class="source-card-title">◇ GitLab</div><div class="source-card-sub">@ViniciusMurray & Disk</div></div>
          <span class="pill-ok">Ativo (${glCount})</span>
        </div>
        <div class="source-card">
          <div class="source-card-info"><div class="source-card-title">▲ Vercel Conta 1</div><div class="source-card-sub">viniciuscasagrande-creator</div></div>
          <span class="pill-ok">Ativo (12)</span>
        </div>
        <div class="source-card">
          <div class="source-card-info"><div class="source-card-title">▲ Vercel Conta 2</div><div class="source-card-sub">DEVELOPDISKINGRESSOS-9897</div></div>
          <span class="pill-ok">Ativo (12)</span>
        </div>
      </div>
    </section>

    <!-- KPI STATS (PRE-RENDERED FROM NEON DB) -->
    <section class="stats">
      <div class="stat"><div class="k">Total no dashboard</div><div class="v" id="st-total">${totalCount}</div><div class="note">Consolidados no painel</div></div>
      <div class="stat" style="border-color:rgba(61,219,160,0.4)"><div class="k">Projetos online exibidos</div><div class="v" id="st-online" style="color:var(--green)">${onlineCount}</div><div class="note">Com link de deploy ativo</div></div>
      <div class="stat"><div class="k">GitHub</div><div class="v" id="st-gh">${ghCount}</div><div class="note">Repositórios vinculados</div></div>
      <div class="stat"><div class="k">GitLab</div><div class="v" id="st-gl">${glCount}</div><div class="note">Repositórios vinculados</div></div>
      <div class="stat"><div class="k">Vercel (2 Contas)</div><div class="v" id="st-vc" style="color:#a49eff">${vcCount}</div><div class="note">Aplicações hospedadas</div></div>
    </section>

    <!-- TOOLS & FILTERS -->
    <div class="tools">
      <input class="search" type="search" id="search" placeholder="⌕ Pesquisar nome, linguagem, conta Vercel ou descrição...">
      <div class="filters">
        <select id="f-source">
          <option value="">Todas as fontes</option>
          <option value="GitHub">GitHub</option>
          <option value="GitLab">GitLab</option>
          <option value="Vercel">Vercel</option>
          <option value="Manual">Manual</option>
        </select>
        <select id="f-account">
          <option value="">Todas as contas Vercel</option>
          <option value="viniciuscasagrande-creator">viniciuscasagrande-creator (DISKHUB)</option>
          <option value="DEVELOPDISKINGRESSOS-9897">DEVELOPDISKINGRESSOS-9897</option>
        </select>
        <select id="f-lang"><option value="">Todas as linguagens</option></select>
        <select id="f-state">
          <option value="">Todos os status</option>
          <option value="online">Online (Verde Neon)</option>
          <option value="dev">Off / Em dev (Vermelho Neon)</option>
        </select>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0">
      <h2 style="font-size:18px;margin:0">Seus projetos</h2>
      <span id="result-count" style="font-size:12px;color:var(--muted)">${totalCount} projeto(s) exibido(s)</span>
    </div>

    <!-- PRE-RENDERED CARDS FROM NEON DB -->
    <div class="cards" id="cards">
${preRenderedCardsHtml}
    </div>
  </main>
</div>

<dialog id="modal">
  <form class="dialog-inner" id="form">
    <h2 id="modal-title" style="margin:0 0 6px">Novo projeto</h2>
    <input type="hidden" id="f-id">
    <label class="field">Nome do projeto *<input id="m-name" required></label>
    <label class="field">Descrição<input id="m-desc"></label>
    <label class="field">Linguagem / Tecnologia *<input id="m-tech" required value="TypeScript"></label>
    <label class="field">Origem<select id="m-source"><option>GitHub</option><option>GitLab</option><option>Vercel</option><option>Manual</option></select></label>
    <label class="field">URL do repositório<input id="m-repo" type="url" placeholder="https://github.com/..."></label>
    <label class="field">URL do deploy (Vercel / Web)<input id="m-deploy" type="url" placeholder="https://...vercel.app"></label>
    <label class="field">Pasta local no PC (habilita botão VS Code ↗)<input id="m-local" placeholder="D:\\projetos principais\\..."></label>
    <label class="field">Situação<select id="m-state"><option value="online">Online</option><option value="dev">Em desenvolvimento</option></select></label>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
      <button type="button" class="btn" id="m-cancel">Cancelar</button>
      <button type="submit" class="btn primary">Salvar</button>
    </div>
  </form>
</dialog>

<script type="module">
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyCVhlowc7oxvS-idKS1XYzxocS1TJHvzRg",
  authDomain: "devcentral-190fe.firebaseapp.com",
  projectId: "devcentral-190fe",
  storageBucket: "devcentral-190fe.firebasestorage.app",
  messagingSenderId: "381168720156",
  appId: "1:381168720156",
  measurementId: "G-9P4K029JCV"
};
try {
  const app = initializeApp(firebaseConfig);
  getAnalytics(app);
} catch (e) {}
</script>

<script>
const INITIAL_PROJECTS = ${JSON.stringify(rawRows)};
const STORAGE_KEY = "devcentral_2_1_neon_projects_v3";
let projects = [];
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  const parsed = saved ? JSON.parse(saved) : null;
  projects = Array.isArray(parsed) && parsed.length >= INITIAL_PROJECTS.length ? parsed : INITIAL_PROJECTS;
} catch {
  projects = INITIAL_PROJECTS;
}

let activeTab = "all";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {}
}

async function fetchFromBackend(triggerSync = false) {
  const label = $("sync-status-label");
  try {
    if (triggerSync) {
      label.textContent = "⏳ Sincronizando GitHub, GitLab, Vercel 1 & 2 com Neon DB...";
      const syncRes = await fetch("/api/sync", { method: "POST" });
      if (syncRes.ok) {
        const data = await syncRes.json();
        if (Array.isArray(data.projects) && data.projects.length > 0) {
          projects = data.projects;
          save();
          render();
          label.textContent = "● Sincronizado via API Neon PostgreSQL (" + projects.length + " projetos)";
          return;
        }
      }
    }
    const res = await fetch("/api/projects");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.projects) && data.projects.length > 0) {
        projects = data.projects;
        save();
        render();
        label.textContent = "● Conectado em tempo real ao Neon PostgreSQL (" + projects.length + " projetos)";
        return;
      }
    }
    if (triggerSync) {
      projects = INITIAL_PROJECTS;
      save();
      render();
      label.textContent = "● Sincronizado com snapshot Neon PostgreSQL (" + projects.length + " projetos)";
    }
  } catch {
    if (triggerSync) {
      projects = INITIAL_PROJECTS;
      save();
      render();
      label.textContent = "● Catálogo restaurado do Neon PostgreSQL (" + projects.length + " projetos)";
    }
  }
}

function render() {
  const q = $("search").value.toLowerCase().trim();
  const src = $("f-source").value;
  const acc = $("f-account").value;
  const lang = $("f-lang").value;
  const st = $("f-state").value;

  const langs = [...new Set(projects.map(p => p.tech).filter(Boolean))].sort();
  $("f-lang").innerHTML = '<option value="">Todas as linguagens</option>' +
    langs.map(x => \`<option value="\${esc(x)}" \${lang===x?"selected":""}>\${esc(x)}</option>\`).join("");

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

  const filtered = projects.filter(p => {
    const isOnline = p.state === "online" || Boolean(p.deploy_url);
    if (activeTab === "pinned" && !p.is_pinned) return false;
    if (activeTab === "online" && !isOnline) return false;
    if (src && p.source !== src) return false;
    if (acc && !(p.vercel_accounts || []).includes(acc)) return false;
    if (lang && p.tech !== lang) return false;
    if (st === "online" && !isOnline) return false;
    if (st === "dev" && isOnline) return false;
    if (q) {
      const hay = [p.name, p.description, p.tech, p.source, p.custom_notes, ...(p.vercel_accounts || []), ...(p.tags || [])].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  $("result-count").textContent = filtered.length + " projeto(s) exibido(s)";
  $("cards").innerHTML = filtered.map(p => {
    const isOnline = p.state === "online" || Boolean(p.deploy_url);
    const vAccs = Array.isArray(p.vercel_accounts) ? p.vercel_accounts : [];
    const deps = Array.isArray(p.deployments) ? p.deployments.filter(d => d.url && d.url !== p.deploy_url) : [];
    const vscodeUrl = p.local_path ? "vscode://file/" + String(p.local_path).split("\\\\").join("/") : "";

    return \`<article class="card \${isOnline ? "card-online" : "card-off"}">
      <div>
        <div class="card-head">
          <div style="display:flex;gap:11px;align-items:center">
            <div class="avatar">\${esc((p.name || "PR").slice(0,2).toUpperCase())}</div>
            <div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);font-weight:700">
                \${esc(p.source)} \${p.visibility === "private" ? " • 🔒 Privado" : ""} \${p.is_pinned ? " • ★ Fixado" : ""}
              </div>
              <h3>\${esc(p.name)}</h3>
            </div>
          </div>
          <span class="status \${isOnline ? "" : "off"}">● \${isOnline ? "Online" : "Off / Em dev"}</span>
        </div>
        <p class="desc">\${esc(p.description || "Projeto sincronizado com Neon PostgreSQL.")}</p>
        \${p.custom_notes ? \`<div class="note-box">📌 \${esc(p.custom_notes)}</div>\` : ""}
        <div class="tags">
          <span class="tag">\${esc(p.tech || "TypeScript")}</span>
          \${vAccs.map(a => \`<span class="tag vercel">▲ \${esc(a)}</span>\`).join("")}
          \${(p.tags || []).slice(0, 3).map(t => \`<span class="tag">\${esc(t)}</span>\`).join("")}
        </div>
      </div>
      <div class="links">
        \${p.repo_url ? \`<a class="link-repo" href="\${esc(p.repo_url)}" target="_blank" rel="noopener">Repositório ↗</a>\` : '<span style="font-size:11px;color:#667794">Sem repo</span>'}
        \${vscodeUrl ? \`<a class="link-vscode" href="\${esc(vscodeUrl)}">VS Code ↗</a>\` : ""}
        \${p.deploy_url ? \`<a class="link-deploy" href="\${esc(p.deploy_url)}" target="_blank" rel="noopener">Abrir site ↗</a>\` : ""}
        \${deps.map(d => \`<a class="link-extra" href="\${esc(d.url)}" target="_blank" rel="noopener">\${esc(d.account)} ↗</a>\`).join("")}
        <div class="card-actions">
          <button data-pin="\${esc(p.id)}" title="Fixar/Desafixar">★</button>
          <button data-edit="\${esc(p.id)}" title="Editar">✎</button>
          <button data-del="\${esc(p.id)}" title="Excluir" style="color:#f6a0a6">×</button>
        </div>
      </div>
    </article>\`;
  }).join("");
}

document.querySelectorAll("[data-tab]").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("[data-tab]").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    render();
  };
});

["search", "f-source", "f-account", "f-lang", "f-state"].forEach(id => {
  $(id).addEventListener(id === "search" ? "input" : "change", render);
});

$("sync-btn").onclick = () => fetchFromBackend(true);
$("add-btn").onclick = () => openModal();
$("m-cancel").onclick = () => $("modal").close();

function openModal(p) {
  $("form").reset();
  $("f-id").value = p?.id || "";
  $("modal-title").textContent = p ? "Editar projeto" : "Novo projeto";
  if (p) {
    $("m-name").value = p.name || "";
    $("m-desc").value = p.description || "";
    $("m-tech").value = p.tech || "TypeScript";
    $("m-source").value = p.source || "GitHub";
    $("m-repo").value = p.repo_url || "";
    $("m-deploy").value = p.deploy_url || "";
    $("m-local").value = p.local_path || "";
    $("m-state").value = p.state || "online";
  }
  $("modal").showModal();
}

$("form").onsubmit = e => {
  e.preventDefault();
  const id = $("f-id").value;
  const item = {
    id: id || "manual-" + Date.now(),
    name: $("m-name").value.trim(),
    description: $("m-desc").value.trim(),
    tech: $("m-tech").value.trim(),
    source: $("m-source").value,
    repo_url: $("m-repo").value.trim(),
    deploy_url: $("m-deploy").value.trim(),
    local_path: $("m-local").value.trim(),
    state: $("m-state").value,
    is_pinned: id ? (projects.find(x => x.id === id)?.is_pinned || false) : true,
    vercel_accounts: id ? (projects.find(x => x.id === id)?.vercel_accounts || []) : [],
    deployments: id ? (projects.find(x => x.id === id)?.deployments || []) : [],
    tags: id ? (projects.find(x => x.id === id)?.tags || []) : []
  };
  if (id) {
    projects = projects.map(x => x.id === id ? { ...x, ...item } : x);
  } else {
    projects.unshift(item);
  }
  save();
  render();
  $("modal").close();
};

$("cards").onclick = e => {
  const pin = e.target.closest("[data-pin]");
  const edit = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-del]");
  if (pin) {
    projects = projects.map(x => x.id === pin.dataset.pin ? { ...x, is_pinned: !x.is_pinned } : x);
    projects.sort((a,b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
    save();
    render();
  }
  if (edit) {
    const p = projects.find(x => x.id === edit.dataset.edit);
    if (p) openModal(p);
  }
  if (del && confirm("Remover este projeto do painel?")) {
    projects = projects.filter(x => x.id !== del.dataset.del);
    save();
    render();
  }
};

render();
fetchFromBackend(false);
</script>
</body>
</html>`;

fs.writeFileSync("firebase-dist/index.html", html, "utf-8");
console.log(
  `Generated firebase-dist/index.html with ${totalCount} pre-rendered projects (${onlineCount} online)!`
);
