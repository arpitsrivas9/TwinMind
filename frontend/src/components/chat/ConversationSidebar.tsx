"use client";

import React, { useState, useEffect, useRef } from "react";
import { Conversation } from "../../lib/api";

type ConversationSidebarProps = {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onRenameConversation: (id: string, newTitle: string) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
  onSearch: (query: string) => void;
  loading?: boolean;
};

export function ConversationSidebar({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
  onSearch,
  loading = false,
}: ConversationSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onSearch(searchQuery);
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, onSearch]);

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveRename = async (id: string) => {
    if (!editTitle.trim() || editTitle.trim() === conversations.find((c) => c.id === id)?.title) {
      setEditingId(null);
      return;
    }
    try {
      await onRenameConversation(id, editTitle.trim());
    } finally {
      setEditingId(null);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
  };

  const confirmDelete = async (id: string) => {
    try {
      await onDeleteConversation(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border-subtle bg-surface-1/95">
      {/* Header & New Chat button */}
      <div className="p-3 border-b border-border-subtle">
        <button
          type="button"
          onClick={onNewConversation}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/30 px-4 py-2.5 text-xs font-semibold text-accent-cyan-strong transition-all hover:bg-accent-cyan/25 hover:border-accent-cyan/50 focus-visible:outline-2 focus-visible:outline-accent-cyan"
        >
          <span className="text-sm">＋</span>
          <span>New thought</span>
        </button>

        {/* Search input */}
        <div className="relative mt-2.5">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-md border border-border-subtle bg-surface-2 py-1.5 pl-8 pr-7 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-cyan focus:outline-none"
          />
          <span className="absolute left-2.5 top-2 text-xs text-text-muted" aria-hidden="true">
            ⌕
          </span>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1.5 text-xs text-text-muted hover:text-text-primary"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2/60" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-xs text-text-muted">
              {searchQuery ? "No matching conversations found" : "No conversations yet"}
            </p>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-2 text-xs font-medium text-accent-cyan hover:underline"
              >
                Clear filter
              </button>
            )}
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = conv.id === editingId;

            return (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`group relative flex cursor-pointer items-center justify-between rounded-lg p-2.5 transition-colors ${
                  isActive
                    ? "bg-accent-cyan/10 border border-accent-cyan/30 text-accent-cyan-strong"
                    : "hover:bg-surface-2 text-text-secondary hover:text-text-primary"
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editTitle}
                      autoFocus
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename(conv.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => handleSaveRename(conv.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full rounded border border-accent-cyan bg-surface-3 px-1.5 py-0.5 text-xs text-text-primary focus:outline-none"
                    />
                  ) : (
                    <>
                      <p className="truncate text-xs font-medium">{conv.title}</p>
                      <p className="mt-0.5 text-[10px] text-text-muted">
                        {new Date(conv.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </>
                  )}
                </div>

                {/* Actions (Rename / Delete) */}
                {!isEditing && (
                  <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => startRename(conv, e)}
                      title="Rename"
                      className="rounded p-1 text-xs text-text-muted hover:bg-surface-3 hover:text-text-primary"
                      aria-label="Rename conversation"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(conv.id, e)}
                      title="Delete"
                      className="rounded p-1 text-xs text-text-muted hover:bg-rose-500/20 hover:text-rose-400"
                      aria-label="Delete conversation"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-border-default bg-surface-1 p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-text-primary">Delete conversation?</h3>
            <p className="mt-2 text-xs text-text-secondary leading-relaxed">
              This will permanently delete this thought stream and all its messages. This action cannot be undone.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-3 hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => confirmDelete(deletingId)}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

