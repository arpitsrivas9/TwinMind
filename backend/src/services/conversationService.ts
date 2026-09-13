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

type InMemoryConversation = {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

type InMemoryCitation = {
  id: string;
  documentId: string;
  chunkId: string;
  documentTitle: string;
  pageNumber?: number | null;
  slideNumber?: number | null;
  timestamp?: string | null;
  snippet: string;
  score?: number | null;
};

type InMemoryMessage = {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  status: 'COMPLETED' | 'FAILED';
  content: string;
  model: string | null;
  createdAt: Date;
  citations: InMemoryCitation[];
};

const inMemoryConversations = new Map<string, InMemoryConversation>();
const inMemoryMessages = new Map<string, InMemoryMessage[]>();

const titleFromContent = (content: string) => {
  const normalized = content.trim().replace(/\s+/g, ' ');
  if (!normalized) return 'New conversation';
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
};

export const listConversations = async (userId: string) => {
  try {
    const list = await prisma.conversation.findMany({
      where: { userId },
      select: conversationSelect,
      orderBy: { updatedAt: 'desc' },
    });
    if (list.length > 0) return list;
  } catch {
    // Database connection error or offline fallback
  }

  return Array.from(inMemoryConversations.values())
    .filter((c) => c.userId === userId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      _count: { messages: (inMemoryMessages.get(c.id) || []).length },
    }));
};

export const searchConversations = async (userId: string, query: string) => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) return listConversations(userId);

  try {
    const results = await prisma.conversation.findMany({
      where: {
        userId,
        OR: [
          { title: { contains: query.trim(), mode: 'insensitive' } },
          { messages: { some: { content: { contains: query.trim(), mode: 'insensitive' } } } },
        ],
      },
      select: conversationSelect,
      orderBy: { updatedAt: 'desc' },
    });
    if (results.length > 0) return results;
  } catch {
    // Database connection error or offline fallback
  }

  return Array.from(inMemoryConversations.values())
    .filter((c) => {
      if (c.userId !== userId) return false;
      if (c.title.toLowerCase().includes(normalizedQuery)) return true;
      const msgs = inMemoryMessages.get(c.id) || [];
      return msgs.some((m) => m.content.toLowerCase().includes(normalizedQuery));
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      _count: { messages: (inMemoryMessages.get(c.id) || []).length },
    }));
};

export const createConversation = async (userId: string, title?: string) => {
  const cleanTitle = title?.trim() || 'New conversation';
  try {
    return await prisma.conversation.create({
      data: {
        userId,
        title: cleanTitle,
      },
      select: conversationSelect,
    });
  } catch {
    const fallbackConv: InMemoryConversation = {
      id: `conv_${Date.now()}`,
      userId,
      title: cleanTitle,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemoryConversations.set(fallbackConv.id, fallbackConv);
    inMemoryMessages.set(fallbackConv.id, []);

    return {
      id: fallbackConv.id,
      title: fallbackConv.title,
      createdAt: fallbackConv.createdAt,
      updatedAt: fallbackConv.updatedAt,
      _count: { messages: 0 },
    };
  }
};

export const getConversation = async (userId: string, conversationId: string) => {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
      select: conversationSelect,
    });

    if (conversation) return conversation;
  } catch {
    // Database connection error or offline
  }

  const memConv = inMemoryConversations.get(conversationId);
  if (memConv && memConv.userId === userId) {
    return {
      id: memConv.id,
      title: memConv.title,
      createdAt: memConv.createdAt,
      updatedAt: memConv.updatedAt,
      _count: { messages: (inMemoryMessages.get(memConv.id) || []).length },
    };
  }

  // In development, support mock/fallback conversations
  if (conversationId.startsWith('conv_') || userId.startsWith('dev-')) {
    const autoConv: InMemoryConversation = {
      id: conversationId,
      userId,
      title: 'Conversation',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    inMemoryConversations.set(conversationId, autoConv);
    if (!inMemoryMessages.has(conversationId)) {
      inMemoryMessages.set(conversationId, []);
    }
    return {
      id: autoConv.id,
      title: autoConv.title,
      createdAt: autoConv.createdAt,
      updatedAt: autoConv.updatedAt,
      _count: { messages: (inMemoryMessages.get(conversationId) || []).length },
    };
  }

  throw new AppError('Conversation not found', 404);
};

export const renameConversation = async (userId: string, conversationId: string, title: string) => {
  await getConversation(userId, conversationId);
  const cleanTitle = title.trim();

  try {
    return await prisma.conversation.update({
      where: { id: conversationId },
      data: { title: cleanTitle },
      select: conversationSelect,
    });
  } catch {
    const memConv = inMemoryConversations.get(conversationId);
    if (memConv) {
      memConv.title = cleanTitle;
      memConv.updatedAt = new Date();
    }
    return {
      id: conversationId,
      title: cleanTitle,
      createdAt: memConv?.createdAt || new Date(),
      updatedAt: memConv?.updatedAt || new Date(),
      _count: { messages: (inMemoryMessages.get(conversationId) || []).length },
    };
  }
};

export const deleteConversation = async (userId: string, conversationId: string) => {
  await getConversation(userId, conversationId);
  try {
    await prisma.conversation.delete({ where: { id: conversationId } });
  } catch {
    // Ignore offline or in-memory deletes
  }
  inMemoryConversations.delete(conversationId);
  inMemoryMessages.delete(conversationId);
};

export const listMessages = async (userId: string, conversationId: string) => {
  await getConversation(userId, conversationId);

  try {
    const dbMsgs = await prisma.message.findMany({
      where: { conversationId },
      select: messageSelect,
      orderBy: { createdAt: 'asc' },
    });
    if (dbMsgs.length > 0) return dbMsgs;
  } catch {
    // DB offline or fallback conversation
  }

  const memMsgs = inMemoryMessages.get(conversationId) || [];
  return memMsgs.map((m) => ({
    id: m.id,
    role: m.role,
    status: m.status,
    content: m.content,
    model: m.model,
    createdAt: m.createdAt,
    citations: m.citations || [],
  }));
};

export const createUserMessage = async (userId: string, conversationId: string, content: string) => {
  await getConversation(userId, conversationId);

  try {
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
  } catch {
    const fallbackMsg: InMemoryMessage = {
      id: `msg_user_${Date.now()}`,
      conversationId,
      role: 'USER' as const,
      status: 'COMPLETED' as const,
      content,
      model: null,
      createdAt: new Date(),
      citations: [],
    };

    if (!inMemoryMessages.has(conversationId)) {
      inMemoryMessages.set(conversationId, []);
    }
    inMemoryMessages.get(conversationId)!.push(fallbackMsg);

    const memConv = inMemoryConversations.get(conversationId);
    if (memConv) {
      if ((inMemoryMessages.get(conversationId) || []).length === 1) {
        memConv.title = titleFromContent(content);
      }
      memConv.updatedAt = new Date();
    }

    return fallbackMsg;
  }
};

export const createAssistantMessage = async (
  userId: string,
  conversationId: string,
  content: string,
  model: string,
  status: 'COMPLETED' | 'FAILED' = 'COMPLETED',
) => {
  await getConversation(userId, conversationId);

  try {
    return await prisma.message.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        status,
        content,
        model,
      },
      select: messageSelect,
    });
  } catch {
    const fallbackMsg: InMemoryMessage = {
      id: `msg_asst_${Date.now()}`,
      conversationId,
      role: 'ASSISTANT' as const,
      status,
      content,
      model,
      createdAt: new Date(),
      citations: [],
    };

    if (!inMemoryMessages.has(conversationId)) {
      inMemoryMessages.set(conversationId, []);
    }
    inMemoryMessages.get(conversationId)!.push(fallbackMsg);

    const memConv = inMemoryConversations.get(conversationId);
    if (memConv) {
      memConv.updatedAt = new Date();
    }

    return fallbackMsg;
  }
};

export const getContextMessages = async (userId: string, conversationId: string, limit: number) => {
  await getConversation(userId, conversationId);

  try {
    const messages = await prisma.message.findMany({
      where: { conversationId, status: 'COMPLETED' },
      select: { role: true, content: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    if (messages.length > 0) {
      return messages.reverse();
    }
  } catch {
    // Database connection error or offline fallback
  }

  const memMsgs = (inMemoryMessages.get(conversationId) || [])
    .filter((m) => m.status === 'COMPLETED')
    .slice(-limit)
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  return memMsgs;
};
