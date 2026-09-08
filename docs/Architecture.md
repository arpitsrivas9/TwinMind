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

## Data Flow (Phase 2)
1. User logs in; JWT token is returned and stored in frontend `localStorage`.
2. Frontend requests active conversations (`GET /api/conversations`) and available models (`GET /api/ai/models`).
3. User types a thought and hits `Enter`:
   - If no conversation is active, a new conversation is automatically created.
   - Frontend opens an HTTP POST connection to `/api/conversations/:id/messages` with `Accept: text/event-stream`.
   - Backend saves the user message to PostgreSQL.
   - Backend retrieves up to 20 recent messages and applies `fitMessagesToBudget` to fit model headroom.
   - Backend calls the selected AI provider (OpenAI or Gemini) with an `AbortSignal`.
   - As tokens stream back, backend sends SSE `delta` events to the client.
   - Upon completion, backend saves the assistant message to PostgreSQL and emits `message_completed`.
   - If the client disconnects mid-stream, `req.on('close')` aborts the upstream LLM call cleanly without creating phantom failed messages.

---

## Security & User Isolation
- All conversation, message, and search endpoints explicitly enforce `{ userId: req.user.id }`.
- Cross-user access (IDOR) returns `404 Not Found`.
- Input content is strictly capped (12,000 characters maximum) with Zod validation.
- API keys reside exclusively on the server.
- All Markdown is escaped and sanitized before rendering to eliminate XSS risks.
