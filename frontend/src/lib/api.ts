export type User = {
  id: string;
  name: string;
  email: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
};

export type Citation = {
  id?: string;
  documentId: string;
  chunkId?: string | null;
  documentTitle: string;
  filename?: string;
  pageNumber?: number | null;
  slideNumber?: number | null;
  timestamp?: string | null;
  snippet: string;
  score?: number | null;
};

export type Message = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  status: 'PENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED';
  content: string;
  model?: string | null;
  createdAt: string;
  citations?: Citation[];
};

export type AiModel = {
  id: string;
  provider: 'openai' | 'gemini';
  displayName: string;
  supportsStreaming: boolean;
};

export type MemoryType =
  | 'USER_PREFERENCE'
  | 'GOAL'
  | 'PROJECT'
  | 'EPISODIC'
  | 'SEMANTIC'
  | 'CONVERSATION';

export type Memory = {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  summary: string | null;
  importance: number;
  confidence: number;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  isActive: boolean;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MemorySettings = {
  id: string;
  userId: string;
  enabled: boolean;
  autoExtract: boolean;
  requireReview: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'twinmind_token';
const USER_KEY = 'twinmind_user';

export const getAuthToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
};

export const setAuthSession = (token: string, user: User) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearAuthSession = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const getStoredUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
};

export async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new Error('Network error. Please check your connection to the TwinMind server.');
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Server returned status ${response.status}`);
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthSession();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/signup')) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/login';
      }
    }
    const message = (typeof data?.error === 'string' ? data.error : null) || 
                    (typeof data?.message === 'string' ? data.message : null) || 
                    'Request failed';
    throw new Error(message);
  }

  return (data?.data !== undefined ? data.data : data) as T;
}

// Authentication
export async function loginUser(identifier: string, password: string): Promise<{ user: User; token: string }> {
  const result = await apiFetch<{ user: User; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: identifier, identifier, password }),
  });
  setAuthSession(result.token, result.user);
  return result;
}

export async function devAutoLogin(): Promise<{ user: User; token: string }> {
  const result = await apiFetch<{ user: User; token: string }>('/api/auth/dev-auto-login', {
    method: 'POST',
  });
  setAuthSession(result.token, result.user);
  return result;
}

export async function registerUser(name: string, email: string, password: string): Promise<{ user: User; token: string }> {
  const result = await apiFetch<{ user: User; token: string }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  setAuthSession(result.token, result.user);
  return result;
}

export async function fetchCurrentUser(): Promise<User> {
  return apiFetch<User>('/api/users/me');
}

// Conversations
export async function listConversations(): Promise<Conversation[]> {
  return apiFetch<Conversation[]>('/api/conversations');
}

export async function createConversation(title?: string): Promise<Conversation> {
  return apiFetch<Conversation>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export async function getConversation(id: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/conversations/${id}`);
}

export async function renameConversation(id: string, title: string): Promise<Conversation> {
  return apiFetch<Conversation>(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  return apiFetch<void>(`/api/conversations/${id}`, {
    method: 'DELETE',
  });
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  return apiFetch<Message[]>(`/api/conversations/${conversationId}/messages`);
}

export async function searchConversations(query: string): Promise<Conversation[]> {
  const q = encodeURIComponent(query.trim());
  return apiFetch<Conversation[]>(`/api/conversations/search?q=${q}`);
}

// AI Models
export async function listAiModels(): Promise<AiModel[]> {
  return apiFetch<AiModel[]>('/api/ai/models');
}

// TwinMemory™
export async function listMemories(params?: {
  type?: MemoryType;
  isActive?: boolean;
  search?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ memories: Memory[]; nextCursor?: string; total: number }> {
  const queryParts: string[] = [];
  if (params?.type) queryParts.push(`type=${encodeURIComponent(params.type)}`);
  if (params?.isActive !== undefined) queryParts.push(`isActive=${params.isActive}`);
  if (params?.search) queryParts.push(`search=${encodeURIComponent(params.search.trim())}`);
  if (params?.cursor) queryParts.push(`cursor=${encodeURIComponent(params.cursor)}`);
  if (params?.limit) queryParts.push(`limit=${params.limit}`);

  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  return apiFetch<{ memories: Memory[]; nextCursor?: string; total: number }>(`/api/memories${qs}`);
}

export async function searchMemories(query: string): Promise<Memory[]> {
  const q = encodeURIComponent(query.trim());
  return apiFetch<Memory[]>(`/api/memories/search?q=${q}`);
}

export async function getMemorySettings(): Promise<MemorySettings> {
  return apiFetch<MemorySettings>('/api/memories/settings');
}

export async function updateMemorySettings(
  settings: Partial<{ enabled: boolean; autoExtract: boolean; requireReview: boolean }>,
): Promise<MemorySettings> {
  return apiFetch<MemorySettings>('/api/memories/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export async function createMemory(data: {
  type: MemoryType;
  content: string;
  summary?: string;
  importance?: number;
  confidence?: number;
}): Promise<Memory> {
  return apiFetch<Memory>('/api/memories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMemory(
  id: string,
  data: Partial<{
    type: MemoryType;
    content: string;
    summary: string;
    importance: number;
    isActive: boolean;
  }>,
): Promise<Memory> {
  return apiFetch<Memory>(`/api/memories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteMemory(id: string): Promise<void> {
  return apiFetch<void>(`/api/memories/${id}`, {
    method: 'DELETE',
  });
}

export async function clearAllMemories(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>('/api/memories', {
    method: 'DELETE',
  });
}

// TwinSearch™ & Documents
export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

export type Document = {
  id: string;
  userId: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  status: DocumentStatus;
  processingError: string | null;
  pageCount: number | null;
  checksum: string;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  _count?: { chunks: number };
};

export type SearchResultItem = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  filename: string;
  content: string;
  pageNumber?: number;
  slideNumber?: number;
  timestamp?: string;
  sectionTitle?: string;
  score: number;
};

export type SearchResponse = {
  query: string;
  count: number;
  results: SearchResultItem[];
};

export async function uploadDocument(file: File): Promise<Document> {
  const formData = new FormData();
  formData.append('file', file);

  return apiFetch<Document>('/api/documents', {
    method: 'POST',
    body: formData,
  });
}

export async function listDocuments(params?: {
  page?: number;
  limit?: number;
  status?: DocumentStatus;
}): Promise<{ documents: Document[]; total: number; page: number; totalPages: number }> {
  const queryParts: string[] = [];
  if (params?.page) queryParts.push(`page=${params.page}`);
  if (params?.limit) queryParts.push(`limit=${params.limit}`);
  if (params?.status) queryParts.push(`status=${params.status}`);

  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  return apiFetch<{ documents: Document[]; total: number; page: number; totalPages: number }>(`/api/documents${qs}`);
}

export async function getDocument(id: string): Promise<Document> {
  return apiFetch<Document>(`/api/documents/${id}`);
}

export async function deleteDocument(id: string): Promise<void> {
  return apiFetch<void>(`/api/documents/${id}`, {
    method: 'DELETE',
  });
}

export async function reprocessDocument(id: string): Promise<Document> {
  return apiFetch<Document>(`/api/documents/${id}/reprocess`, {
    method: 'POST',
  });
}

export async function searchKnowledge(query: string, topK?: number): Promise<SearchResponse> {
  return apiFetch<SearchResponse>('/api/search', {
    method: 'POST',
    body: JSON.stringify({ query, topK }),
  });
}

// TwinGraph™
export type EntityType =
  | 'USER'
  | 'PERSON'
  | 'PROJECT'
  | 'DOCUMENT'
  | 'TASK'
  | 'GOAL'
  | 'MEETING'
  | 'CONVERSATION'
  | 'MEMORY'
  | 'ORGANIZATION'
  | 'TOPIC';

export type RelationshipType =
  | 'OWNS'
  | 'WORKS_ON'
  | 'RELATED_TO'
  | 'CONTAINS'
  | 'HAS_DOCUMENT'
  | 'HAS_TASK'
  | 'HAS_GOAL'
  | 'ATTENDED'
  | 'DISCUSSED_IN'
  | 'MENTIONED_IN'
  | 'DERIVED_FROM'
  | 'REFERENCES'
  | 'DEPENDS_ON'
  | 'PART_OF'
  | 'ABOUT'
  | 'ASSOCIATED_WITH'
  | 'CREATED_FROM'
  | 'SUPPORTS';

export type GraphEntity = {
  id: string;
  userId: string;
  type: EntityType;
  name: string;
  normalizedName: string;
  description?: string | null;
  confidence: number;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type GraphRelationship = {
  id: string;
  userId: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationshipType;
  confidence: number;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  sourceEntity?: GraphEntity;
  targetEntity?: GraphEntity;
};

export type GraphOverview = {
  totalEntities: number;
  totalRelationships: number;
  entityCountByType: Record<EntityType, number>;
  topHubEntities: Array<{
    id: string;
    name: string;
    type: EntityType;
    connectionCount: number;
  }>;
};

export type ProjectContextResponse = {
  project: GraphEntity;
  documents: GraphEntity[];
  tasks: GraphEntity[];
  goals: GraphEntity[];
  meetings: GraphEntity[];
  topics: GraphEntity[];
  people: GraphEntity[];
  allRelationships: GraphRelationship[];
};

export type GraphTraversalResult = {
  startEntity: GraphEntity;
  nodes: Array<{
    entity: GraphEntity;
    depth: number;
    relationshipVia?: GraphRelationship;
  }>;
  relationships: GraphRelationship[];
};

export async function getGraphOverview(): Promise<GraphOverview> {
  return apiFetch<GraphOverview>('/api/graph/overview');
}

export async function listGraphEntities(params?: {
  type?: EntityType;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ entities: GraphEntity[]; total: number }> {
  const queryParts: string[] = [];
  if (params?.type) queryParts.push(`type=${encodeURIComponent(params.type)}`);
  if (params?.search) queryParts.push(`search=${encodeURIComponent(params.search.trim())}`);
  if (params?.page) queryParts.push(`page=${params.page}`);
  if (params?.limit) queryParts.push(`limit=${params.limit}`);

  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
  return apiFetch<{ entities: GraphEntity[]; total: number }>(`/api/graph/entities${qs}`);
}

export async function getGraphEntity(id: string): Promise<{ entity: GraphEntity; relationships: GraphRelationship[] }> {
  return apiFetch<{ entity: GraphEntity; relationships: GraphRelationship[] }>(`/api/graph/entities/${id}`);
}

export async function createGraphEntity(data: {
  type: EntityType;
  name: string;
  description?: string;
  confidence?: number;
}): Promise<GraphEntity> {
  return apiFetch<GraphEntity>('/api/graph/entities', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteGraphEntity(id: string): Promise<void> {
  return apiFetch<void>(`/api/graph/entities/${id}`, {
    method: 'DELETE',
  });
}

export async function listGraphRelationships(entityId: string): Promise<GraphRelationship[]> {
  return apiFetch<GraphRelationship[]>(`/api/graph/relationships?entityId=${encodeURIComponent(entityId)}`);
}

export async function createGraphRelationship(data: {
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationshipType;
  confidence?: number;
}): Promise<GraphRelationship> {
  return apiFetch<GraphRelationship>('/api/graph/relationships', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteGraphRelationship(id: string): Promise<void> {
  return apiFetch<void>(`/api/graph/relationships/${id}`, {
    method: 'DELETE',
  });
}

export async function getProjectGraphContext(projectName: string): Promise<ProjectContextResponse> {
  return apiFetch<ProjectContextResponse>(`/api/graph/projects/${encodeURIComponent(projectName)}/context`);
}

export async function queryGraphTraversal(startEntityId: string, maxDepth = 2): Promise<GraphTraversalResult> {
  return apiFetch<GraphTraversalResult>('/api/graph/query', {
    method: 'POST',
    body: JSON.stringify({ startEntityId, maxDepth }),
  });
}

