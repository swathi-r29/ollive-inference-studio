// src/api/client.js
// Centralised API client for all backend calls.
// API key is NEVER touched here — it lives only in the backend .env

const getApiUrl = () => {
  const url = import.meta.env.VITE_API_URL;
  if (!url) return "/api";
  return url.endsWith("/api") ? url : `${url}/api`;
};
const BASE = getApiUrl();

// ─── Conversations ────────────────────────────────────────────────────────────

export async function fetchConversations() {
  const res = await fetch(`${BASE}/conversations`);
  if (!res.ok) throw new Error(`Failed to fetch conversations: ${res.statusText}`);
  return res.json();
}

export async function createConversation(model, provider = "google") {
  const res = await fetch(`${BASE}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, provider }),
  });
  if (!res.ok) throw new Error(`Failed to create conversation: ${res.statusText}`);
  return res.json();
}

export async function fetchConversation(id) {
  const res = await fetch(`${BASE}/conversations/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch conversation: ${res.statusText}`);
  return res.json();
}

export async function cancelConversationAPI(id) {
  const res = await fetch(`${BASE}/conversations/${id}/cancel`, { method: "PATCH" });
  if (!res.ok) throw new Error(`Failed to cancel conversation: ${res.statusText}`);
  return res.json();
}

export async function deleteConversationAPI(id) {
  const res = await fetch(`${BASE}/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete conversation: ${res.statusText}`);
  return res.json();
}

// ─── Streaming chat ───────────────────────────────────────────────────────────

/**
 * Send a message and stream the response via SSE.
 *
 * @param {string}   conversationId
 * @param {string}   content        - User message text
 * @param {string}   model          - Model ID
 * @param {Function} onChunk        - Called with each text delta
 * @param {AbortSignal} signal      - AbortController signal for cancellation
 * @returns {{ inputTokens, outputTokens }}
 */
export async function sendMessageStream(conversationId, content, model, onChunk, signal) {
  const res = await fetch(`${BASE}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, model }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }

  // Read SSE stream
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last incomplete line in the buffer
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json) continue;
      try {
        const event = JSON.parse(json);
        if (event.type === "delta") {
          onChunk(event.text);
        } else if (event.type === "done") {
          inputTokens = event.inputTokens;
          outputTokens = event.outputTokens;
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      } catch (e) {
        if (e.message !== "Unexpected end of JSON input") {
          throw e;
        }
      }
    }
  }

  return { inputTokens, outputTokens };
}

// ─── Ingestion ────────────────────────────────────────────────────────────────

export async function sendLog(log) {
  try {
    const res = await fetch(`${BASE}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log),
    });
    if (!res.ok) console.warn("[SDK] Ingest returned", res.status);
  } catch (err) {
    // Fire-and-forget: never let logging failures break the UI
    console.warn("[SDK] Ingest failed:", err.message);
  }
}

export async function fetchStats(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/ingest/stats${qs ? "?" + qs : ""}`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function fetchLogs(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/ingest/logs${qs ? "?" + qs : ""}`);
  if (!res.ok) throw new Error("Failed to fetch logs");
  return res.json();
}
