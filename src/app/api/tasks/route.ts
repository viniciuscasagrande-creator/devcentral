import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-admin";
import { deleteProjectTask, listProjectTasks, upsertProjectTask } from "@/lib/db";
import type { TaskPriority, TaskStatus } from "@/types/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const hasAuthHeader = Boolean(req.headers.get("authorization"));
  if (hasAuthHeader) {
    const denied = await requireAdmin(req);
    if (denied) return denied;
  }
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
  try {
    const tasks = await listProjectTasks(projectId);
    return NextResponse.json(
      { tasks },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("Falha ao listar tarefas:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as tarefas." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const title = String(body.title || "").trim();
    if (!title) {
      return NextResponse.json(
        { error: "O título da tarefa é obrigatório." },
        { status: 400 }
      );
    }
    const priority: TaskPriority = ["high", "medium", "low"].includes(
      String(body.priority)
    )
      ? body.priority
      : "medium";
    const status: TaskStatus = ["todo", "in_progress", "done"].includes(
      String(body.status)
    )
      ? body.status
      : "todo";

    const id =
      typeof body.id === "string" && body.id.trim()
        ? body.id.trim()
        : `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const task = await upsertProjectTask({
      id,
      projectId: body.projectId ? String(body.projectId) : null,
      projectName: body.projectName ? String(body.projectName) : "Geral",
      recommendationId: body.recommendationId
        ? String(body.recommendationId)
        : null,
      title,
      priority,
      status,
      assignee: body.assignee ? String(body.assignee) : "Admin",
      dueDate: body.dueDate ? String(body.dueDate) : "",
      checklist: Array.isArray(body.checklist) ? body.checklist : [],
      notes: body.notes ? String(body.notes) : "",
      issueUrl: body.issueUrl ? String(body.issueUrl) : "",
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Falha ao criar/atualizar tarefa:", error);
    return NextResponse.json(
      { error: "Erro ao salvar tarefa." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  return POST(req);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID obrigatório." }, { status: 400 });
  }

  try {
    await deleteProjectTask(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Falha ao remover tarefa:", error);
    return NextResponse.json(
      { error: "Erro ao remover tarefa." },
      { status: 500 }
    );
  }
}
