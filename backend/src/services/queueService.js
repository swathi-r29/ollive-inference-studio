// src/services/queueService.js
// Event-based log ingestion service.
// Uses BullMQ + Redis for robust, asynchronous, retryable queuing.
// Falls back gracefully to an in-memory event bus if Redis is unavailable.

import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import EventEmitter from "events";
import { ingestLog } from "./ingestionService.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let logQueue = null;
let isRedisAvailable = false;
const fallbackEmitter = new EventEmitter();

// Initialize the queue service
export function initQueueService() {
  console.log("[QueueService] Initializing Log Ingestion Queue...");

  try {
    const redisOptions = {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false, // Don't buffer commands offline to fail fast if Redis is down
      connectTimeout: 3000,      // Timeout quickly if Redis is not running
    };

    const client = new Redis(REDIS_URL, redisOptions);

    client.on("error", (err) => {
      if (isRedisAvailable) {
        console.warn("[QueueService] Redis connection error, failing over to in-memory processing:", err.message);
        isRedisAvailable = false;
      }
    });

    client.on("connect", () => {
      if (isRedisAvailable) return;
      console.log("[QueueService] Redis connected successfully. BullMQ queue is active.");
      isRedisAvailable = true;

      // Initialize BullMQ Queue
      logQueue = new Queue("log-ingestion", {
        connection: client,
      });

      // Initialize BullMQ Worker with separate connection
      const workerConnection = new Redis(REDIS_URL, redisOptions);
      workerConnection.on("error", () => {}); // Silence connection errors for worker connection

      const worker = new Worker(
        "log-ingestion",
        async (job) => {
          console.log(`[QueueService Worker] Processing job ${job.id} for request ${job.data.requestId}`);
          await ingestLog(job.data);
        },
        {
          connection: workerConnection,
          concurrency: 5,
        }
      );

      worker.on("completed", (job) => {
        console.log(`[QueueService Worker] Job ${job.id} completed successfully.`);
      });

      worker.on("failed", (job, err) => {
        console.error(`[QueueService Worker] Job ${job?.id || 'unknown'} failed:`, err.message);
      });
    });

  } catch (err) {
    console.warn("[QueueService] Failed to initialize Redis client. Falling back to in-memory events.", err.message);
    isRedisAvailable = false;
  }
}

// In-Memory Fallback Worker
fallbackEmitter.on("ingest", async (payload) => {
  try {
    console.log(`[QueueService In-Memory Fallback] Asynchronously processing request ${payload.requestId}`);
    // Simulate minor processing delay to behave like an asynchronous queue
    await new Promise((resolve) => setTimeout(resolve, 50));
    await ingestLog(payload);
    console.log(`[QueueService In-Memory Fallback] Successfully ingested request ${payload.requestId}`);
  } catch (err) {
    console.error(`[QueueService In-Memory Fallback] Failed to ingest request ${payload.requestId}:`, err.message);
  }
});

/**
 * Add a log payload to the ingestion queue (Redis if available, otherwise In-Memory fallback).
 * @param {object} payload - Ingestion payload
 */
export async function addLogToQueue(payload) {
  if (isRedisAvailable && logQueue) {
    try {
      const job = await logQueue.add("ingest", payload, {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      });
      console.log(`[QueueService] Successfully queued request ${payload.requestId} in Redis (Job ID: ${job.id})`);
      return { queued: true, type: "redis", jobId: job.id };
    } catch (err) {
      console.warn("[QueueService] Redis queue write failed, falling back to in-memory emitter:", err.message);
    }
  }

  // Fallback to in-memory event-based asynchronous processing
  fallbackEmitter.emit("ingest", payload);
  console.log(`[QueueService] Emitted request ${payload.requestId} to in-memory fallback queue.`);
  return { queued: true, type: "in-memory" };
}
