// src/hooks/useConversations.js
// Custom hook that owns all conversation state and backend communication.
// Keeps the App component clean — it just renders, this hook does the work.

import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchConversations,
  createConversation,
  fetchConversation,
  cancelConversationAPI,
  deleteConversationAPI,
  sendMessageStream,
} from "../api/client.js";
import { logger } from "../sdk/inferenceLogger.js";

export function useConversations() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [activeMessages, setActiveMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const activeConv = conversations.find((c) => c._id === activeConvId);

  // Load conversation list on mount
  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    try {
      setLoading(true);
      const data = await fetchConversations();
      setConversations(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // When the active conversation changes, load its full messages
  useEffect(() => {
    if (!activeConvId) {
      setActiveMessages([]);
      return;
    }
    loadConversationMessages(activeConvId);
  }, [activeConvId]);

  async function loadConversationMessages(id) {
    try {
      const data = await fetchConversation(id);
      setActiveMessages(data.messages || []);
    } catch (err) {
      console.error("Failed to load messages:", err.message);
    }
  }

  const startNewConversation = useCallback(async (model) => {
    try {
      const conv = await createConversation(model);
      setConversations((prev) => [conv, ...prev]);
      setActiveConvId(conv._id);
      setActiveMessages([]);
      return conv;
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const selectConversation = useCallback((id) => {
    setActiveConvId(id);
  }, []);

  const cancelConversation = useCallback(async () => {
    // Abort the in-flight stream
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
    setStreamBuffer("");

    if (activeConvId) {
      try {
        const updated = await cancelConversationAPI(activeConvId);
        setConversations((prev) =>
          prev.map((c) => (c._id === activeConvId ? { ...c, status: "cancelled" } : c))
        );
      } catch (err) {
        console.warn("Cancel API call failed:", err.message);
      }
    }
  }, [activeConvId]);

  const deleteConversation = useCallback(async (id) => {
    try {
      await deleteConversationAPI(id);
      setConversations((prev) => prev.filter((c) => c._id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
        setActiveMessages([]);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [activeConvId]);

  const sendMessage = useCallback(
    async (content, model) => {
      if (!content.trim() || streaming) return;

      let convId = activeConvId;

      // Auto-create a conversation if none is active
      if (!convId) {
        try {
          const conv = await createConversation(model);
          convId = conv._id;
          setConversations((prev) => [conv, ...prev]);
          setActiveConvId(conv._id);
        } catch (err) {
          setError(err.message);
          return;
        }
      }

      // Optimistically append the user message to the UI
      const userMsg = { role: "user", content, _id: `temp_${Date.now()}` };
      setActiveMessages((prev) => [...prev, userMsg]);
      setStreaming(true);
      setStreamBuffer("");

      // Start trace for logging
      const provider = model.startsWith("gemini")
        ? "google"
        : model.startsWith("claude")
        ? "anthropic"
        : "openai";
      const trace = logger.startTrace(convId, provider, model);

      const controller = new AbortController();
      abortRef.current = controller;

      let fullText = "";
      try {
        const result = await sendMessageStream(
          convId,
          content,
          model,
          (chunk) => {
            fullText += chunk;
            setStreamBuffer((prev) => prev + chunk);
          },
          controller.signal
        );

        // Commit assistant message to state
        const assistantMsg = {
          role: "assistant",
          content: fullText,
          _id: `temp_assistant_${Date.now()}`,
        };
        setActiveMessages((prev) => [...prev, assistantMsg]);

        // Update conversation title if this was the first message
        setConversations((prev) =>
          prev.map((c) =>
            c._id === convId && c.title === "New conversation"
              ? { ...c, title: content.slice(0, 60) }
              : c
          )
        );

        // Log the successful trace
        logger.endTrace(trace, {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          inputPreview: content.slice(0, 200),
          outputPreview: fullText.slice(0, 200),
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          const cleanErrorMessage = err.message.includes("429")
            ? "Rate limit exceeded. Please wait and try again."
            : "Something went wrong while generating response.";

          const errMsg = {
            role: "assistant",
            content: `Error: ${cleanErrorMessage}`,
            _id: `temp_err_${Date.now()}`,
            error: true,
          };
          if (fullText.trim()) {
            const assistantMsg = {
              role: "assistant",
              content: fullText,
              _id: `temp_assistant_${Date.now()}`,
            };
            setActiveMessages((prev) => [...prev, assistantMsg, errMsg]);
            logger.endTrace(trace, {
              error: err.message,
              inputPreview: content.slice(0, 200),
              outputPreview: fullText.slice(0, 200),
            });
          } else {
            setActiveMessages((prev) => [...prev, errMsg]);
            logger.endTrace(trace, { error: err.message, inputPreview: content.slice(0, 200) });
          }
        }
      } finally {
        setStreaming(false);
        setStreamBuffer("");
        abortRef.current = null;
      }
    },
    [activeConvId, streaming]
  );

  return {
    conversations,
    activeConv,
    activeConvId,
    activeMessages,
    streaming,
    streamBuffer,
    loading,
    error,
    startNewConversation,
    selectConversation,
    cancelConversation,
    deleteConversation,
    sendMessage,
  };
}
