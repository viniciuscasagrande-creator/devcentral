import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureSchema, getSql } from "@/lib/db";
import { runFullSync } from "@/lib/integrations";

export const dynamic = "force-dynamic";

async function updateEnvLocal(updates: Record<string, string>) {
  const envPath = path.join(process.cwd(), ".env.local");
  let content = "";
  try {
    content = await fs.readFile(envPath, "utf-8");
  } catch {
    content = "";
  }

  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
    const regex = new RegExp(`^${key}=.*$`, "m");
    const newLine = `${key}="${value}"`;
    if (regex.test(content)) {
      content = content.replace(regex, newLine);
    } else {
      content += `\n${newLine}`;
    }
  }

  await fs.writeFile(envPath, content, "utf-8");
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const sql = getSql();
    const body = await req.json();
    const mode = String(body.mode || "");

    // MODE 1: Connect via Username or Group (no token required for public projects)
    if (mode === "username_or_group") {
      const handle = String(body.handle || "")
        .trim()
        .replace(/^@/, "")
        .replace(/^https?:\/\/gitlab\.com\//i, "")
        .replace(/\/+$/, "");

      if (!handle) {
        return NextResponse.json(
          { error: "Informe o nome de usuário ou grupo do GitLab." },
          { status: 400 }
        );
      }

      const baseUrl = (
        process.env.GITLAB_BASE_URL?.trim() || "https://gitlab.com"
      ).replace(/\/+$/, "");

      // Try user endpoint first, then group endpoint
      let projects: any[] = [];
      const userRes = await fetch(
        `${baseUrl}/api/v4/users/${encodeURIComponent(
          handle
        )}/projects?per_page=100&order_by=last_activity_at&sort=desc`,
        { cache: "no-store" }
      );
      if (userRes.ok) {
        const data = await userRes.json();
        if (Array.isArray(data)) projects = data;
      }

      if (projects.length === 0) {
        const groupRes = await fetch(
          `${baseUrl}/api/v4/groups/${encodeURIComponent(
            handle
          )}/projects?include_subgroups=true&per_page=100&order_by=last_activity_at&sort=desc`,
          { cache: "no-store" }
        );
        if (groupRes.ok) {
          const data = await groupRes.json();
          if (Array.isArray(data)) projects = data;
        }
      }

      await updateEnvLocal({ GITLAB_USERNAME: handle });

      let importedCount = 0;
      for (const p of projects) {
        const extId = `gitlab:${p.id}`;
        const id = `gitlab-${p.id}`;
        const topics: string[] = Array.isArray(p.topics) ? p.topics : [];
        await sql`
          INSERT INTO projects (
            id, external_id, name, description, tech, source, repo_url, deploy_url,
            state, visibility, default_branch, stars, forks, open_issues,
            last_commit_at, is_manual, tags, updated_at
          ) VALUES (
            ${id},
            ${extId},
            ${String(p.name || handle)},
            ${String(p.description || "")},
            ${topics[0] || "GitLab Repo"},
            'GitLab',
            ${String(p.web_url || "")},
            ${String(p.website_url || "")},
            ${p.website_url ? "online" : "dev"},
            ${p.visibility === "public" ? "public" : "private"},
            ${String(p.default_branch || "main")},
            ${Number(p.star_count || 0)},
            ${Number(p.forks_count || 0)},
            ${Number(p.open_issues_count || 0)},
            ${p.last_activity_at || null},
            false,
            ${topics.slice(0, 6)},
            NOW()
          )
          ON CONFLICT (external_id) DO UPDATE SET
            repo_url = EXCLUDED.repo_url,
            updated_at = NOW()
        `;
        importedCount++;
      }

      return NextResponse.json({
        ok: true,
        importedCount,
        message:
          importedCount > 0
            ? `Conectado a @${handle}! ${importedCount} projeto(s) público(s) importado(s) do GitLab.`
            : `Usuário/grupo @${handle} salvo no .env.local, porém nenhum repositório público foi retornado (se seus repositórios forem privados, use a aba "Colar URLs" ou "Token 1-Clique").`,
      });
    }

    // MODE 2: Save Token directly from UI and run sync
    if (mode === "token") {
      const token = String(body.token || "").trim();
      const baseUrl = String(body.baseUrl || "https://gitlab.com")
        .trim()
        .replace(/\/+$/, "");

      if (!token) {
        return NextResponse.json(
          { error: "Cole o token gerado no GitLab." },
          { status: 400 }
        );
      }

      // Verify token with GitLab /api/v4/user
      const verifyRes = await fetch(`${baseUrl}/api/v4/user`, {
        headers: { "PRIVATE-TOKEN": token },
        cache: "no-store",
      });

      if (!verifyRes.ok) {
        return NextResponse.json(
          {
            error: `O GitLab recusou este token (HTTP ${verifyRes.status}). Verifique se marcou a opção "read_api".`,
          },
          { status: 400 }
        );
      }

      const userData = await verifyRes.json();
      await updateEnvLocal({
        GITLAB_TOKEN: token,
        GITLAB_USERNAME: String(userData.username || ""),
        GITLAB_BASE_URL: baseUrl,
      });

      const syncResult = await runFullSync();
      return NextResponse.json({
        ok: true,
        importedCount: syncResult.gitlabCount,
        message: `GitLab conectado na conta @${userData.username}! ${syncResult.gitlabCount} projeto(s) do GitLab sincronizados.`,
      });
    }

    // MODE 3: Batch import GitLab URLs directly (works for private repos without token!)
    if (mode === "urls") {
      const rawUrls = String(body.urls || "");
      const lines = rawUrls
        .split(/[\r\n,]+/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        return NextResponse.json(
          { error: "Cole pelo menos uma URL de repositório do GitLab." },
          { status: 400 }
        );
      }

      let importedCount = 0;
      for (const rawLine of lines) {
        const clean = rawLine.replace(/\.git$/i, "").replace(/\/+$/, "");
        const urlStr = clean.startsWith("http")
          ? clean
          : `https://gitlab.com/${clean.replace(/^\/+/, "")}`;

        let repoName = "Projeto GitLab";
        let namespace = "";
        try {
          const parsed = new URL(urlStr);
          const parts = parsed.pathname.split("/").filter(Boolean);
          repoName = parts[parts.length - 1] || repoName;
          namespace = parts.slice(0, -1).join("/");
        } catch {
          continue;
        }

        const extId = `gitlab:url:${namespace}/${repoName}`.toLowerCase();
        const id = extId.replace(/[^a-z0-9-]/g, "-");

        await sql`
          INSERT INTO projects (
            id, external_id, name, description, tech, source, repo_url,
            state, visibility, default_branch, is_manual, custom_override, tags, updated_at
          ) VALUES (
            ${id},
            ${extId},
            ${repoName},
            ${namespace ? `Repositório GitLab em ${namespace}/${repoName}` : "Repositório GitLab"},
            ${String(body.defaultTech || "TypeScript")},
            'GitLab',
            ${urlStr},
            'dev',
            'private',
            'main',
            false,
            true,
            ${namespace ? ["GitLab", namespace] : ["GitLab"]},
            NOW()
          )
          ON CONFLICT (external_id) DO UPDATE SET
            repo_url = EXCLUDED.repo_url,
            updated_at = NOW()
        `;
        importedCount++;
      }

      return NextResponse.json({
        ok: true,
        importedCount,
        message: `${importedCount} repositório(s) do GitLab adicionado(s) ao painel!`,
      });
    }

    // MODE 4: Import from Local PC Folder path
    if (mode === "local_folder") {
      const folderPath = String(body.folderPath || "").trim();
      if (!folderPath) {
        return NextResponse.json(
          { error: "Informe o caminho da pasta local no computador." },
          { status: 400 }
        );
      }

      let stat;
      try {
        stat = await fs.stat(folderPath);
      } catch {
        return NextResponse.json(
          { error: `Pasta não encontrada no computador: ${folderPath}` },
          { status: 400 }
        );
      }

      if (!stat.isDirectory()) {
        return NextResponse.json(
          { error: "O caminho informado não é uma pasta." },
          { status: 400 }
        );
      }

      const folderName = path.basename(folderPath);
      let repoUrl = "";
      let source: "GitLab" | "GitHub" | "Manual" = "GitLab";
      let tech = "TypeScript";
      let description = `Projeto localizado em ${folderPath}`;
      const tags: string[] = [];

      // Check .git/config
      try {
        const gitConfig = await fs.readFile(
          path.join(folderPath, ".git", "config"),
          "utf-8"
        );
        const match = gitConfig.match(/url\s*=\s*(.+)/i);
        if (match?.[1]) {
          let rawUrl = match[1].trim().replace(/\.git$/i, "");
          if (rawUrl.startsWith("git@")) {
            rawUrl = rawUrl
              .replace(/^git@([^:]+):/, "https://$1/")
              .replace(/\.git$/, "");
          }
          repoUrl = rawUrl;
          if (rawUrl.toLowerCase().includes("gitlab")) {
            source = "GitLab";
          } else if (rawUrl.toLowerCase().includes("github")) {
            source = "GitHub";
          }
        }
      } catch {
        // no .git/config
      }

      // Check package.json
      try {
        const pkgRaw = await fs.readFile(
          path.join(folderPath, "package.json"),
          "utf-8"
        );
        const pkg = JSON.parse(pkgRaw);
        if (pkg.description) description = String(pkg.description);
        const deps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
        };
        if (deps.next) tags.push("Next.js");
        if (deps.react) tags.push("React");
        if (deps.vite) tags.push("Vite");
        if (deps["@nestjs/core"]) tags.push("NestJS");
        if (deps.fastify) tags.push("Fastify");
        if (deps.express) tags.push("Express");
        if (deps.prisma || deps["@prisma/client"]) tags.push("Prisma");
        if (!deps.typescript && !deps["ts-node"] && !deps.tsx) {
          tech = "JavaScript";
        }
      } catch {
        // ignore
      }

      const extId = `local:${folderPath.toLowerCase()}`;
      const id = `local-${folderName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

      await sql`
        INSERT INTO projects (
          id, external_id, name, description, tech, source, repo_url,
          state, visibility, default_branch, local_path, custom_notes,
          is_manual, is_pinned, custom_override, tags, updated_at
        ) VALUES (
          ${id},
          ${extId},
          ${folderName},
          ${description},
          ${tech},
          ${source},
          ${repoUrl},
          'dev',
          'private',
          'main',
          ${folderPath},
          ${`Pasta local: ${folderPath}`},
          true,
          true,
          true,
          ${tags},
          NOW()
        )
        ON CONFLICT (external_id) DO UPDATE SET
          local_path = EXCLUDED.local_path,
          repo_url = CASE WHEN EXCLUDED.repo_url <> '' THEN EXCLUDED.repo_url ELSE projects.repo_url END,
          updated_at = NOW()
      `;

      return NextResponse.json({
        ok: true,
        importedCount: 1,
        message: `Pasta "${folderName}" importada com sucesso (com atalho VS Code ↗)!`,
      });
    }

    return NextResponse.json(
      { error: "Modo de conexão inválido." },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("POST /api/gitlab error:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao conectar ao GitLab." },
      { status: 500 }
    );
  }
}
