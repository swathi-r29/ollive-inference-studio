// src/App.jsx
// Root component. Owns view switching (chat / dashboard / logs).
// All business logic lives in custom hooks.

import { useState, useEffect, useRef } from "react";
import { useConversations } from "./hooks/useConversations.js";
import { useDashboard } from "./hooks/useDashboard.js";
import Sidebar from "./components/Sidebar.jsx";
import ChatView from "./components/ChatView.jsx";
import DashboardView from "./components/DashboardView.jsx";
import LogsView from "./components/LogsView.jsx";

const MODELS = [
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google" },
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", provider: "google" },
  { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (Anthropic)", provider: "anthropic" },
  { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (Anthropic)", provider: "anthropic" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini (OpenAI)", provider: "openai" },
  { id: "gpt-4o", label: "GPT-4o (OpenAI)", provider: "openai" },
];

export default function App() {
  const [view, setView] = useState("chat");
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);

  const {
    conversations,
    activeConv,
    activeConvId,
    activeMessages,
    streaming,
    streamBuffer,
    loading,
    startNewConversation,
    selectConversation,
    cancelConversation,
    deleteConversation,
    sendMessage,
  } = useConversations();

  const { stats, throughput, modelBreakdown, logs, localLogs, localStats, loadingStats, refresh } =
    useDashboard(view === "dashboard" || view === "logs");

  function handleNewConversation() {
    startNewConversation(selectedModel);
    setView("chat");
  }

  function handleSelectConversation(id) {
    selectConversation(id);
    setView("chat");
  }

  function handleSend(content) {
    sendMessage(content, selectedModel);
  }

  // Combine server logs with local SDK logs for the logs view
  const allLogs = logs.length > 0 ? logs : localLogs;

  return (
    <div style={styles.root}>
      <Sidebar
        conversations={conversations}
        activeConvId={activeConvId}
        view={view}
        logCount={allLogs.length}
        loading={loading}
        onNewConversation={handleNewConversation}
        onSelectConversation={handleSelectConversation}
        onDeleteConversation={deleteConversation}
        onSetView={setView}
      />

      <main style={styles.main}>
        {view === "chat" && (
          <ChatView
            conversation={activeConv}
            messages={activeMessages}
            streaming={streaming}
            streamBuffer={streamBuffer}
            selectedModel={selectedModel}
            models={MODELS}
            onSend={handleSend}
            onCancel={cancelConversation}
            onModelChange={setSelectedModel}
          />
        )}
        {view === "dashboard" && (
          <DashboardView
            stats={stats}
            throughput={throughput}
            modelBreakdown={modelBreakdown}
            loading={loadingStats}
            onRefresh={refresh}
          />
        )}
        {view === "logs" && (
          <LogsView logs={allLogs} loading={loadingStats} />
        )}
      </main>
    </div>
  );
}

const styles = {
  root: {
    display: "flex",
    height: "100vh",
    background: "#0a0a0a",
    color: "#e5e5e5",
    fontFamily: "'DM Mono', 'Fira Code', 'Courier New', monospace",
    overflow: "hidden",
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
};
