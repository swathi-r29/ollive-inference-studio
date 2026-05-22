// src/services/ingestionService.js
// The ingestion pipeline lives here.
//
// Flow:
//   Frontend SDK  →  POST /api/ingest  →  ingestionService  →  MongoDB
//
// Steps:
//   1. Validate the incoming payload (required fields, types)
//   2. PII redact input/output previews
//   3. Extract and normalise metadata
//   4. Write to InferenceLog collection
//   5. Update the parent Conversation's totalTokens counter
//
// This is intentionally synchronous (awaited) so the DB write happens before
// the 200 response. For higher throughput, swap to a queue (Redis + BullMQ)
// and respond 202 immediately, processing in a worker.

import InferenceLog from "../models/InferenceLog.js";
import Conversation from "../models/Conversation.js";
import { redactLogPII } from "../utils/piiRedactor.js";

/**
 * Validate that required fields exist and have correct types.
 * Returns { valid: bool, errors: string[] }
 */
function validatePayload(payload) {
  const errors = [];
  const required = ["conversationId", "requestId", "model", "provider", "latency", "status"];

  for (const field of required) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === "") {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (payload.latency !== undefined && (typeof payload.latency !== "number" || payload.latency < 0)) {
    errors.push("latency must be a non-negative number");
  }

  if (payload.status && !["success", "error", "cancelled"].includes(payload.status)) {
    errors.push("status must be success | error | cancelled");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Ingest a single inference log record.
 * @param {object} rawPayload - Log data from the frontend SDK
 * @returns {Promise<InferenceLog>} - The saved document
 */
export async function ingestLog(rawPayload) {
  // Step 1: Validate
  const { valid, errors } = validatePayload(rawPayload);
  if (!valid) {
    const err = new Error("Payload validation failed: " + errors.join(", "));
    err.statusCode = 400;
    throw err;
  }

  // Step 2: PII redaction on previews
  const redacted = redactLogPII({
    inputPreview: (rawPayload.inputPreview || "").slice(0, 200),
    outputPreview: (rawPayload.outputPreview || "").slice(0, 200),
  });

  // Step 3: Build the normalised document
  const totalTokens = (rawPayload.inputTokens || 0) + (rawPayload.outputTokens || 0);

  const logDoc = new InferenceLog({
    conversationId: rawPayload.conversationId,
    requestId: rawPayload.requestId,
    model: rawPayload.model,
    provider: rawPayload.provider,
    latency: rawPayload.latency,
    inputTokens: rawPayload.inputTokens || 0,
    outputTokens: rawPayload.outputTokens || 0,
    totalTokens,
    status: rawPayload.status,
    error: rawPayload.error || null,
    inputPreview: redacted.inputPreview,
    outputPreview: redacted.outputPreview,
    piiDetected: redacted.piiDetected,
    clientTimestamp: rawPayload.timestamp,
  });

  // Step 4: Save the log
  await logDoc.save();

  // Step 5: Update conversation's total token counter (non-blocking update)
  // Using $inc avoids a read-modify-write race condition
  if (totalTokens > 0) {
    await Conversation.findByIdAndUpdate(rawPayload.conversationId, {
      $inc: { totalTokens },
    }).catch((e) => console.warn("[Ingestion] Failed to update conversation tokens:", e.message));
  }

  return logDoc;
}

/**
 * Get aggregated stats for the dashboard.
 * Uses MongoDB aggregation pipeline for efficiency.
 */
export async function getStats({ model, provider, since } = {}) {
  const match = {};
  if (model) match.model = model;
  if (provider) match.provider = provider;
  if (since) match.createdAt = { $gte: new Date(since) };

  const [result] = await InferenceLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        errors: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
        avgLatency: { $avg: "$latency" },
        totalTokens: { $sum: "$totalTokens" },
        latencies: { $push: "$latency" },
      },
    },
    {
      $project: {
        _id: 0,
        total: 1,
        errors: 1,
        avgLatency: { $round: ["$avgLatency", 0] },
        totalTokens: 1,
        // Error rate as a percentage
        errorRate: {
          $round: [{ $multiply: [{ $divide: ["$errors", { $max: ["$total", 1] }] }, 100] }, 1],
        },
        latencies: 1,
      },
    },
  ]);

  if (!result) return { total: 0, errors: 0, avgLatency: 0, totalTokens: 0, errorRate: 0, p95: 0 };

  // P95 latency — MongoDB doesn't have a percentile aggregation in older versions
  // so we compute it in JS from the collected array
  const sorted = (result.latencies || []).sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  result.p95 = sorted[p95Index] || 0;
  delete result.latencies;

  return result;
}

/**
 * Get per-model breakdown for the dashboard.
 */
export async function getModelBreakdown() {
  return InferenceLog.aggregate([
    {
      $group: {
        _id: { model: "$model", provider: "$provider" },
        count: { $sum: 1 },
        avgLatency: { $avg: "$latency" },
        totalTokens: { $sum: "$totalTokens" },
        errors: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
      },
    },
    { $sort: { count: -1 } },
  ]);
}

/**
 * Get hourly throughput for the last 24 hours.
 */
export async function getThroughput() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return InferenceLog.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: {
          hour: { $dateToString: { format: "%Y-%m-%dT%H:00", date: "$createdAt" } },
        },
        count: { $sum: 1 },
        avgLatency: { $avg: "$latency" },
        errors: { $sum: { $cond: [{ $eq: ["$status", "error"] }, 1, 0] } },
      },
    },
    { $sort: { "_id.hour": 1 } },
  ]);
}
