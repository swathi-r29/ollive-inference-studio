// src/routes/ingest.js
import { Router } from "express";
import { receiveLog, getLogs, getAggregatedStats } from "../controllers/ingestionController.js";

const router = Router();

// Receive a log from the frontend SDK
router.post("/", receiveLog);

// Query logs and stats
router.get("/logs", getLogs);
router.get("/stats", getAggregatedStats);

export default router;
