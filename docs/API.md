# API Documentation

All responses follow a consistent JSON format:
- Success: `{ "success": true, "data": ... }`
- Error: `{ "success": false, "error": "Error description" }`

Protected endpoints require a `Authorization: Bearer <jwt_token>` header.

---

## 1. Authentication Endpoints

### `POST /api/auth/signup`
Creates a new user account.
- **Request Body**:
  ```json
  {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "Password123!"
  }
  ```
- **Response (201)**:
  ```json
  {
    "success": true,
    "data": {
      "user": { "id": "cuid...", "name": "Jane Doe", "email": "jane@example.com" },
      "token": "jwt.token.string"
    }
  }
  ```

### `POST /api/auth/login`
Authenticates existing credentials.
- **Request Body**:
  ```json
  {
    "email": "jane@example.com",
    "password": "Password123!"
  }
  ```
- **Response (200)**: Same payload as signup.

---

## 2. User Endpoints

### `GET /api/users/me`
Retrieves the currently authenticated user's profile.
- **Auth**: Required
- **Response (200)**: `{ "success": true, "data": { "id": "...", "name": "...", "email": "..." } }`

---

## 3. Conversation Endpoints

### `GET /api/conversations`
Lists all conversations belonging to the authenticated user, ordered by `updatedAt` descending.
- **Auth**: Required
- **Response (200)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "cmtt...",
        "title": "Quantum Neural Systems",
        "createdAt": "2026-09-09T04:00:00.000Z",
        "updatedAt": "2026-09-09T04:10:00.000Z",
        "_count": { "messages": 4 }
      }
    ]
  }
  ```

### `POST /api/conversations`
Creates a new conversation.
- **Auth**: Required
- **Request Body**: `{ "title": "Optional title" }`
- **Response (201)**: Conversation object.

### `GET /api/conversations/:id`
Retrieves a single conversation by ID.
- **Auth**: Required (Enforces user isolation; returns 404 if owned by another user)
- **Response (200)**: Conversation object.

### `PATCH /api/conversations/:id`
Renames an existing conversation.
- **Auth**: Required
- **Request Body**: `{ "title": "New Title" }`
- **Response (200)**: Updated conversation object.

### `DELETE /api/conversations/:id`
Deletes a conversation and all cascading messages.
- **Auth**: Required
- **Response (204)**: No Content.

### `GET /api/conversations/search?q=keyword`
Performs case-insensitive relational search across conversation titles and message contents.
- **Auth**: Required (Exclusively searches authenticated user's records)
- **Response (200)**: Array of matching conversation objects.

### `GET /api/conversations/:id/messages`
Retrieves all chronological messages for a conversation.
- **Auth**: Required
- **Response (200)**: Array of message objects (`id`, `role`, `status`, `content`, `model`, `createdAt`).

---

## 4. Message & AI Streaming Endpoints

### `POST /api/conversations/:id/messages`
Sends a user message and streams the assistant response via Server-Sent Events (`text/event-stream`).
- **Auth**: Required
- **Rate Limit**: 30 requests per 15 minutes per user.
- **Request Body**:
  ```json
  {
    "content": "Explain vector similarity search.",
    "model": "gpt-4o-mini"
  }
  ```
- **Response (200 SSE Stream)**:
  - `event: message_started`:
    `data: {"userMessage": {...}, "model": "gpt-4o-mini"}`
  - `event: delta`:
    `data: {"text": "Vector similarity "}`
  - `event: message_completed`:
    `data: {"message": {"id": "...", "role": "ASSISTANT", "status": "COMPLETED", ...}}`
  - `event: error`:
    `data: {"message": "Error description"}`

---

## 5. AI Models Endpoint

### `GET /api/ai/models`
Returns list of configured AI models available for completion.
- **Auth**: Required
- **Response (200)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "gpt-4o-mini",
        "provider": "openai",
        "displayName": "gpt-4o-mini",
        "supportsStreaming": true
      },
      {
        "id": "gemini-2.0-flash",
        "provider": "gemini",
        "displayName": "gemini-2.0-flash",
        "supportsStreaming": true
      }
    ]
  }
  ```

---

## 6. TwinMemory™ Endpoints

### `GET /api/memories`
Lists stored memories for the authenticated user with optional filtering and pagination.
- **Auth**: Required
- **Query Params**:
  - `type`: `USER_PREFERENCE` | `GOAL` | `PROJECT` | `EPISODIC` | `SEMANTIC` | `CONVERSATION`
  - `isActive`: `true` | `false`
  - `search`: string
  - `cursor`: CUID
  - `limit`: integer (1-100, default 20)
- **Response (200)**:
  ```json
  {
    "success": true,
    "data": {
      "memories": [
        {
          "id": "cmtt...",
          "type": "USER_PREFERENCE",
          "content": "User prefers concise answers formatted in bullet points.",
          "summary": "Prefers concise bullet points",
          "importance": 8,
          "confidence": 0.95,
          "isActive": true,
          "createdAt": "2026-09-09T04:00:00.000Z"
        }
      ],
      "nextCursor": null,
      "total": 1
    }
  }
  ```

### `POST /api/memories`
Manually creates a new memory record.
- **Auth**: Required
- **Request Body**:
  ```json
  {
    "type": "USER_PREFERENCE",
    "content": "User prefers TypeScript over JavaScript.",
    "summary": "Prefers TypeScript",
    "importance": 8,
    "confidence": 0.95
  }
  ```
- **Response (201)**: Memory object.

### `GET /api/memories/search?q=keyword`
Full-text search across memory content and summaries.
- **Auth**: Required
- **Response (200)**: Array of matching Memory objects.

### `GET /api/memories/:id`
Retrieves a single memory by ID.
- **Auth**: Required (Enforces IDOR user isolation; returns 404 if not found or unowned)
- **Response (200)**: Memory object.

### `PATCH /api/memories/:id`
Updates memory content, summary, importance, or active state.
- **Auth**: Required (Enforces IDOR user isolation)
- **Request Body**:
  ```json
  {
    "content": "Updated memory statement",
    "summary": "Updated headline",
    "importance": 9,
    "isActive": true
  }
  ```
- **Response (200)**: Updated Memory object.

### `DELETE /api/memories/:id`
Deletes a single memory record.
- **Auth**: Required (Enforces IDOR user isolation)
- **Response (204)**: No Content.

### `DELETE /api/memories`
Permanently deletes all memories for the authenticated user.
- **Auth**: Required
- **Response (200)**: `{ "success": true, "data": { "count": 14 } }`

### `GET /api/memories/settings`
Fetches user privacy and memory extraction settings.
- **Auth**: Required
- **Response (200)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "cmtt...",
      "userId": "cmtt...",
      "enabled": true,
      "autoExtract": true,
      "requireReview": false
    }
  }
  ```

### `PATCH /api/memories/settings`
Updates memory privacy settings.
- **Auth**: Required
- **Request Body**:
  ```json
  {
    "enabled": true,
    "autoExtract": true,
    "requireReview": false
  }
  ```
- **Response (200)**: Updated MemorySettings object.

---

## 6. Document & Knowledge Endpoints

### `POST /api/documents` (and `POST /api/documents/upload`)
Uploads a document or media file for background parsing, chunking, and vector embedding.
- **Auth**: Required
- **Form Data**:
  - `file`: Binary file upload (Max 25MB). Supported: `.pdf`, `.docx`, `.pptx`, `.png`, `.jpg`, `.webp`, `.mp4`, `.webm`, `.mov`, `.mp3`, `.wav`, `.txt`, `.md`.
- **Response (201)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "cmtu...",
      "userId": "cuid...",
      "filename": "1788956832249_architecture.md",
      "originalFilename": "architecture.md",
      "mimeType": "text/markdown",
      "fileSize": 1024,
      "status": "UPLOADED",
      "checksum": "sha256...",
      "createdAt": "2026-09-09T12:00:00.000Z"
    }
  }
  ```

### `GET /api/documents`
Lists all documents for the authenticated user with chunk counts.
- **Auth**: Required
- **Query Params**: `page` (default 1), `limit` (default 20), `status` (`UPLOADED`, `PROCESSING`, `READY`, `FAILED`)
- **Response (200)**: Array of Document objects with pagination metadata.

### `GET /api/documents/:id`
Retrieves document metadata, processing status, and chunk breakdown.
- **Auth**: Required (Enforces IDOR isolation)
- **Response (200)**: Document object with array of chunks.

### `POST /api/documents/:id/reprocess`
Re-triggers document parsing, chunking, and embedding pipeline.
- **Auth**: Required (Enforces IDOR isolation)
- **Response (200)**: Updated Document object with `status: "PROCESSING"`.

### `DELETE /api/documents/:id`
Permanently deletes a document, physical file on disk/cloud, and associated vector embeddings.
- **Auth**: Required (Enforces IDOR isolation)
- **Response (200)**: `{ "success": true, "data": { "message": "Document deleted successfully" } }`

---

## 7. TwinSearch™ Endpoints

### `GET /api/search?q=query`
Quick query parameter search across user documents.
- **Auth**: Required
- **Query Params**: `q` (required), `topK` (optional, default 5)
- **Response (200)**:
  ```json
  {
    "success": true,
    "data": {
      "query": "architecture",
      "count": 2,
      "results": [
        {
          "chunkId": "cmtu...",
          "documentId": "cmtu...",
          "documentTitle": "System Architecture.md",
          "filename": "architecture.md",
          "content": "TwinMind incorporates hybrid vector search...",
          "pageNumber": 1,
          "score": 0.89
        }
      ]
    }
  }
  ```

### `POST /api/search`
Standalone JSON query search across user documents.
- **Auth**: Required
- **Request Body**:
  ```json
  {
    "query": "What is the remote work policy?",
    "topK": 5
  }
  ```
- **Response (200)**: Same structure as `GET /api/search`.

