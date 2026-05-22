// src/components/DashboardView.jsx
export default function DashboardView({ stats, throughput, modelBreakdown, loading, onRefresh }) {
  const latencyData = throughput.slice(-20);
  const maxLatency = Math.max(...latencyData.map((t) => t.avgLatency || 0), 1);
  const maxCount = Math.max(...latencyData.map((t) => t.count || 0), 1);

  return (
    <div style={s.wrap}>
      <div style={s.topBar}>
        <h2 style={s.title}>Inference Dashboard</h2>
        <button style={s.refreshBtn} onClick={onRefresh} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {!stats ? (
        <div style={s.empty}>No data yet. Send some messages first.</div>
      ) : (
        <>
          <div style={s.statGrid}>
            <StatCard label="Total Requests" value={stats.total} />
            <StatCard label="Avg Latency" value={`${stats.avgLatency}ms`} />
            <StatCard label="P95 Latency" value={`${stats.p95}ms`} />
            <StatCard label="Error Rate" value={`${stats.errorRate}%`} accent={parseFloat(stats.errorRate) > 5} />
            <StatCard label="Total Tokens" value={(stats.totalTokens || 0).toLocaleString()} />
            <StatCard label="Errors" value={stats.errors} accent={stats.errors > 0} />
          </div>

          {/* Throughput chart */}
          {throughput.length > 0 && (
            <div style={s.chartBox}>
              <div style={s.chartLabel}>Requests per hour (last 24h)</div>
              <div style={s.bars}>
                {latencyData.map((d, i) => (
                  <div key={i} style={s.barWrap}>
                    <div
                      style={{
                        ...s.bar,
                        height: `${Math.round((d.count / maxCount) * 100)}%`,
                        background: "#6366f1",
                      }}
                    />
                    <div style={s.barTick}>{d._id?.hour?.slice(11, 16) || ""}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Avg latency by hour */}
          {throughput.length > 0 && (
            <div style={s.chartBox}>
              <div style={s.chartLabel}>Avg latency by hour (ms)</div>
              <div style={s.bars}>
                {latencyData.map((d, i) => (
                  <div key={i} style={s.barWrap}>
                    <div
                      style={{
                        ...s.bar,
                        height: `${Math.round(((d.avgLatency || 0) / maxLatency) * 100)}%`,
                        background: (d.avgLatency || 0) > 3000 ? "#ef4444" : (d.avgLatency || 0) > 1500 ? "#f59e0b" : "#22c55e",
                      }}
                    />
                    <div style={s.barTick}>{Math.round(d.avgLatency || 0)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Model breakdown */}
          {modelBreakdown.length > 0 && (
            <div style={s.chartBox}>
              <div style={s.chartLabel}>By model</div>
              {modelBreakdown.map((m, i) => (
                <div key={i} style={s.modelRow}>
                  <span style={s.modelName}>{m._id?.model?.split("-").slice(0, 2).join("-")}</span>
                  <span style={s.modelStat}>{m.count} reqs</span>
                  <span style={s.modelStat}>{Math.round(m.avgLatency || 0)}ms avg</span>
                  <span style={s.modelStat}>{(m.totalTokens || 0).toLocaleString()} tokens</span>
                  <span style={{ ...s.modelStat, color: m.errors > 0 ? "#ef4444" : "#555" }}>
                    {m.errors} errors
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ ...s.statCard, ...(accent ? s.statCardAccent : {}) }}>
      <div style={s.statVal}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  );
}

const s = {
  wrap: { flex: 1, overflowY: "auto", padding: "32px" },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title: { fontSize: 20, color: "#fff", fontWeight: 600 },
  refreshBtn: {
    background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6,
    color: "#ccc", padding: "6px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  },
  empty: { color: "#555", fontSize: 14, padding: 20 },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 },
  statCard: { background: "#111", border: "1px solid #1f1f1f", borderRadius: 10, padding: "20px 24px" },
  statCardAccent: { border: "1px solid #3a1010", background: "#0f0505" },
  statVal: { fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 6 },
  statLabel: { fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" },
  chartBox: { background: "#111", border: "1px solid #1f1f1f", borderRadius: 10, padding: "20px 24px", marginBottom: 16 },
  chartLabel: { fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 },
  bars: { display: "flex", alignItems: "flex-end", gap: 4, height: 100 },
  barWrap: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", gap: 4 },
  bar: { width: "100%", minHeight: 2, borderRadius: "3px 3px 0 0" },
  barTick: { fontSize: 8, color: "#444", textAlign: "center", whiteSpace: "nowrap" },
  modelRow: { display: "flex", gap: 24, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1a1a1a" },
  modelName: { fontSize: 12, color: "#ccc", width: 160 },
  modelStat: { fontSize: 11, color: "#666" },
};
