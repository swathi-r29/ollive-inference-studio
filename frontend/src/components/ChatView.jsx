// src/components/ChatView.jsx
import { useState, useEffect, useRef } from "react";

export default function ChatView({
  conversation,
  messages,
  streaming,
  streamBuffer,
  selectedModel,
  models,
  onSend,
  onCancel,
  onModelChange,
}) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuffer]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    if (!input.trim() || streaming) return;
    onSend(input.trim());
    setInput("");
  }

  return (
    <>
      <div style={s.header}>
        <div style={s.title}>
          {conversation ? conversation.title : "Select or start a conversation"}
          {conversation?.status === "cancelled" && <span style={s.cancelledBadge}> cancelled</span>}
        </div>
        <div style={s.headerRight}>
          <select
            style={s.modelSelect}
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
          {streaming && (
            <button style={s.stopBtn} onClick={onCancel}>
              Stop
            </button>
          )}
        </div>
      </div>

      <div style={s.messages}>
        {!conversation && (
          <div style={s.welcome}>
            <div style={s.welcomeTitle}>Start a conversation</div>
            <div style={s.welcomeSub}>
              Every request is logged with latency, token usage, and trace ID.
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg._id || msg.id}
            style={{ ...s.msg, ...(msg.role === "user" ? s.userMsg : s.assistantMsg), ...(msg.error ? s.errorMsg : {}) }}
          >
            <div style={s.msgRole}>
              {msg.role === "user" ? "You" : (conversation?.provider === "google" || (conversation?.model && conversation.model.startsWith("gemini")) ? "Gemini" : "Claude")}
            </div>
            <div style={s.msgContent}>{msg.content}</div>
          </div>
        ))}

        {streaming && streamBuffer && (
          <div style={{ ...s.msg, ...s.assistantMsg }}>
            <div style={s.msgRole}>
              {selectedModel.startsWith("gemini") ? "Gemini" : "Claude"}
            </div>
            <div style={s.msgContent}>
              {streamBuffer}
              <span style={s.cursor}>▋</span>
            </div>
          </div>
        )}

        {streaming && !streamBuffer && (
          <div style={{ ...s.msg, ...s.assistantMsg }}>
            <div style={s.msgRole}>
              {selectedModel.startsWith("gemini") ? "Gemini" : "Claude"}
            </div>
            <div style={{ ...s.msgContent, color: "#555", fontStyle: "italic" }}>thinking...</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div style={s.inputArea}>
        <textarea
          style={s.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message... (Enter to send, Shift+Enter for newline)"
          rows={3}
          disabled={streaming || conversation?.status === "cancelled"}
        />
        <button
          style={{ ...s.sendBtn, ...(streaming || !input.trim() ? s.sendBtnDisabled : {}) }}
          onClick={handleSend}
          disabled={streaming || !input.trim()}
        >
          Send
        </button>
      </div>
    </>
  );
}

const s = {
  header: {
    padding: "16px 24px", borderBottom: "1px solid #1a1a1a",
    display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 60,
  },
  title: { fontSize: 14, color: "#888", fontWeight: 500 },
  cancelledBadge: { color: "#ef4444", fontSize: 11 },
  headerRight: { display: "flex", gap: 10, alignItems: "center" },
  modelSelect: {
    background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 6,
    color: "#ccc", padding: "6px 10px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  },
  stopBtn: {
    background: "#1a0000", border: "1px solid #3a1010", color: "#ef4444",
    borderRadius: 6, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  },
  messages: {
    flex: 1, overflowY: "auto", padding: "24px",
    display: "flex", flexDirection: "column", gap: 16,
  },
  welcome: { margin: "auto", textAlign: "center", padding: 40 },
  welcomeTitle: { fontSize: 24, color: "#fff", marginBottom: 8, fontWeight: 600 },
  welcomeSub: { fontSize: 13, color: "#555" },
  msg: { maxWidth: 760, padding: "14px 18px", borderRadius: 10, lineHeight: 1.6 },
  userMsg: { alignSelf: "flex-end", background: "#1a1a2e", border: "1px solid #252540" },
  assistantMsg: { alignSelf: "flex-start", background: "#111", border: "1px solid #1f1f1f" },
  errorMsg: { background: "#1a0000", border: "1px solid #3a1010" },
  msgRole: { fontSize: 10, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" },
  msgContent: { fontSize: 14, color: "#e5e5e5", whiteSpace: "pre-wrap", wordBreak: "break-word" },
  cursor: { animation: "blink 1s step-end infinite" },
  inputArea: { padding: "16px 24px", borderTop: "1px solid #1a1a1a", display: "flex", gap: 12, alignItems: "flex-end" },
  textarea: {
    flex: 1, background: "#111", border: "1px solid #2a2a2a", borderRadius: 10,
    color: "#e5e5e5", padding: "12px 16px", fontSize: 14, fontFamily: "inherit",
    resize: "none", outline: "none", lineHeight: 1.5,
  },
  sendBtn: {
    background: "#e5e5e5", color: "#0a0a0a", border: "none", borderRadius: 8,
    padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
    fontFamily: "inherit", alignSelf: "flex-end", marginBottom: 2,
  },
  sendBtnDisabled: { background: "#222", color: "#555", cursor: "not-allowed" },
};
