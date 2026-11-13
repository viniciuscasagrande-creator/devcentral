"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Bell, Check, RefreshCw, X } from "lucide-react";
import { getFirebaseIdToken } from "@/lib/firebase";
import type { DevCentralAlert } from "@/lib/alerts-types";

type AlertResponse = { alerts: DevCentralAlert[]; unreadCount: number; activeCount: number };

export function AlertsBell({
  signedIn,
  onOpenTelemetry,
}: {
  signedIn: boolean;
  onOpenTelemetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<DevCentralAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const request = useCallback(async (method: "GET" | "POST" | "PATCH", body?: object) => {
    const token = await getFirebaseIdToken();
    const res = await fetch("/api/alerts", {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Falha na operação (${res.status}).`);
    return res.json();
  }, []);

  const reload = useCallback(async () => {
    if (!signedIn) return;
    try {
      const data: AlertResponse = await request("GET");
      setAlerts(data.alerts || []);
      setUnreadCount(data.unreadCount || 0);
      setError("");
    } catch {
      setError("Não foi possível carregar os alertas. Confirme sua autorização.");
    }
  }, [signedIn, request]);

  useEffect(() => {
    if (!signedIn) {
      setAlerts([]);
      setUnreadCount(0);
      setOpen(false);
      return;
    }
    void reload();
    const interval = window.setInterval(() => void reload(), 60_000);
    return () => window.clearInterval(interval);
  }, [signedIn, reload]);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open]);

  const scan = async () => {
    setBusy(true);
    try {
      await request("POST");
      await reload();
    } catch {
      setError("A análise falhou. Confira as integrações e o Neon.");
    } finally {
      setBusy(false);
    }
  };

  const read = async (id: string) => {
    try {
      await request("PATCH", { id });
      await reload();
    } catch {
      setError("Não foi possível marcar o alerta como lido.");
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { if (signedIn) { setOpen((x) => !x); void reload(); } else { onOpenTelemetry(); } }}
        aria-label={`Alertas operacionais${unreadCount ? `: ${unreadCount} não lidos` : ""}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative w-10 h-10 rounded-full bg-[#101729] border border-[#222e4a] text-[#c3cbed] hover:text-white hover:border-[#7c5cff] grid place-items-center transition cursor-pointer"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center border-2 border-[#101729]">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && signedIn && (
        <>
          <button type="button" aria-label="Fechar alertas" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/25 sm:bg-transparent cursor-default" />
          <section role="dialog" aria-label="Central de alertas operacionais" className="fixed inset-x-3 top-16 z-50 max-h-[75dvh] overflow-y-auto rounded-2xl border border-[#354366] bg-[#0c1425] p-3 shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-12 sm:w-[390px] sm:max-h-[65vh]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-sm font-bold text-white">Alertas operacionais</h2>
                <p className="text-[11px] text-[#9baac5]">Baseados na última telemetria registrada</p>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => void scan()} disabled={busy} title="Analisar agora" aria-label="Atualizar alertas" className="w-9 h-9 rounded-lg border border-[#304261] grid place-items-center disabled:opacity-50 cursor-pointer">
                  <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
                </button>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="w-9 h-9 rounded-lg border border-[#304261] grid place-items-center cursor-pointer"><X className="w-4 h-4" /></button>
              </div>
            </div>
            {error && <p role="alert" className="mb-2 text-xs text-amber-300">{error}</p>}
            {!alerts.length && <p className="text-xs text-[#9baac5] py-7 text-center">Nenhum alerta registrado. Use atualizar para executar uma análise.</p>}
            <div className="space-y-2">
              {alerts.slice(0, 20).map((a) => (
                <article key={a.id} className={`rounded-xl border p-3 ${a.state === "active" ? "border-[#374767] bg-[#141e31]" : "border-[#253149] bg-[#0d1626] opacity-65"}`}>
                  <div className="flex justify-between gap-2 items-start">
                    <div className="min-w-0">
                      <p className="text-[10px] text-[#9baac5] truncate">{a.projectName} · {a.state === "recovered" ? "Recuperado" : a.severity === "critical" ? "Crítico" : "Atenção"}</p>
                      <h3 className="text-xs font-bold text-white break-words mt-1">{a.title}</h3>
                    </div>
                    {a.state === "active" && !a.readAt && <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" aria-label="Não lido" />}
                  </div>
                  <p className="text-[11px] text-[#bac6da] mt-1 line-clamp-2 break-words">{a.evidence}</p>
                  <div className="mt-2 flex gap-2 items-center justify-between">
                    <time className="text-[10px] text-[#92a2bd]" dateTime={a.lastSeenAt}>{new Date(a.lastSeenAt).toLocaleString("pt-BR")}</time>
                    {!a.readAt && (
                      <button type="button" onClick={() => void read(a.id)} className="inline-flex items-center gap-1 text-[11px] text-[#3ddba0] min-h-9 px-2 rounded-lg hover:bg-[#14322c] cursor-pointer"><Check className="w-3.5 h-3.5" /> Marcar lido</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <a href="/relatorios" className="mt-3 min-h-11 w-full rounded-xl border border-[#34415e] bg-[#151d31] hover:bg-[#1b2843] text-xs font-bold text-white inline-flex items-center justify-center">📊 Relatórios de saúde</a>
            <button type="button" onClick={() => { setOpen(false); onOpenTelemetry(); }} className="mt-2 min-h-11 w-full rounded-xl bg-[#5b46e8] hover:bg-[#725cf7] text-xs font-bold text-white cursor-pointer">Abrir Telemetria & Soluções</button>
          </section>
        </>
      )}
    </div>
  );
}
