"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowLeft, Bell, ClipboardList, RefreshCw, ShieldAlert } from "lucide-react";
import { getFirebaseIdToken } from "@/lib/firebase";

type Report = {
  generatedAt: string; source: string; days: number;
  current: { projects: number; deployFailures: number; activeAlerts: number;
    criticalAlerts: number; pendingTasks: number; lastSyncAt: string | null };
  history: { day: string; projects: number; deployFailures: number; activeAlerts: number;
    criticalAlerts: number; pendingTasks: number }[];
  alerts: { id: string; projectName: string; title: string; severity: string; lastSeenAt: string }[];
  tasks: { id: string; title: string; projectName: string; priority: string; status: string }[];
};

export function HealthReports() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getFirebaseIdToken();
      const response = await fetch(`/api/reports?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      if (!response.ok) throw new Error(response.status === 403 ? "Conta sem autorização de administrador." : `Falha na consulta (${response.status}).`);
      setData((await response.json()) as Report);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Não foi possível carregar o relatório.");
    } finally { setLoading(false); }
  }, [days]);
  useEffect(() => { void reload(); }, [reload]);
  const tiles = data ? [
    { label: "Projetos", value: data.current.projects, icon: Activity },
    { label: "Alertas ativos", value: data.current.activeAlerts, icon: Bell },
    { label: "Críticos", value: data.current.criticalAlerts, icon: ShieldAlert },
    { label: "Deploys com falha registrada", value: data.current.deployFailures, icon: ShieldAlert },
    { label: "Tarefas pendentes", value: data.current.pendingTasks, icon: ClipboardList },
  ] : [];
  const maxAlerts = Math.max(1, ...(data?.history.map(x => x.activeAlerts) || []));
  return (
    <main className="min-h-screen bg-[#070a14] text-white px-4 py-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <a href="/" className="inline-flex items-center gap-2 text-sm text-[#abb9d5] hover:text-white min-h-11"><ArrowLeft size={17}/> Voltar ao painel</a>
          <div className="flex gap-2 items-center">
            <label htmlFor="reports-days" className="text-xs text-[#abb9d5]">Período</label>
            <select id="reports-days" value={days} onChange={e => setDays(Number(e.target.value) as 7|30|90)}
              className="min-h-11 rounded-lg bg-[#151d31] border border-[#34415e] px-3 text-sm">
              <option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option>
            </select>
            <button type="button" onClick={() => void reload()} disabled={loading} className="min-h-11 px-3 rounded-lg border border-[#34415e] bg-[#151d31] inline-flex gap-2 items-center text-sm disabled:opacity-50 cursor-pointer"><RefreshCw size={16}/> Atualizar</button>
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-widest text-[#a28dfd]">DevCentral 3.0 • Telemetria</p>
          <h1 className="text-2xl sm:text-4xl font-extrabold mt-2">Relatórios de saúde dos projetos</h1>
          <p className="text-sm text-[#abb9d5] mt-2">Indicadores do Neon e da última varredura. Não são métricas de disponibilidade contínua.</p>
        </div>
        {error && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">{error} Entre como administrador na página principal e tente novamente.</div>}
        {loading && <p role="status" className="text-sm text-[#abb9d5]">Carregando relatório...</p>}
        {data && <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {tiles.map(t => <article key={t.label} className="rounded-xl bg-[#111b2e] border border-[#293756] p-4 min-w-0">
              <t.icon className="w-5 h-5 text-[#a58cff]" aria-hidden="true"/><p className="mt-3 text-3xl font-bold tabular-nums">{t.value}</p><p className="mt-1 text-xs text-[#b7c2d8]">{t.label}</p>
            </article>)}
          </div>
          <section className="bg-[#111b2e] border border-[#293756] rounded-xl p-4 sm:p-5">
            <h2 className="font-bold mb-2">Evolução de alertas ativos</h2>
            <p className="text-xs text-[#a1adc6] mb-4">Snapshots diários disponíveis: {data.history.length}. Dias sem execução agendada não são preenchidos artificialmente.</p>
            {data.history.length ? <div role="img" aria-label="Barras representando o total de alertas ativos em cada dia com registro" className="h-44 flex items-end gap-1 sm:gap-2 overflow-x-auto">
              {data.history.map(day => <div key={day.day} title={`${day.day}: ${day.activeAlerts} alertas ativos`} className="flex-none min-w-[22px] flex-1 max-w-14 flex flex-col items-center justify-end gap-1 h-full">
                <span className="text-[10px] text-[#abb9d5]">{day.activeAlerts}</span><div className="w-full rounded-t bg-gradient-to-t from-[#6552dd] to-[#46bde2] min-h-1" style={{height: `${Math.max(3,(day.activeAlerts/maxAlerts)*80)}%`}}/>
                <span className="text-[9px] text-[#abb9d5]">{day.day.slice(8,10)}</span>
              </div>)}
            </div> : <p className="text-sm text-[#a1adc6]">O histórico aparecerá após a primeira execução do monitoramento agendado.</p>}
          </section>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-[#111b2e] border border-[#293756] rounded-xl p-4 sm:p-5">
              <h2 className="font-bold mb-3">Alertas prioritários</h2>
              {data.alerts.length ? <div className="space-y-2">{data.alerts.map(a => <div key={a.id} className="rounded-lg bg-[#0c1425] border border-[#263450] p-3">
                <div className="flex justify-between gap-2"><span className="text-xs text-[#a5b4fc] break-all">{a.projectName}</span><span className={`text-xs font-semibold ${a.severity === "critical" ? "text-red-300" : "text-amber-300"}`}>{a.severity === "critical" ? "Crítico" : "Atenção"}</span></div>
                <p className="text-sm mt-1">{a.title}</p></div>)}</div> : <p className="text-sm text-[#a1adc6]">Nenhum alerta ativo na última varredura.</p>}
            </section>
            <section className="bg-[#111b2e] border border-[#293756] rounded-xl p-4 sm:p-5">
              <h2 className="font-bold mb-3">Planos de ação pendentes</h2>
              {data.tasks.length ? <div className="space-y-2">{data.tasks.map(t => <div key={t.id} className="rounded-lg bg-[#0c1425] border border-[#263450] p-3">
                <p className="text-xs text-[#a5b4fc]">{t.projectName} • {t.priority === "high" ? "Alta prioridade" : t.priority === "medium" ? "Média prioridade" : "Baixa prioridade"}</p><p className="text-sm mt-1">{t.title}</p></div>)}</div> : <p className="text-sm text-[#a1adc6]">Nenhuma tarefa pendente.</p>}
            </section>
          </div>
          <p className="text-xs text-[#8291af]">Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")}. Última sincronização: {data.current.lastSyncAt ? new Date(data.current.lastSyncAt).toLocaleString("pt-BR") : "sem registro"}. {data.source}.</p>
        </>}
      </div>
    </main>
  );
}
