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
}

export function DeploymentStatus({
  projects,
  onPingUrl,
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

  return (
    <div className="rounded-2xl border border-[#29344a] bg-[#121a29]/90 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Globe className="w-5 h-5 text-[#3ddba0]" />
          <div>
            <h2 className="text-base font-bold text-white">
              Monitor de Deploys (Vercel Conta 1 & Conta 2)
            </h2>
            <p className="text-xs text-[#9baac5]">
              Distingue o último status informado pela Vercel (<code>last_deploy_status</code>) da verificação HTTP ao vivo.
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#182337] text-[#a49eff] border border-[#29344a]">
          {deployedProjects.length} projetos com deploy
        </span>
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
              className={`p-4 rounded-xl border bg-[#0e1525] flex flex-col justify-between gap-3 ${
                isError
                  ? "border-[#ff4d6d]/70 shadow-[0_0_12px_rgba(255,77,109,0.2)]"
                  : "border-[#3ddba0]/50 shadow-[0_0_12px_rgba(61,219,160,0.12)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-white">{p.name}</div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    {(p.vercel_accounts || []).map((acc) => (
                      <span
                        key={acc}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#182337] text-[#a49eff] border border-[#29344a]"
                      >
                        ▲ {acc}
                      </span>
                    ))}
                    <span className="text-[10px] text-[#9baac5]">
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

                {primaryUrl && (
                  <button
                    type="button"
                    onClick={() => handleCheck(primaryUrl)}
                    disabled={check?.loading}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[#344463] bg-[#182337] text-[11px] font-semibold text-white hover:border-[#3ddba0] transition cursor-pointer shrink-0"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${
                        check?.loading ? "animate-spin" : ""
                      }`}
                    />
                    Testar HTTP
                  </button>
                )}
              </div>

              {primaryUrl && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#29344a]/70 text-xs">
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
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        check.reachable
                          ? "bg-[#12372e] text-[#3ddba0]"
                          : "bg-[#ff4d6d]/20 text-[#ff6b86]"
                      }`}
                    >
                      {check.reachable ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> HTTP{" "}
                          {check.statusCode} ({check.latencyMs}ms)
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3" /> Off /{" "}
                          {check.statusCode || "Erro"}
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
