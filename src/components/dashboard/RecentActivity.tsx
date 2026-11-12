"use client";

import React from "react";
import { SyncLog } from "@/types/project";
import { Activity, CheckCircle2, AlertCircle, Clock, RefreshCw } from "lucide-react";

interface RecentActivityProps {
  logs: SyncLog[];
  loading?: boolean;
  onRefresh?: () => void;
}

export function RecentActivity({
  logs,
  loading,
  onRefresh,
}: RecentActivityProps) {
  return (
    <div className="rounded-2xl border border-[#29344a] bg-[#121a29]/90 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Activity className="w-5 h-5 text-[#3ddba0]" />
          <div>
            <h2 className="text-base font-bold text-white">
              Central de Atividade & Sincronizações
            </h2>
            <p className="text-xs text-[#9baac5]">
              Histórico gravado em tempo real na tabela <code>sync_logs</code> do Neon PostgreSQL
            </p>
          </div>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#344463] bg-[#182337] text-xs font-semibold text-white hover:border-[#8b85ff] transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar logs
          </button>
        )}
      </div>

      {logs.length === 0 ? (
        <div className="p-6 text-center text-xs text-[#9baac5] border border-dashed border-[#29344a] rounded-xl">
          Nenhum registro de sincronização encontrado no banco Neon.
        </div>
      ) : (
        <div className="space-y-2.5">
          {logs.map((log) => {
            const isOk = log.status === "success";
            return (
              <div
                key={log.id}
                className="p-3.5 rounded-xl border border-[#29344a] bg-[#0e1525]/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isOk ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#12372e] text-[#3ddba0] border border-[#3ddba0]/40">
                        <CheckCircle2 className="w-3 h-3" /> Sucesso
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-400/40">
                        <AlertCircle className="w-3 h-3" /> Parcial / Alerta
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-[#9baac5]">
                      <Clock className="w-3 h-3" />
                      {new Date(log.synced_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                  <p className="text-xs text-white font-medium">
                    {log.details || "Sincronização executada"}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0 text-[11px]">
                  <span className="px-2 py-1 rounded-lg bg-[#182337] text-[#b5c4dc] border border-[#29344a]">
                    GitHub: <strong>{log.github_count}</strong>
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-[#182337] text-[#b5c4dc] border border-[#29344a]">
                    GitLab: <strong>{log.gitlab_count}</strong>
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-[#182337] text-[#a49eff] border border-[#29344a]">
                    Vercel 1: <strong>{log.vercel1_count}</strong>
                  </span>
                  <span className="px-2 py-1 rounded-lg bg-[#182337] text-[#a49eff] border border-[#29344a]">
                    Vercel 2: <strong>{log.vercel2_count}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
