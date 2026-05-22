// src/sdk/inferenceLogger.js
// Client-side logging SDK.
// Captures timing, token usage, and metadata for every LLM request,
// then ships the log to the backend ingestion endpoint.
//
// The SDK is intentionally decoupled from the UI — it only cares about
// start/end trace and sending to the backend. UI stats are derived from
// the same events via a subscriber pattern.

import { sendLog } from "../api/client.js";

class InferenceLogger {
  constructor() {
    // In-memory log store (capped at 200 entries for the local dashboard view)
    this.logs = [];
    // Subscriber functions called on each new log (e.g. to update React state)
    this.listeners = [];
  }

  /**
   * Start a trace. Call this before the LLM request.
   * @returns {object} trace object — pass to endTrace()
   */
  startTrace(conversationId, provider, model) {
    return {
      conversationId,
      provider,
      model,
      requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      startTime: performance.now(), // high-resolution timer for latency
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * End a trace and send the log to the backend.
   * @param {object} trace   - Object returned by startTrace()
   * @param {object} result  - { inputTokens, outputTokens, inputPreview, outputPreview, error }
   */
  endTrace(trace, result) {
    const latency = Math.round(performance.now() - trace.startTime);

    const log = {
      conversationId: trace.conversationId,
      requestId: trace.requestId,
      provider: trace.provider,
      model: trace.model,
      latency,
      status: result.error ? "error" : "success",
      error: result.error || null,
      inputTokens: result.inputTokens || 0,
      outputTokens: result.outputTokens || 0,
      inputPreview: (result.inputPreview || "").slice(0, 200),
      outputPreview: (result.outputPreview || "").slice(0, 200),
      timestamp: trace.timestamp,
      endTime: new Date().toISOString(),
    };

    // Update in-memory store (for local dashboard)
    this.logs = [log, ...this.logs].slice(0, 200);

    // Notify subscribers (React state updates)
    this.listeners.forEach((fn) => fn(log));

    // Fire-and-forget to backend — errors are swallowed so UI never breaks
    sendLog(log);

    return log;
  }

  /** Subscribe to new logs. Returns an unsubscribe function. */
  subscribe(fn) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  /** Compute aggregate stats from the in-memory log store. */
  getLocalStats() {
    const total = this.logs.length;
    if (total === 0) return null;

    const errors = this.logs.filter((l) => l.status === "error").length;
    const successes = this.logs.filter((l) => l.status === "success");

    const avgLatency =
      successes.length > 0
        ? Math.round(successes.reduce((s, l) => s + l.latency, 0) / successes.length)
        : 0;

    const totalTokens = this.logs.reduce((s, l) => s + l.inputTokens + l.outputTokens, 0);

    const sortedLatencies = [...successes].map((l) => l.latency).sort((a, b) => a - b);
    const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;

    return {
      total,
      errors,
      errorRate: ((errors / total) * 100).toFixed(1),
      avgLatency,
      p95,
      totalTokens,
    };
  }
}

// Export a singleton so the whole app shares one instance
export const logger = new InferenceLogger();
