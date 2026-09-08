"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
import { WorkspaceShell } from "../../components/WorkspaceShell";
import { Button } from "../../components/ui";
import { MemoryCard } from "../../components/memory/MemoryCard";
import { MemoryModal } from "../../components/memory/MemoryModal";
import { MemoryPrivacyModal } from "../../components/memory/MemoryPrivacyModal";
import {
  Memory,
  MemoryType,
  MemorySettings,
  listMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  clearAllMemories,
  getMemorySettings,
  updateMemorySettings,
} from "../../lib/api";

const FILTER_TABS: { value: MemoryType | "ALL"; label: string; icon: string }[] = [
  { value: "ALL", label: "All Memories", icon: "◈" },
  { value: "USER_PREFERENCE", label: "Preferences", icon: "★" },
  { value: "GOAL", label: "Goals", icon: "🎯" },
  { value: "PROJECT", label: "Projects", icon: "◈" },
  { value: "EPISODIC", label: "Biographical", icon: "⏱" },
  { value: "SEMANTIC", label: "Facts", icon: "ℹ" },
  { value: "CONVERSATION", label: "Past Context", icon: "💬" },
];

export default function MemoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [memories, setMemories] = useState<Memory[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<MemoryType | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  // Modals state
  const [modalOpen, setModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [settings, setSettings] = useState<MemorySettings>({
    id: "",
    userId: "",
    enabled: true,
    autoExtract: true,
    requireReview: false,
  });

  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  // Load Settings
  useEffect(() => {
    if (!user) return;
    getMemorySettings()
      .then((s) => setSettings(s))
      .catch(() => {
        // use default fallback
      });
  }, [user]);

  // Fetch Memories
  const fetchMemoriesList = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const typeFilter = selectedType === "ALL" ? undefined : selectedType;
      const res = await listMemories({
        type: typeFilter,
        isActive: activeOnly ? true : undefined,
        search: searchQuery.trim() || undefined,
        limit: 50,
      });
      setMemories(res.memories);
      setTotalCount(res.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user, selectedType, activeOnly, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMemoriesList();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchMemoriesList]);

  // Handlers
  const handleCreateOrUpdate = async (data: {
    type: MemoryType;
    content: string;
    summary?: string;
    importance: number;
    isActive?: boolean;
  }) => {
    if (editingMemory) {
      const updated = await updateMemory(editingMemory.id, data);
      setMemories((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      showNotification("Memory updated successfully.");
    } else {
      const created = await createMemory(data);
      setMemories((prev) => [created, ...prev]);
      setTotalCount((c) => c + 1);
      showNotification("New memory created successfully.");
    }
    setEditingMemory(null);
  };

  const handleToggleActive = async (memory: Memory) => {
    try {
      const updated = await updateMemory(memory.id, { isActive: !memory.isActive });
      setMemories((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      showNotification(updated.isActive ? "Memory activated." : "Memory archived.");
    } catch {
      showNotification("Failed to update memory state.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setTotalCount((c) => Math.max(0, c - 1));
      showNotification("Memory deleted.");
    } catch {
      showNotification("Failed to delete memory.");
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllMemories();
      setMemories([]);
      setTotalCount(0);
      showNotification("All memories erased.");
    } catch {
      showNotification("Failed to clear memories.");
    }
  };

  const handleUpdateSettings = async (newSettings: Partial<MemorySettings>) => {
    const updated = await updateMemorySettings(newSettings);
    setSettings(updated);
    showNotification("Privacy settings saved.");
  };

  // Stats calculation
  const stats = {
    preferences: memories.filter((m) => m.type === "USER_PREFERENCE").length,
    goals: memories.filter((m) => m.type === "GOAL").length,
    projects: memories.filter((m) => m.type === "PROJECT").length,
  };

  if (authLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base text-text-muted text-sm">
        Loading TwinMemory™...
      </div>
    );
  }

  return (
    <WorkspaceShell>
      <div className="flex flex-col gap-6 p-4 md:p-8 max-w-7xl mx-auto w-full">
        {/* Notification banner */}
        {notification && (
          <div className="fixed top-5 right-5 z-50 rounded-xl border border-cyan-400/30 bg-surface-1 px-4 py-2.5 text-xs font-medium text-cyan-300 shadow-2xl backdrop-blur-md animate-fade-in">
            {notification}
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 font-bold">
                ◌
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                TwinMemory™
              </h1>
              {!settings.enabled && (
                <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-300 border border-rose-500/20">
                  Paused
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-text-muted max-w-2xl">
              Personal long-term memory system. TwinMind remembers user preferences, goals, and projects across sessions to naturally personalize your intelligence.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setPrivacyModalOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-3 hover:text-text-primary transition-colors"
            >
              <span>⚙</span>
              <span>Privacy & Controls</span>
            </button>

            <Button
              onClick={() => {
                setEditingMemory(null);
                setModalOpen(true);
              }}
            >
              + Add Memory
            </Button>
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border-subtle bg-surface-1/70 p-3.5 backdrop-blur-sm">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-muted">Total Knowledge</p>
            <p className="mt-1 text-2xl font-bold text-text-primary">{totalCount}</p>
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface-1/70 p-3.5 backdrop-blur-sm">
            <p className="text-[11px] font-medium uppercase tracking-wider text-purple-300">Preferences</p>
            <p className="mt-1 text-2xl font-bold text-purple-200">{stats.preferences}</p>
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface-1/70 p-3.5 backdrop-blur-sm">
            <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-300">Active Goals</p>
            <p className="mt-1 text-2xl font-bold text-emerald-200">{stats.goals}</p>
          </div>
          <div className="rounded-xl border border-border-subtle bg-surface-1/70 p-3.5 backdrop-blur-sm">
            <p className="text-[11px] font-medium uppercase tracking-wider text-cyan-300">Projects</p>
            <p className="mt-1 text-2xl font-bold text-cyan-200">{stats.projects}</p>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pt-2">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {FILTER_TABS.map((tab) => {
              const active = selectedType === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setSelectedType(tab.value)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border border-cyan-400/30 bg-cyan-400/10 text-cyan-200 shadow-sm"
                      : "text-text-muted hover:bg-surface-2 hover:text-text-primary"
                  }`}
                >
                  <span className="text-[11px]">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search Input & Active Filter */}
          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search memories..."
                className="w-full rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 pl-8 text-xs text-text-primary placeholder:text-text-muted/60 focus:border-cyan-400 focus:outline-none"
              />
              <span className="absolute left-2.5 top-1.5 text-text-muted text-xs">⌕</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1.5 text-text-muted hover:text-text-primary text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="rounded accent-cyan-400 cursor-pointer"
              />
              <span>Active only</span>
            </label>
          </div>
        </div>

        {/* Memory Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 py-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-36 rounded-xl border border-border-subtle/50 bg-surface-1/40 animate-pulse"
              />
            ))}
          </div>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border-subtle bg-surface-1/40 p-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-xl text-cyan-300 mb-3">
              ◌
            </div>
            <h3 className="text-base font-semibold text-text-primary">
              {searchQuery ? "No matching memories found" : "No memories stored yet"}
            </h3>
            <p className="mt-1 max-w-sm text-xs text-text-muted">
              {searchQuery
                ? `No memories matched "${searchQuery}". Try a different search query or clear the filter.`
                : "TwinMind automatically extracts durable preferences, goals, and facts from conversations, or you can create one manually."}
            </p>
            {!searchQuery && (
              <Button
                className="mt-4"
                onClick={() => {
                  setEditingMemory(null);
                  setModalOpen(true);
                }}
              >
                + Create Your First Memory
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {memories.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                onEdit={(m) => {
                  setEditingMemory(m);
                  setModalOpen(true);
                }}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Creation & Edit Modal */}
      <MemoryModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingMemory(null);
        }}
        onSave={handleCreateOrUpdate}
        editingMemory={editingMemory}
      />

      {/* Privacy Settings Modal */}
      <MemoryPrivacyModal
        isOpen={privacyModalOpen}
        onClose={() => setPrivacyModalOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onClearAll={handleClearAll}
      />
    </WorkspaceShell>
  );
}
