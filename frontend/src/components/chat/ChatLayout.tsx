"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
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
import { useCognitiveActivity } from "../../context/CognitiveContext";
import { useTwinVoice } from "../../context/VoiceContext";
import { useWorkspace, isValidTab } from "../../context/WorkspaceContext";
import { AIStateIndicator } from "../motion/AIStateIndicator";

export function ChatLayout() {
  const { startThinking, setIdle, triggerSuccess, triggerError } = useCognitiveActivity();
  const { switchTab } = useWorkspace();
  const {
    openVoiceModal,
    registerChatHandlers,
    unregisterChatHandlers,
    feedStreamDeltaToVoice,
    setTurnLanguageVoice,
    finishStreamVoice,
    settings: voiceSettings,
  } = useTwinVoice();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(() =>
    safeStorage.getString(STORAGE_KEYS.LAST_MODEL, "gemini-3.7-flash"),
  );
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

  // Model selection with safeStorage persistence
  const handleSelectModel = useCallback((modelId: string) => {
    setSelectedModel(modelId);
    safeStorage.set(STORAGE_KEYS.LAST_MODEL, modelId);
  }, []);

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
  const handleNewConversation = useCallback(async () => {
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
  }, [setMessages, setError]);

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
  const handleSendMessage = useCallback(
    async (
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
      try {
        startThinking();
        await sendMessage(content, modelId, targetConvId, attachmentFile, {
          language: voiceSettings.language,
          speakingStyle: voiceSettings.speakingStyle,
          onMessageStarted: (data) => {
            if (data.resolvedLanguage) {
              const target = data.resolvedLanguage === "hi" ? "hi" : data.resolvedLanguage === "hinglish" ? "en-IN" : "en";
              setTurnLanguageVoice(target);
            }
          },
        });
        triggerSuccess();
      } catch {
        triggerError();
      } finally {
        setTimeout(() => setIdle(), 2500);
      }

      // Refresh conversation list to get updated titles/timestamps
      setTimeout(() => {
        refreshConversations();
      }, 1000);
    },
    [
      activeConversationId,
      sendMessage,
      voiceSettings.language,
      voiceSettings.speakingStyle,
      setTurnLanguageVoice,
      startThinking,
      triggerSuccess,
      triggerError,
      setIdle,
      refreshConversations,
      setError,
    ],
  );

  // Bridge real-time streaming text deltas to TwinVoice speech synthesizer
  const lastStreamIndexRef = useRef(0);
  useEffect(() => {
    if (isStreaming) {
      const delta = streamingContent.slice(lastStreamIndexRef.current);
      if (delta) {
        lastStreamIndexRef.current = streamingContent.length;
        feedStreamDeltaToVoice(delta);
      }
    } else {
      if (lastStreamIndexRef.current > 0) {
        finishStreamVoice();
        lastStreamIndexRef.current = 0;
      }
    }
  }, [isStreaming, streamingContent, feedStreamDeltaToVoice, finishStreamVoice]);

  // Register chat handlers with VoiceContext for full voice control
  useEffect(() => {
    registerChatHandlers({
      sendChatMessage: async (content, file) => {
        await handleSendMessage(content, selectedModel, file);
      },
      abortChatStream: () => {
        abortStream();
      },
      createNewConversation: async () => {
        await handleNewConversation();
      },
      navigateTab: (tab) => {
        if (isValidTab(tab)) {
          switchTab(tab);
        }
      },
      getLastAssistantMessage: () => {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "ASSISTANT") {
            return messages[i].content;
          }
        }
        return null;
      },
    });

    return () => {
      unregisterChatHandlers();
    };
  }, [
    registerChatHandlers,
    unregisterChatHandlers,
    handleSendMessage,
    handleNewConversation,
    selectedModel,
    messages,
    abortStream,
    switchTab,
    activeConversationId,
    conversations,
  ]);

  return (
    <div className="relative flex h-[calc(100vh-4rem)] w-full overflow-hidden rounded-2xl border border-border-subtle bg-surface-1/70 shadow-2xl backdrop-blur-md">
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

      {/* Desktop Conversation Sidebar (Fixed width) */}
      <div className="hidden md:flex h-full w-72 shrink-0 border-r border-border-subtle">
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
            {/* TwinVoice HUD Launcher Button */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={openVoiceModal}
              className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-2.5 py-1 text-xs font-mono text-cyan-300 hover:border-cyan-400 hover:bg-cyan-900/50 hover:shadow-[0_0_12px_rgba(6,182,212,0.25)] transition-all"
              title="Open dedicated TwinVoice™ HUD (voice conversation mode)"
            >
              <span className="text-sm">🎙️</span>
              <span className="hidden sm:inline font-semibold">TwinVoice™</span>
            </motion.button>
            <AIStateIndicator forceState={isStreaming ? "streaming" : "idle"} />
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
