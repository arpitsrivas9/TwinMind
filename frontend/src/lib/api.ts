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

export type Message = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  status: 'PENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED';
  content: string;
  model?: string | null;
  createdAt: string;
};

export type AiModel = {
  id: string;
  provider: 'openai' | 'gemini';
  displayName: string;
  supportsStreaming: boolean;
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
export async function loginUser(email: string, password: string): Promise<{ user: User; token: string }> {
  const result = await apiFetch<{ user: User; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
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
