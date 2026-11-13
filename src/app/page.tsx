"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Menu, X as CloseMenu } from "lucide-react";
import { MobileNavigation } from "@/components/layout/MobileNavigation";
import {
  IntegrationConfigStatus,
  Project,
  ProjectSource,
  ProjectState,
  SyncLog,
} from "@/types/project";
import {
  FirebaseUser,
  getFirebaseIdToken,
  initFirebaseAnalytics,
  signInWithGoogle,
  signOutFirebase,
  subscribeFirebaseAuth,
} from "@/lib/firebase";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { OverviewStats } from "@/components/dashboard/OverviewStats";
import { IntegrationOverview } from "@/components/dashboard/IntegrationOverview";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ProjectFilters } from "@/components/projects/ProjectFilters";
import { ProjectGrid } from "@/components/projects/ProjectGrid";
import { ProjectDetails } from "@/components/projects/ProjectDetails";
import { ProjectForm } from "@/components/projects/ProjectForm";
import { DeploymentStatus } from "@/components/deployments/DeploymentStatus";
import {
  TelemetrySolutionsCenter,
  TelemetrySubTab,
} from "@/components/telemetry/TelemetrySolutionsCenter";
import type {
  RecommendationStatus,
  TelemetryRecommendation,
} from "@/types/telemetry";
import { AlertCircle, CheckCircle2, KeyRound, X } from "lucide-react";

type NavTab =
  | "all"
  | "pinned"
  | "online"
  | "deployments"
  | "telemetry"
  | "activity"
  | "hidden"
  | "integrations";

async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getFirebaseIdToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}

export default function DevCentralDashboard() {
  const [signedUser, setSignedUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    return subscribeFirebaseAuth((u) => {
      setSignedUser(u);
      setAuthReady(true);
    });
  }, []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [lastSync, setLastSync] = useState<SyncLog | null>(null);
  const [activityLogs, setActivityLogs] = useState<SyncLog[]>([]);
  const [telemetryRecs, setTelemetryRecs] = useState<
    TelemetryRecommendation[]
  >([]);
  const [telemetrySubTab, setTelemetrySubTab] =
    useState<TelemetrySubTab>("diagnostic");
  const [integrationStatus, setIntegrationStatus] =
    useState<IntegrationConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Navigation & Filters (Compact 4-per-row grid: className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3")
  const [activeTab, setActiveTab] = useState<NavTab>("all");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileMenuOpen(false); };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", escape); };
  }, [mobileMenuOpen]);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "stars">("recent");

  // Selected project for ProjectDetails modal
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Sync Key modal
  const [syncKeyModalOpen, setSyncKeyModalOpen] = useState(false);
  const [syncKeyInput, setSyncKeyInput] = useState("");

  // Create / Edit Project Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formTech, setFormTech] = useState("TypeScript");
  const [formSource, setFormSource] = useState<ProjectSource>("GitHub");
  const [formRepoUrl, setFormRepoUrl] = useState("");
  const [formDeployUrl, setFormDeployUrl] = useState("");
  const [formState, setFormState] = useState<ProjectState>("online");
  const [formVisibility, setFormVisibility] = useState<"public" | "private">(
    "public"
  );
  const [formBranch, setFormBranch] = useState("main");
  const [formTags, setFormTags] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formLocalPath, setFormLocalPath] = useState("");
  const [formPinned, setFormPinned] = useState(false);

  // GitLab Connector Modal
  const [gitlabModalOpen, setGitlabModalOpen] = useState(false);
  const [gitlabUrls, setGitlabUrls] = useState("");
  const [gitlabLoading, setGitlabLoading] = useState(false);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/projects?includeHidden=true", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Falha ao carregar projetos");
      }
      setProjects(data.projects || []);
      setLastSync(data.lastSync || null);
      setIntegrationStatus(data.integrationStatus || null);
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Erro ao carregar dados do servidor.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const res = await authedFetch("/api/activity", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setActivityLogs(data.logs || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadTelemetry = useCallback(async () => {
    try {
      const res = await authedFetch("/api/telemetry", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTelemetryRecs(data.recommendations || []);
        if (Array.isArray(data.syncLogs)) {
          setActivityLogs(data.syncLogs);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const handleUpdateTelemetryStatus = async (
    id: string,
    status: RecommendationStatus
  ) => {
    try {
      const res = await authedFetch("/api/telemetry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        setTelemetryRecs((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status } : item))
        );
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!authReady) return;
    loadProjects();
    loadTelemetry();
    if (signedUser) {
      loadActivity();
    }
    initFirebaseAnalytics();
  }, [authReady, signedUser, loadProjects, loadTelemetry, loadActivity]);

  const executeSync = async (providedKey?: string) => {
    setSyncing(true);
    setBanner(null);
    try {
      const res = await authedFetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncKey: providedKey || "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if ((res.status === 401 || res.status === 503) && data.requiresSyncKey) {
          setSyncKeyModalOpen(true);
        }
        setBanner({
          type: "error",
          text: data.error || "Não foi possível sincronizar.",
        });
        return;
      }
      setSyncKeyModalOpen(false);
      setSyncKeyInput("");
      await Promise.all([loadProjects(), loadTelemetry()]);
      setBanner({
        type: "success",
        text:
          data.syncResult?.details ||
          `Sincronização concluída! (${data.syncResult?.upsertedCount || 0} projetos atualizados)`,
      });
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Erro ao tentar sincronizar.",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handlePingUrl = async (url: string) => {
    const res = await authedFetch("/api/deployments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    return res.json();
  };

  const openModal = (p?: Project) => {
    if (p) {
      setEditingId(p.id);
      setFormName(p.name);
      setFormDesc(p.description);
      setFormTech(p.tech);
      setFormSource(p.source);
      setFormRepoUrl(p.repo_url);
      setFormDeployUrl(p.deploy_url);
      setFormState(p.state);
      setFormVisibility(p.visibility);
      setFormBranch(p.default_branch || "main");
      setFormTags((p.tags || []).join(", "));
      setFormNotes(p.custom_notes || "");
      setFormLocalPath(p.local_path || "");
      setFormPinned(p.is_pinned);
    } else {
      setEditingId(null);
      setFormName("");
      setFormDesc("");
      setFormTech("TypeScript");
      setFormSource("GitHub");
      setFormRepoUrl("");
      setFormDeployUrl("");
      setFormState("online");
      setFormVisibility("public");
      setFormBranch("main");
      setFormTags("");
      setFormNotes("");
      setFormLocalPath("");
      setFormPinned(false);
    }
    setModalOpen(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingForm(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDesc.trim(),
        tech: formTech.trim() || "TypeScript",
        source: formSource,
        repo_url: formRepoUrl.trim(),
        deploy_url: formDeployUrl.trim(),
        state: formState,
        visibility: formVisibility,
        default_branch: formBranch.trim() || "main",
        tags: formTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        custom_notes: formNotes.trim(),
        local_path: formLocalPath.trim(),
        is_pinned: formPinned,
      };
      const url = editingId ? `/api/projects/${editingId}` : "/api/projects";
      const method = editingId ? "PUT" : "POST";
      const res = await authedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar projeto.");
      setModalOpen(false);
      await Promise.all([loadProjects(), loadTelemetry()]);
      setBanner({
        type: "success",
        text: `Projeto "${payload.name}" salvo no Neon PostgreSQL!`,
      });
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Erro ao salvar projeto.",
      });
    } finally {
      setSavingForm(false);
    }
  };

  const handleTogglePin = async (p: Project) => {
    try {
      const res = await authedFetch(`/api/projects/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ togglePin: !p.is_pinned }),
      });
      if (res.ok) {
        setProjects((prev) =>
          prev.map((item) =>
            item.id === p.id ? { ...item, is_pinned: !p.is_pinned } : item
          )
        );
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteProject = async (p: Project) => {
    if (!window.confirm(`Remover "${p.name}" do painel?`)) return;
    try {
      const res = await authedFetch(`/api/projects/${p.id}?mode=delete`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((item) => item.id !== p.id));
      }
    } catch {
      // ignore
    }
  };

  const handleGitlabImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setGitlabLoading(true);
    try {
      const res = await authedFetch("/api/gitlab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "urls", urls: gitlabUrls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao importar GitLab.");
      setGitlabModalOpen(false);
      setGitlabUrls("");
      await loadProjects();
      setBanner({ type: "success", text: data.message });
    } catch (err: any) {
      setBanner({ type: "error", text: err?.message });
    } finally {
      setGitlabLoading(false);
    }
  };

  const visibleProjects = useMemo(
    () => projects.filter((p) => !p.is_hidden),
    [projects]
  );
  const hiddenProjects = useMemo(
    () => projects.filter((p) => p.is_hidden),
    [projects]
  );

  // Strictly real counts from Neon PostgreSQL projects
  const counts = useMemo(() => {
    const acc1 =
      integrationStatus?.vercel1.accountName || "viniciuscasagrande-creator";
    const acc2 =
      integrationStatus?.vercel2.accountName || "DEVELOPDISKINGRESSOS-9897";
    return {
      total: visibleProjects.length,
      pinned: visibleProjects.filter((p) => p.is_pinned).length,
      online: visibleProjects.filter(
        (p) => p.state === "online" || Boolean(p.deploy_url)
      ).length,
      hidden: hiddenProjects.length,
      github: visibleProjects.filter((p) => p.source === "GitHub").length,
      gitlab: visibleProjects.filter((p) => p.source === "GitLab").length,
      vercel1: visibleProjects.filter((p) =>
        (p.vercel_accounts || []).includes(acc1)
      ).length,
      vercel2: visibleProjects.filter((p) =>
        (p.vercel_accounts || []).includes(acc2)
      ).length,
      telemetryAlerts: telemetryRecs.filter(
        (r) => r.kind === "confirmed_issue" && r.status !== "resolved"
      ).length,
    };
  }, [visibleProjects, hiddenProjects, integrationStatus, telemetryRecs]);

  const availableLanguages = useMemo(() => {
    const set = new Set<string>();
    visibleProjects.forEach((p) => {
      if (p.tech) set.add(p.tech);
    });
    return Array.from(set).sort();
  }, [visibleProjects]);

  const availableVercelAccounts = useMemo(() => {
    const set = new Set<string>();
    if (integrationStatus?.vercel1.accountName) {
      set.add(integrationStatus.vercel1.accountName);
    }
    if (integrationStatus?.vercel2.accountName) {
      set.add(integrationStatus.vercel2.accountName);
    }
    visibleProjects.forEach((p) => {
      (p.vercel_accounts || []).forEach((acc) => {
        if (acc) set.add(acc);
      });
    });
    return Array.from(set);
  }, [visibleProjects, integrationStatus]);

  const filteredProjects = useMemo(() => {
    const base = activeTab === "hidden" ? hiddenProjects : visibleProjects;
    return base
      .filter((p) => {
        const isOnline = p.state === "online" || Boolean(p.deploy_url);
        if (activeTab === "pinned" && !p.is_pinned) return false;
        if (activeTab === "online" && !isOnline) return false;
        if (sourceFilter && p.source !== sourceFilter) return false;
        if (
          accountFilter &&
          !(p.vercel_accounts || []).includes(accountFilter)
        ) {
          return false;
        }
        if (langFilter && p.tech !== langFilter) return false;
        if (stateFilter === "online" && !isOnline) return false;
        if (stateFilter === "dev" && isOnline) return false;
        if (stateFilter === "archived" && p.state !== "archived") return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const hay = [
            p.name,
            p.description,
            p.tech,
            p.source,
            p.custom_notes,
            ...(p.vercel_accounts || []),
            ...(p.tags || []),
          ]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "stars") return (b.stars || 0) - (a.stars || 0);
        const dateA = new Date(a.last_commit_at || a.updated_at).getTime();
        const dateB = new Date(b.last_commit_at || b.updated_at).getTime();
        return dateB - dateA;
      });
  }, [
    activeTab,
    visibleProjects,
    hiddenProjects,
    sourceFilter,
    accountFilter,
    langFilter,
    stateFilter,
    searchQuery,
    sortBy,
  ]);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setBanner({
        type: "error",
        text: e?.message || "Não foi possível entrar com Google.",
      });
    }
  };

  return (
    <div className="min-h-screen min-w-0 grid grid-cols-1 lg:grid-cols-[292px_1fr] bg-[#070a14] text-white">
      {/* Mobile toolbar stays outside desktop sidebar; all actions use existing handlers. */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#273254] bg-[#080c17]/95 backdrop-blur-lg px-4 py-3 min-w-0">
        <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="Abrir menu" aria-controls="devcentral-mobile-drawer" aria-expanded={mobileMenuOpen}
          className="min-h-11 min-w-11 grid place-items-center rounded-xl border border-[#344463] bg-[#141c32] text-white">
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="font-extrabold text-base truncate">DevCentral <span className="text-[#a5b4fc]">3.0</span></div>
          <div className="text-[10px] text-[#9baac5] truncate">Projetos • Telemetria • Soluções</div>
        </div>
        <button type="button" onClick={() => signedUser ? openModal() : handleSignIn()} aria-label="Novo projeto"
          className="min-h-11 min-w-11 grid place-items-center rounded-xl bg-[#6d4aff] text-white text-xl font-bold">+</button>
      </div>
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="presentation">
          <button type="button" className="absolute inset-0 bg-black/80" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />
          <div id="devcentral-mobile-drawer" role="dialog" aria-modal="true" aria-label="Menu principal" className="absolute inset-y-0 left-0 w-[min(88vw,340px)] overflow-y-auto bg-[#080c17] shadow-2xl">
            <button type="button" className="sticky top-2 z-10 ml-auto mr-3 mt-2 grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#344463] bg-[#151f35]" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}><CloseMenu className="w-5 h-5" /></button>
            <div className="[&>aside]:!border-0 [&>aside]:!min-h-0"><AppSidebar
              activeTab={activeTab}
              telemetrySubTab={telemetrySubTab}
              onSelectTab={(tab, sub) => { setActiveTab(tab); if (sub) setTelemetrySubTab(sub); setMobileMenuOpen(false); }}
              counts={counts} integrationStatus={integrationStatus} lastSync={lastSync} signedUser={signedUser}
              onSignOut={() => { signOutFirebase(); setMobileMenuOpen(false); }}
              onOpenGitlabModal={() => { setMobileMenuOpen(false); signedUser ? setGitlabModalOpen(true) : handleSignIn(); }}
              onOpenSettingsModal={() => { setMobileMenuOpen(false); signedUser ? setSyncKeyModalOpen(true) : handleSignIn(); }}
              onQuickFilter={(src, acc) => { setSourceFilter(src); setAccountFilter(acc || ""); setActiveTab("all"); setMobileMenuOpen(false); }}
            /></div>
          </div>
        </div>
      )}
      <div className="hidden lg:block min-w-0">
      <AppSidebar
        activeTab={activeTab}
        telemetrySubTab={telemetrySubTab}
        onSelectTab={(tab, sub) => {
          setActiveTab(tab);
          if (sub) setTelemetrySubTab(sub);
        }}
        counts={counts}
        integrationStatus={integrationStatus}
        lastSync={lastSync}
        signedUser={signedUser}
        onSignOut={() => signOutFirebase()}
        onOpenGitlabModal={() =>
          signedUser ? setGitlabModalOpen(true) : handleSignIn()
        }
        onOpenSettingsModal={() =>
          signedUser ? setSyncKeyModalOpen(true) : handleSignIn()
        }
        onQuickFilter={(src, acc) => {
          setSourceFilter(src);
          setAccountFilter(acc || "");
          setActiveTab("all");
        }}
      />
      </div>

      <main className="min-w-0 pl-4 pr-5 py-4 pb-28 sm:pl-6 sm:pr-7 sm:py-6 sm:pb-28 lg:pl-8 lg:pr-10 lg:py-6 max-w-[1640px] w-full mx-auto">
        <AppHeader
          syncing={syncing}
          onSyncClick={() => {
            if (!signedUser) {
              handleSignIn();
              return;
            }
            executeSync();
          }}
          onNewProjectClick={() => (signedUser ? openModal() : handleSignIn())}
          onTabChange={setActiveTab}
          activeTab={activeTab}
          signedUser={signedUser}
          onSignInClick={handleSignIn}
          onSignOutClick={() => signOutFirebase()}
          onFocusSearch={() =>
            document.getElementById("project-search-input")?.focus()
          }
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        {banner && (
          <div
            className={`mb-5 p-4 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium ${
              banner.type === "error"
                ? "bg-[#ff4d6d]/10 border-[#ff4d6d]/40 text-[#ff6b86]"
                : "bg-[#12372e]/70 border-[#3ddba0]/40 text-[#3ddba0]"
            }`}
          >
            <span className="flex items-center gap-2">
              {banner.type === "error" ? (
                <AlertCircle className="w-4 h-4 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              {banner.text}
            </span>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {activeTab === "telemetry" ? (
          <TelemetrySolutionsCenter
            key={telemetrySubTab}
            projects={visibleProjects}
            recommendations={telemetryRecs}
            syncLogs={activityLogs}
            loading={loading}
            initialSubTab={telemetrySubTab}
            onRefresh={loadTelemetry}
            onUpdateStatus={handleUpdateTelemetryStatus}
            onSelectProject={setSelectedProject}
          />
        ) : activeTab === "activity" ? (
          <RecentActivity
            logs={activityLogs}
            loading={loading}
            onRefresh={loadActivity}
          />
        ) : activeTab === "deployments" ? (
          <DeploymentStatus
            projects={visibleProjects}
            onPingUrl={handlePingUrl}
            onSelectProject={setSelectedProject}
          />
        ) : (
          <>
            {activeTab === "integrations" && (
              <IntegrationOverview
                integrationStatus={integrationStatus}
                projects={visibleProjects}
                onOpenGitlabModal={() =>
                  signedUser ? setGitlabModalOpen(true) : handleSignIn()
                }
                onSelectSourceFilter={(src, acc) => {
                  setSourceFilter(src);
                  setAccountFilter(acc || "");
                }}
              />
            )}
            <OverviewStats
              projects={visibleProjects}
              onOpenGitlabModal={() =>
                signedUser ? setGitlabModalOpen(true) : handleSignIn()
              }
              onFilterSelect={(f) => {
                if (f.source !== undefined) setSourceFilter(f.source);
                if (f.state !== undefined) setStateFilter(f.state);
                if (f.lang !== undefined) setLangFilter(f.lang);
                setActiveTab("all");
              }}
            />

            <ProjectFilters
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sourceFilter={sourceFilter}
              onSourceChange={setSourceFilter}
              accountFilter={accountFilter}
              onAccountChange={setAccountFilter}
              langFilter={langFilter}
              onLangChange={setLangFilter}
              stateFilter={stateFilter}
              onStateChange={setStateFilter}
              sortBy={sortBy}
              onSortChange={setSortBy}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              availableLanguages={availableLanguages}
              availableVercelAccounts={availableVercelAccounts}
              filteredCount={filteredProjects.length}
              totalCount={visibleProjects.length}
              onClearAll={() => {
                setSearchQuery("");
                setSourceFilter("");
                setAccountFilter("");
                setLangFilter("");
                setStateFilter("");
              }}
              isPinnedTab={activeTab === "pinned"}
              onTogglePinnedTab={() =>
                setActiveTab(activeTab === "pinned" ? "all" : "pinned")
              }
            />

            <ProjectGrid
              projects={filteredProjects}
              viewMode={viewMode}
              onSelect={setSelectedProject}
              onEdit={(p) => (signedUser ? openModal(p) : handleSignIn())}
              onDelete={(p) =>
                signedUser ? handleDeleteProject(p) : handleSignIn()
              }
              onTogglePin={(p) =>
                signedUser ? handleTogglePin(p) : handleSignIn()
              }
            />
          </>
        )}
      </main>
      <MobileNavigation
        activeTab={activeTab}
        onNavigate={(tab) => { setActiveTab(tab); setMobileMenuOpen(false); }}
        onNewProject={() => signedUser ? openModal() : handleSignIn()}
      />

      <ProjectDetails
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
        onEdit={openModal}
        onTogglePin={handleTogglePin}
        onPingUrl={handlePingUrl}
      />

      <ProjectForm
        open={modalOpen}
        editingId={editingId}
        saving={savingForm}
        formName={formName}
        setFormName={setFormName}
        formDesc={formDesc}
        setFormDesc={setFormDesc}
        formTech={formTech}
        setFormTech={setFormTech}
        formSource={formSource}
        setFormSource={setFormSource}
        formRepoUrl={formRepoUrl}
        setFormRepoUrl={setFormRepoUrl}
        formDeployUrl={formDeployUrl}
        setFormDeployUrl={setFormDeployUrl}
        formState={formState}
        setFormState={setFormState}
        formVisibility={formVisibility}
        setFormVisibility={setFormVisibility}
        formBranch={formBranch}
        setFormBranch={setFormBranch}
        formTags={formTags}
        setFormTags={setFormTags}
        formNotes={formNotes}
        setFormNotes={setFormNotes}
        formLocalPath={formLocalPath}
        setFormLocalPath={setFormLocalPath}
        formPinned={formPinned}
        setFormPinned={setFormPinned}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSaveProject}
      />

      {syncKeyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#344463] bg-[#111a2b] p-6 text-white space-y-4">
            <div className="flex items-center gap-2 font-bold">
              <KeyRound className="w-4 h-4 text-[#3ddba0]" />
              Chave Administrativa de Sincronização
            </div>
            <input
              type="password"
              value={syncKeyInput}
              onChange={(e) => setSyncKeyInput(e.target.value)}
              placeholder="DASHBOARD_SYNC_KEY"
              className="w-full px-3 py-2 rounded-xl bg-[#0b1321] border border-[#29344a] text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSyncKeyModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-[#29344a] text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => executeSync(syncKeyInput)}
                className="px-4 py-1.5 rounded-lg bg-[#746ef0] text-xs font-bold cursor-pointer"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {gitlabModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <form
            onSubmit={handleGitlabImport}
            className="w-full max-w-md rounded-2xl border border-[#344463] bg-[#111a2b] p-6 text-white space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">Importar URLs do GitLab</h3>
              <button
                type="button"
                onClick={() => setGitlabModalOpen(false)}
                className="cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              rows={4}
              value={gitlabUrls}
              onChange={(e) => setGitlabUrls(e.target.value)}
              placeholder="https://gitlab.com/usuario/projeto"
              className="w-full p-3 rounded-xl bg-[#0b1321] border border-[#29344a] text-xs text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setGitlabModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-[#29344a] text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={gitlabLoading}
                className="px-4 py-1.5 rounded-lg bg-[#746ef0] text-xs font-bold cursor-pointer"
              >
                {gitlabLoading ? "Importando..." : "Importar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
