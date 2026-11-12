"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  GitCommitHorizontal,
  Lightbulb,
  LoaderCircle,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  FirebaseUser,
  getFirebaseIdToken,
  signInWithGoogle,
  subscribeFirebaseAuth,
} from "@/lib/firebase";
import type {
  RecommendationStatus,
  TelemetryPayload,
  TelemetryRecommendation,
} from "@/types/telemetry";

type Tab = "diagnostics" | "events" | "solutions";
const statusLabels: Record<RecommendationStatus, string> = {
  open: "Pendente",
  investigating: "Em análise",
  resolved: "Resolvida",
};

export default function TelemetryPage() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<TelemetryPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("diagnostics");
  const [projectId, setProjectId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [copiedCmd, setCopiedCmd] = useState("");

  useEffect(
    () =>
      subscribeFirebaseAuth((u) => {
        setUser(u);
        setAuthReady(true);
      }),
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getFirebaseIdToken();
      const res = await fetch("/api/telemetry", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Falha HTTP ${res.status}`);
      setData(body as TelemetryPayload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar telemetria."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authReady && user) void load();
    if (authReady && !user) setLoading(false);
  }, [authReady, user, load]);

  const updateStatus = async (
    item: TelemetryRecommendation,
    status: RecommendationStatus
  ) => {
    setSaving(item.id);
    setError("");
    try {
      const token = await getFirebaseIdToken();
      const res = await fetch("/api/telemetry", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: item.id, status }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `Falha HTTP ${res.status}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar.");
    } finally {
      setSaving(null);
    }
  };

  const visible = useMemo(
    () =>
      (data?.recommendations || []).filter((r) => {
        if (projectId !== "all" && r.projectId !== projectId) return false;
        if (filterStatus !== "all" && r.status !== filterStatus) return false;
        const search = query.toLowerCase().trim();
        return (
          !search ||
          [r.title, r.projectName, r.evidence, r.action].some((s) =>
            String(s || "")
              .toLowerCase()
              .includes(search)
          )
        );
      }),
    [data, projectId, filterStatus, query]
  );

  const events = useMemo(
    () =>
      (data?.events || []).filter(
        (event) => projectId === "all" || event.projectId === projectId
      ),
    [data, projectId]
  );

  const buttonClass =
    "rounded-lg border border-[#35445e] bg-[#1b2840] px-3 py-2 text-xs font-semibold hover:bg-[#273853] disabled:opacity-50 cursor-pointer";

  return (
    <main className="min-h-screen bg-[#0a0e18] text-[#edf2ff] p-4 sm:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-[#a49eff] hover:underline mb-3"
            >
              <ArrowLeft size={16} /> Voltar ao painel
            </Link>
            <div className="flex items-center gap-3">
              <Activity className="text-[#3ddba0]" size={26} />
              <h1 className="text-2xl sm:text-3xl font-extrabold">
                Telemetria & Soluções
              </h1>
            </div>
            <p className="text-sm text-[#a5b5d0] mt-2">
              Diagnóstico orientado pelos dados sincronizados do GitHub, GitLab,
              Vercel 1, Vercel 2 e Neon.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={!user || loading}
            className={buttonClass + " flex items-center gap-2"}
          >
            <RefreshCcw size={15} /> Atualizar diagnóstico
          </button>
        </header>

        {!authReady ? (
          <p className="text-[#a5b5d0]">Verificando autenticação...</p>
        ) : !user ? (
          <section className="rounded-2xl border border-[#35445e] bg-[#141e30] p-8 max-w-lg">
            <h2 className="text-lg font-bold mb-3">Acesso protegido</h2>
            <p className="text-sm text-[#a5b5d0] mb-5">
              Entre com a conta administradora para consultar diagnósticos
              privados.
            </p>
            <button
              className={buttonClass}
              onClick={() =>
                signInWithGoogle().catch((e) => setError(String(e.message)))
              }
            >
              Entrar com Google
            </button>
          </section>
        ) : (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                {
                  label: "Projetos",
                  value: data?.summary.projects ?? "—",
                  icon: ClipboardList,
                },
                {
                  label: "Deploys com falha registrada",
                  value: data?.summary.deploymentsWithError ?? "—",
                  icon: ShieldAlert,
                },
                {
                  label: "Recomendações pendentes",
                  value: data?.summary.open ?? "—",
                  icon: Lightbulb,
                },
                {
                  label: "Em análise",
                  value: data?.summary.investigating ?? "—",
                  icon: Activity,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-[#2b3952] bg-[#121a29] p-4 min-w-0"
                >
                  <item.icon size={18} className="text-[#a49eff] mb-3" />
                  <div className="text-2xl font-bold">{item.value}</div>
                  <div className="text-xs text-[#a5b5d0] mt-1">
                    {item.label}
                  </div>
                </div>
              ))}
            </div>
            {data && (
              <p className="text-xs text-[#9baac5]">
                {data.sourceLabel} · Diagnóstico gerado em{" "}
                {new Date(data.generatedAt).toLocaleString("pt-BR")} · Última
                sincronização:{" "}
                {data.summary.lastSyncAt
                  ? new Date(data.summary.lastSyncAt).toLocaleString("pt-BR")
                  : "não registrada"}
              </p>
            )}
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-rose-700 bg-rose-950/40 text-rose-200 p-3 text-sm"
              >
                {error}
              </div>
            )}
            <section className="flex flex-wrap items-center gap-2">
              {(
                [
                  ["diagnostics", "Diagnóstico"],
                  ["events", "Atividade"],
                  ["solutions", "Soluções"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`${buttonClass} ${
                    tab === key ? "!bg-[#383c75] !border-[#8b85ff]" : ""
                  }`}
                >
                  {label}
                </button>
              ))}
            </section>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,250px)_1fr] gap-3">
              <label className="text-xs text-[#a5b5d0] space-y-1">
                Projeto
                <select
                  aria-label="Filtrar por projeto"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-lg bg-[#172138] border border-[#35445e] p-2 text-sm text-white"
                >
                  <option value="all">Todos os projetos</option>
                  {(data?.projects || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {tab !== "events" && (
                <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2">
                  <label className="text-xs text-[#a5b5d0] space-y-1">
                    Situação
                    <select
                      aria-label="Filtrar por situação"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="w-full rounded-lg bg-[#172138] border border-[#35445e] p-2 text-sm text-white"
                    >
                      <option value="all">Todas</option>
                      <option value="open">Pendente</option>
                      <option value="investigating">Em análise</option>
                      <option value="resolved">Resolvida</option>
                    </select>
                  </label>
                  <label className="text-xs text-[#a5b5d0] space-y-1">
                    Pesquisar
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Projeto, problema ou melhoria"
                      className="w-full rounded-lg bg-[#172138] border border-[#35445e] p-2 text-sm text-white"
                    />
                  </label>
                </div>
              )}
            </div>
            {loading ? (
              <div className="text-[#a5b5d0] flex items-center gap-2">
                <LoaderCircle className="animate-spin" size={18} /> Carregando
                telemetria...
              </div>
            ) : !data ? (
              <p className="text-[#a5b5d0]">
                Nenhum dado disponível. Verifique a autenticação e o acesso do
                Cloud Run ao Neon.
              </p>
            ) : tab === "events" ? (
              <div className="space-y-2">
                {events.length === 0 ? (
                  <p className="text-[#a5b5d0]">
                    Nenhuma atividade registrada para esse filtro.
                  </p>
                ) : (
                  events.map((event) => (
                    <article
                      key={event.id}
                      className="rounded-xl border border-[#2b3952] bg-[#121a29] p-4 flex gap-3"
                    >
                      <GitCommitHorizontal
                        size={18}
                        className="shrink-0 text-[#a49eff]"
                      />
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm">{event.title}</h3>
                        <p className="text-xs text-[#a5b5d0] mt-1 break-words">
                          {event.detail}
                        </p>
                        <p className="text-xs text-[#7385a5] mt-2">
                          {new Date(event.occurredAt).toLocaleString("pt-BR")}
                        </p>
                      </div>
                    </article>
                  ))
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
                {visible.length === 0 ? (
                  <p className="text-[#a5b5d0]">
                    Nenhuma recomendação para os filtros selecionados.
                  </p>
                ) : (
                  visible.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-xl border border-[#2b3952] bg-[#121a29] p-4 flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[#a49eff] truncate">
                          {item.projectName || "Sistema de sincronização"}
                        </span>
                        <span
                          className={`text-[11px] font-bold rounded px-2 py-1 ${
                            item.severity === "critical"
                              ? "bg-rose-950 text-rose-300"
                              : item.severity === "warning"
                              ? "bg-amber-950 text-amber-300"
                              : "bg-[#253654] text-[#c9d7ee]"
                          }`}
                        >
                          {item.severity === "critical"
                            ? "Prioridade alta"
                            : item.severity === "warning"
                            ? "Atenção"
                            : "Melhoria"}
                        </span>
                      </div>
                      <h3 className="font-bold text-sm flex items-start gap-2">
                        {item.severity === "critical" ? (
                          <TriangleAlert
                            className="shrink-0 text-rose-400"
                            size={17}
                          />
                        ) : (
                          <Sparkles
                            size={17}
                            className="shrink-0 text-[#a49eff]"
                          />
                        )}
                        {item.title}
                      </h3>
                      <p className="text-xs leading-relaxed text-[#a5b5d0]">
                        {item.evidence}
                      </p>
                      <div className="rounded-lg border border-[#35445e] bg-[#0b1220] p-3 mt-auto space-y-2">
                        <div>
                          <div className="text-xs font-semibold text-[#3ddba0] mb-1">
                            Como resolver
                          </div>
                          <p className="text-xs text-[#c1cde0] leading-relaxed">
                            {item.action}
                          </p>
                        </div>
                        {item.steps && item.steps.length > 0 && (
                          <ol className="list-decimal list-inside space-y-1 text-[11px] text-[#9baac5]">
                            {item.steps.map((s, idx) => (
                              <li key={idx}>{s}</li>
                            ))}
                          </ol>
                        )}
                        {item.commands && item.commands.length > 0 && (
                          <div className="space-y-1 pt-1">
                            {item.commands.map((cmd, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-2 rounded bg-[#070b13] px-2.5 py-1.5 font-mono text-[11px] text-[#3ddba0]"
                              >
                                <span className="truncate">$ {cmd}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(cmd);
                                    setCopiedCmd(cmd);
                                    setTimeout(() => setCopiedCmd(""), 2000);
                                  }}
                                  className="shrink-0 text-[10px] font-sans font-bold text-[#a49eff] hover:underline cursor-pointer"
                                >
                                  {copiedCmd === cmd ? "Copiado!" : "Copiar"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {item.href && (
                          <a
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex gap-1 items-center text-xs text-[#a49eff] mt-2 hover:underline"
                          >
                            Abrir referência <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-[#9baac5]">
                          {statusLabels[item.status]}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {item.status !== "investigating" && (
                            <button
                              disabled={saving === item.id}
                              onClick={() =>
                                void updateStatus(item, "investigating")
                              }
                              className={buttonClass}
                            >
                              Em análise
                            </button>
                          )}
                          {item.status !== "resolved" && (
                            <button
                              disabled={saving === item.id}
                              onClick={() =>
                                void updateStatus(item, "resolved")
                              }
                              className={
                                buttonClass + " flex items-center gap-1"
                              }
                            >
                              <CheckCircle2 size={13} /> Resolvida
                            </button>
                          )}
                          {item.status !== "open" && (
                            <button
                              disabled={saving === item.id}
                              onClick={() => void updateStatus(item, "open")}
                              className={buttonClass}
                            >
                              Reabrir
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            )}
            <p className="text-xs text-[#9baac5]">
              As recomendações ajudam a investigar, mas não executam comandos
              nem alteram projetos automaticamente. Um status marcado como
              resolvido indica acompanhamento manual, não comprovação automática
              da correção.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
