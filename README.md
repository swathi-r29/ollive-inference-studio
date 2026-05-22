# Ollive Inference Studio

A full-stack LLM chatbot with real-time inference logging, ingestion pipeline, and observability dashboard.

---

### Architecture Overview

```
                               ┌───────────────────────────┐
                               │    Browser (React + Vite) │
                               └─────────────┬─────────────┘
                                             │
                       ┌─────────────────────┴─────────────────────┐
                       ▼ /api/conversations/*                      ▼ /api/ingest (fire-and-forget)
         ┌───────────────────────────┐               ┌───────────────────────────┐
         │      Express Backend      │               │   Ingestion Route (202)   │
         └─────────────┬─────────────┘               └─────────────┬─────────────┘
                       │                                           │ (Adds job)
         ┌─────────────┼─────────────┐                             ▼
         ▼             ▼             ▼                    ┌─────────────────┐
    Gemini API    Claude API     GPT API                  │   Redis Queue   │
    (Google)      (Anthropic)    (OpenAI)                 └────────┬────────┘
                                                                   │ (Pops job)
                                                                   ▼
                                                          ┌─────────────────┐
                                                          │  BullMQ Worker  │
                                                          └────────┬────────┘
                                                                   │
                                                                   ▼
                                                       ┌───────────────────────┐
                                                       │  Ingestion Service    │
                                                       │ (Validation/Redaction)│
                                                       └───────────┬───────────┘
                                                                   │
                                                                   ▼
                                                       ┌───────────────────────┐
                                                       │  MongoDB Atlas Cloud  │
                                                       └───────────────────────┘
```

---

## UI & Observability Gallery

### 💬 Chat Interface & Multi-Provider Support
Exposes a responsive interface allowing users to start, list, resume, and cancel multi-turn conversations across OpenAI, Anthropic, and Gemini models.
![Chatbot UI](./screenshots/chatUI.png)

---

### 🔌 Multi-Provider Support
Supports streaming responses from multiple LLM models (Claude, Gemini, GPT) with unified backend adapters.
![Multi-Provider Support](./screenshots/providers.png)

---

### 📊 Real-Time Telemetry Dashboard
An observability panel aggregating end-to-end latency metrics, token throughput spikes, error rates, and model usage distributions.
![Metrics Dashboard](./screenshots/dashboard.png)

---

### 🔍 Ingestion Logs & Async PII Redaction
Audit-ready logs exhibiting rich SDK metadata parameters and real-time server-side PII scrubbing.
![Inference Logs](./screenshots/Logs.png)

---

### 🐳 Containerized Hybrid Stack (Docker Compose)
Launch the unified stack (frontend, backend, Redis queue broker) with a single execution step.
![Docker Stack](./screenshots/docker.png)

---

### Key Design Decisions

* **Multi-Provider Unified Streaming & SSE**: Backend adapters unify streaming interfaces across Google (Gemini), Anthropic (Claude), and OpenAI (GPT), abstracting differences in token counting and system instructions. Server-Sent Events (SSE) deliver real-time token streaming with sub-100ms perceived time-to-first-token.
* **API Key Security**: Authentication keys live exclusively on the backend environment (`.env`) and never leak to the client browser.
* **Event-Driven Log Ingestion (BullMQ + Redis)**: Ingestion POST calls return a `202 Accepted` immediately, eliminating synchronous DB write latency (~10–30ms) from the request cycle. Heavy tasks (PII redaction, storage, stats indexing, aggregation) are handled asynchronously by background workers. 
* **Graceful Local Failover**: In local development environments without an active Redis instance, the backend automatically falls back to an asynchronous, non-blocking in-memory `EventEmitter` event loop.
* **Embedded Messages vs. Separate Collection**: Messages are embedded directly in the `Conversation` document. This eliminates N+1 queries and ensures instantaneous retrieval during conversation resume/reload operations.
* **TTL-Managed Inference Log Collection**: Inference logs live in a distinct MongoDB collection, structured for multi-parameter aggregation (latency, throughput, model, date/time ranges) and automatic lifecycle management via a 30-day TTL index.
* **Multi-Format PII Redaction**: Incoming inference inputs/outputs are scanned and scrubbed of sensitive fields (emails, credit card numbers, phone numbers, IP addresses) before writing to persistence, while storing a list of flagged fields (`piiDetected`) for audit trails.

---

## Folder Structure

```
ollive-inference/
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── chatController.js      # Conversation CRUD + streaming
│   │   │   └── ingestionController.js # Async log ingestion + stats queries
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
│   │   │   ├── llmService.js          # Google, Anthropic, and OpenAI adapters (streaming)
│   │   │   ├── queueService.js        # Event-driven queue (Redis + BullMQ + in-memory failover)
│   │   │   └── ingestionService.js    # Validation, PII redaction, aggregation
│   │   ├── utils/
│   │   │   ├── db.js                  # MongoDB connection with retry logic
│   │   │   └── piiRedactor.js         # Regex-based PII redaction
│   │   └── server.js                  # Express app entry point
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js              # SSE streaming reader and HTTP requests
│   │   ├── components/
│   │   │   ├── ChatView.jsx           # Chat UI with model and cancellation controls
│   │   │   ├── DashboardView.jsx      # Metrics charts and latency breakdown
│   │   │   ├── LogsView.jsx           # Filterable logs table with PII auditing
│   │   │   └── Sidebar.jsx            # Conversation list + navigation
│   │   ├── hooks/
│   │   │   ├── useConversations.js    # Multi-turn, cancel, resume, list conversation hook
│   │   │   └── useDashboard.js        # Real-time metrics polling and fallbacks
│   │   ├── sdk/
│   │   │   └── inferenceLogger.js     # Light client-side telemetry SDK wrapper
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── index.html
│   └── vite.config.js
├── k8s/                               # Production Kubernetes manifests
│   ├── namespace.yaml                 # isolated ollive namespace
│   ├── mongo.yaml                     # MongoDB configuration for stateful backup
│   ├── redis.yaml                     # Ingestion queue broker deployment
│   ├── backend.yaml                   # Express API deployment & service
│   ├── frontend.yaml                  # Vite Nginx static deployment & service
│   └── ingress.yaml                   # Ingress routing rules
├── docker-compose.yml                 # Clean, hybrid container stack setup
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
        └── POST /api/ingest  (non-blocking)
              ▼
        ingestionController.receiveLog()
              │
              ├─── [Redis Available] ──→ Add to BullMQ Queue ──→ Return 202 Accepted
              │                                │ (Asynchronous Processing)
              │                                ▼
              │                        queueService Worker
              │                                │
              │                                ▼
              │                      ingestionService.ingestLog()
              │                                │
              │                                ▼
              │                      1. validatePayload()
              │                      2. redactLogPII()
              │                      3. InferenceLog.save()
              │                      4. Conversation.$inc(totalTokens)
              │
              └─── [Redis Offline] ────→ Node.js EventEmitter ──→ Return 202 Accepted
```

---

## Logging & Observability Strategy

- **Client Telemetry Instrumentation**: Every LLM conversation turn is framed by `logger.startTrace()` and `logger.endTrace()` in the frontend SDK.
- **Microsecond Precision**: Latency is tracked via standard `performance.now()` high-resolution timers.
- **Asynchronous Ingestion**: Logs are pushed asynchronously via `navigator.sendBeacon` or a fire-and-forget fetch request. The UI responds instantaneously.
- **Background Pipeline Processing**: The Express API responds immediately with `202 Accepted`. The logs are offloaded to Redis + BullMQ where they are validated, PII-redacted, and persisted under separate worker threads without impacting thread performance.
- **Polled Aggregations**: The observability dashboard queries `/api/ingest/stats` every 10 seconds using rich Mongo aggregation pipelines to populate latency distribution, throughput spikes, error margins, and model breakdown telemetry.

---

## Scaling Accomplishments & Architecture

**Completed Enhancements:**
* **Redis Queue & Worker Integration (BullMQ)**: Replaced synchronous database operations with an event-driven task queue returning a `202 Accepted` response.
* **Multi-Provider Core (Gemini, Claude, GPT)**: Designed high-throughput adapters that scale to multiple foundation models with transparent fallback logic.
* **Production Kubernetes Deployment**: Engineered high-availability k8s configurations including Ingress routers, resource limits, and distinct services for localized, horizontal auto-scaling.

**Future Scaling Considerations:**
1. **MongoDB Sharding**: Shard collections on `conversationId` for horizontal storage scaling.
2. **Reverse Proxy Load Balancing**: Secure SSE streaming streams behind HAProxy or Nginx tuned with long-lived timeout profiles (`proxy_read_timeout 300s`).
3. **API Rate Limiting**: Introduce Express rate-limiting middlewares to defend against ingestion request denial-of-service.

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
- MongoDB 7 database (Cloud MongoDB Atlas or Local installation)
- Redis server running locally (or backend automatically falls back to an in-memory event-queue)
- LLM API keys (Gemini API key is standard for testing, Claude/GPT optionally supported)

### 1. Setup environment files

Create a `.env` file in the root of the project:
```env
GEMINI_API_KEY=your_gemini_api_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ollive
PORT=4000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

Create a corresponding `.env` file in `/backend` folder containing the same settings.

### 2. Clone and install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3. Run Development Servers

Open two terminals:

```bash
# Terminal 1 — backend
cd backend
npm run dev

# Terminal 2 — frontend
cd frontend
npm run dev
```

Open your browser to `http://localhost:5173`

---

## Setup — Docker (Streamlined Hybrid Stack)

This project runs in a **Streamlined Hybrid Container Stack** which is highly performant and secure:
* **Docker Runs**: The Frontend, Backend API, and Redis Queue.
* **Cloud Persistence**: Links directly to your cloud **MongoDB Atlas** database, avoiding local database container setups, backups, volume complexity, and initialization delays.

### 1. Launch the Stack
Make sure you have your `.env` configured at the root directory, then execute:

```bash
# Build and run the service containers
docker compose up --build
```

Docker will load your variables, boot the `redis` health-check service, compile `backend` and `frontend` Docker images, and launch the unified network stack.

* **Express Backend** is accessible at `http://localhost:4000`
* **Vite Frontend** is accessible at `http://localhost:5173`

### 2. Stop the Stack
To safely spin down and clean up containers, run:
```bash
docker compose down
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

1. **Enterprise Identity & Authorization**: Implement JWT-based user identities so that conversations, analytics dashboards, and telemetry logs are securely isolated per user or tenant.
2. **Machine Learning-Based PII Identification**: Replace the lightweight regex PII filters with full contextual analyzers like **Microsoft Presidio** or **AWS Comprehend** to capture and redact complex sensitive parameters.
3. **Semantic Log Indexes**: Attach vector indexes to the `InferenceLog` collection to allow administrative teams to search through redacting prompts using natural language vector queries.
4. **E2E Integration Testing**: Introduce system tests using Playwright to fully automate validation of model selections, cancellations, resumes, logs updates, and real-time dashboard graphs.
5. **Automated CI/CD Pipelines**: Incorporate automated pipelines using GitHub Actions to run linters, run unit tests, compile distribution builds, build Docker images, and push them to secure container registries.

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
