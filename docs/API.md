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
