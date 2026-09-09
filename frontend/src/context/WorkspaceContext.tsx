"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";

export type WorkspaceTab = "chat" | "memory" | "search" | "graph" | "agents" | "settings" | "profile";

export const VALID_TABS: readonly WorkspaceTab[] = [
  "chat",
  "memory",
  "search",
  "graph",
  "agents",
  "settings",
  "profile",
] as const;

export function isValidTab(tab: string | null | undefined): tab is WorkspaceTab {
  return VALID_TABS.includes(tab as WorkspaceTab);
}

interface WorkspaceContextType {
  activeTab: WorkspaceTab;
  switchTab: (tab: WorkspaceTab) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({
  children,
  initialTab = "chat",
}: {
  children: React.ReactNode;
  initialTab?: WorkspaceTab;
}) {
  const searchParams = useSearchParams();

  const getInitialTab = useCallback((): WorkspaceTab => {
    const tabParam = searchParams?.get("tab")?.toLowerCase();
    if (isValidTab(tabParam)) {
      return tabParam;
    }
    return initialTab;
  }, [searchParams, initialTab]);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(getInitialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const switchTab = useCallback((tab: WorkspaceTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", tab);
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  // Listen for browser back / forward navigation
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      const url = new URL(window.location.href);
      const tabParam = url.searchParams.get("tab")?.toLowerCase();
      if (isValidTab(tabParam)) {
        setActiveTab(tabParam);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        activeTab,
        switchTab,
        mobileMenuOpen,
        setMobileMenuOpen,
        toggleMobileMenu,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}

