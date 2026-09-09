"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { ChatLayout } from "../chat/ChatLayout";
import { MemoryManager } from "../memory/MemoryManager";
import { DocumentManager } from "../documents/DocumentManager";
import { GraphExplorer } from "../graph/GraphExplorer";
import { SettingsPanel } from "../SettingsPanel";
import { ProfileForm } from "../ProfileForm";

export type WorkspaceTab = "chat" | "memory" | "search" | "graph" | "settings" | "profile";

interface WorkspaceSPAProps {
  initialTab?: WorkspaceTab;
}

const NAV_ITEMS: {
  id: WorkspaceTab;
  label: string;
  sublabel: string;
  icon: string;
  badge?: string;
}[] = [
  {
    id: "chat",
    label: "Chat",
    sublabel: "Twin Core AI",
    icon: "💬",
  },
  {
    id: "memory",
    label: "TwinMemory™",
    sublabel: "Personal memory",
    icon: "◌",
  },
  {
    id: "search",
    label: "TwinSearch™",
    sublabel: "Docs & knowledge",
    icon: "⌕",
  },
  {
    id: "graph",
    label: "TwinGraph™",
    sublabel: "Knowledge & connections",
    icon: "🕸️",
  },
  {
    id: "settings",
    label: "Settings",
    sublabel: "Preferences",
    icon: "⚙",
  },
  {
    id: "profile",
    label: "Profile",
    sublabel: "Account info",
    icon: "◎",
  },
];

function WorkspaceSPAContent({ initialTab = "chat" }: WorkspaceSPAProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading, logout } = useAuth();

  // Resolve initial tab from query param or prop
  const getTabFromUrl = useCallback((): WorkspaceTab => {
    const tabParam = searchParams?.get("tab")?.toLowerCase();
    if (tabParam === "chat" || tabParam === "memory" || tabParam === "search" || tabParam === "settings" || tabParam === "profile") {
      return tabParam;
    }
    return initialTab;
  }, [searchParams, initialTab]);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(getTabFromUrl);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  // Sync tab with URL search parameter
  const switchTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);

    // Update URL query string without full page reload
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState({}, "", url.toString());
  };

  // Listen for browser back / forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const url = new URL(window.location.href);
      const tabParam = url.searchParams.get("tab") as WorkspaceTab | null;
      if (tabParam && ["chat", "memory", "search", "settings", "profile"].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (authLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-base text-text-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-accent-cyan border-t-transparent" />
          <p className="text-xs font-medium text-text-muted">Loading TwinMind OS…</p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-base text-text-primary antialiased">
      {/* =========================================================================
          DESKTOP SIDEBAR
         ========================================================================= */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border-subtle bg-surface-1/80 backdrop-blur-md shrink-0">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
          <div className="flex size-9 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 font-bold shadow-[0_0_16px_rgba(34,211,238,0.15)]">
            ◈
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-[0.16em] text-text-primary uppercase">
              TwinMind
            </h1>
            <p className="text-[10px] text-text-muted">Personal AI OS</p>
          </div>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/20">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            SPA
          </span>
        </div>

        {/* Primary Navigation Tabs */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold tracking-[0.2em] text-text-muted uppercase">
            Core Modules
          </div>

          {NAV_ITEMS.slice(0, 3).map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => switchTab(item.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-all ${
                  isActive
                    ? "border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 shadow-sm"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                }`}
              >
                <span className="flex size-6 items-center justify-center text-base">
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-none">{item.label}</p>
                  <p className="mt-1 text-[10px] text-text-muted truncate">{item.sublabel}</p>
                </div>
                {isActive && (
                  <span className="size-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                )}
              </button>
            );
          })}

          <div className="pt-5 px-3 pb-2 text-[10px] font-semibold tracking-[0.2em] text-text-muted uppercase">
            Configuration
          </div>

          {NAV_ITEMS.slice(3).map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => switchTab(item.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-all ${
                  isActive
                    ? "border border-white/10 bg-white/6 text-text-primary shadow-sm"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                }`}
              >
                <span className="flex size-6 items-center justify-center text-base">
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-none">{item.label}</p>
                  <p className="mt-1 text-[10px] text-text-muted truncate">{item.sublabel}</p>
                </div>
                {isActive && (
                  <span className="size-1.5 rounded-full bg-white/70" />
                )}
              </button>
            );
          })}
        </div>

        {/* User Footer */}
        <div className="p-3 border-t border-border-subtle bg-surface-base/50">
          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface-2/60 border border-border-subtle">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-text-primary truncate">{user.name}</p>
              <p className="text-[10px] text-text-muted truncate">{user.email}</p>
            </div>
            <button
              onClick={logout}
              title="Log out"
              className="p-1.5 rounded-lg text-text-muted hover:text-rose-300 hover:bg-rose-500/10 transition-colors text-xs"
            >
              ⎋
            </button>
          </div>
        </div>
      </aside>

      {/* =========================================================================
          MAIN CONTENT VIEW AREA (STATE PRESERVED)
         ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile Header Bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface-1/90 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg border border-border-subtle text-text-secondary hover:text-text-primary"
              aria-label="Toggle navigation menu"
            >
              ☰
            </button>
            <span className="text-xs font-bold tracking-wider text-text-primary uppercase">
              TwinMind
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-cyan-300 capitalize">
              {activeTab}
            </span>
            <button
              onClick={logout}
              className="text-xs text-rose-300 px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20"
            >
              Log out
            </button>
          </div>
        </header>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden flex flex-col gap-1 p-3 border-b border-border-subtle bg-surface-2 animate-fade-in z-50">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => switchTab(item.id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium ${
                  activeTab === item.id
                    ? "bg-cyan-400/10 text-cyan-200 border border-cyan-400/30"
                    : "text-text-secondary hover:bg-surface-3"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Persistent View Container */}
        <main className="flex-1 overflow-y-auto min-w-0 relative">
          {/* TAB 1: Chat (Twin Core) - Preserves active SSE stream & conversation state */}
          <div className={`h-full w-full p-3 sm:p-6 ${activeTab === "chat" ? "block" : "hidden"}`}>
            <div className="mx-auto max-w-7xl h-full">
              <ChatLayout />
            </div>
          </div>

          {/* TAB 2: TwinMemory™ */}
          <div className={`h-full w-full p-4 md:p-8 overflow-y-auto ${activeTab === "memory" ? "block" : "hidden"}`}>
            <div className="mx-auto max-w-7xl">
              <MemoryManager />
            </div>
          </div>

          {/* TAB 3: TwinSearch™ & Knowledge */}
          <div className={`h-full w-full p-4 md:p-8 overflow-y-auto ${activeTab === "search" ? "block" : "hidden"}`}>
            <div className="mx-auto max-w-7xl">
              <div className="flex flex-col gap-6 w-full">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex size-8 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 font-bold">
                        🔍
                      </span>
                      <h2 className="text-2xl font-bold tracking-tight text-text-primary">
                        TwinSearch™ & Knowledge
                      </h2>
                    </div>
                    <p className="mt-1 text-sm text-text-muted max-w-2xl">
                      Upload documents, videos, slides, and files to expand TwinMind's personal knowledge base.
                      All content is indexed with semantic embeddings and private hybrid search.
                    </p>
                  </div>
                </div>

                <DocumentManager />
              </div>
            </div>
          </div>

          {/* TAB 4: TwinGraph™ */}
          <div className={`h-full w-full p-4 md:p-8 overflow-y-auto ${activeTab === "graph" ? "block" : "hidden"}`}>
            <div className="mx-auto max-w-7xl">
              <GraphExplorer />
            </div>
          </div>

          {/* TAB 5: Settings */}
          <div className={`h-full w-full p-4 md:p-8 overflow-y-auto ${activeTab === "settings" ? "block" : "hidden"}`}>
            <div className="mx-auto max-w-4xl">
              <SettingsPanel />
            </div>
          </div>

          {/* TAB 5: Profile */}
          <div className={`h-full w-full p-4 md:p-8 overflow-y-auto ${activeTab === "profile" ? "block" : "hidden"}`}>
            <div className="mx-auto max-w-3xl">
              <ProfileForm />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export function WorkspaceSPA(props: WorkspaceSPAProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-surface-base text-text-muted text-xs">
          Loading TwinMind SPA...
        </div>
      }
    >
      <WorkspaceSPAContent {...props} />
    </Suspense>
  );
}

