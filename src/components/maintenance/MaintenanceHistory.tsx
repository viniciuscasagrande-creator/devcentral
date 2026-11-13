"use client";

import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { getFirebaseIdToken } from "@/lib/firebase";
import type { MaintenanceAnalysis } from "@/types/maintenance";

type HistoryData = { reports: MaintenanceAnalysis[]; total: number; page: number; pageSize: number; totalPages: number };

export function MaintenanceHistory({ projectId, refreshKey, onOpenReport }: {
  projectId: string;
  refreshKey: string | undefined;
  onOpenReport: (report: MaintenanceAnalysis) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryData>({ reports: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const resetPage = useCallback(() => setPage(1), []);
  useEffect(() => { resetPage(); }, [projectId, resetPage]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true); setError("");
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: "10" });
        if (projectId) params.set("projectId", projectId);
        if (search.trim()) params.set("search", search.trim());
        if (severity) params.set("severity", severity);
        if (method) params.set("method", method);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const token = await getFirebaseIdToken();
        if (controller.signal.aborted) return;
        const response = await fetch(`/api/maintenance/history?${params}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        const result: HistoryData & { error?: string } = await response.json();
        if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
        if (!controller.signal.aborted) setData(result);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Erro ao buscar histórico.");
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [projectId, search, severity, method, from, to, page, refreshKey]);

  return (
    <section className="rounded-2xl border border-[#293756] bg-[#111b2e] p-4 sm:p-5">
      <button type="button" className="w-full text-left inline-flex justify-between items-center min-h-11 cursor-pointer" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="maintenance-history">
        <span className="font-bold flex items-center gap-2"><History size={18} /> Histórico de análises ({data.total} registros)</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && <div id="maintenance-history" className="mt-3 space-y-4">
        <p className="text-xs text-[#9cacc8]">Histórico completo salvo no Neon. O projeto acompanha a seleção acima.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-xs text-[#bac7e3]">Pesquisar texto
            <input type="search" aria-label="Pesquisar no histórico" maxLength={160} value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} placeholder="Projeto, erro ou evidência" className="mt-1 block w-full min-h-11 bg-[#0b1425] border border-[#34425f] rounded-lg p-2 text-white" />
          </label>
          <label className="text-xs text-[#bac7e3]">Severidade
            <select value={severity} onChange={e => { setSeverity(e.target.value); resetPage(); }} className="mt-1 block w-full min-h-11 bg-[#0b1425] border border-[#34425f] rounded-lg p-2 text-white">
              <option value="">Todas</option><option value="critical">Crítico</option><option value="warning">Atenção</option><option value="info">Informativo</option>
            </select>
          </label>
          <label className="text-xs text-[#bac7e3]">Tipo
            <select value={method} onChange={e => { setMethod(e.target.value); resetPage(); }} className="mt-1 block w-full min-h-11 bg-[#0b1425] border border-[#34425f] rounded-lg p-2 text-white">
              <option value="">Todas</option><option value="rules">Regras</option><option value="ai">Com IA</option>
            </select>
          </label>
          <label className="text-xs text-[#bac7e3]">De
            <input type="date" value={from} max={to || undefined} onChange={e => { setFrom(e.target.value); resetPage(); }} className="mt-1 block w-full min-h-11 bg-[#0b1425] border border-[#34425f] rounded-lg p-2 text-white" />
          </label>
          <label className="text-xs text-[#bac7e3]">Até
            <input type="date" value={to} min={from || undefined} onChange={e => { setTo(e.target.value); resetPage(); }} className="mt-1 block w-full min-h-11 bg-[#0b1425] border border-[#34425f] rounded-lg p-2 text-white" />
          </label>
          <button type="button" onClick={() => { setSearch(""); setSeverity(""); setMethod(""); setFrom(""); setTo(""); resetPage(); }} className="self-end min-h-11 rounded-lg border border-[#34425f] px-3 text-sm hover:bg-[#1d2c49] cursor-pointer">Limpar filtros</button>
        </div>
        {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
        {busy && <p role="status" className="text-sm text-[#b6c6e4]">Consultando histórico...</p>}
        {!busy && !error && <div className="space-y-2">
          {data.reports.length ? data.reports.map(report => (
            <button key={report.id} type="button" onClick={() => { onOpenReport(report); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="w-full text-left p-3 bg-[#0b1526] rounded-lg border border-[#273853] hover:border-[#866cff] text-sm flex flex-col sm:flex-row justify-between gap-2 cursor-pointer">
              <span className="min-w-0"><span className="text-[#a59bff] text-xs font-semibold">{report.projectName} • {report.method === "ai" ? "IA" : "Regras"}</span><span className="block mt-1 break-words">{report.summary.slice(0, 200)}</span></span>
              <span className="shrink-0 text-xs text-[#95a9ca]">{new Date(report.createdAt).toLocaleString("pt-BR")}</span>
            </button>
          )) : <p className="text-sm text-[#9cacc8]">Nenhuma análise encontrada para os filtros selecionados.</p>}
        </div>}
        <div className="flex flex-wrap justify-between items-center gap-3 border-t border-[#293756] pt-3">
          <span className="text-xs text-[#aebfda]" aria-live="polite">Página {data.page} de {Math.max(1, data.totalPages)} • {data.total} análises</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || busy} onClick={() => setPage(p => Math.max(1, p - 1))} className="min-h-11 px-4 border border-[#34425f] rounded-lg text-sm disabled:opacity-40 cursor-pointer">Anterior</button>
            <button type="button" disabled={page >= data.totalPages || busy} onClick={() => setPage(p => p + 1)} className="min-h-11 px-4 border border-[#34425f] rounded-lg text-sm disabled:opacity-40 cursor-pointer">Próxima</button>
          </div>
        </div>
      </div>}
    </section>
  );
}
