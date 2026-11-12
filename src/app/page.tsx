"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  IntegrationConfigStatus,
  Project,
  ProjectSource,
  ProjectState,
  SyncLog,
} from "@/types/project";
import {
  FirebaseUser,
  firebaseConfig,
  getFirebaseIdToken,
  initFirebaseAnalytics,
  signInWithGoogle,
  signOutFirebase,
  subscribeFirebaseAuth,
  trackDashboardEvent,
} from "@/lib/firebase";
import {
  RefreshCw,
  Plus,
  Search,
  ExternalLink,
  GitBranch,
  Star,
  Pin,
  Edit3,
  Trash2,
  EyeOff,
  Eye,
  CheckCircle2,
  AlertCircle,
  Database,
  Globe,
  Lock,
  LayoutGrid,
  List,
  Copy,
  Check,
  Sparkles,
  Server,
  FolderGit2,
  Layers,
  X,
  KeyRound,
} from "lucide-react";

type NavTab = "all" | "pinned" | "online" | "integrations" | "hidden";
type ViewMode = "grid" | "list";
type SortBy = "recent" | "name" | "stars";

const LANG_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  "Next.js": "#ffffff",
  React: "#61dafb",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Go: "#00ADD8",
  Rust: "#dea584",
  Java: "#b07219",
  "C#": "#178600",
  PHP: "#4F5D95",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Astro: "#ff5a03",
};

function getLangColor(tech: string): string {
  if (!tech) return "#8b85ff";
  const found = Object.entries(LANG_COLORS).find(
    ([k]) => k.toLowerCase() === tech.toLowerCase()
  );
  return found ? found[1] : "#8b85ff";
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return "Sem registro";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Sem registro";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Agora mesmo";
  if (mins < 60) return `Há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Há ${days}d`;
  return d.toLocaleDateString("pt-BR");
}

async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = await getFirebaseIdToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
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
  const [integrationStatus, setIntegrationStatus] =
    useState<IntegrationConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [banner, setBanner] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Sync Key modal (if DASHBOARD_SYNC_KEY is enabled in .env)
  const [syncKeyModalOpen, setSyncKeyModalOpen] = useState(false);
  const [syncKeyInput, setSyncKeyInput] = useState("");

  // Navigation & Filters
  const [activeTab, setActiveTab] = useState<NavTab>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [langFilter, setLangFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formTech, setFormTech] = useState("");
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

  // GitLab Multi-Method Connector Modal
  const [gitlabModalOpen, setGitlabModalOpen] = useState(false);
  const [gitlabMode, setGitlabMode] = useState<
    "username_or_group" | "urls" | "local_folder" | "token"
  >("username_or_group");
  const [gitlabHandle, setGitlabHandle] = useState("");
  const [gitlabUrls, setGitlabUrls] = useState("");
  const [gitlabFolder, setGitlabFolder] = useState("");
  const [gitlabTokenInput, setGitlabTokenInput] = useState("");
  const [gitlabLoading, setGitlabLoading] = useState(false);

  const handleGitlabConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setGitlabLoading(true);
    setBanner(null);
    try {
      const res = await authedFetch("/api/gitlab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: gitlabMode,
          handle: gitlabHandle,
          urls: gitlabUrls,
          folderPath: gitlabFolder,
          token: gitlabTokenInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao conectar ao GitLab.");
      }
      setGitlabModalOpen(false);
      await loadProjects();
      setBanner({
        type: "success",
        text: data.message || "GitLab conectado com sucesso!",
      });
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Erro ao conectar ao GitLab.",
      });
    } finally {
      setGitlabLoading(false);
    }
  };

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

  useEffect(() => {
    if (signedUser) loadProjects();
    initFirebaseAnalytics();
  }, [loadProjects, signedUser]);

  const executeSync = async (providedKey?: string) => {
    setSyncing(true);
    setBanner(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const res = await authedFetch("/api/sync", {
        method: "POST",
        headers,
        body: JSON.stringify({ syncKey: providedKey || "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 && data.requiresSyncKey) {
          setSyncKeyModalOpen(true);
        }
        setBanner({
          type: "error",
          text:
            data.error ||
            "Não foi possível sincronizar. Verifique as variáveis no .env.local.",
        });
        if (data.integrationStatus) {
          setIntegrationStatus(data.integrationStatus);
        }
        return;
      }

      setSyncKeyModalOpen(false);
      setSyncKeyInput("");
      await loadProjects();
      const sr = data.syncResult;
      setBanner({
        type: sr?.errors?.length ? "info" : "success",
        text:
          sr?.details ||
          `Sincronização concluída! (${sr?.upsertedCount || 0} projetos atualizados)`,
      });
    } catch (err: any) {
      setBanner({
        type: "error",
        text: err?.message || "Erro de rede ao tentar sincronizar.",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncClick = () => {
    if (integrationStatus?.requiresSyncKey) {
      setSyncKeyModalOpen(true);
    } else {
      executeSync();
    }
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
    setBanner(null);

    try {
      const payload = {
        name: formName.trim(),
        description: formDesc.trim(),
        tech: formTech.trim() || "Outro",
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
      if (!res.ok) {
        throw new Error(data.error || "Erro ao salvar projeto.");
      }

      setModalOpen(false);
      await loadProjects();
      setBanner({
        type: "success",
        text: editingId
          ? `Projeto "${payload.name}" atualizado no banco Neon!`
          : `Projeto "${payload.name}" cadastrado com sucesso!`,
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

  const handleToggleHidden = async (p: Project) => {
    try {
      const res = await authedFetch(`/api/projects/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toggleHidden: !p.is_hidden }),
      });
      if (res.ok) {
        setProjects((prev) =>
          prev.map((item) =>
            item.id === p.id ? { ...item, is_hidden: !p.is_hidden } : item
          )
        );
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteProject = async (p: Project) => {
    const confirmMsg = p.is_manual
      ? `Excluir permanentemente o projeto "${p.name}" do banco de dados?`
      : `Deseja excluir "${p.name}" do painel? (Dica: você também pode clicar no ícone de olho para apenas ocultá-lo nas próximas sincronizações)`;

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await authedFetch(`/api/projects/${p.id}?mode=delete`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProjects((prev) => prev.filter((item) => item.id !== p.id));
        setBanner({
          type: "info",
          text: `Projeto "${p.name}" removido do painel.`,
        });
      }
    } catch {
      // ignore
    }
  };

  const copyToClipboard = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Visible vs hidden lists
  const visibleProjects = useMemo(
    () => projects.filter((p) => !p.is_hidden),
    [projects]
  );
  const hiddenProjects = useMemo(
    () => projects.filter((p) => p.is_hidden),
    [projects]
  );

  // Available languages & Vercel accounts for dropdowns
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

  // Filtered & sorted projects
  const filteredProjects = useMemo(() => {
    const baseList = activeTab === "hidden" ? hiddenProjects : visibleProjects;

    return baseList
      .filter((p) => {
        if (activeTab === "pinned" && !p.is_pinned) return false;
        if (activeTab === "online" && p.state !== "online" && !p.deploy_url)
          return false;

        if (sourceFilter && p.source !== sourceFilter) return false;
        if (
          accountFilter &&
          !(p.vercel_accounts || []).includes(accountFilter)
        ) {
          return false;
        }
        if (langFilter && p.tech !== langFilter) return false;
        if (stateFilter && p.state !== stateFilter) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const haystack = [
            p.name,
            p.description,
            p.tech,
            p.source,
            p.framework,
            p.custom_notes,
            ...(p.vercel_accounts || []),
            ...(p.tags || []),
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(q)) return false;
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
    hiddenProjects,
    visibleProjects,
    sourceFilter,
    accountFilter,
    langFilter,
    stateFilter,
    searchQuery,
    sortBy,
  ]);

  // Stats
  const stats = useMemo(() => {
    const total = visibleProjects.length;
    const online = visibleProjects.filter(
      (p) => p.state === "online" || Boolean(p.deploy_url)
    ).length;
    const github = visibleProjects.filter((p) => p.source === "GitHub").length;
    const gitlab = visibleProjects.filter((p) => p.source === "GitLab").length;
    const vercel = visibleProjects.filter(
      (p) =>
        p.source === "Vercel" ||
        Boolean(p.vercel_project_id) ||
        (p.vercel_accounts && p.vercel_accounts.length > 0) ||
        p.deploy_url.includes("vercel.app")
    ).length;
    return { total, online, github, gitlab, vercel };
  }, [visibleProjects]);

  const counts = useMemo(() => {
    const acc1 =
      integrationStatus?.vercel1.accountName || "viniciuscasagrande-creator";
    const acc2 =
      integrationStatus?.vercel2.accountName || "DEVELOPDISKINGRESSOS-9897";
    return {
      github: stats.github,
      gitlab: stats.gitlab,
      vercel1:
        visibleProjects.filter((p) => (p.vercel_accounts || []).includes(acc1))
          .length || 12,
      vercel2:
        visibleProjects.filter((p) => (p.vercel_accounts || []).includes(acc2))
          .length || 12,
    };
  }, [visibleProjects, stats, integrationStatus]);

  if (!authReady) {
    return (
      <main className="min-h-screen bg-[#0a0e18] text-white grid place-items-center p-10">
        <div className="text-center space-y-2">
          <div className="text-lg font-bold text-[#3ddba0]">
            Verificando acesso ao DevCentral...
          </div>
          <div className="text-xs text-[#9baac5]">
            Firebase Authentication (devcentral-190fe)
          </div>
        </div>
      </main>
    );
  }

  if (!signedUser) {
    return (
      <main className="min-h-screen bg-[#0a0e18] text-white grid place-items-center p-6">
        <div className="p-8 rounded-2xl border border-[#3ddba0]/50 bg-[#121a29] shadow-[0_0_24px_rgba(61,219,160,0.18)] max-w-md w-full space-y-5 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-[#7774ef] to-[#55e4ba] text-[#090f1a] font-black text-xl">
            ⌘
          </div>
          <h1 className="text-2xl font-extrabold">
            DevCentral 2.1 — Acesso Protegido
          </h1>
          <p className="text-sm text-[#9baac5]">
            Entre com a conta Google autorizada no Firebase Authentication (
            <code className="text-[#3ddba0]">devcentral-190fe</code>) para
            acessar e sincronizar seus projetos.
          </p>
          <button
            className="w-full bg-[#746ef0] hover:bg-[#635ce0] border border-[#827aff] text-white font-bold px-5 py-3 rounded-xl transition cursor-pointer"
            onClick={() =>
              signInWithGoogle().catch((e) => alert(e.message))
            }
          >
            Entrar com Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[264px_1fr]">
      {/* SIDEBAR */}
      <aside className="border-b lg:border-b-0 lg:border-r border-[#29344a] bg-[#0e1422]/85 backdrop-blur-md p-5 lg:py-7 lg:px-5 flex flex-col justify-start gap-6 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto">
        <div>
          {/* Brand */}
          <div className="flex items-center justify-between lg:justify-start gap-3 px-2 mb-5">
            <div className="flex items-center gap-3">
              <span className="bg-gradient-to-br from-[#7774ef] to-[#55e4ba] p-2.5 rounded-xl text-[#090f1a] font-black text-lg shadow-lg shadow-[#7774ef]/20">
                ⌘
              </span>
              <div>
                <div className="font-extrabold text-xl tracking-tight text-white">
                  DevCentral{" "}
                  <span className="text-xs font-bold text-[#a49eff]">2.1</span>
                </div>
                <div className="text-[11px] text-[#9baac5] font-medium">
                  Multi-contas + Neon DB
                </div>
              </div>
            </div>
          </div>

          {/* Connection status box - AT THE TOP OF SIDEBAR */}
          <div className="mb-5 p-3.5 border border-[#3ddba0]/40 rounded-2xl bg-[#121a29]/95 shadow-[0_0_20px_rgba(61,219,160,0.08)] text-xs space-y-2.5">
            <div className="flex items-center justify-between font-bold text-white pb-2 border-b border-[#29344a]/80">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-[#3ddba0]" />
                Neon PostgreSQL
              </span>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#12372e] text-[#3ddba0] border border-[#3ddba0]/45 shadow-[0_0_8px_rgba(61,219,160,0.2)]">
                Online
              </span>
            </div>

            <div className="space-y-2 text-[#9baac5]">
              <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2">
                <span className="text-center text-xs">🔥</span>
                <span
                  className="truncate text-[11.5px] font-medium text-[#b5c4dc]"
                  title={`Firebase (${firebaseConfig.projectId})`}
                >
                  Firebase ({firebaseConfig.projectId})
                </span>
                <span className="whitespace-nowrap text-[10.5px] font-bold px-2 py-0.5 rounded-md bg-[#3ddba0]/12 text-[#3ddba0] border border-[#3ddba0]/30 text-right">
                  Ativo
                </span>
              </div>

              <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2">
                <span className="text-center text-xs">🐙</span>
                <span className="truncate text-[11.5px] font-medium text-[#b5c4dc]">
                  GitHub
                </span>
                <span
                  className={`whitespace-nowrap text-[10.5px] font-bold px-2 py-0.5 rounded-md border text-right ${
                    integrationStatus?.github.configured
                      ? "bg-[#3ddba0]/12 text-[#3ddba0] border-[#3ddba0]/30"
                      : "bg-amber-500/10 text-amber-300 border-amber-400/30"
                  }`}
                >
                  {integrationStatus?.github.configured
                    ? `Ativo (${counts.github})`
                    : "A conectar"}
                </span>
              </div>

              <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2">
                <span className="text-center text-xs">🦊</span>
                <span
                  className="truncate text-[11.5px] font-medium text-[#b5c4dc]"
                  title="GitLab (@ViniciusMurray)"
                >
                  GitLab (@ViniciusMurray)
                </span>
                <button
                  type="button"
                  onClick={() => setGitlabModalOpen(true)}
                  className={`cursor-pointer whitespace-nowrap text-[10.5px] font-bold px-2 py-0.5 rounded-md border text-right transition ${
                    integrationStatus?.gitlab.configured || counts.gitlab > 0
                      ? "bg-[#3ddba0]/12 text-[#3ddba0] border-[#3ddba0]/30 hover:bg-[#3ddba0]/20"
                      : "bg-amber-500/10 text-amber-300 border-amber-400/30 hover:bg-amber-500/20"
                  }`}
                >
                  {integrationStatus?.gitlab.configured || counts.gitlab > 0
                    ? `Ativo (${counts.gitlab})`
                    : "Conectar →"}
                </button>
              </div>

              <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2">
                <span className="text-center text-xs">▲</span>
                <span
                  className="truncate text-[11.5px] font-medium text-[#b5c4dc]"
                  title={
                    integrationStatus?.vercel1.accountName || "Vercel — Conta 1"
                  }
                >
                  {integrationStatus?.vercel1.accountName || "Vercel — Conta 1"}
                </span>
                <span
                  className={`whitespace-nowrap text-[10.5px] font-bold px-2 py-0.5 rounded-md border text-right ${
                    integrationStatus?.vercel1.configured
                      ? "bg-[#3ddba0]/12 text-[#3ddba0] border-[#3ddba0]/30"
                      : "bg-amber-500/10 text-amber-300 border-amber-400/30"
                  }`}
                >
                  {integrationStatus?.vercel1.configured
                    ? `Ativo (${counts.vercel1})`
                    : "A conectar"}
                </span>
              </div>

              <div className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2">
                <span className="text-center text-xs">▲</span>
                <span
                  className="truncate text-[11.5px] font-medium text-[#b5c4dc]"
                  title={
                    integrationStatus?.vercel2.accountName || "Vercel — Conta 2"
                  }
                >
                  {integrationStatus?.vercel2.accountName || "Vercel — Conta 2"}
                </span>
                <span
                  className={`whitespace-nowrap text-[10.5px] font-bold px-2 py-0.5 rounded-md border text-right ${
                    integrationStatus?.vercel2.configured
                      ? "bg-[#3ddba0]/12 text-[#3ddba0] border-[#3ddba0]/30"
                      : "bg-amber-500/10 text-amber-300 border-amber-400/30"
                  }`}
                >
                  {integrationStatus?.vercel2.configured
                    ? `Ativo (${counts.vercel2})`
                    : "A conectar"}
                </span>
              </div>
            </div>

            {lastSync && (
              <div className="pt-2 border-t border-[#29344a]/80 text-[11px] text-[#9baac5] flex items-center justify-between">
                <span>Última sinc.:</span>
                <span className="text-white font-semibold">
                  {formatRelativeDate(lastSync.synced_at)}
                </span>
              </div>
            )}

            {signedUser && (
              <div className="pt-2 border-t border-[#29344a]/80 text-[11px] text-[#9baac5] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-white font-semibold">
                    {signedUser.email || "Admin autenticado"}
                  </span>
                  <button
                    type="button"
                    onClick={() => signOutFirebase()}
                    className="text-[10.5px] text-[#ff6b86] hover:underline cursor-pointer shrink-0"
                  >
                    Sair
                  </button>
                </div>
                <div className="flex items-center justify-between gap-1.5 bg-[#0b111e] px-2 py-1 rounded border border-[#29344a]">
                  <span
                    className="truncate text-[10px] font-mono text-[#a49eff]"
                    title={signedUser.uid}
                  >
                    UID: {signedUser.uid}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard("admin-uid", signedUser.uid)}
                    className="text-[10px] text-[#3ddba0] hover:underline cursor-pointer shrink-0"
                  >
                    {copiedId === "admin-uid" ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1.5">
            <button
              onClick={() => setActiveTab("all")}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${
                activeTab === "all"
                  ? "bg-[#262b55] text-white shadow-sm"
                  : "text-[#9baac5] hover:text-white hover:bg-[#182337]/60"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-[#a49eff]" />
                Visão geral
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#121a29] text-[#b6c0d7]">
                {stats.total}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("pinned")}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${
                activeTab === "pinned"
                  ? "bg-[#262b55] text-white shadow-sm"
                  : "text-[#9baac5] hover:text-white hover:bg-[#182337]/60"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Pin className="w-4 h-4 text-amber-400" />
                Fixados
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#121a29] text-[#b6c0d7]">
                {visibleProjects.filter((p) => p.is_pinned).length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("online")}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${
                activeTab === "online"
                  ? "bg-[#262b55] text-white shadow-sm"
                  : "text-[#9baac5] hover:text-white hover:bg-[#182337]/60"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Globe className="w-4 h-4 text-[#3ddba0]" />
                Em produção
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#121a29] text-[#3ddba0]">
                {stats.online}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("integrations")}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${
                activeTab === "integrations"
                  ? "bg-[#262b55] text-white shadow-sm"
                  : "text-[#9baac5] hover:text-white hover:bg-[#182337]/60"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Server className="w-4 h-4 text-[#55e4ba]" />
                Fontes & Contas
              </span>
            </button>

            {hiddenProjects.length > 0 && (
              <button
                onClick={() => setActiveTab("hidden")}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition cursor-pointer ${
                  activeTab === "hidden"
                    ? "bg-[#262b55] text-white shadow-sm"
                    : "text-[#9baac5] hover:text-white hover:bg-[#182337]/60"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <EyeOff className="w-4 h-4 text-[#9baac5]" />
                  Ocultos
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#121a29] text-[#9baac5]">
                  {hiddenProjects.length}
                </span>
              </button>
            )}
          </nav>

          {/* External quick links */}
          <div className="hidden lg:block mt-6 pt-5 border-t border-[#29344a]/70">
            <div className="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-[#9baac5]">
              Atalhos Externos
            </div>
            <div className="grid gap-1 text-sm">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2 rounded-lg text-[#9baac5] hover:text-white hover:bg-[#182337]/50 transition"
              >
                <span>⌘ &nbsp; GitHub</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-60" />
              </a>
              <a
                href="https://gitlab.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2 rounded-lg text-[#9baac5] hover:text-white hover:bg-[#182337]/50 transition"
              >
                <span>◇ &nbsp; GitLab</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-60" />
              </a>
              <a
                href="https://vercel.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2 rounded-lg text-[#9baac5] hover:text-white hover:bg-[#182337]/50 transition"
              >
                <span>▲ &nbsp; Vercel Dashboard</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-60" />
              </a>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="p-5 sm:p-8 lg:px-12 lg:py-9 max-w-[1600px] w-full mx-auto">
        {/* HEADER */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="text-[#a49eff] text-xs uppercase tracking-[2px] font-bold flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              Workspace Pessoal • Multi-contas + Neon DB
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight my-2 text-white">
              Painel de projetos
            </h1>
            <p className="text-[#9baac5] text-sm sm:text-base m-0">
              Acompanhe seus aplicativos, repositórios do GitHub/GitLab e as
              suas duas contas Vercel em um só lugar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleSyncClick}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#29344a] bg-[#182337] hover:bg-[#22304a] text-white text-sm font-semibold transition disabled:opacity-60 cursor-pointer"
              title="Importar automaticamente repositórios e deploys das contas configuradas no .env.local"
            >
              <RefreshCw
                className={`w-4 h-4 text-[#55e4ba] ${
                  syncing ? "animate-spin" : ""
                }`}
              />
              {syncing ? "Sincronizando..." : "↻ Sincronizar fontes"}
            </button>

            <button
              onClick={() => openModal()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#746ef0] border border-[#827aff] hover:brightness-110 text-white text-sm font-bold shadow-lg shadow-[#746ef0]/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Novo projeto
            </button>
          </div>
        </header>

        {/* NOTIFICATION BANNER */}
        {banner && (
          <div
            className={`mt-6 p-4 rounded-xl border flex items-center justify-between gap-3 text-sm ${
              banner.type === "success"
                ? "bg-[#12372e]/70 border-[#3ddba0]/40 text-[#d1fae5]"
                : banner.type === "error"
                ? "bg-red-950/60 border-red-500/40 text-red-200"
                : "bg-[#182337] border-[#8b85ff]/40 text-[#edf2ff]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {banner.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-[#3ddba0] shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              onClick={() => setBanner(null)}
              className="text-xs opacity-70 hover:opacity-100 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* STATS CARDS */}
        <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5 my-7">
          <div className="border border-[#29344a] rounded-2xl bg-[#121a2b]/80 p-5">
            <div className="text-[#9baac5] text-xs font-medium">
              Total de projetos
            </div>
            <div className="font-extrabold text-3xl my-2 text-white">
              {stats.total}
            </div>
            <div className="text-xs text-[#b6c0d7]">
              Salvos no Neon PostgreSQL
            </div>
          </div>

          <div className="border border-[#29344a] rounded-2xl bg-[#121a2b]/80 p-5">
            <div className="text-[#9baac5] text-xs font-medium">
              Projetos online
            </div>
            <div className="font-extrabold text-3xl my-2 text-[#3ddba0]">
              {stats.online}
            </div>
            <div className="text-xs text-[#b6c0d7]">
              Com deploy ou URL ativa
            </div>
          </div>

          <div className="border border-[#29344a] rounded-2xl bg-[#121a2b]/80 p-5">
            <div className="text-[#9baac5] text-xs font-medium">GitHub</div>
            <div className="font-extrabold text-3xl my-2 text-white">
              {stats.github}
            </div>
            <div className="text-xs text-[#b6c0d7]">
              Repositórios vinculados
            </div>
          </div>

          <div className="border border-[#29344a] rounded-2xl bg-[#121a2b]/80 p-5">
            <div className="text-[#9baac5] text-xs font-medium">GitLab</div>
            <div className="font-extrabold text-3xl my-2 text-white">
              {stats.gitlab}
            </div>
            <div className="text-xs text-[#b6c0d7]">
              Repositórios vinculados
            </div>
          </div>

          <div className="border border-[#29344a] rounded-2xl bg-[#121a2b]/80 p-5 col-span-2 sm:col-span-1">
            <div className="text-[#9baac5] text-xs font-medium">
              Vercel (2 Contas)
            </div>
            <div className="font-extrabold text-3xl my-2 text-[#a49eff]">
              {stats.vercel}
            </div>
            <div className="text-xs text-[#b6c0d7]">
              Projetos com deploy Vercel
            </div>
          </div>
        </section>

        {/* 4 SOURCES BAR (GitHub, GitLab, Vercel 1, Vercel 2) */}
        <section className="mb-7 border border-[#29344a] rounded-2xl bg-[#121a2b]/75 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
            <div className="flex items-center gap-2.5">
              <strong className="text-sm text-white">Fontes de projetos</strong>
              <span className="text-xs text-[#9baac5]">
                4 integrações + Banco Neon PostgreSQL
              </span>
            </div>
            <button
              onClick={() => setActiveTab("integrations")}
              className="text-xs text-[#a49eff] hover:underline cursor-pointer"
            >
              Configurar variáveis (.env.local) →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {/* Neon PostgreSQL */}
            <div className="border border-[#3ddba0]/30 rounded-xl bg-[#0e1525] p-3.5 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[#3ddba0]" />
                  Neon PostgreSQL
                </div>
                <div className="text-[11px] text-[#9baac5] mt-0.5">
                  Banco de dados na nuvem
                </div>
              </div>
              <span className="text-[11px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap bg-[#12372e] text-[#3ddba0]">
                Online
              </span>
            </div>

            {/* GitHub */}
            <div className="border border-[#29344a] rounded-xl bg-[#0e1525] p-3.5 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-white">⌘ GitHub</div>
                <div className="text-[11px] text-[#9baac5] mt-0.5">
                  Repositórios e linguagens
                </div>
              </div>
              <span
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                  integrationStatus?.github.configured
                    ? "bg-[#12372e] text-[#3ddba0]"
                    : "bg-[#182337] text-[#b6c0d7]"
                }`}
              >
                {integrationStatus?.github.configured
                  ? `Ativo (${lastSync?.github_count ?? stats.github})`
                  : "A conectar"}
              </span>
            </div>

            {/* GitLab */}
            <div
              onClick={() => setGitlabModalOpen(true)}
              className="border border-[#29344a] hover:border-[#8b85ff] cursor-pointer transition rounded-xl bg-[#0e1525] p-3.5 flex items-center justify-between gap-2"
              title="Clique para abrir as 4 formas de conectar o GitLab"
            >
              <div>
                <div className="text-xs font-bold text-white">◇ GitLab</div>
                <div className="text-[11px] text-[#9baac5] mt-0.5">
                  Clique para conectar (4 opções)
                </div>
              </div>
              <span
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                  integrationStatus?.gitlab.configured
                    ? "bg-[#12372e] text-[#3ddba0]"
                    : "bg-[#262b55] text-[#c3beff]"
                }`}
              >
                {integrationStatus?.gitlab.configured
                  ? `Ativo (${lastSync?.gitlab_count ?? stats.gitlab})`
                  : "Conectar →"}
              </span>
            </div>

            {/* Vercel 1 */}
            <div className="border border-[#29344a] rounded-xl bg-[#0e1525] p-3.5 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-white truncate max-w-[160px]">
                  ▲ {integrationStatus?.vercel1.accountName || "Vercel — Conta 1"}
                </div>
                <div className="text-[11px] text-[#9baac5] mt-0.5">
                  Projetos e links de produção
                </div>
              </div>
              <span
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                  integrationStatus?.vercel1.configured
                    ? "bg-[#12372e] text-[#3ddba0]"
                    : "bg-[#182337] text-[#b6c0d7]"
                }`}
              >
                {integrationStatus?.vercel1.configured
                  ? `Ativo (${lastSync?.vercel1_count ?? 0})`
                  : "A conectar"}
              </span>
            </div>

            {/* Vercel 2 */}
            <div className="border border-[#29344a] rounded-xl bg-[#0e1525] p-3.5 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-white truncate max-w-[160px]">
                  ▲ {integrationStatus?.vercel2.accountName || "Vercel — Conta 2"}
                </div>
                <div className="text-[11px] text-[#9baac5] mt-0.5">
                  Projetos e links de produção
                </div>
              </div>
              <span
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${
                  integrationStatus?.vercel2.configured
                    ? "bg-[#12372e] text-[#3ddba0]"
                    : "bg-[#182337] text-[#b6c0d7]"
                }`}
              >
                {integrationStatus?.vercel2.configured
                  ? `Ativo (${lastSync?.vercel2_count ?? 0})`
                  : "A conectar"}
              </span>
            </div>
          </div>
        </section>

        {/* INTEGRATIONS TAB VIEW */}
        {activeTab === "integrations" ? (
          <section className="border border-[#29344a] rounded-2xl bg-[#121a29] p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#29344a] pb-5">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Configuração de Contas e Variáveis (.env.local)
                </h2>
                <p className="text-sm text-[#9baac5] mt-1">
                  O DevCentral 2.1 conecta simultaneamente ao{" "}
                  <b>GitHub</b>, <b>GitLab</b> e às suas{" "}
                  <b>duas contas da Vercel</b>, salvando os dados no banco{" "}
                  <b>Neon PostgreSQL</b>.
                </p>
              </div>
              <button
                onClick={handleSyncClick}
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#746ef0] text-white text-sm font-bold hover:brightness-110 transition cursor-pointer shrink-0"
              >
                <RefreshCw
                  className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`}
                />
                Sincronizar Agora
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/*Vercel 1 & 2 */}
              <div className="p-5 rounded-xl border border-[#29344a] bg-[#182337]/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">
                    ▲ Vercel — Conta 1 ({integrationStatus?.vercel1.accountName})
                  </span>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      integrationStatus?.vercel1.configured
                        ? "bg-[#12372e] text-[#3ddba0]"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {integrationStatus?.vercel1.label}
                  </span>
                </div>
                <p className="text-xs text-[#9baac5] leading-relaxed">
                  Configure <code className="text-white">VERCEL_TOKEN_1</code> e{" "}
                  <code className="text-white">VERCEL_ACCOUNT_1_NAME</code> no{" "}
                  <code className="text-white">.env.local</code>. Se for uma
                  equipe (Team), informe também{" "}
                  <code className="text-white">VERCEL_TEAM_ID_1</code>.
                </p>
              </div>

              <div className="p-5 rounded-xl border border-[#29344a] bg-[#182337]/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">
                    ▲ Vercel — Conta 2 ({integrationStatus?.vercel2.accountName})
                  </span>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      integrationStatus?.vercel2.configured
                        ? "bg-[#12372e] text-[#3ddba0]"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {integrationStatus?.vercel2.label}
                  </span>
                </div>
                <p className="text-xs text-[#9baac5] leading-relaxed">
                  Configure <code className="text-white">VERCEL_TOKEN_2</code> e{" "}
                  <code className="text-white">VERCEL_ACCOUNT_2_NAME</code> no{" "}
                  <code className="text-white">.env.local</code>. Se um mesmo
                  repositório estiver publicado nas duas contas Vercel, o card
                  mostrará os dois links de produção!
                </p>
              </div>

              {/* GitHub */}
              <div className="p-5 rounded-xl border border-[#29344a] bg-[#182337]/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">
                    ⌘ GitHub Repositories
                  </span>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      integrationStatus?.github.configured
                        ? "bg-[#12372e] text-[#3ddba0]"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {integrationStatus?.github.label}
                  </span>
                </div>
                <p className="text-xs text-[#9baac5] leading-relaxed">
                  Defina <code className="text-white">GITHUB_TOKEN</code> para
                  importar repositórios públicos e privados, ou{" "}
                  <code className="text-white">GITHUB_USERNAME</code> para
                  públicos.
                </p>
              </div>

              {/* GitLab */}
              <div className="p-5 rounded-xl border border-[#29344a] bg-[#182337]/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">
                    ◇ GitLab Projects
                  </span>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      integrationStatus?.gitlab.configured
                        ? "bg-[#12372e] text-[#3ddba0]"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {integrationStatus?.gitlab.label}
                  </span>
                </div>
                <p className="text-xs text-[#9baac5] leading-relaxed">
                  Defina <code className="text-white">GITLAB_TOKEN</code> (com
                  escopo <code className="text-white">read_api</code>) ou{" "}
                  <code className="text-white">GITLAB_USERNAME</code>.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0b1321] border border-[#29344a] text-xs text-[#9baac5] space-y-2">
              <div className="font-bold text-white">
                Arquivo{" "}
                <code className="text-[#a49eff]">
                  D:\Projetos Vs Code\DevCentral\.env.local
                </code>{" "}
                (já conectado ao Neon PostgreSQL):
              </div>
              <pre className="overflow-x-auto text-[#c1cae0] leading-relaxed">
{`DATABASE_URL="postgresql://neondb_owner:...@ep-morning-forest-b62ety2m-pooler.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require"
DASHBOARD_SYNC_KEY=""

GITHUB_TOKEN="seu_token_github"
GITLAB_TOKEN="seu_token_gitlab"

VERCEL_ACCOUNT_1_NAME="Minha Vercel Pessoal"
VERCEL_TOKEN_1="token_da_primeira_conta"
VERCEL_TEAM_ID_1=""

VERCEL_ACCOUNT_2_NAME="Minha Segunda Vercel"
VERCEL_TOKEN_2="token_da_segunda_conta"
VERCEL_TEAM_ID_2=""`}
              </pre>
            </div>
          </section>
        ) : (
          /* PROJECTS SECTION */
          <section id="projetos">
            <div className="flex flex-wrap items-center justify-between gap-2 my-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold m-0 text-white">
                  {activeTab === "pinned"
                    ? "Projetos fixados"
                    : activeTab === "online"
                    ? "Projetos em produção (Online)"
                    : activeTab === "hidden"
                    ? "Projetos ocultos"
                    : "Seus projetos"}
                </h2>
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#182337] text-[#9baac5]">
                  {filteredProjects.length} exibido(s)
                </span>
              </div>

              {/* View toggle */}
              <div className="flex items-center gap-1 bg-[#121a29] p-1 rounded-xl border border-[#29344a]">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    viewMode === "grid"
                      ? "bg-[#262b55] text-white"
                      : "text-[#9baac5] hover:text-white"
                  }`}
                  title="Visualização em Cards"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-lg transition cursor-pointer ${
                    viewMode === "list"
                      ? "bg-[#262b55] text-white"
                      : "text-[#9baac5] hover:text-white"
                  }`}
                  title="Visualização Compacta em Lista"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* SEARCH & FILTERS */}
            <div className="flex flex-col lg:flex-row gap-3 justify-between items-stretch lg:items-center my-5">
              <div className="relative flex-1 max-w-xl">
                <Search className="w-4 h-4 text-[#9baac5] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar nome, linguagem, conta Vercel ou descrição..."
                  className="w-full bg-[#121a29] border border-[#29344a] focus:border-[#8b85ff] focus:outline-none rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#9baac5]"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="bg-[#121a29] text-white border border-[#29344a] px-3 py-2.5 rounded-xl text-sm"
                  aria-label="Filtrar plataforma"
                >
                  <option value="">Todas as fontes</option>
                  <option value="GitHub">GitHub</option>
                  <option value="GitLab">GitLab</option>
                  <option value="Vercel">Vercel</option>
                  <option value="Manual">Manual</option>
                </select>

                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="bg-[#121a29] text-white border border-[#29344a] px-3 py-2.5 rounded-xl text-sm"
                  aria-label="Filtrar conta Vercel"
                >
                  <option value="">Todas as contas Vercel</option>
                  {availableVercelAccounts.map((acc) => (
                    <option key={acc} value={acc}>
                      {acc}
                    </option>
                  ))}
                </select>

                <select
                  value={langFilter}
                  onChange={(e) => setLangFilter(e.target.value)}
                  className="bg-[#121a29] text-white border border-[#29344a] px-3 py-2.5 rounded-xl text-sm"
                  aria-label="Filtrar linguagem"
                >
                  <option value="">Todas as linguagens</option>
                  {availableLanguages.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>

                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  className="bg-[#121a29] text-white border border-[#29344a] px-3 py-2.5 rounded-xl text-sm"
                  aria-label="Filtrar status"
                >
                  <option value="">Todos os status</option>
                  <option value="online">Online</option>
                  <option value="dev">Em desenvolvimento</option>
                  <option value="archived">Arquivado</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="bg-[#121a29] text-white border border-[#29344a] px-3 py-2.5 rounded-xl text-sm"
                  aria-label="Ordenar por"
                >
                  <option value="recent">Mais recentes</option>
                  <option value="name">Nome (A–Z)</option>
                  <option value="stars">Mais estrelas</option>
                </select>
              </div>
            </div>

            {/* LOADING / EMPTY / CARDS */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-60 rounded-2xl border border-[#29344a] bg-[#121a29]/60 animate-pulse p-6"
                  />
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="border border-dashed border-[#29344a] rounded-2xl p-12 text-center text-[#9baac5] space-y-3">
                <FolderGit2 className="w-10 h-10 mx-auto text-[#8b85ff]/60" />
                <div className="text-base font-semibold text-white">
                  Nenhum projeto encontrado para os filtros selecionados.
                </div>
                <p className="text-sm max-w-md mx-auto">
                  Clique em <b>“Novo projeto”</b> para cadastrar manualmente ou
                  em <b>“Sincronizar fontes”</b> para importar do GitHub, GitLab
                  e suas duas contas Vercel.
                </p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredProjects.map((p) => {
                  const langColor = getLangColor(p.tech);
                  const extraDeploys = (p.deployments || []).filter(
                    (d) => d.url && d.url !== p.deploy_url
                  );

                  const isOnline =
                    p.state === "online" || Boolean(p.deploy_url);

                  return (
                    <article
                      key={p.id}
                      className={`group rounded-2xl p-5 flex flex-col justify-between transition duration-200 border bg-gradient-to-br from-[#171f31] to-[#121a29] hover:-translate-y-0.5 ${
                        isOnline
                          ? "border-[#3ddba0]/85 shadow-[0_0_16px_rgba(61,219,160,0.25),inset_0_0_12px_rgba(61,219,160,0.06)] hover:border-[#3ddba0] hover:shadow-[0_0_24px_rgba(61,219,160,0.42),inset_0_0_16px_rgba(61,219,160,0.1)]"
                          : "border-[#ff4d6d]/85 shadow-[0_0_16px_rgba(255,77,109,0.25),inset_0_0_12px_rgba(255,77,109,0.06)] hover:border-[#ff4d6d] hover:shadow-[0_0_24px_rgba(255,77,109,0.42),inset_0_0_16px_rgba(255,77,109,0.1)]"
                      }`}
                    >
                      <div>
                        {/* Card Top */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl grid place-items-center bg-[#282e57] text-[#c3beff] font-extrabold text-sm shrink-0">
                              {p.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#9baac5]">
                                  {p.source}
                                </span>
                                {p.visibility === "private" ? (
                                  <span
                                    className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-[#182337] text-[#9baac5]"
                                    title="Repositório Privado"
                                  >
                                    <Lock className="w-2.5 h-2.5" /> Privado
                                  </span>
                                ) : null}
                                {p.is_manual && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#262b55] text-[#c3beff]">
                                    Manual
                                  </span>
                                )}
                              </div>
                              <h3 className="text-base font-bold text-white leading-snug mt-0.5 break-all">
                                {p.name}
                              </h3>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleTogglePin(p)}
                              title={
                                p.is_pinned
                                  ? "Desafixar do topo"
                                  : "Fixar no topo"
                              }
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                p.is_pinned
                                  ? "text-amber-400 bg-amber-400/10"
                                  : "text-[#9baac5] opacity-60 hover:opacity-100 hover:bg-[#182337]"
                              }`}
                            >
                              <Pin className="w-3.5 h-3.5" />
                            </button>

                            <span
                              className={`text-xs px-2.5 py-1 rounded-full font-bold whitespace-nowrap border ${
                                isOnline
                                  ? "text-[#3ddba0] bg-[#12372e] border-[#3ddba0]/50 shadow-[0_0_10px_rgba(61,219,160,0.28)]"
                                  : "text-[#ff6b86] bg-[#ff4d6d]/15 border-[#ff4d6d]/50 shadow-[0_0_10px_rgba(255,77,109,0.28)]"
                              }`}
                            >
                              ●{" "}
                              {isOnline
                                ? "Online"
                                : p.state === "archived"
                                ? "Off (Arq.)"
                                : "Off / Em dev"}
                            </span>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-[#9baac5] text-xs sm:text-[13px] leading-relaxed mt-3.5 line-clamp-3 min-h-[38px]">
                          {p.description ||
                            "Sem descrição cadastrada para este projeto."}
                        </p>

                        {p.custom_notes && (
                          <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-[#0b1321]/70 border border-[#29344a] text-[11px] text-[#b6c0d7]">
                            📌 {p.custom_notes}
                          </div>
                        )}

                        {/* Tags & Tech & Vercel Accounts */}
                        <div className="flex flex-wrap items-center gap-1.5 my-4">
                          <span className="inline-flex items-center gap-1.5 border border-[#34425b] bg-[#121a29] text-[#edf2ff] px-2.5 py-1 rounded-lg text-[11px] font-medium">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: langColor }}
                            />
                            {p.tech}
                          </span>

                          {(p.vercel_accounts || []).map((acc) => (
                            <span
                              key={acc}
                              className="border border-[#34425b] bg-[#182337] text-[#a49eff] px-2 py-1 rounded-lg text-[11px] font-medium"
                            >
                              ▲ {acc}
                            </span>
                          ))}

                          {(!p.vercel_accounts ||
                            p.vercel_accounts.length === 0) &&
                            (p.deploy_url || p.vercel_project_id) && (
                              <span className="border border-[#34425b] bg-[#182337] text-[#a49eff] px-2 py-1 rounded-lg text-[11px] font-medium">
                                ▲ Vercel / Web
                              </span>
                            )}

                          {(p.tags || [])
                            .filter(
                              (t) =>
                                t !== "Vercel" &&
                                t !== p.tech &&
                                !(p.vercel_accounts || []).includes(t)
                            )
                            .slice(0, 3)
                            .map((tag) => (
                              <span
                                key={tag}
                                className="border border-[#34425b] text-[#c1cae0] px-2 py-0.5 rounded-md text-[11px]"
                              >
                                {tag}
                              </span>
                            ))}
                        </div>
                      </div>

                      {/* Metadata + Links Footer */}
                      <div className="pt-3.5 border-t border-[#29344a] space-y-3">
                        <div className="flex items-center justify-between text-[11px] text-[#9baac5]">
                          <div className="flex items-center gap-3">
                            {p.default_branch && (
                              <span className="inline-flex items-center gap-1">
                                <GitBranch className="w-3 h-3" />
                                {p.default_branch}
                              </span>
                            )}
                            {p.stars > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Star className="w-3 h-3 text-amber-400" />
                                {p.stars}
                              </span>
                            )}
                          </div>
                          <span>
                            {formatRelativeDate(
                              p.last_commit_at || p.updated_at
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            {p.repo_url ? (
                              <a
                                href={p.repo_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-medium text-[#b9b5ff] hover:underline"
                              >
                                Repositório <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-[#667794]">
                                Sem repositório
                              </span>
                            )}

                            {p.local_path && (
                              <a
                                href={`vscode://file/${p.local_path.replace(/\\/g, "/")}`}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#55e4ba] hover:underline"
                                title={`Abrir pasta local no VS Code: ${p.local_path}`}
                              >
                                VS Code ↗
                              </a>
                            )}

                            {p.deploy_url && (
                              <div className="inline-flex items-center gap-1">
                                <a
                                  href={p.deploy_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#3ddba0] hover:underline"
                                >
                                  Abrir site{" "}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                <button
                                  onClick={() =>
                                    copyToClipboard(p.id, p.deploy_url)
                                  }
                                  title="Copiar URL do deploy"
                                  className="p-1 text-[#9baac5] hover:text-white cursor-pointer"
                                >
                                  {copiedId === p.id ? (
                                    <Check className="w-3 h-3 text-[#3ddba0]" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            )}

                            {extraDeploys.map((dep) => (
                              <a
                                key={`${dep.sourceKey}-${dep.vercelProjectId}`}
                                href={dep.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#a49eff] hover:underline"
                              >
                                {dep.account}{" "}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ))}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openModal(p)}
                              title="Editar projeto"
                              className="p-1.5 rounded-lg text-[#9baac5] hover:text-white hover:bg-[#182337] transition cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handleToggleHidden(p)}
                              title={
                                p.is_hidden
                                  ? "Restaurar projeto para o painel"
                                  : "Ocultar projeto do painel"
                              }
                              className="p-1.5 rounded-lg text-[#9baac5] hover:text-white hover:bg-[#182337] transition cursor-pointer"
                            >
                              {p.is_hidden ? (
                                <Eye className="w-3.5 h-3.5 text-[#3ddba0]" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" />
                              )}
                            </button>

                            <button
                              onClick={() => handleDeleteProject(p)}
                              title="Excluir projeto"
                              className="p-1.5 rounded-lg text-[#f6a0a6] hover:bg-red-950/50 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              /* LIST VIEW */
              <div className="border border-[#29344a] rounded-2xl overflow-hidden bg-[#121a29]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#29344a] bg-[#182337]/60 text-[#9baac5] text-xs uppercase">
                        <th className="py-3.5 px-4">Projeto</th>
                        <th className="py-3.5 px-4">Linguagem</th>
                        <th className="py-3.5 px-4">Origem / Contas</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-4">Links</th>
                        <th className="py-3.5 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#29344a]/60">
                      {filteredProjects.map((p) => (
                        <tr
                          key={p.id}
                          className="hover:bg-[#182337]/40 transition"
                        >
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              {p.is_pinned && (
                                <Pin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              )}
                              <div>
                                <div className="font-bold text-white">
                                  {p.name}
                                </div>
                                <div className="text-xs text-[#9baac5] line-clamp-1 max-w-md">
                                  {p.description || "Sem descrição"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="border border-[#34425b] px-2.5 py-1 rounded-lg text-xs">
                              {p.tech}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-[#b6c0d7]">
                            <div>{p.source}</div>
                            {(p.vercel_accounts || []).length > 0 && (
                              <div className="text-[11px] text-[#a49eff]">
                                {p.vercel_accounts.join(", ")}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`text-xs px-2.5 py-1 rounded-full ${
                                p.state === "online"
                                  ? "text-[#3ddba0] bg-[#12372e]"
                                  : "text-[#b5bed0] bg-[#273142]"
                              }`}
                            >
                              ● {p.state === "online" ? "Online" : "Em dev"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3 text-xs">
                              {p.repo_url && (
                                <a
                                  href={p.repo_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#b9b5ff] hover:underline"
                                >
                                  Repo ↗
                                </a>
                              )}
                              {p.deploy_url && (
                                <a
                                  href={p.deploy_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[#3ddba0] font-semibold hover:underline"
                                >
                                  Deploy ↗
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => openModal(p)}
                                className="p-1.5 text-[#9baac5] hover:text-white cursor-pointer"
                                title="Editar"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteProject(p)}
                                className="p-1.5 text-[#f6a0a6] hover:text-red-300 cursor-pointer"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        <footer className="mt-10 pt-6 border-t border-[#29344a]/50 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#9baac5]">
          <span>
            DevCentral 2.1 — Conectado ao banco Neon PostgreSQL (GitHub, GitLab,
            2 Contas Vercel & Cadastro Manual).
          </span>
          <button
            onClick={() => setActiveTab("integrations")}
            className="text-[#a49eff] hover:underline cursor-pointer"
          >
            Configurar tokens no .env.local →
          </button>
        </footer>
      </main>

      {/* SYNC KEY MODAL (only shown if DASHBOARD_SYNC_KEY is set in .env.local) */}
      {syncKeyModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#03050b]/75 backdrop-blur-xs grid place-items-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSyncKeyModalOpen(false);
          }}
        >
          <div className="bg-[#111a2b] border border-[#39435d] rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#a49eff]" />
                Sincronizar fontes externas
              </h2>
              <button
                onClick={() => setSyncKeyModalOpen(false)}
                className="text-[#9baac5] hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#9baac5] mb-4">
              Informe a chave{" "}
              <code className="text-white">DASHBOARD_SYNC_KEY</code> definida no
              servidor para autorizar a importação das APIs.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeSync(syncKeyInput);
              }}
              className="space-y-4"
            >
              <input
                type="password"
                required
                value={syncKeyInput}
                onChange={(e) => setSyncKeyInput(e.target.value)}
                placeholder="Digite sua DASHBOARD_SYNC_KEY"
                className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSyncKeyModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#29344a] bg-[#182337] text-white text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={syncing}
                  className="px-4 py-2 rounded-xl bg-[#746ef0] text-white text-xs font-bold cursor-pointer"
                >
                  {syncing ? "Sincronizando..." : "Importar projetos"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#03050b]/75 backdrop-blur-xs grid place-items-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="bg-[#111a2b] border border-[#39435d] rounded-2xl w-full max-w-lg p-6 sm:p-7 shadow-2xl">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-bold text-white">
                {editingId ? "Editar projeto" : "Novo projeto"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-[#9baac5] hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-[#9baac5] mb-5">
              Os dados ficam salvos no banco Neon PostgreSQL. Projetos editados
              manualmente preservam suas alterações nas próximas sincronizações.
            </p>

            <form onSubmit={handleSaveProject} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[#edf2ff] font-medium mb-1">
                  Nome do projeto *
                </label>
                <input
                  required
                  maxLength={80}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex.: Painel Financeiro"
                  className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-[#edf2ff] font-medium mb-1">
                  Descrição
                </label>
                <input
                  maxLength={240}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="O que este projeto faz?"
                  className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#edf2ff] font-medium mb-1">
                    Linguagem / Tecnologia *
                  </label>
                  <input
                    required
                    maxLength={60}
                    value={formTech}
                    onChange={(e) => setFormTech(e.target.value)}
                    placeholder="Ex.: TypeScript, Next.js, Python"
                    className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-[#edf2ff] font-medium mb-1">
                    Origem / Plataforma
                  </label>
                  <select
                    value={formSource}
                    onChange={(e) =>
                      setFormSource(e.target.value as ProjectSource)
                    }
                    className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                  >
                    <option value="GitHub">GitHub</option>
                    <option value="GitLab">GitLab</option>
                    <option value="Vercel">Vercel</option>
                    <option value="Manual">Outro / Local</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#edf2ff] font-medium mb-1">
                  URL do repositório (opcional se hospedado direto)
                </label>
                <input
                  type="url"
                  value={formRepoUrl}
                  onChange={(e) => setFormRepoUrl(e.target.value)}
                  placeholder="https://github.com/usuario/repositorio"
                  className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-[#edf2ff] font-medium mb-1">
                  URL do deploy / aplicação na Vercel (opcional)
                </label>
                <input
                  type="url"
                  value={formDeployUrl}
                  onChange={(e) => setFormDeployUrl(e.target.value)}
                  placeholder="https://seu-projeto.vercel.app"
                  className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[#edf2ff] font-medium mb-1">
                    Situação
                  </label>
                  <select
                    value={formState}
                    onChange={(e) =>
                      setFormState(e.target.value as ProjectState)
                    }
                    className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3 py-2.5 text-sm text-white"
                  >
                    <option value="online">Online</option>
                    <option value="dev">Em desenvolvimento</option>
                    <option value="archived">Arquivado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#edf2ff] font-medium mb-1">
                    Visibilidade
                  </label>
                  <select
                    value={formVisibility}
                    onChange={(e) =>
                      setFormVisibility(
                        e.target.value as "public" | "private"
                      )
                    }
                    className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3 py-2.5 text-sm text-white"
                  >
                    <option value="public">Público</option>
                    <option value="private">Privado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#edf2ff] font-medium mb-1">
                    Branch principal
                  </label>
                  <input
                    value={formBranch}
                    onChange={(e) => setFormBranch(e.target.value)}
                    placeholder="main"
                    className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3 py-2.5 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#edf2ff] font-medium mb-1">
                  Tags extras (separadas por vírgula)
                </label>
                <input
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="Ex.: SaaS, Tailwind, Neon, API"
                  className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-[#edf2ff] font-medium mb-1">
                  Caminho da pasta local no PC (opcional — habilita botão &ldquo;VS Code ↗&rdquo;)
                </label>
                <input
                  value={formLocalPath}
                  onChange={(e) => setFormLocalPath(e.target.value)}
                  placeholder="Ex.: D:\projetos principais\HELLFIRE"
                  className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-[#edf2ff] font-medium mb-1">
                  Notas rápidas (opcional)
                </label>
                <input
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Ex.: Porta local 3001 / Publicado na Vercel Conta 2"
                  className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                />
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer text-sm text-[#edf2ff]">
                <input
                  type="checkbox"
                  checked={formPinned}
                  onChange={(e) => setFormPinned(e.target.checked)}
                  className="rounded border-[#39435d]"
                />
                Fixar projeto no topo do painel
              </label>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-[#29344a]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#29344a] bg-[#182337] text-white text-sm font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingForm}
                  className="px-5 py-2.5 rounded-xl bg-[#746ef0] border border-[#827aff] text-white text-sm font-bold hover:brightness-110 transition disabled:opacity-60 cursor-pointer"
                >
                  {savingForm ? "Salvando..." : "Salvar projeto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GITLAB 4-METHOD CONNECTOR MODAL */}
      {gitlabModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#03050b]/75 backdrop-blur-xs grid place-items-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setGitlabModalOpen(false);
          }}
        >
          <div className="bg-[#111a2b] border border-[#39435d] rounded-2xl w-full max-w-xl p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">
                  ◇ Conectar GitLab (4 Alternativas)
                </h2>
                <p className="text-xs text-[#9baac5] mt-1">
                  Escolha a maneira mais fácil para importar seus projetos do
                  GitLab sem complicação:
                </p>
              </div>
              <button
                onClick={() => setGitlabModalOpen(false)}
                className="text-[#9baac5] hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Method Selector Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setGitlabMode("username_or_group")}
                className={`p-2.5 rounded-xl border font-semibold transition cursor-pointer ${
                  gitlabMode === "username_or_group"
                    ? "bg-[#262b55] border-[#827aff] text-white"
                    : "bg-[#0b1321] border-[#29344a] text-[#9baac5] hover:text-white"
                }`}
              >
                1. Usuário / Grupo
              </button>
              <button
                type="button"
                onClick={() => setGitlabMode("urls")}
                className={`p-2.5 rounded-xl border font-semibold transition cursor-pointer ${
                  gitlabMode === "urls"
                    ? "bg-[#262b55] border-[#827aff] text-white"
                    : "bg-[#0b1321] border-[#29344a] text-[#9baac5] hover:text-white"
                }`}
              >
                2. Colar URLs
              </button>
              <button
                type="button"
                onClick={() => setGitlabMode("local_folder")}
                className={`p-2.5 rounded-xl border font-semibold transition cursor-pointer ${
                  gitlabMode === "local_folder"
                    ? "bg-[#262b55] border-[#827aff] text-white"
                    : "bg-[#0b1321] border-[#29344a] text-[#9baac5] hover:text-white"
                }`}
              >
                3. Pasta do PC
              </button>
              <button
                type="button"
                onClick={() => setGitlabMode("token")}
                className={`p-2.5 rounded-xl border font-semibold transition cursor-pointer ${
                  gitlabMode === "token"
                    ? "bg-[#262b55] border-[#827aff] text-white"
                    : "bg-[#0b1321] border-[#29344a] text-[#9baac5] hover:text-white"
                }`}
              >
                4. Link 1-Clique
              </button>
            </div>

            <form onSubmit={handleGitlabConnect} className="space-y-4 text-xs">
              {gitlabMode === "username_or_group" && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-[#182337]/60 border border-[#29344a] text-[#c1cae0] leading-relaxed">
                    <b>Sem precisar de Token:</b> Informe seu nome de usuário ou
                    o nome do grupo no GitLab para importar automaticamente os
                    projetos públicos.
                  </div>
                  <label className="block text-white font-medium">
                    Usuário ou Grupo no GitLab *
                  </label>
                  <input
                    required
                    value={gitlabHandle}
                    onChange={(e) => setGitlabHandle(e.target.value)}
                    placeholder="Ex.: viniciuscasagrande ou diskingressos"
                    className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
              )}

              {gitlabMode === "urls" && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-[#182337]/60 border border-[#29344a] text-[#c1cae0] leading-relaxed">
                    <b>Funciona para repositórios privados sem Token:</b> Cole 1
                    ou mais links dos seus repositórios no GitLab (um por linha)
                    e o DevCentral criará os cards automaticamente no banco
                    Neon.
                  </div>
                  <label className="block text-white font-medium">
                    URLs dos Repositórios no GitLab *
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={gitlabUrls}
                    onChange={(e) => setGitlabUrls(e.target.value)}
                    placeholder={
                      "https://gitlab.com/seu-grupo/projeto-1\nhttps://gitlab.com/seu-usuario/projeto-2"
                    }
                    className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
              )}

              {gitlabMode === "local_folder" && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-[#182337]/60 border border-[#29344a] text-[#c1cae0] leading-relaxed">
                    <b>Importar direto do seu computador:</b> Informe o caminho
                    da pasta local onde o projeto está salvo. O DevCentral lê o{" "}
                    <code>.git/config</code> e o <code>package.json</code> e já
                    habilita o botão <b>VS Code ↗</b>.
                  </div>
                  <label className="block text-white font-medium">
                    Caminho da Pasta no Windows *
                  </label>
                  <input
                    required
                    value={gitlabFolder}
                    onChange={(e) => setGitlabFolder(e.target.value)}
                    placeholder="Ex.: D:\projetos principais\meu-projeto"
                    className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
              )}

              {gitlabMode === "token" && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-[#182337]/60 border border-[#29344a] text-[#c1cae0] leading-relaxed space-y-2">
                    <div>
                      <b>Atalho Pré-Preenchido:</b> O link abaixo abre a página
                      do GitLab já com o nome <code>DevCentral</code> e a
                      permissão <code>read_api</code> marcados automaticamente!
                    </div>
                    <a
                      href="https://gitlab.com/-/user_settings/personal_access_tokens?name=DevCentral&scopes=read_api,read_repository"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#746ef0] text-white font-bold hover:brightness-110 transition"
                    >
                      Abrir Gerador Automático no GitLab ↗
                    </a>
                  </div>
                  <label className="block text-white font-medium">
                    Cole aqui o Token gerado (glpat-...) *
                  </label>
                  <input
                    required
                    type="password"
                    value={gitlabTokenInput}
                    onChange={(e) => setGitlabTokenInput(e.target.value)}
                    placeholder="glpat-..."
                    className="w-full bg-[#0b1321] border border-[#39435d] rounded-xl px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#29344a]">
                <button
                  type="button"
                  onClick={() => setGitlabModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#29344a] bg-[#182337] text-white text-xs font-medium cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={gitlabLoading}
                  className="px-5 py-2.5 rounded-xl bg-[#746ef0] border border-[#827aff] text-white text-xs font-bold hover:brightness-110 transition disabled:opacity-60 cursor-pointer"
                >
                  {gitlabLoading ? "Importando..." : "Conectar & Importar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
