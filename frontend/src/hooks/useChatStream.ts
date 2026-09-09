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
    async (content: string, modelId: string) => {
      if (!conversationId || !content.trim() || isStreaming) return;

      setError(null);
      setIsStreaming(true);
      setStreamingContent("");

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // Optimistic user message
      const tempUserMsg: Message = {
        id: `temp-user-${Date.now()}`,
        role: "USER",
        status: "COMPLETED",
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      let currentAssistantText = "";
      let currentCitations: Citation[] = [];

      try {
        const token = getAuthToken();
        const response = await fetch(
          `${API_BASE}/api/conversations/${conversationId}/messages`,
          {
            method: "POST",
            signal: abortController.signal,
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              content: content.trim(),
              model: modelId,
            }),
          },
        );

        if (!response.ok) {
          let errMsg = `Request failed (${response.status})`;
          try {
            const errData = await response.json();
            errMsg = errData.error || errData.message || errMsg;
          } catch {
            // response was not json
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

          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const block of parts) {
            if (!block.trim()) continue;

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

            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              if (event === "message_started") {
                if (data.userMessage) {
                  // Replace optimistic user message with server persisted one
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
                  setMessages((prev) => [...prev, finalMsg]);
                }
                setStreamingContent("");
              } else if (event === "error") {
                throw new Error(data.message || "An error occurred during streaming");
              }
            } catch (jsonErr: unknown) {
              const parseErr = jsonErr as { message?: string };
              if (parseErr?.message?.includes("streaming")) {
                throw jsonErr;
              }
              // Ignore partial JSON parse errors
            }
          }
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
          }
        } else {
          setError(errorObj?.message || "Failed to generate AI response.");
        }
      } finally {
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
