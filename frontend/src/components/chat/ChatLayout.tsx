"use client";

import React, { useState, useEffect, useCallback } from "react";
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
import { ConversationSidebar } from "./ConversationSidebar";
import { ChatArea } from "./ChatArea";
import { MessageInput } from "./MessageInput";

export function ChatLayout() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>("gpt-4o-mini");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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

  // Handle sending message
  const handleSendMessage = async (content: string, modelId: string) => {
    let targetConvId = activeConversationId;

    // If no active conversation, create one first
    if (!targetConvId) {
      try {
        const initialTitle = content.length > 60 ? `${content.slice(0, 57)}…` : content;
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

    await sendMessage(content, modelId);
    // Refresh conversation list to get auto-generated title and updated timestamp
    setTimeout(() => {
      refreshConversations();
    }, 1000);
  };

  return (
    <div className="relative flex h-[calc(100vh-4rem)] w-full overflow-hidden rounded-2xl border border-border-subtle bg-surface-1/70 shadow-2xl backdrop-blur-md">
      {/* Mobile sidebar toggle overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar (Desktop & Mobile Drawer) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 md:static md:z-auto md:transform-none ${
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
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

      {/* Chat workspace */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar for mobile trigger & active conversation title */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle px-4 bg-surface-1/80">
          <div className="flex items-center gap-2">
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

          <div className="flex items-center gap-2">
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
          onSelectModel={setSelectedModel}
        />
      </div>
    </div>
  );
}
