"use client";

import React, { useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import {
  WorkspaceProvider,
  useWorkspace,
  WorkspaceTab,
} from "../../context/WorkspaceContext";
import { ChatLayout } from "../chat/ChatLayout";
import { MemoryManager } from "../memory/MemoryManager";
import { DocumentManager } from "../documents/DocumentManager";
import { GraphExplorer } from "../graph/GraphExplorer";
import { SettingsPanel } from "../SettingsPanel";
import { ProfileForm } from "../ProfileForm";
import { ThemeToggle } from "../ui/ThemeToggle";
import { safeStorage, STORAGE_KEYS } from "../../lib/storage";
import { AgentsDashboard } from "../agents/AgentsDashboard";
import { TwinMindHeartbeat } from "../motion/TwinMindHeartbeat";
import { ModuleCognitiveSignal } from "../motion/ModuleCognitiveSignal";

const MIN_PRIMARY_SIDEBAR_WIDTH = 280;
const DEFAULT_PRIMARY_SIDEBAR_WIDTH = 345;
const MAX_PRIMARY_SIDEBAR_WIDTH = 500;

interface WorkspaceSPAProps {
  initialTab?: WorkspaceTab;
}

const CORE_NAV_ITEMS: {
  id: WorkspaceTab;
  label: string;
  sublabel: string;
  icon: string;
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
    id: "agents",
    label: "TwinAgents™",
    sublabel: "Autonomous workers",
    icon: "⚡",
  },
];

const CONFIG_NAV_ITEMS: {
  id: WorkspaceTab;
  label: string;
  sublabel: string;
  icon: string;
}[] = [
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

const ALL_NAV_ITEMS = [...CORE_NAV_ITEMS, ...CONFIG_NAV_ITEMS];

function WorkspaceSPAContent() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { activeTab, switchTab, mobileMenuOpen, setMobileMenuOpen, toggleMobileMenu } =
    useWorkspace();

  const [sidebarWidth, setSidebarWidth] = React.useState<number>(() =>
    safeStorage.get<number>(
      STORAGE_KEYS.PRIMARY_SIDEBAR_WIDTH,
      DEFAULT_PRIMARY_SIDEBAR_WIDTH,
    ),
  );
  const [isDragging, setIsDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDividerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSidebarWidth((w) => {
        const next = Math.max(MIN_PRIMARY_SIDEBAR_WIDTH, w - 10);
        safeStorage.set(STORAGE_KEYS.PRIMARY_SIDEBAR_WIDTH, next);
        return next;
      });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSidebarWidth((w) => {
        const next = Math.min(MAX_PRIMARY_SIDEBAR_WIDTH, w + 10);
        safeStorage.set(STORAGE_KEYS.PRIMARY_SIDEBAR_WIDTH, next);
        return next;
      });
    }
  };

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerLeft = containerRef.current?.getBoundingClientRect().left ?? 0;
      const rawWidth = e.clientX - containerLeft;
      const maxAllowed = Math.min(
        MAX_PRIMARY_SIDEBAR_WIDTH,
        typeof window !== "undefined" ? window.innerWidth * 0.5 : MAX_PRIMARY_SIDEBAR_WIDTH,
      );
      const clampedWidth = Math.min(
        maxAllowed,
        Math.max(MIN_PRIMARY_SIDEBAR_WIDTH, rawWidth),
      );
      setSidebarWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setSidebarWidth((current) => {
        safeStorage.set(STORAGE_KEYS.PRIMARY_SIDEBAR_WIDTH, current);
        return current;
      });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging]);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-1 text-text-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-accent-cyan border-t-transparent" />
          <p className="text-xs font-medium text-text-muted">Loading TwinMind OS…</p>
        </div>
      </main>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-screen w-screen overflow-hidden bg-background text-text-primary antialiased"
    >
      {/* =========================================================================
          DESKTOP RESIZABLE PRIMARY NAVIGATION SIDEBAR
         ========================================================================= */}
      <aside
        style={{ width: `${sidebarWidth}px` }}
        className="hidden md:flex flex-col border-r border-border-subtle bg-surface-1/90 backdrop-blur-md shrink-0 select-none overflow-hidden"
      >
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
          <div className="flex size-9 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 shadow-[0_0_16px_rgba(34,211,238,0.2)]">
            <TwinMindHeartbeat size="sm" showRings={false} />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-[0.16em] text-text-primary uppercase">
              TwinMind
            </h1>
            <p className="text-[10px] text-text-muted">Personal AI OS</p>
          </div>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            SPA
          </span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold tracking-[0.2em] text-text-muted uppercase">
            Core Modules
          </div>

          {CORE_NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchTab(item.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-all ${
                  isActive
                    ? "border border-cyan-400/40 bg-cyan-400/15 text-accent-cyan shadow-xs"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                }`}
              >
                <span className="flex size-6 items-center justify-center text-base" aria-hidden="true">
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-none">{item.label}</p>
                  <p className="mt-1 text-[10px] text-text-muted truncate">{item.sublabel}</p>
                </div>
                <ModuleCognitiveSignal moduleId={item.id} isActive={isActive} />
              </button>
            );
          })}

          <div className="pt-5 px-3 pb-2 text-[10px] font-semibold tracking-[0.2em] text-text-muted uppercase">
            Configuration
          </div>

          {CONFIG_NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchTab(item.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-all ${
                  isActive
                    ? "border border-border-strong bg-surface-3 text-text-primary shadow-xs"
                    : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
                }`}
              >
                <span className="flex size-6 items-center justify-center text-base" aria-hidden="true">
                  {item.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-none">{item.label}</p>
                  <p className="mt-1 text-[10px] text-text-muted truncate">{item.sublabel}</p>
                </div>
                <ModuleCognitiveSignal moduleId={item.id} isActive={isActive} />
              </button>
            );
          })}
        </div>

        {/* User & Theme Footer */}
        <div className="p-3 border-t border-border-subtle bg-surface-1/50 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Appearance</span>
            <ThemeToggle compact />
          </div>
          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-surface-2 border border-border-subtle">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-text-primary truncate">{user.name}</p>
              <p className="text-[10px] text-text-muted truncate">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Log out"
              className="p-1.5 rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors text-xs"
              aria-label="Log out"
            >
              ⎋
            </button>
          </div>
        </div>
      </aside>

      {/* Draggable Divider Handle on Right Edge of Primary Navigation Sidebar */}
      <div
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        aria-valuenow={sidebarWidth}
        aria-valuemin={MIN_PRIMARY_SIDEBAR_WIDTH}
        aria-valuemax={MAX_PRIMARY_SIDEBAR_WIDTH}
        aria-label="Resize primary navigation sidebar"
        onMouseDown={handleMouseDown}
        onKeyDown={handleDividerKeyDown}
        className={`group relative hidden md:flex w-2 shrink-0 cursor-col-resize items-center justify-center -ml-1 z-20 select-none transition-colors duration-150 focus-visible:outline-none ${
          isDragging ? "bg-accent-cyan/30" : "bg-transparent hover:bg-accent-cyan/20"
        }`}
        title="Drag to resize primary sidebar"
      >
        <div
          className={`h-full w-[2px] transition-colors duration-150 ${
            isDragging
              ? "bg-accent-cyan shadow-[0_0_8px_rgba(34,211,238,0.8)]"
              : "bg-transparent group-hover:bg-accent-cyan/60"
          }`}
        />
      </div>

      {/* =========================================================================
          MAIN CONTENT VIEW AREA (STATE PRESERVED)
         ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Mobile Header Bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface-1/95 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleMobileMenu}
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
            <ThemeToggle compact />
            <button
              type="button"
              onClick={logout}
              className="text-xs text-rose-400 px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20"
            >
              Log out
            </button>
          </div>
        </header>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex flex-col">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative z-10 w-4/5 max-w-xs h-full bg-surface-1 border-r border-border-subtle flex flex-col p-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
                <span className="text-xs font-bold tracking-wider text-text-primary uppercase">
                  TwinMind Menu
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded text-text-muted hover:text-text-primary"
                  aria-label="Close menu"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-3 space-y-1">
                <p className="px-2 pb-1 text-[10px] font-semibold text-text-muted uppercase">Modules</p>
                {ALL_NAV_ITEMS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => switchTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium text-left ${
                      activeTab === item.id
                        ? "bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30"
                        : "text-text-secondary hover:bg-surface-2"
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="pt-3 border-t border-border-subtle">
                <div className="p-2 rounded-lg bg-surface-2 mb-2">
                  <p className="text-xs font-medium text-text-primary truncate">{user.name}</p>
                  <p className="text-[10px] text-text-muted truncate">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="w-full py-2 rounded-lg text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Persistent View Container */}
        <main className="flex-1 overflow-y-auto min-w-0 relative">
          {/* TAB 1: Chat (Twin Core) - Preserves active SSE stream & conversation state */}
          <div className={`h-full w-full p-2 sm:p-4 md:p-6 ${activeTab === "chat" ? "block" : "hidden"}`}>
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
                      <span className="flex size-8 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-accent-cyan font-bold">
                        🔍
                      </span>
                      <h2 className="text-2xl font-bold tracking-tight text-text-primary">
                        TwinSearch™ & Knowledge
                      </h2>
                    </div>
                    <p className="mt-1 text-sm text-text-muted max-w-2xl">
                      Upload documents, videos, slides, and files to expand TwinMind&apos;s personal knowledge base.
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

          {/* TAB 5: TwinAgents™ */}
          <div className={`h-full w-full p-4 md:p-8 overflow-y-auto ${activeTab === "agents" ? "block" : "hidden"}`}>
            <div className="mx-auto max-w-7xl">
              <AgentsDashboard />
            </div>
          </div>

          {/* TAB 6: Settings */}
          <div className={`h-full w-full p-4 md:p-8 overflow-y-auto ${activeTab === "settings" ? "block" : "hidden"}`}>
            <div className="mx-auto max-w-4xl">
              <SettingsPanel />
            </div>
          </div>

          {/* TAB 7: Profile */}
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

export function WorkspaceSPA({ initialTab = "chat" }: WorkspaceSPAProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-surface-1 text-text-muted text-xs">
          Loading TwinMind SPA...
        </div>
      }
    >
      <WorkspaceProvider initialTab={initialTab}>
        <WorkspaceSPAContent />
      </WorkspaceProvider>
    </Suspense>
  );
}
