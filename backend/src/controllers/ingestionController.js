// src/controllers/ingestionController.js
// Receives inference logs from the frontend SDK and stores them via
// the ingestion service pipeline.

import { getStats, getModelBreakdown, getThroughput } from "../services/ingestionService.js";
import { addLogToQueue } from "../services/queueService.js";
import InferenceLog from "../models/InferenceLog.js";

/**
 * POST /api/ingest
 * Receive a single inference log from the client SDK.
 * The payload is pushed to an asynchronous event queue (Redis/BullMQ)
 * and processed in the background. Returns 202 Accepted immediately.
 */
export async function receiveLog(req, res, next) {
  try {
    const queueResult = await addLogToQueue(req.body);
    res.status(202).json({
      ok: true,
      message: "Log received and queued for asynchronous processing.",
      ...queueResult,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/ingest/logs
 * Return paginated logs for the logs table in the dashboard.
 * Supports ?page, ?limit, ?status, ?model query params.
 */
export async function getLogs(req, res, next) {
  try {
    const { page = 1, limit = 50, status, model, conversationId } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (model) filter.model = model;
    if (conversationId) filter.conversationId = conversationId;

    const [logs, total] = await Promise.all([
      InferenceLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      InferenceLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/ingest/stats
 * Aggregated stats: total requests, avg latency, P95, error rate, total tokens.
 * Supports ?model, ?provider, ?since query params.
 */
export async function getAggregatedStats(req, res, next) {
  try {
    const { model, provider, since } = req.query;
    const [stats, modelBreakdown, throughput] = await Promise.all([
      getStats({ model, provider, since }),
      getModelBreakdown(),
      getThroughput(),
    ]);

    res.json({ stats, modelBreakdown, throughput });
  } catch (err) {
    next(err);
  }
}
