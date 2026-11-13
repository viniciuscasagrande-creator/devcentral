"use client";

import React, { useState } from "react";
import { Project } from "@/types/project";
import {
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Globe,
  Activity,
  RefreshCw,
} from "lucide-react";

interface DeploymentStatusProps {
  projects: Project[];
  onPingUrl: (url: string) => Promise<{
    reachable: boolean;
    statusCode: number;
    latencyMs: number;
    checkedAt: string;
  }>;
  onSelectProject?: (project: Project) => void;
}

export function DeploymentStatus({
  projects,
  onPingUrl,
  onSelectProject,
}: DeploymentStatusProps) {
  const [checks, setChecks] = useState<
    Record<
      string,
      {
        loading?: boolean;
        reachable?: boolean;
        statusCode?: number;
        latencyMs?: number;
        checkedAt?: string;
      }
    >
  >({});
  const [batchRunning, setBatchRunning] = useState(false);

  const deployedProjects = projects.filter(
    (p) => Boolean(p.deploy_url) || (p.deployments && p.deployments.length > 0)
  );

  const handleCheck = async (url: string) => {
    setChecks((prev) => ({ ...prev, [url]: { loading: true } }));
    try {
      const res = await onPingUrl(url);
      setChecks((prev) => ({
        ...prev,
        [url]: {
          loading: false,
          reachable: res.reachable,
          statusCode: res.statusCode,
          latencyMs: res.latencyMs,
          checkedAt: res.checkedAt,
        },
      }));
    } catch {
      setChecks((prev) => ({
        ...prev,
        [url]: { loading: false, reachable: false, statusCode: 0 },
      }));
    }
  };

  const handleBatchCheckAll = async () => {
    setBatchRunning(true);
    try {
      const urls = Array.from(
        new Set(
          deployedProjects
            .map((p) => p.deploy_url || p.deployments?.[0]?.url || "")
            .filter(Boolean)
        )
      );
      for (const url of urls) {
        await handleCheck(url);
      }
    } finally {
      setBatchRunning(false);
    }
  };

  const checkedList = Object.values(checks).filter((c) => !c.loading);
  const reachableCount = checkedList.filter((c) => c.reachable).length;
  const avgLatency =
    checkedList.length > 0
      ? Math.round(
          checkedList.reduce((acc, c) => acc + (c.latencyMs || 0), 0) /
            checkedList.length
        )
      : null;

  return (
    <div className="rounded-2xl border border-[#22304d] bg-[#0e1526]/90 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Globe className="w-5 h-5 text-[#3ddba0]" />
          <div>
            <h2 className="text-base font-extrabold text-white">
              Monitoramento de Sites & Deploys (Vercel Conta 1 & Conta 2)
            </h2>
            <p className="text-xs text-[#9baac5]">
              Separa o status reportado pela Vercel (<code>READY</code> /{" "}
              <code>ERROR</code>) da disponibilidade HTTP real e tempo de
              resposta em milissegundos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {checkedList.length > 0 && (
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-[#0d2e28] text-[#3ddba0] border border-[#2dd4a0]/40">
              {reachableCount}/{checkedList.length} Online • Média:{" "}
              {avgLatency ?? 0}ms
            </span>
          )}
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#162038] text-[#a5b4fc] border border-[#29344a]">
            {deployedProjects.length} projetos publicados
          </span>
          <button
            type="button"
            onClick={handleBatchCheckAll}
            disabled={batchRunning}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#5641e5] to-[#4330c6] hover:opacity-95 text-xs font-bold text-white shadow-lg shadow-[#5641e5]/25 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${batchRunning ? "animate-spin" : ""}`}
            />
            {batchRunning
              ? "Verificando Endpoints..."
              : "Testar Todos os Endpoints"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {deployedProjects.map((p) => {
          const primaryUrl = p.deploy_url || p.deployments?.[0]?.url || "";
          const check = primaryUrl ? checks[primaryUrl] : undefined;
          const isError =
            p.last_deploy_status === "ERROR" ||
            p.last_deploy_status === "BLOCKED";

          return (
            <div
              key={p.id}
              className={`p-4 rounded-xl border bg-[#0b1120] flex flex-col justify-between gap-3 ${
                isError
                  ? "border-[#ff4d6d]/70 shadow-[0_0_12px_rgba(255,77,109,0.2)]"
                  : "border-[#2dd4a0]/50 shadow-[0_0_12px_rgba(45,212,160,0.12)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-extrabold text-white">
                    {p.name}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    {(p.vercel_accounts || []).map((acc) => (
                      <span
                        key={acc}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#182337] text-[#a49eff] border border-[#29344a]"
                      >
                        ▲ {acc}
                      </span>
                    ))}
                    <span className="text-[10.5px] text-[#9baac5]">
                      Status Vercel:{" "}
                      <strong
                        className={
                          isError ? "text-[#ff6b86]" : "text-[#3ddba0]"
                        }
                      >
                        {p.last_deploy_status || "READY"}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {onSelectProject && (
                    <button
                      type="button"
                      onClick={() => onSelectProject(p)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#6e56cf]/50 bg-[#5641e5]/20 text-[11px] font-bold text-[#d5ceff] hover:bg-[#5641e5] hover:text-white transition cursor-pointer"
                    >
                      <Activity className="w-3 h-3" />
                      Analisar
                    </button>
                  )}
                  {primaryUrl && (
                    <button
                      type="button"
                      onClick={() => handleCheck(primaryUrl)}
                      disabled={check?.loading}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#344463] bg-[#182337] text-[11px] font-semibold text-white hover:border-[#3ddba0] transition cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3 h-3 ${
                          check?.loading ? "animate-spin" : ""
                        }`}
                      />
                      Ping HTTP
                    </button>
                  )}
                </div>
              </div>

              {primaryUrl && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#1e2942] text-xs">
                  <a
                    href={primaryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#3ddba0] hover:underline truncate flex items-center gap-1"
                  >
                    {primaryUrl}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>

                  {check && !check.loading && (
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0 ${
                        check.reachable
                          ? "bg-[#0d2e28] text-[#3ddba0] border border-[#2dd4a0]/40"
                          : "bg-[#ff4d6d]/20 text-[#ff6b86] border border-[#ff4d6d]/40"
                      }`}
                    >
                      {check.reachable ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> Site Online •
                          HTTP {check.statusCode} ({check.latencyMs}ms)
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3" /> Indisponível •{" "}
                          {check.statusCode || "Timeout"}
                        </>
                      )}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
