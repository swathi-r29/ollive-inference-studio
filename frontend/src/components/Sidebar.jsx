// src/components/Sidebar.jsx
export default function Sidebar({
  conversations,
  activeConvId,
  view,
  logCount,
  loading,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onSetView,
}) {
  return (
    <aside style={s.sidebar}>
      <div style={s.header}>
        <span style={s.logo}>ollive</span>
        <span style={s.logoSub}>inference studio</span>
      </div>

      <button style={s.newBtn} onClick={onNewConversation}>
        + New conversation
      </button>

      <nav style={s.nav}>
        {[
          { id: "chat", label: "Conversations" },
          { id: "dashboard", label: "Dashboard" },
          { id: "logs", label: `Logs${logCount > 0 ? ` (${logCount})` : ""}` },
        ].map(({ id, label }) => (
          <button
            key={id}
            style={{ ...s.navBtn, ...(view === id ? s.navBtnActive : {}) }}
            onClick={() => onSetView(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div style={s.list}>
        {loading && <div style={s.empty}>Loading...</div>}
        {!loading && conversations.length === 0 && (
          <div style={s.empty}>No conversations yet</div>
        )}
        {conversations.map((conv) => (
          <div
            key={conv._id}
            style={{ ...s.item, ...(conv._id === activeConvId ? s.itemActive : {}) }}
            onClick={() => onSelectConversation(conv._id)}
          >
            <div style={s.itemTitle}>{conv.title || "Untitled"}</div>
            <div style={s.itemMeta}>
              {conv.status === "cancelled" && <span style={s.cancelled}>cancelled · </span>}
              {new Date(conv.createdAt).toLocaleDateString()}
            </div>
            <button
              style={s.deleteBtn}
              onClick={(e) => { e.stopPropagation(); onDeleteConversation(conv._id); }}
              title="Delete conversation"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

const s = {
  sidebar: {
    width: 260, minWidth: 260,
    background: "#111",
    borderRight: "1px solid #1f1f1f",
    display: "flex", flexDirection: "column",
    padding: "20px 0", overflow: "hidden",
  },
  header: { padding: "0 20px 20px", borderBottom: "1px solid #1f1f1f", marginBottom: 12 },
  logo: { display: "block", fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" },
  logoSub: { fontSize: 10, color: "#555", letterSpacing: "0.08em", textTransform: "uppercase" },
  newBtn: {
    margin: "0 12px 12px",
    padding: "10px 14px",
    background: "#1a1a1a", border: "1px solid #2a2a2a",
    borderRadius: 8, color: "#ccc", cursor: "pointer", fontSize: 13, textAlign: "left",
  },
  nav: {
    display: "flex", flexDirection: "column",
    padding: "0 12px 12px", borderBottom: "1px solid #1f1f1f", gap: 2, marginBottom: 8,
  },
  navBtn: {
    padding: "8px 12px", background: "transparent", border: "none",
    borderRadius: 6, color: "#666", cursor: "pointer", fontSize: 13, textAlign: "left",
  },
  navBtnActive: { background: "#1a1a1a", color: "#e5e5e5" },
  list: { flex: 1, overflowY: "auto", padding: "0 12px", display: "flex", flexDirection: "column", gap: 4 },
  empty: { color: "#444", fontSize: 12, padding: "12px 8px", textAlign: "center" },
  item: {
    padding: "10px 12px", borderRadius: 8, cursor: "pointer",
    position: "relative", border: "1px solid transparent",
  },
  itemActive: { background: "#1a1a1a", border: "1px solid #2a2a2a" },
  itemTitle: { fontSize: 12, color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 20 },
  itemMeta: { fontSize: 10, color: "#555", marginTop: 3 },
  cancelled: { color: "#ef4444" },
  deleteBtn: {
    position: "absolute", top: 8, right: 8,
    background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2,
  },
};
