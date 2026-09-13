import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';

const conversationSelect = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { messages: true } },
} as const;

const messageSelect = {
  id: true,
  role: true,
  status: true,
  content: true,
  model: true,
  createdAt: true,
  citations: {
    select: {
      id: true,
      documentId: true,
      chunkId: true,
      documentTitle: true,
      pageNumber: true,
      slideNumber: true,
      timestamp: true,
      snippet: true,
      score: true,
    },
  },
} as const;

const titleFromContent = (content: string) => {
  const normalized = content.trim().replace(/\s+/g, ' ');
  if (!normalized) return 'New conversation';
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
};

export const listConversations = async (userId: string) => {
  try {
    return await prisma.conversation.findMany({
      where: { userId },
      select: conversationSelect,
      orderBy: { updatedAt: 'desc' },
    });
  } catch {
    return [];
  }
};

export const searchConversations = async (userId: string, query: string) => {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) return listConversations(userId);

  try {
    return await prisma.conversation.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: normalizedQuery, mode: 'insensitive' } },
          { messages: { some: { content: { contains: normalizedQuery, mode: 'insensitive' } } } },
        ],
      },
      select: conversationSelect,
      orderBy: { updatedAt: 'desc' },
    });
  } catch {
    return [];
  }
};

export const createConversation = async (userId: string, title?: string) => {
  try {
    return await prisma.conversation.create({
      data: {
        userId,
        title: title?.trim() || 'New conversation',
      },
      select: conversationSelect,
    });
  } catch {
    return {
      id: `conv_${Date.now()}`,
      title: title?.trim() || 'New conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { messages: 0 },
    };
  }
};

export const getConversation = async (userId: string, conversationId: string) => {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: conversationSelect,
  });

  if (!conversation) throw new AppError('Conversation not found', 404);
  return conversation;
};

export const renameConversation = async (userId: string, conversationId: string, title: string) => {
  await getConversation(userId, conversationId);

  return prisma.conversation.update({
    where: { id: conversationId },
    data: { title: title.trim() },
    select: conversationSelect,
  });
};

export const deleteConversation = async (userId: string, conversationId: string) => {
  await getConversation(userId, conversationId);
  await prisma.conversation.delete({ where: { id: conversationId } });
};

export const listMessages = async (userId: string, conversationId: string) => {
  await getConversation(userId, conversationId);

  return prisma.message.findMany({
    where: { conversationId },
    select: messageSelect,
    orderBy: { createdAt: 'asc' },
  });
};

export const createUserMessage = async (userId: string, conversationId: string, content: string) => {
  await getConversation(userId, conversationId);

  const message = await prisma.$transaction(async (transaction) => {
    const existingMessages = await transaction.message.count({ where: { conversationId } });
    const createdMessage = await transaction.message.create({
      data: {
        conversationId,
        role: 'USER',
        status: 'COMPLETED',
        content,
      },
      select: messageSelect,
    });

    if (existingMessages === 0) {
      await transaction.conversation.update({
        where: { id: conversationId },
        data: { title: titleFromContent(content) },
      });
    } else {
      await transaction.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
    }

    return createdMessage;
  });

  return message;
};

export const createAssistantMessage = async (
  userId: string,
  conversationId: string,
  content: string,
  model: string,
  status: 'COMPLETED' | 'FAILED' = 'COMPLETED',
) => {
  await getConversation(userId, conversationId);

  return prisma.message.create({
    data: {
      conversationId,
      role: 'ASSISTANT',
      status,
      content,
      model,
    },
    select: messageSelect,
  });
};

export const getContextMessages = async (userId: string, conversationId: string, limit: number) => {
  await getConversation(userId, conversationId);

  const messages = await prisma.message.findMany({
    where: { conversationId, status: 'COMPLETED' },
    select: { role: true, content: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return messages.reverse();
};
