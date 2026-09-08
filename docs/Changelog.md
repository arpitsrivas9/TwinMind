# Changelog

All notable changes to the TwinMind cognitive system.

## [Phase 2 — Twin Core] - 2026-09-09

### Added
- **Interactive Chat Workspace**: Full-featured React 19 + Next.js App Router workspace (`ChatLayout`) replacing static dashboard placeholders.
- **Server-Sent Events (SSE) Streaming**: Native progressive token streaming for assistant responses with `delta`, `message_started`, and `message_completed` events.
- **Client Disconnect Handling**: Immediate upstream LLM abort via `AbortController` when client disconnects; prevents writing phantom `FAILED` messages.
- **Safe Markdown & Syntax Highlighting**: Integrated `react-markdown`, `remark-gfm`, and `prismjs` syntax highlighter with one-click code copy feedback and XSS safety.
- **Conversation Management**: Full CRUD operations for conversations (create, list, retrieve, inline rename, delete with confirmation modal).
- **Relational Search**: Instant debounced search filtering conversations across titles and message contents with strict user isolation.
- **Dynamic Model Selection**: Support for `openai` (`gpt-4o-mini`) and `gemini` (`gemini-2.0-flash`) with dynamic availability filtering.
- **Gemini Multi-Turn Normalization**: Sanitizer ensuring conversation turns strictly alternate between `user` and `model` without leading model messages.
- **Context Budgeting**: `fitMessagesToBudget` protecting against LLM context window overflow while preserving latest user queries.
- **Real Frontend Authentication**: Connected `AuthForm` to `/api/auth/login` and `/api/auth/signup` with JWT storage and `AuthProvider` route guards.
- **Automated Integration Tests**: 30 automated Jest tests covering Auth, Conversation CRUD, User Isolation (IDOR), AI Model Selection, and Gemini Turn Normalization.

### Fixed
- Applied pending database migration `20260909100000_twin_core_conversations` creating `conversations` and `messages` tables.
- Resolved `ERR_ERL_KEY_GEN_IPV6` express-rate-limit configuration warning.
- Added CUID validation to message route parameters.
- Replaced hardcoded test credentials with dynamic timestamped identities to guarantee test idempotency.

## [Phase 1 — Foundation] - 2026-09-08
- Initialized Express + TypeScript backend and Next.js frontend.
- Created PostgreSQL `User` schema and JWT authentication foundation.
- Configured Dockerized PostgreSQL database and base security headers.

