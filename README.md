# Ollive Inference Studio

A full-stack LLM chatbot with real-time inference logging, ingestion pipeline, and observability dashboard.

---

## Architecture Overview

```
Browser (React + Vite)
  │
  ├── /api/conversations/*  ──→  Express (Node.js)  ──→  Anthropic API
  │                                    │
  └── /api/ingest           ──→  Ingestion Pipeline ──→  MongoDB
                                       │
                               PII Redaction → Validation → Storage
```

### Key design decisions

**API key never leaves the backend.** The frontend talks only to `/api/*` on our own Express server. The Anthropic key lives in `.env` and is never sent to the browser.

**Streaming via SSE.** The backend uses Anthropic's SDK streaming API and forwards each text delta as a Server-Sent Event. The frontend reads these with a `ReadableStream` reader. This gives sub-100ms time-to-first-token perceived latency.

**Embedded messages vs separate collection.** Messages are embedded in the `Conversation` document rather than stored in a separate collection. This avoids N+1 queries since messages are always fetched with their conversation. For conversations that grow past ~500 messages you'd want to paginate — a known tradeoff for typical chat sizes.

**Separate InferenceLog collection.** Logs have a different query pattern from conversations (filter by latency, model, time range) so they live in their own collection with appropriate compound indexes.

**PII redaction before storage.** The ingestion service strips emails, phone numbers, credit card numbers, and IP addresses from input/output previews before writing to the DB. The `piiDetected` field records which types were found for compliance auditing.

**TTL index on logs.** A 30-day TTL index on `InferenceLog.createdAt` auto-expires old records without manual cleanup. Remove it if you want permanent retention.

---

## Folder Structure

```
ollive-inference/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── chatController.js      # Conversation CRUD + streaming
│   │   │   └── ingestionController.js # Log ingestion + stats queries
│   │   ├── middleware/
│   │   │   ├── errorHandler.js        # Global error handler
│   │   │   └── requestLogger.js       # HTTP request logging
│   │   ├── models/
│   │   │   ├── Conversation.js        # MongoDB schema: conversations + messages
│   │   │   └── InferenceLog.js        # MongoDB schema: inference logs
│   │   ├── routes/
│   │   │   ├── chat.js                # /api/conversations routes
│   │   │   └── ingest.js              # /api/ingest routes
│   │   ├── services/
│   │   │   ├── llmService.js          # Anthropic API calls (streaming)
│   │   │   └── ingestionService.js    # Validation, PII redaction, aggregation
│   │   ├── utils/
│   │   │   ├── db.js                  # MongoDB connection
│   │   │   └── piiRedactor.js         # Regex-based PII redaction
│   │   └── server.js                  # Express app entry point
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js              # All backend API calls
│   │   ├── components/
│   │   │   ├── ChatView.jsx           # Chat UI
│   │   │   ├── DashboardView.jsx      # Stats + charts
│   │   │   ├── LogsView.jsx           # Logs table
│   │   │   └── Sidebar.jsx            # Conversation list + nav
│   │   ├── hooks/
│   │   │   ├── useConversations.js    # Conversation state + backend sync
│   │   │   └── useDashboard.js        # Stats polling + local SDK data
│   │   ├── sdk/
│   │   │   └── inferenceLogger.js     # Client-side logging SDK
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── index.html
│   └── vite.config.js
├── docker-compose.yml
└── README.md
```

---

## MongoDB Schema

### Conversation

```js
{
  _id: ObjectId,
  title: String,          // auto-generated from first message
  model: String,          // e.g. "claude-sonnet-4-20250514"
  provider: String,       // "anthropic"
  status: "active" | "cancelled" | "completed",
  totalTokens: Number,    // running sum, updated on each log ingestion
  sessionId: String,      // optional grouping key
  messages: [             // embedded array
    {
      role: "user" | "assistant",
      content: String,
      clientId: String,
      createdAt: Date
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

### InferenceLog

```js
{
  _id: ObjectId,
  conversationId: ObjectId,   // ref → Conversation
  requestId: String,          // unique, client-generated
  model: String,
  provider: String,
  latency: Number,            // ms, end-to-end
  inputTokens: Number,
  outputTokens: Number,
  totalTokens: Number,
  status: "success" | "error" | "cancelled",
  error: String | null,
  inputPreview: String,       // max 200 chars, PII-redacted
  outputPreview: String,      // max 200 chars, PII-redacted
  piiDetected: [String],      // e.g. ["email", "phone"]
  clientTimestamp: String,
  createdAt: Date,            // TTL index: auto-delete after 30 days
  updatedAt: Date
}
```

### Indexes

| Collection    | Index                              | Purpose                          |
|---------------|------------------------------------|----------------------------------|
| Conversation  | `{ createdAt: -1 }`                | List sorted by most recent       |
| Conversation  | `{ sessionId: 1, createdAt: -1 }` | Session-scoped queries           |
| InferenceLog  | `{ conversationId: 1 }`           | Logs per conversation            |
| InferenceLog  | `{ requestId: 1 }` (unique)       | Deduplication                    |
| InferenceLog  | `{ provider: 1, model: 1, createdAt: -1 }` | Dashboard queries   |
| InferenceLog  | `{ createdAt: 1 }` TTL 30d        | Auto-expiry                      |

---

## Ingestion Flow

```
Frontend SDK (inferenceLogger.js)
  └── endTrace() called after each LLM response
        └── POST /api/ingest  (fire-and-forget)
              └── ingestionController.receiveLog()
                    └── ingestionService.ingestLog()
                          1. validatePayload()    → 400 if invalid
                          2. redactLogPII()       → strip emails, phones, etc.
                          3. InferenceLog.save()  → write to MongoDB
                          4. Conversation.$inc(totalTokens) → update counter
```

---

## Logging Strategy

- Every LLM request is bracketed by `logger.startTrace()` / `logger.endTrace()` in the frontend SDK
- The SDK captures wall-clock latency using `performance.now()` (sub-millisecond resolution)
- Logs are sent to `/api/ingest` as fire-and-forget — logging failures never block the UI
- The backend validates, PII-redacts, and stores each log synchronously before responding 201
- The dashboard polls `/api/ingest/stats` every 10 seconds using MongoDB aggregation pipelines

---

## Scaling Considerations

**Current (single server):**
- MongoDB on the same host — fine for demo/small scale
- Synchronous ingestion — adds ~5-20ms to each log POST

**To scale:**
1. Move ingestion to an async queue (Redis + BullMQ or Kafka). Respond 202 immediately, process in a worker pool
2. Add connection pooling (`mongoose.connect` already does this by default — max 100 connections)
3. Shard MongoDB on `conversationId` for horizontal write scaling
4. Put the SSE streaming endpoint behind a long-connection-aware load balancer (HAProxy or nginx with `proxy_read_timeout 300s`)
5. Add rate limiting per session/IP to prevent abuse

---

## Failure Handling

| Failure | Behaviour |
|---|---|
| Anthropic API error | Error SSE event sent to client, error logged to InferenceLog |
| MongoDB write fails | Error returned to client via errorHandler middleware |
| Ingest POST fails | SDK swallows the error silently (fire-and-forget) — conversation still works |
| Stream aborted by user | AbortController cancels the fetch, conversation marked cancelled via PATCH API |
| MongoDB connection drops | Reconnect attempted automatically by mongoose |

---

## Setup — Local Development

### Prerequisites

- Node.js 20+
- MongoDB 7 running locally (or use Docker)
- Anthropic API key from [console.anthropic.com](https://console.anthropic.com)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd ollive-inference

# Backend
cd backend
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY
npm install

# Frontend
cd ../frontend
cp .env.example .env
npm install
```

### 2. Edit backend/.env

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
MONGODB_URI=mongodb://localhost:27017/ollive
PORT=4000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

### 3. Run

Open two terminals:

```bash
# Terminal 1 — backend
cd backend
npm run dev

# Terminal 2 — frontend
cd frontend
npm run dev
```

Open http://localhost:5173

---

## Setup — Docker (one command)

```bash
# Create a .env file at the project root with your API key
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env

# Start everything
docker compose up --build
```

Open http://localhost:5173

To stop:
```bash
docker compose down
# To also remove the MongoDB volume:
docker compose down -v
```

---

## API Reference

### Conversations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/conversations` | List all conversations |
| POST | `/api/conversations` | Create a new conversation |
| GET | `/api/conversations/:id` | Get conversation with messages |
| DELETE | `/api/conversations/:id` | Delete a conversation |
| PATCH | `/api/conversations/:id/cancel` | Mark as cancelled |
| POST | `/api/conversations/:id/messages` | Send message (SSE stream) |

### Ingestion

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ingest` | Ingest an inference log |
| GET | `/api/ingest/logs` | Paginated log list |
| GET | `/api/ingest/stats` | Aggregated stats + throughput |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Backend health check |

---

## What I'd Improve With More Time

1. **Auth** — Add JWT-based auth so conversations are scoped per user, not shared globally
2. **Queue-based ingestion** — Replace synchronous DB writes with Redis + BullMQ for higher throughput without blocking responses
3. **Better PII detection** — Replace regex patterns with a dedicated library (Microsoft Presidio or AWS Comprehend)
4. **Multi-provider** — Add OpenAI and Gemini adapters behind the same `llmService` interface; the frontend model selector already has a `provider` field
5. **Self-hosted k8s** — Add Kubernetes manifests (Deployment, Service, ConfigMap, Secret) and a Helm chart for one-command cluster deployment
6. **Rate limiting** — Add express-rate-limit per IP to prevent abuse of the streaming endpoint
7. **Conversation search** — Add full-text search index on messages for finding past conversations
8. **Export** — Allow exporting conversation + log data as JSON/CSV

---

## Interview Explanation Points

**System design question:**
> "The ingestion pipeline separates concerns. The frontend SDK is a thin wrapper that measures latency and fires logs asynchronously. The backend validates and stores them. If I needed 10x throughput, I'd add a message queue between the POST endpoint and the DB write — the API responds 202 immediately and workers drain the queue. MongoDB's aggregation pipeline does the stats computation at query time, which is fine for this scale; at higher volume I'd pre-aggregate into a time-series collection."

**Why SSE instead of WebSockets:**
> "SSE is simpler and fits the use case. The stream is one-directional (server to client). WebSockets add bidirectional complexity you don't need for streaming text. SSE also reconnects automatically and works over HTTP/1.1."

**Why embedded messages instead of a separate collection:**
> "Messages are always fetched with their conversation — there's no use case where you query messages independently. Embedding avoids a join and is the standard MongoDB pattern when the subdocuments are bounded in size. The tradeoff is that the document grows with each message, so for very long conversations you'd want to paginate the messages array."

**Why PII redaction in the ingestion service, not the SDK:**
> "You can't trust the client to redact data. The regex runs server-side before any write happens. The SDK sends the raw preview, the ingestion service strips PII before storage. This way even if the SDK code is modified, the backend always enforces the redaction."
