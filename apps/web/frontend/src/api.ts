import { parseSse } from './sse';

export interface SessionUser {
  id: number;
  email: string;
  name: string;
}

export interface Conversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface UserSettings {
  language: 'en' | 'ja' | 'fa';
  theme: 'system' | 'light' | 'dark';
}

export interface HealthInfo {
  ok: boolean;
  product: string;
  apiVersion: string;
  provider: string;
  toolsEnabled: boolean;
}

export interface ServerTool {
  name: string;
  description: string;
  risk: string;
  scope: string;
  allowlisted: boolean;
}

export class ApiError extends Error {
  constructor(public readonly code: string, public readonly status: number) {
    super(code);
    this.name = 'ApiError';
  }
}

const TOKEN_KEY = 'lunaai.web.token';

export function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) — session stays in memory only */
  }
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onTool?: (tool: { name: string; status: string; reason?: string }) => void;
  onError?: (code: string) => void;
}

export class LunaApiClient {
  private token: string | null;

  constructor(private readonly baseUrl = '') {
    this.token = readStoredToken();
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string | null): void {
    this.token = token;
    storeToken(token);
  }

  health(): Promise<HealthInfo> {
    return this.json<HealthInfo>('/api/health', { auth: false });
  }

  async register(email: string, name: string, password: string): Promise<SessionUser> {
    const payload = await this.json<{ user: SessionUser; token: string }>('/api/auth/register', {
      method: 'POST',
      body: { email, name, password },
      auth: false,
    });
    this.setToken(payload.token);
    return payload.user;
  }

  async login(email: string, password: string): Promise<SessionUser> {
    const payload = await this.json<{ user: SessionUser; token: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    this.setToken(payload.token);
    return payload.user;
  }

  me(): Promise<{ user: SessionUser }> {
    return this.json<{ user: SessionUser }>('/api/auth/me');
  }

  logout(): void {
    this.setToken(null);
  }

  listConversations(): Promise<{ conversations: Conversation[] }> {
    return this.json('/api/conversations');
  }

  createConversation(title = ''): Promise<{ conversation: Conversation }> {
    return this.json('/api/conversations', { method: 'POST', body: { title } });
  }

  getConversation(id: number): Promise<{ conversation: Conversation; messages: ChatMessage[] }> {
    return this.json(`/api/conversations/${id}`);
  }

  renameConversation(id: number, title: string): Promise<{ conversation: Conversation }> {
    return this.json(`/api/conversations/${id}`, { method: 'PATCH', body: { title } });
  }

  deleteConversation(id: number): Promise<void> {
    return this.request(`/api/conversations/${id}`, { method: 'DELETE' }).then(() => undefined);
  }

  searchConversations(query: string): Promise<{ results: Array<{ id: number; title: string; snippet: string }> }> {
    return this.json(`/api/conversations/search?q=${encodeURIComponent(query)}`);
  }

  getSettings(): Promise<{ settings: UserSettings }> {
    return this.json('/api/settings');
  }

  updateSettings(settings: Partial<UserSettings>): Promise<{ settings: UserSettings }> {
    return this.json('/api/settings', { method: 'PUT', body: settings });
  }

  listTools(): Promise<{ enabled: boolean; scope: string; tools: ServerTool[] }> {
    return this.json('/api/tools');
  }

  /** Stream an assistant reply. Returns when the stream is complete or aborted. */
  async streamMessage(
    conversationId: number,
    content: string,
    handlers: StreamHandlers,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await this.request(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: { content },
      signal,
    });

    if (!response.ok || !response.body) {
      const error = await safeError(response);
      handlers.onError?.(error);
      throw new ApiError(error, response.status);
    }

    for await (const event of parseSse(response.body, { signal })) {
      const data = event.data as Record<string, unknown>;
      if (event.event === 'delta') handlers.onDelta(String(data.text ?? ''));
      else if (event.event === 'tool') {
        handlers.onTool?.({
          name: String(data.name ?? ''),
          status: String(data.status ?? ''),
          reason: data.reason ? String(data.reason) : undefined,
        });
      } else if (event.event === 'error') {
        handlers.onError?.(String(data.error ?? 'internal_error'));
      }
    }
  }

  private async json<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.request(path, options);
    if (!response.ok) {
      const code = await safeError(response);
      if (response.status === 401) this.setToken(null);
      throw new ApiError(code, response.status);
    }
    return (await response.json()) as T;
  }

  private request(
    path: string,
    { method = 'GET', body, auth = true, signal }: RequestOptions = {}
  ): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth && this.token) headers.authorization = `Bearer ${this.token}`;

    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiError('network', 0);
    });
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

async function safeError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || 'internal_error';
  } catch {
    return response.status >= 500 ? 'internal_error' : 'generic';
  }
}
