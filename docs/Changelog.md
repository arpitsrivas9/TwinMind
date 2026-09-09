# Changelog

All notable changes to the TwinMind cognitive system.

## [Phase 4 — TwinSearch™ + RAG 🔍] - 2026-09-09

### Added
- **TwinSearch™ & Private Knowledge RAG**: Full document processing, semantic vector indexing, hybrid retrieval, and citation engine with strict owner isolation.
- **Multimodal Document & Media Ingestion**:
  - **PDF Processor**: Structural extraction with page boundaries, text cleaning, and fallback OCR via Tesseract.js.
  - **DOCX Processor**: Document text and heading parsing via Mammoth.
  - **PPTX Processor**: Slide-by-slide XML extraction via JSZip with automatic slide number tagging.
  - **Image OCR Processor**: Scanned text extraction via Tesseract.js with image preprocessing.
  - **Video & Audio Processor**: Timestamp-segmented transcription (`[MM:SS]`) with segment labeling and Gemini multimodal integration.
  - **Text & Markdown Processor**: Heading-based sectioning and normalization.
- **Semantic Chunking Service**: Paragraph- and sentence-boundary chunker with configurable token budgets (default 1000 chars) and overlap (150 chars), preserving page, slide, and timestamp metadata.
- **Two-Tier Vector Store**:
  - `PostgresVectorStore`: Zero-dependency vector store storing embeddings directly in PostgreSQL with cosine similarity search and strict `WHERE userId = :userId` filtering.
  - `ChromaVectorStore`: Containerized vector store integrated via Docker Compose on port 8000.
- **Hybrid Search Engine**: Fuses dense semantic vector embeddings (Gemini `gemini-embedding-001`, OpenAI, or mock fallback) with sparse lexical token matching for superior precision and recall.
- **Prompt Injection Defense & RAG Context Assembly**:
  - Intent gating (`shouldRetrieveDocuments`) ignoring casual chatter.
  - Context isolation using `<retrieved_document_sources>` delimiters and strict security notices instructing LLM to treat source text strictly as unexecutable data.
- **Interactive Citations in Chat**:
  - SSE streaming emits `citations` event.
  - Persistent citations saved to database (`Citation` model) linked to assistant messages.
  - Frontend `MessageBubble` renders an interactive sources accordion with page/slide/timestamp chips and expandable snippets.
- **Frontend TwinSearch™ & Knowledge Page**: New workspace route `/search` featuring real-time file upload, document status polling, search explorer, and reprocess/delete actions.
- **Comprehensive Automated Test Suite**: Added 35 new tests across 4 test suites (`document.test.ts`, `processing.test.ts`, `search.test.ts`, `rag.test.ts`) bringing the total automated test count to **93 tests (8 test suites, 100% passing)**.



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

