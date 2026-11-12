import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getLastSyncLog, getSql, listProjects, mapRowToProject } from "@/lib/db";
import { getIntegrationStatus } from "@/lib/integrations";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const includeHidden = req.nextUrl.searchParams.get("includeHidden") === "true";
    const [projects, lastSync] = await Promise.all([
      listProjects(includeHidden),
      getLastSyncLog(),
    ]);
    const integrationStatus = getIntegrationStatus();

    return NextResponse.json({
      projects,
      lastSync,
      integrationStatus,
    });
  } catch (err: any) {
    console.error("GET /api/projects error:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao carregar projetos do banco Neon." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const sql = getSql();
    const body = await req.json();

    const id =
      body.id ||
      `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const externalId = body.external_id || `manual:${id}`;
    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const tech = String(body.tech || "TypeScript").trim();
    const source = String(body.source || "GitHub").trim();
    const repoUrl = String(body.repo_url || "").trim();
    const deployUrl = String(body.deploy_url || "").trim();
    const state = String(body.state || "dev").trim();
    const visibility = body.visibility === "private" ? "private" : "public";
    const defaultBranch = String(body.default_branch || "main").trim();
    const customNotes = String(body.custom_notes || "").trim();
    const localPath = String(body.local_path || "").trim();
    const isPinned = Boolean(body.is_pinned);
    const tags: string[] = Array.isArray(body.tags)
      ? body.tags.map((t: any) => String(t).trim()).filter(Boolean)
      : typeof body.tags === "string"
      ? body.tags
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean)
      : [];

    if (!name) {
      return NextResponse.json(
        { error: "O nome do projeto é obrigatório." },
        { status: 400 }
      );
    }

    const rows = await sql`
      INSERT INTO projects (
        id, external_id, name, description, tech, source, repo_url, deploy_url,
        state, visibility, default_branch, last_deploy_status,
        is_manual, is_pinned, custom_override, custom_notes, local_path, tags, updated_at
      ) VALUES (
        ${id},
        ${externalId},
        ${name},
        ${description},
        ${tech},
        ${source},
        ${repoUrl},
        ${deployUrl},
        ${state},
        ${visibility},
        ${defaultBranch},
        ${deployUrl && state === "online" ? "READY" : ""},
        true,
        ${isPinned},
        true,
        ${customNotes},
        ${localPath},
        ${tags},
        NOW()
      )
      RETURNING *
    `;

    return NextResponse.json({
      project: mapRowToProject(rows[0]),
    });
  } catch (err: any) {
    console.error("POST /api/projects error:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao salvar projeto." },
      { status: 500 }
    );
  }
}
