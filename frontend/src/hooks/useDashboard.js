// src/hooks/useDashboard.js
// Fetches aggregated stats and logs from the backend ingestion API.
// Polling interval: 10 seconds when the dashboard view is active.

import { useState, useEffect, useCallback } from "react";
import { fetchStats, fetchLogs } from "../api/client.js";
import { logger } from "../sdk/inferenceLogger.js";

export function useDashboard(active) {
  const [serverStats, setServerStats] = useState(null);
  const [throughput, setThroughput] = useState([]);
  const [modelBreakdown, setModelBreakdown] = useState([]);
  const [logs, setLogs] = useState([]);
  const [localLogs, setLocalLogs] = useState([]);
  const [localStats, setLocalStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Subscribe to the local SDK logger for real-time updates
  useEffect(() => {
    return logger.subscribe((log) => {
      setLocalLogs((prev) => [log, ...prev].slice(0, 200));
      setLocalStats(logger.getLocalStats());
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!active) return;
    try {
      setLoadingStats(true);
      const [statsData, logsData] = await Promise.all([
        fetchStats(),
        fetchLogs({ limit: 50 }),
      ]);
      setServerStats(statsData.stats);
      setThroughput(statsData.throughput || []);
      setModelBreakdown(statsData.modelBreakdown || []);
      setLogs(logsData.logs || []);
    } catch (err) {
      console.warn("[Dashboard] Failed to load stats:", err.message);
    } finally {
      setLoadingStats(false);
    }
  }, [active]);

  // Fetch on activation and poll every 10s
  useEffect(() => {
    if (!active) return;
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, [active, refresh]);

  // Merge server stats with local stats (local is more real-time)
  const stats = serverStats || localStats;

  return { stats, throughput, modelBreakdown, logs, localLogs, localStats, loadingStats, refresh };
}
