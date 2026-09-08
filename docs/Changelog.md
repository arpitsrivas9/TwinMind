# Changelog

All notable changes to the TwinMind cognitive system.

## [Phase 3 — TwinMemory™] - 2026-09-09

### Added
- **TwinMemory™ Long-Term Memory System**: Personal memory engine enabling TwinMind to retain durable facts, preferences, goals, and project context across conversations.
- **Database Models & Migration**: Applied migration `20260909120000_twin_memory` creating `memories` and `memory_settings` tables with `MemoryType` enum and user-isolated indexing.
- **Heuristic Candidate Detection**: Rule-based detection (`isCandidateForMemory`) identifying personal disclosure signals while skipping generic queries to minimize LLM latency and cost.
- **Structured Memory Extraction**: Dedicated extractor service extracting candidate memories with JSON schema validation, importance scores (1-10), and confidence metrics (0.0-1.0).
- **Zero-Secret Storage Guarantee**: Rigorous credential and secret validator (`memoryValidator.ts`) automatically detecting and rejecting API keys (OpenAI, Google, AWS, Anthropic), passwords, private keys, JWTs, and card numbers.
- **Deduplication & Conflict Resolution**: Jaccard word similarity analyzer detecting redundant memories, boosting confidence on re-affirmation, and deactivating contradicting older preferences (e.g. language preference changes).
- **Prompt Ranking & Context Injection**: Relevance ranker matching prompt tokens against stored memories, injecting active memories into a dedicated `<retrieved_personal_memories>` block with prompt-injection defense notices.
- **TwinMemory™ REST API**: Full CRUD, search, and bulk deletion under `/api/memories` with Zod validation, rate limiting, and strict IDOR multi-tenant protection.
- **TwinMemory™ Workspace UI**: Complete interactive frontend page at `/memory` featuring stats counters, type filter tabs, search, memory cards with confidence meters and badges, manual memory creation/editing modal, and privacy controls modal.
- **Automated Memory Test Suite**: 28 new tests in `memory.test.ts` (bringing total test suite to 58 tests across 4 suites) validating extraction, validation, deduplication, conflict resolution, ranking, context injection, CRUD, privacy controls, and IDOR isolation.

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

