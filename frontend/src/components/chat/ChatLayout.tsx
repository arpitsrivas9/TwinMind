"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Conversation,
  listConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  listMessages,
  searchConversations,
} from "../../lib/api";
import { useChatStream } from "../../hooks/useChatStream";
import { safeStorage, STORAGE_KEYS } from "../../lib/storage";
import { ConversationSidebar } from "./ConversationSidebar";
import { ChatArea } from "./ChatArea";
import { MessageInput } from "./MessageInput";

const DEFAULT_SIDEBAR_WIDTH = 300;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 520;

export function ChatLayout() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    safeStorage.getString(STORAGE_KEYS.LAST_MODEL, "gemini-3.6-flash"),
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    safeStorage.get(STORAGE_KEYS.SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH),
  );
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    messages,
    setMessages,
    isStreaming,
    streamingContent,
    error,
    setError,
    sendMessage,
    abortStream,
    regenerateLast,
  } = useChatStream(activeConversationId);

  // Model selection with safeStorage persistence
  const handleSelectModel = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    safeStorage.set(STORAGE_KEYS.LAST_MODEL, modelId);
  }, []);

  // Resizable sidebar dragging handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleTouchStart = () => {
    setIsDragging(true);
  };

  const handleDividerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSidebarWidth((w) => {
        const next = Math.max(MIN_SIDEBAR_WIDTH, w - 10);
        safeStorage.set(STORAGE_KEYS.SIDEBAR_WIDTH, next);
        return next;
      });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSidebarWidth((w) => {
        const next = Math.min(MAX_SIDEBAR_WIDTH, w + 10);
        safeStorage.set(STORAGE_KEYS.SIDEBAR_WIDTH, next);
        return next;
      });
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const newWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, clientX - containerRect.left),
      );
      setSidebarWidth(newWidth);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      setSidebarWidth((latest) => {
        safeStorage.set(STORAGE_KEYS.SIDEBAR_WIDTH, latest);
        return latest;
      });
    };

    document.addEventListener("mousemove", handlePointerMove);
    document.addEventListener("mouseup", handlePointerUp);
    document.addEventListener("touchmove", handlePointerMove);
    document.addEventListener("touchend", handlePointerUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", handlePointerMove);
      document.removeEventListener("mouseup", handlePointerUp);
      document.removeEventListener("touchmove", handlePointerMove);
      document.removeEventListener("touchend", handlePointerUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging]);

  // Load conversations helper
  const refreshConversations = useCallback(async () => {
    try {
      const list = await listConversations();
      setConversations(list);
      return list;
    } catch {
      // Unauthenticated or network issue
      return [];
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  // Initial load on mount
  useEffect(() => {
    let ignore = false;
    const fetchInitial = async () => {
      try {
        const list = await listConversations();
        if (!ignore) {
          setConversations(list);
          setActiveConversationId((current) => current || (list.length > 0 ? list[0].id : null));
        }
      } catch {
        // Unauthenticated or network issue
      } finally {
        if (!ignore) setLoadingConversations(false);
      }
    };
    fetchInitial();
    return () => {
      ignore = true;
    };
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    let mounted = true;
    async function fetchMsgs() {
      setLoadingMessages(true);
      try {
        const history = await listMessages(activeConversationId!);
        if (mounted) {
          setMessages(history);
        }
      } catch (err: unknown) {
        if (mounted) {
          const message = err instanceof Error ? err.message : "Failed to load conversation history";
          setError(message);
        }
      } finally {
        if (mounted) setLoadingMessages(false);
      }
    }

    fetchMsgs();
    return () => {
      mounted = false;
    };
  }, [activeConversationId, setMessages, setError]);

  // Handle Search
  const handleSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        refreshConversations();
        return;
      }
      setLoadingConversations(true);
      try {
        const results = await searchConversations(query);
        setConversations(results);
      } catch {
        // Search error
      } finally {
        setLoadingConversations(false);
      }
    },
    [refreshConversations],
  );

  // Handle New Conversation
  const handleNewConversation = async () => {
    try {
      const newConv = await createConversation("New thought");
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setMessages([]);
      setMobileSidebarOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not create new conversation";
      setError(message);
    }
  };

  // Handle Rename
  const handleRename = async (id: string, newTitle: string) => {
    try {
      const updated = await renameConversation(id, newTitle);
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c)),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not rename conversation";
      setError(message);
    }
  };

  // Handle Delete
  const handleDelete = async (id: string) => {
    try {
      await deleteConversation(id);
      const remaining = conversations.filter((c) => c.id !== id);
      setConversations(remaining);
      if (activeConversationId === id) {
        setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not delete conversation";
      setError(message);
    }
  };

  // Handle sending message with attachment and direct conversation targeting
  const handleSendMessage = async (
    content: string,
    modelId: string,
    attachmentFile?: File,
  ) => {
    let targetConvId = activeConversationId;

    // If no active conversation, create one first
    if (!targetConvId) {
      try {
        const initialTitle = content.trim()
          ? content.length > 60
            ? `${content.slice(0, 57)}…`
            : content.trim()
          : attachmentFile
          ? `File: ${attachmentFile.name}`
          : "New thought";
        const newConv = await createConversation(initialTitle);
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(newConv.id);
        targetConvId = newConv.id;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to initialize conversation";
        setError(message);
        return;
      }
    }

    // Pass targetConvId directly to bypass stale closure
    await sendMessage(content, modelId, targetConvId, attachmentFile);

    // Refresh conversation list to get updated titles/timestamps
    setTimeout(() => {
      refreshConversations();
    }, 1000);
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-[calc(100vh-4rem)] w-full overflow-hidden rounded-2xl border border-border-subtle bg-surface-1/70 shadow-2xl backdrop-blur-md"
    >
      {/* Mobile sidebar toggle overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Mobile Drawer (screens < md) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform transition-transform duration-200 md:hidden ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <ConversationSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={(id) => {
            setActiveConversationId(id);
            setMobileSidebarOpen(false);
          }}
          onNewConversation={handleNewConversation}
          onRenameConversation={handleRename}
          onDeleteConversation={handleDelete}
          onSearch={handleSearch}
          loading={loadingConversations}
        />
      </div>

      {/* Desktop Resizable Sidebar (screens >= md) */}
      <div
        style={{ width: `${sidebarWidth}px` }}
        className="hidden md:flex h-full shrink-0 overflow-hidden"
      >
        <ConversationSidebar
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={setActiveConversationId}
          onNewConversation={handleNewConversation}
          onRenameConversation={handleRename}
          onDeleteConversation={handleDelete}
          onSearch={handleSearch}
          loading={loadingConversations}
        />
      </div>

      {/* Draggable Divider Handle between Sidebar and Chat (Desktop) */}
      <div
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        aria-valuenow={sidebarWidth}
        aria-valuemin={MIN_SIDEBAR_WIDTH}
        aria-valuemax={MAX_SIDEBAR_WIDTH}
        aria-label="Resize conversation sidebar"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onKeyDown={handleDividerKeyDown}
        className={`group relative hidden md:flex w-2.5 shrink-0 cursor-col-resize items-center justify-center transition-colors focus-visible:outline-none select-none z-10 ${
          isDragging
            ? "bg-accent-cyan/30"
            : "bg-transparent hover:bg-surface-2"
        }`}
      >
        <div
          className={`h-12 w-1 rounded-full transition-all ${
            isDragging
              ? "bg-accent-cyan shadow-[0_0_10px_rgba(34,211,238,0.8)] scale-y-110"
              : "bg-border-subtle group-hover:bg-accent-cyan/70 group-hover:shadow-[0_0_6px_rgba(34,211,238,0.4)]"
          }`}
        />
      </div>

      {/* Chat workspace */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Top bar for mobile trigger & active conversation title */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4 bg-surface-1/80">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="rounded p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary md:hidden"
              aria-label="Open conversation sidebar"
            >
              ☰
            </button>
            <span className="truncate text-xs font-semibold text-text-primary">
              {conversations.find((c) => c.id === activeConversationId)?.title ||
                "TwinMind Thought Stream"}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-accent-cyan">
              <span className="size-1.5 rounded-full bg-accent-cyan animate-pulse" />
              Phase 2 Active
            </span>
          </div>
        </div>

        {/* Messages feed */}
        <ChatArea
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          streamingModel={selectedModel}
          error={error}
          onClearError={() => setError(null)}
          onRegenerate={() => regenerateLast(selectedModel)}
          onPromptClick={(prompt) => handleSendMessage(prompt, selectedModel)}
          loadingMessages={loadingMessages}
        />

        {/* Input */}
        <MessageInput
          onSend={handleSendMessage}
          onAbort={abortStream}
          isStreaming={isStreaming}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
        />
      </div>
    </div>
  );
}
