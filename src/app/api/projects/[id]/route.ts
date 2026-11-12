import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, getSql, mapRowToProject } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSchema();
    const { id } = await context.params;
    const sql = getSql();
    const body = await req.json();

    // Check if it's a quick toggle (pin or hide)
    if (typeof body.togglePin === "boolean") {
      const rows = await sql`
        UPDATE projects
        SET is_pinned = ${body.togglePin}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows.length) {
        return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
      }
      return NextResponse.json({ project: mapRowToProject(rows[0]) });
    }

    if (typeof body.toggleHidden === "boolean") {
      const rows = await sql`
        UPDATE projects
        SET is_hidden = ${body.toggleHidden}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      if (!rows.length) {
        return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
      }
      return NextResponse.json({ project: mapRowToProject(rows[0]) });
    }

    const name = String(body.name || "").trim();
    const description = String(body.description || "").trim();
    const tech = String(body.tech || "Outro").trim();
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
      UPDATE projects
      SET
        name = ${name},
        description = ${description},
        tech = ${tech},
        source = ${source},
        repo_url = ${repoUrl},
        deploy_url = ${deployUrl},
        state = ${state},
        visibility = ${visibility},
        default_branch = ${defaultBranch},
        custom_notes = ${customNotes},
        local_path = ${localPath},
        is_pinned = ${isPinned},
        tags = ${tags},
        custom_override = true,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (!rows.length) {
      return NextResponse.json(
        { error: "Projeto não encontrado." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      project: mapRowToProject(rows[0]),
    });
  } catch (err: any) {
    console.error("PUT /api/projects/[id] error:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao atualizar projeto." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSchema();
    const { id } = await context.params;
    const mode = req.nextUrl.searchParams.get("mode") || "delete";
    const sql = getSql();

    if (mode === "hide") {
      await sql`
        UPDATE projects
        SET is_hidden = true, updated_at = NOW()
        WHERE id = ${id}
      `;
    } else {
      await sql`
        DELETE FROM projects
        WHERE id = ${id}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/projects/[id] error:", err);
    return NextResponse.json(
      { error: err?.message || "Erro ao excluir projeto." },
      { status: 500 }
    );
  }
}
