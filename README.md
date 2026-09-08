# TwinMind

TwinMind is a secure personal AI operating system foundation built with a production-oriented full-stack architecture.

---

## Phase 2 — Twin Core 🧠
Phase 2 delivers the primary conversational intelligence loop:
- **Interactive Chat Workspace**: Full conversation sidebar, auto-resizing input, and streaming message feed.
- **Server-Sent Events (SSE) Streaming**: Progressive real-time response generation from OpenAI (`gpt-4o-mini`) and Google Gemini (`gemini-2.0-flash`).
- **Conversation Management**: Create, list, retrieve, inline rename, and delete conversation threads with cascade deletion.
- **Relational Search**: Instant debounced search filtering conversation titles and message content with strict cross-user isolation.
- **Safe Markdown & Syntax Highlighting**: Rich formatting for code blocks, tables, blockquotes, and lists with one-click code copying and XSS protection.
- **Context Budgeting & Normalization**: Token/character budgeting preventing context overflow and Gemini turn alternation sanitizer.
- **Robustness**: Real-time client disconnect abortion and per-user rate limiting without configuration warnings.

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
Covers:
- Authentication & JWT issuance
- Conversation CRUD lifecycle
- Cross-user authorization (IDOR protection)
- Relational conversation search
- Gemini multi-turn role normalization
- Context window budgeting
- Model selection & validation

---

## Default URLs
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:4000`
- PostgreSQL: `localhost:5432`
