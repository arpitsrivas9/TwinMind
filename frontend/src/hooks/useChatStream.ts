"use client";

import { useCallback, useRef, useState } from "react";
import { Message, Citation, getAuthToken } from "../lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function useChatStream(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (
      content: string,
      modelId: string,
      overrideConversationId?: string,
      attachmentFile?: File,
      options?: {
        language?: string;
        speakingStyle?: string;
        onMessageStarted?: (data: { resolvedLanguage?: string; resolvedScript?: string }) => void;
      },
    ) => {
      const targetConvId = overrideConversationId || conversationId;
      if (!targetConvId || (!content.trim() && !attachmentFile) || isStreaming) return;

      setError(null);
      setIsStreaming(true);
      setStreamingContent("");

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Display optimistic user message
      const displayContent = attachmentFile
        ? content.trim()
          ? `[Attachment: ${attachmentFile.name}]\n\n${content.trim()}`
          : `[Attachment: ${attachmentFile.name}]`
        : content.trim();

      const tempUserMsg: Message = {
        id: `temp-user-${Date.now()}`,
        role: "USER",
        status: "COMPLETED",
        content: displayContent,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      let currentAssistantText = "";
      let currentCitations: Citation[] = [];
      let assistantMessageAdded = false;

      const processBlock = (block: string) => {
        if (!block.trim()) return;

        let event = "message";
        let dataStr = "";

        const lines = block.split("\n");
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            event = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataStr = line.slice(6).trim();
          }
        }

        if (!dataStr) return;

        try {
          const data = JSON.parse(dataStr);

          if (event === "message_started") {
            if (options?.onMessageStarted && data?.resolvedLanguage) {
              options.onMessageStarted({
                resolvedLanguage: data.resolvedLanguage,
                resolvedScript: data.resolvedScript,
              });
            }
            if (data.userMessage) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempUserMsg.id ? data.userMessage : m,
                ),
              );
            }
          } else if (event === "citations") {
            if (Array.isArray(data.citations)) {
              currentCitations = data.citations;
            }
          } else if (event === "delta") {
            currentAssistantText += data.text || "";
            setStreamingContent(currentAssistantText);
          } else if (event === "message_completed") {
            if (data.message) {
              const finalMsg: Message = {
                ...data.message,
                citations: data.message.citations || currentCitations,
              };
              setMessages((prev) => {
                const filtered = prev.filter((m) => m.id !== tempUserMsg.id);
                return [...filtered, finalMsg];
              });
              assistantMessageAdded = true;
            }
          } else if (event === "error") {
            setError(data.message || "An error occurred during generation");
          }
        } catch {
          // Ignore JSON parse errors for incomplete streaming events
        }
      };

      try {
        const token = getAuthToken();
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};

        let body: BodyInit;
        if (attachmentFile) {
          const formData = new FormData();
          formData.append("content", content.trim());
          formData.append("model", modelId);
          formData.append("file", attachmentFile);
          if (options?.language) formData.append("language", options.language);
          if (options?.speakingStyle) formData.append("speakingStyle", options.speakingStyle);
          body = formData;
        } else {
          headers["Content-Type"] = "application/json";
          body = JSON.stringify({
            content: content.trim(),
            model: modelId,
            language: options?.language || "auto",
            speakingStyle: options?.speakingStyle || "conversational",
          });
        }

        const response = await fetch(
          `${API_BASE}/api/conversations/${targetConvId}/messages`,
          {
            method: "POST",
            signal: abortController.signal,
            headers,
            body,
          },
        );

        if (!response.ok) {
          let errMsg = `Request failed (${response.status})`;
          try {
            const errData = await response.json();
            errMsg = errData.error || errData.message || errMsg;
          } catch {
            // Response was not JSON
          }
          throw new Error(errMsg);
        }

        if (!response.body) {
          throw new Error("No response body received from server");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const block of parts) {
            processBlock(block);
          }
        }

        // Process any remaining chunk left in buffer when stream closes
        if (buffer.trim()) {
          processBlock(buffer);
        }
      } catch (err: unknown) {
        const errorObj = err as { name?: string; message?: string };
        if (errorObj?.name === "AbortError") {
          // If aborted by user and partial content was generated, keep what we got
          if (currentAssistantText) {
            const abortedMsg: Message = {
              id: `aborted-${Date.now()}`,
              role: "ASSISTANT",
              status: "COMPLETED",
              content: currentAssistantText,
              model: modelId,
              createdAt: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, abortedMsg]);
            assistantMessageAdded = true;
          }
        } else {
          setError(errorObj?.message || "Failed to generate AI response.");
        }
      } finally {
        // Fallback safeguard: If response was streamed but message_completed event was dropped,
        // guarantee the generated message persists in messages state so it never vanishes from UI!
        if (!assistantMessageAdded && currentAssistantText.trim()) {
          const fallbackMsg: Message = {
            id: `assistant-completed-${Date.now()}`,
            role: "ASSISTANT",
            status: "COMPLETED",
            content: currentAssistantText,
            model: modelId,
            citations: currentCitations.length > 0 ? currentCitations : undefined,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, fallbackMsg]);
        }
        setIsStreaming(false);
        setStreamingContent("");
        abortControllerRef.current = null;
      }
    },
    [conversationId, isStreaming],
  );

  const regenerateLast = useCallback(
    async (modelId: string) => {
      if (messages.length === 0 || isStreaming) return;

      // Find the last user message
      let lastUserMsgIndex = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === "USER") {
          lastUserMsgIndex = i;
          break;
        }
      }

      if (lastUserMsgIndex === -1) return;

      const lastUserContent = messages[lastUserMsgIndex].content;
      // Remove any subsequent assistant messages
      setMessages((prev) => prev.slice(0, lastUserMsgIndex));
      await sendMessage(lastUserContent, modelId);
    },
    [messages, isStreaming, sendMessage],
  );

  return {
    messages,
    setMessages,
    isStreaming,
    streamingContent,
    error,
    setError,
    sendMessage,
    abortStream,
    regenerateLast,
  };
}
