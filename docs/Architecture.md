# Architecture

## System Overview
TwinMind is a secure personal AI cognitive operating system built with a modular full-stack architecture.

Phase 2 ("Twin Core 🧠") enables authenticated users to hold persistent, short-term context conversations with supported AI models via real-time SSE streaming.

---

## Frontend
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript.
- **Styling**: Tailwind CSS v4 using semantic dark cognitive design tokens (`surface-1`, `surface-2`, `accent-cyan`, `accent-violet`).
- **State & Communication**:
  - `AuthProvider` & `useAuth`: Manages user credentials, session persistence, and client-side route guards.
  - `useChatStream`: Custom hook consuming server-sent events (`text/event-stream`), progressively updating message chunks in real time, handling abort signals, and managing retry/regeneration.
  - `MarkdownContent`: Safe Markdown rendering powered by `react-markdown` and `remark-gfm` with syntax highlighting via `prismjs` and copy-to-clipboard functionality.
- **Components**:
  - `ChatLayout`: Root workspace container orchestrating sidebar, message feed, and multiline input.
  - `ConversationSidebar`: Thought stream list with real-time debounced search, inline renaming, and delete confirmation.
  - `ModelSelector`: Dynamic model picker populated via `GET /api/ai/models`.
  - `MessageBubble`: Role-specific display with timestamp, model badge, and message actions.
  - `MessageInput`: Autosizing multiline input with `Enter` send, `Shift+Enter` newline, character limits, and stop button.

---

## Backend
- **Runtime**: Node.js + Express + TypeScript.
- **Data Access**: Prisma ORM with PostgreSQL database.
- **Authentication**: JWT Bearer token middleware (`requireAuth`) validating tokens and attaching user identity to `req.user`.
- **API Routing**:
  - `/api/auth`: Signup and Login with Bcrypt password hashing.
  - `/api/users`: Authenticated user profile routes.
  - `/api/conversations`: Conversation CRUD, list, and relational search.
  - `/api/conversations/:id/messages`: SSE streaming message creation, context resolution, and persistence.
  - `/api/ai/models`: Safe public model metadata listing.
- **AI Engine**:
  - `modelRegistry`: Centralized registry supporting OpenAI (`gpt-4o-mini`) and Google Gemini (`gemini-2.0-flash`).
  - `aiService`: Provider abstraction with Fetch-based SSE readers and `AbortSignal` cancellation support.
  - `promptService`: Centralized `TWINMIND_SYSTEM_PROMPT`, character/token context budgeting (`fitMessagesToBudget`), and Gemini multi-turn role normalization (`buildGeminiContents`).
  - `rateLimit`: Configured with per-user keying (`req.user.id`) to protect against quota exhaustion without IPv6 warnings.

---

## Data Flow (Phase 2 & 3)
1. User logs in; JWT token is returned and stored in frontend `localStorage`.
2. Frontend requests active conversations (`GET /api/conversations`) and available models (`GET /api/ai/models`).
3. User types a thought and hits `Enter`:
   - If no conversation is active, a new conversation is automatically created.
   - Frontend opens an HTTP POST connection to `/api/conversations/:id/messages` with `Accept: text/event-stream`.
   - Backend saves the user message to PostgreSQL.
   - **TwinMemory™ Retrieval**: If enabled in user settings, active memories are retrieved and scored by token overlap, importance, and recency against the prompt and recent turns (`memoryRanker.ts`).
   - Top-ranked memories are formatted into a prompt-isolated `<retrieved_personal_memories>` block (`promptService.ts`).
   - Short-term conversation context messages are bounded by `fitMessagesToBudget`.
   - Backend calls the selected AI provider (OpenAI or Gemini) with the system prompt, retrieved memories, context messages, and an `AbortSignal`.
   - As tokens stream back, backend sends SSE `delta` events to the client.
   - Upon completion, backend saves the assistant message to PostgreSQL and emits `message_completed`.
   - **TwinMemory™ Extraction (Async Background)**: Asynchronously checks if turn contains candidate personal durable information (`memoryExtractor.ts`). If candidate detected, extracts facts, validates against sensitive info (`memoryValidator.ts`), analyzes duplicates and conflicts (`memoryDeduplicator.ts`), and persists to PostgreSQL.

---

## TwinMemory™ Architecture (Phase 3)

```
Conversation Turn Completed
          │
          ▼
1. Heuristic Candidate Filter (isCandidateForMemory)
          │ (Skips generic queries to save costs)
          ▼
2. Memory Extraction (Gemini / OpenAI structured JSON)
          │
          ▼
3. Sensitive Info Validator (Blocks API keys, passwords, private keys)
          │
          ▼
4. Taxonomy Classification (USER_PREFERENCE, GOAL, PROJECT, etc.)
          │
          ▼
5. Deduplication & Conflict Resolution (Superseedes contradicting memories)
          │
          ▼
6. Storage (PostgreSQL `memories` table with User foreign key & indexes)
```

### Memory Taxonomy
- **`USER_PREFERENCE`**: Communication style, formatting, UI preferences, language, tools.
- **`GOAL`**: Career milestones, learning objectives, personal ambitions.
- **`PROJECT`**: Active codebases, applications, software architectures.
- **`EPISODIC`**: Specific completed experiences, achievements, interviews.
- **`SEMANTIC`**: Durable factual knowledge, background, skillset.
- **`CONVERSATION`**: High-level durable insights distilled from discussions.

---

## Security & User Isolation
- All conversation, message, memory, and search endpoints explicitly enforce `{ userId: req.user.id }`.
- Cross-user access (IDOR) returns `404 Not Found`.
- Input content is strictly capped (12,000 characters maximum for chat, 2,000 characters for memory) with Zod validation.
- Sensitive credentials (passwords, tokens, API keys) are detected and blocked from long-term memory storage.
- Injected memories are framed with prompt-injection defense notices in the system instruction.
- API keys reside exclusively on the server.
- All Markdown is escaped and sanitized before rendering to eliminate XSS risks.
