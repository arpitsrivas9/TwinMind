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
- **Relations**: Belongs to `conversation`.

---

## Migrations Applied
1. `20260908185855_init`: Created `users` table.
2. `20260909100000_twin_core_conversations`: Created `conversations` and `messages` tables with enums, indexes, and cascade constraints.
