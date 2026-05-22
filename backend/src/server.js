// src/server.js
// Express app entry point.
// Loads env vars, connects to MongoDB, registers middleware and routes.

import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./utils/db.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler } from "./middleware/errorHandler.js";
import chatRoutes from "./routes/chat.js";
import ingestRoutes from "./routes/ingest.js";
import { initQueueService } from "./services/queueService.js";

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ───────────────────────────────────────────────────────────────

// Allow requests from the Vite dev server and production frontend
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || "http://localhost:5173",
      "http://localhost:4173", // vite preview
      "https://ollive-inference-studio-git-main-swathi-r29s-projects.vercel.app",
    ],
    credentials: true,
    // Expose SSE headers to the browser
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Increase limit for larger message payloads
app.use(express.json({ limit: "2mb" }));

// Log every HTTP request
app.use(requestLogger);

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

app.use("/api/conversations", chatRoutes);
app.use("/api/ingest", ingestRoutes);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler — must be last
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────

async function start() {
  try {
    await connectDB();
    initQueueService();
    app.listen(PORT, () => {
      console.log(`[Server] Running on http://localhost:${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (err) {
    console.error("[Server] Failed to start:", err);
    process.exit(1);
  }
}

start();
