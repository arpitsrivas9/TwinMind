# Database Documentation

TwinMind uses PostgreSQL as its relational persistence store with Prisma ORM.

---

## Schema Overview

### 1. `users` Table
Stores account identity and authentication credentials.
- `id`: `TEXT` (Primary Key, CUID)
- `name`: `TEXT`
- `email`: `TEXT` (Unique)
- `passwordHash`: `TEXT` (Bcrypt 12 rounds)
- `avatarUrl`: `TEXT` (Nullable)
- `createdAt`: `TIMESTAMP`
- `updatedAt`: `TIMESTAMP`
- **Relations**: Has many `conversations` (cascade delete).

### 2. `conversations` Table
Stores discrete thought streams and chat sessions.
- `id`: `TEXT` (Primary Key, CUID)
- `userId`: `TEXT` (Foreign Key referencing `users(id)` ON DELETE CASCADE)
- `title`: `VARCHAR(160)`
- `createdAt`: `TIMESTAMP`
- `updatedAt`: `TIMESTAMP`
- **Indexes**:
  - `@@index([userId, updatedAt])`: Optimizes listing user conversations in reverse chronological order and ensures high-performance user-isolated searches.
- **Relations**: Belongs to `user`; has many `messages` (cascade delete).

### 3. `messages` Table
Stores chronological dialogue turns.
- `id`: `TEXT` (Primary Key, CUID)
- `conversationId`: `TEXT` (Foreign Key referencing `conversations(id)` ON DELETE CASCADE)
- `role`: `ENUM('USER', 'ASSISTANT')`
- `status`: `ENUM('PENDING', 'STREAMING', 'COMPLETED', 'FAILED')`
- `content`: `TEXT`
- `model`: `VARCHAR(120)` (Nullable, records AI model utilized)
- `createdAt`: `TIMESTAMP`
- **Indexes**:
  - `@@index([conversationId, createdAt])`: Optimizes retrieving conversation dialogue history in chronological order.
- **Relations**: Belongs to `conversation`; has many `memories` (set null on delete).

### 4. `memories` Table (TwinMemory™)
Stores durable personal user memories across sessions.
- `id`: `TEXT` (Primary Key, CUID)
- `userId`: `TEXT` (Foreign Key referencing `users(id)` ON DELETE CASCADE)
- `type`: `ENUM('USER_PREFERENCE', 'GOAL', 'PROJECT', 'EPISODIC', 'SEMANTIC', 'CONVERSATION')`
- `content`: `TEXT` (Concise durable factual statement)
- `summary`: `VARCHAR(255)` (Headline title)
- `importance`: `INTEGER` (1-10 priority ranking signal)
- `confidence`: `DOUBLE PRECISION` (0.0 to 1.0 extraction confidence)
- `sourceConversationId`: `TEXT` (Nullable, Foreign Key referencing `conversations(id)` ON DELETE SET NULL)
- `sourceMessageId`: `TEXT` (Nullable, Foreign Key referencing `messages(id)` ON DELETE SET NULL)
- `isActive`: `BOOLEAN` (Default `true`)
- `lastAccessedAt`: `TIMESTAMP` (Nullable, updated when memory is injected into AI context)
- `createdAt`: `TIMESTAMP`
- `updatedAt`: `TIMESTAMP`
- **Indexes**:
  - `@@index([userId, isActive, importance])`: Fast retrieval of active, high-importance memories for prompt ranking.
  - `@@index([userId, type])`: Efficient filtering by memory taxonomy in UI.
  - `@@index([userId, createdAt])`: Chronological memory review.
- **Relations**: Belongs to `user`, optionally links to `sourceConversation` and `sourceMessage`.

### 5. `memory_settings` Table
Controls user memory privacy and extraction behavior.
- `id`: `TEXT` (Primary Key, CUID)
- `userId`: `TEXT` (Unique, Foreign Key referencing `users(id)` ON DELETE CASCADE)
- `enabled`: `BOOLEAN` (Default `true`, master toggle for TwinMemory)
- `autoExtract`: `BOOLEAN` (Default `true`, allows automatic extraction from conversations)
- `requireReview`: `BOOLEAN` (Default `false`, marks new extractions as inactive until reviewed)
- `createdAt`: `TIMESTAMP`
- `updatedAt`: `TIMESTAMP`

### 6. `documents` & `document_chunks` Tables (TwinSearch™)
Stores private documents and segmented semantic chunk embeddings.
- **`documents`**:
  - `id`: `TEXT` (Primary Key, CUID)
  - `userId`: `TEXT` (Foreign Key referencing `users(id)` ON DELETE CASCADE)
  - `title`: `TEXT`
  - `originalFilename`: `TEXT`
  - `mimeType`: `VARCHAR(100)`
  - `fileSize`: `INTEGER`
  - `checksum`: `VARCHAR(64)` (SHA-256 for deduplication)
  - `status`: `ENUM('UPLOADED', 'PROCESSING', 'READY', 'FAILED')`
  - `pageCount`: `INTEGER`
  - `totalChunks`: `INTEGER`
  - `metadata`: `JSONB`
- **`document_chunks`**:
  - `id`: `TEXT` (Primary Key, CUID)
  - `documentId`: `TEXT` (Foreign Key referencing `documents(id)` ON DELETE CASCADE)
  - `userId`: `TEXT` (Foreign Key referencing `users(id)` ON DELETE CASCADE)
  - `chunkIndex`: `INTEGER`
  - `content`: `TEXT`
  - `tokenCount`: `INTEGER`
  - `pageNumber`: `INTEGER`
  - `slideNumber`: `INTEGER`
  - `timestamp`: `VARCHAR(20)`
  - `embedding`: `JSONB` (Vector floats for PostgreSQL vector store)

### 7. `graph_entities` Table (TwinGraph™)
Stores nodes in the personal knowledge graph.
- `id`: `TEXT` (Primary Key, CUID)
- `userId`: `TEXT` (Foreign Key referencing `users(id)` ON DELETE CASCADE)
- `type`: `ENUM('USER', 'PERSON', 'PROJECT', 'DOCUMENT', 'TASK', 'GOAL', 'MEETING', 'CONVERSATION', 'MEMORY', 'ORGANIZATION', 'TOPIC')`
- `name`: `VARCHAR(255)`
- `normalizedName`: `VARCHAR(255)` (Case-insensitive alphanumeric key for resolution)
- `description`: `TEXT` (Nullable)
- `confidence`: `DOUBLE PRECISION` (Default 1.0)
- `metadata`: `JSONB` (Nullable)
- `createdAt`: `TIMESTAMP`
- `updatedAt`: `TIMESTAMP`
- **Indexes**:
  - `@@unique([userId, type, normalizedName])`: Prevents duplicate entity node creation per user tenant.
  - `@@index([userId, type])`: Fast type filtering.
  - `@@index([userId, name])`: Fast name lookups.

### 8. `graph_relationships` Table (TwinGraph™)
Stores directed edges connecting knowledge graph entities.
- `id`: `TEXT` (Primary Key, CUID)
- `userId`: `TEXT` (Foreign Key referencing `users(id)` ON DELETE CASCADE)
- `sourceEntityId`: `TEXT` (Foreign Key referencing `graph_entities(id)` ON DELETE CASCADE)
- `targetEntityId`: `TEXT` (Foreign Key referencing `graph_entities(id)` ON DELETE CASCADE)
- `type`: `ENUM('OWNS', 'WORKS_ON', 'RELATED_TO', 'CONTAINS', 'HAS_DOCUMENT', 'HAS_TASK', 'HAS_GOAL', 'ATTENDED', 'DISCUSSED_IN', 'MENTIONED_IN', 'DERIVED_FROM', 'REFERENCES', 'DEPENDS_ON', 'PART_OF', 'ABOUT', 'ASSOCIATED_WITH', 'CREATED_FROM', 'SUPPORTS')`
- `confidence`: `DOUBLE PRECISION` (Default 1.0)
- `sourceType`: `VARCHAR(60)` (Originating subsystem, e.g. `DOCUMENT`, `CONVERSATION`)
- `sourceId`: `VARCHAR(120)` (Foreign key in originating subsystem)
- `metadata`: `JSONB` (Nullable)
- `createdAt`: `TIMESTAMP`
- `updatedAt`: `TIMESTAMP`
- **Indexes**:
  - `@@unique([userId, sourceEntityId, targetEntityId, type])`: Prevents duplicate edges.
  - `@@index([userId, sourceEntityId])`: Fast forward traversal.
  - `@@index([userId, targetEntityId])`: Fast reverse traversal.
  - `@@index([userId, type])`: Fast relationship filtering.

---

## Migrations Applied
1. `20260908185855_init`: Created `users` table.
2. `20260909100000_twin_core_conversations`: Created `conversations` and `messages` tables with enums, indexes, and cascade constraints.
3. `20260909120000_twin_memory`: Created `memories` and `memory_settings` tables, `MemoryType` enum, and user isolation indexes.
4. `20260909140000_twin_search_rag`: Created `documents`, `document_chunks`, and `citations` tables.
5. `20260909180000_twin_graph`: Created `graph_entities` and `graph_relationships` tables, `EntityType` and `RelationshipType` enums, and composite unique indexes.

