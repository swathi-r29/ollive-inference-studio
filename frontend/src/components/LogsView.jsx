// src/components/LogsView.jsx
export default function LogsView({ logs, loading }) {
  return (
    <div style={s.wrap}>
      <h2 style={s.title}>Inference Logs</h2>
      {loading && logs.length === 0 && <div style={s.empty}>Loading...</div>}
      {!loading && logs.length === 0 && <div style={s.empty}>No logs yet. Send some messages first.</div>}
      {logs.length > 0 && (
        <div style={s.table}>
          <div style={s.header}>
            <span>Request ID</span>
            <span>Model</span>
            <span>Status</span>
            <span>Latency</span>
            <span>In</span>
            <span>Out</span>
            <span>Time</span>
            <span>PII</span>
          </div>
          {logs.map((log, i) => (
            <div key={log.requestId || log._id || i} style={s.row}>
              <span style={s.mono}>{(log.requestId || "").slice(-12)}</span>
              <span style={s.mono}>{(log.model || "").split("-").slice(0, 2).join("-")}</span>
              <span
                style={{
                  ...s.pill,
                  background: log.status === "success" ? "#14532d" : "#450a0a",
                  color: log.status === "success" ? "#86efac" : "#fca5a5",
                }}
              >
                {log.status}
              </span>
              <span style={s.mono}>{log.latency}ms</span>
              <span style={s.mono}>{log.inputTokens || 0}</span>
              <span style={s.mono}>{log.outputTokens || 0}</span>
              <span style={s.mono}>
                {new Date(log.clientTimestamp || log.createdAt || log.timestamp).toLocaleTimeString()}
              </span>
              <span style={{ ...s.mono, color: (log.piiDetected?.length > 0) ? "#f59e0b" : "#333" }}>
                {log.piiDetected?.length > 0 ? log.piiDetected.join(", ") : "none"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const cols = "150px 140px 80px 80px 50px 50px 90px 1fr";

const s = {
  wrap: { flex: 1, overflowY: "auto", padding: "32px" },
  title: { fontSize: 20, color: "#fff", fontWeight: 600, marginBottom: 24 },
  empty: { color: "#555", fontSize: 14, padding: 20 },
  table: { display: "flex", flexDirection: "column", gap: 1, fontSize: 12 },
  header: {
    display: "grid", gridTemplateColumns: cols, gap: 12,
    padding: "8px 12px", background: "#111", borderRadius: "8px 8px 0 0",
    color: "#555", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em",
  },
  row: {
    display: "grid", gridTemplateColumns: cols, gap: 12,
    padding: "10px 12px", background: "#0f0f0f",
    borderBottom: "1px solid #161616", alignItems: "center",
  },
  mono: { fontFamily: "monospace", color: "#999", fontSize: 11 },
  pill: { borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 600, textAlign: "center" },
};
