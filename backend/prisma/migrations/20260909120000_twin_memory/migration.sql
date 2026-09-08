-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('USER_PREFERENCE', 'GOAL', 'PROJECT', 'EPISODIC', 'SEMANTIC', 'CONVERSATION');

-- CreateTable
CREATE TABLE "memories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "MemoryType" NOT NULL,
    "content" TEXT NOT NULL,
    "summary" VARCHAR(255),
    "importance" INTEGER NOT NULL DEFAULT 5,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "sourceConversationId" TEXT,
    "sourceMessageId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastAccessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memory_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "autoExtract" BOOLEAN NOT NULL DEFAULT true,
    "requireReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memory_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memories_userId_isActive_importance_idx" ON "memories"("userId", "isActive", "importance");

-- CreateIndex
CREATE INDEX "memories_userId_type_idx" ON "memories"("userId", "type");

-- CreateIndex
CREATE INDEX "memories_userId_createdAt_idx" ON "memories"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "memory_settings_userId_key" ON "memory_settings"("userId");

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_sourceConversationId_fkey" FOREIGN KEY ("sourceConversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memory_settings" ADD CONSTRAINT "memory_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

