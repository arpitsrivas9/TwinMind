# TwinMind

TwinMind is a secure personal AI operating system foundation built with a production-oriented full-stack architecture.

---

## Phase 3 — TwinMemory™ 🧠
Phase 3 introduces durable, long-term personal memory across conversations:
- **Long-Term Memory Engine**: Retains durable facts, user preferences, goals, and projects across sessions.
- **Candidate Detection & Extraction**: Heuristic filtering bypassing trivial queries + structured LLM extraction.
- **Privacy & Zero-Secret Guarantee**: Automatic detection and rejection of API keys, passwords, and private tokens.
- **Deduplication & Conflict Resolution**: Jaccard similarity detection and automatic superseding of outdated preferences.
- **Relevance Ranking & Context Injection**: Ranks active memories by prompt overlap, recency, and importance, cleanly injecting them into the LLM system context with prompt-injection defense.
- **Dedicated Memory Workspace**: Full UI at `/memory` with category filtering, search, cards, manual memory creation/editing, and privacy controls.
- **Privacy Controls**: Master toggle, automatic extraction toggle, review requirement, and permanent bulk memory erasure.

---

## Phase 2 — Twin Core 🧠
Phase 2 delivers the primary conversational intelligence loop:
- **Interactive Chat Workspace**: Full conversation sidebar, auto-resizing input, and streaming message feed.
- **Server-Sent Events (SSE) Streaming**: Progressive real-time response generation from OpenAI and Google Gemini.
- **Conversation Management**: Create, list, retrieve, inline rename, and delete conversation threads with cascade deletion.
- **Relational Search**: Instant debounced search filtering conversation titles and message content with strict cross-user isolation.
- **Safe Markdown & Syntax Highlighting**: Rich formatting for code blocks, tables, blockquotes, and lists with one-click code copying and XSS protection.
- **Context Budgeting & Normalization**: Token/character budgeting preventing context overflow and Gemini turn alternation sanitizer.

---

## Project Structure

```text
TwinMind/
├── frontend/             # Next.js 16 App Router, React 19, Tailwind CSS v4
│   ├── src/app/          # Routes: /, /login, /signup, /dashboard, /profile, /settings
│   ├── src/components/   # ChatLayout, Sidebar, MessageBubble, Input, MarkdownContent
│   ├── src/context/      # AuthContext session management
│   ├── src/hooks/        # useChatStream SSE hook
│   └── src/lib/          # API client
├── backend/              # Express + TypeScript REST API
│   ├── src/routes/       # auth, user, conversation, message, ai routes
│   ├── src/services/     # conversation, modelRegistry, aiService, promptService
│   ├── src/middleware/   # requireAuth, errorHandler, rateLimiters
│   ├── prisma/           # schema.prisma, PostgreSQL migrations
│   └── tests/            # Jest integration test suites
├── docs/                 # Architecture, API, Database, Changelog
├── docker-compose.yml    # PostgreSQL container configuration
├── decisions.md          # Architectural decision records
├── flow.md               # Runtime execution flow documentation
└── README.md
```

---

## Quick Start

### 1. Start PostgreSQL
```bash
docker compose up -d postgres
```

### 2. Backend Setup
```bash
cd backend
cp .env.example .env     # Configure OPENAI_API_KEY or GEMINI_API_KEY
npm install
npx prisma migrate deploy
npm run dev              # Runs on http://localhost:4000
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev              # Runs on http://localhost:3000
```

---

## Automated Tests
Run the backend test suite:
```bash
cd backend
npm test
```
58 tests across 4 suites:
- Authentication & JWT issuance (`auth.test.ts`)
- Conversation CRUD lifecycle & relational search (`conversation.test.ts`)
- Model selection & Gemini turn normalization (`ai.test.ts`)
- TwinMemory™ extraction, deduplication, conflict resolution, ranking, CRUD, privacy controls & IDOR isolation (`memory.test.ts`)

---

## Default URLs
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- PostgreSQL: `localhost:5432`
