/** Cliente HTTP con sesión por cookie y CSRF (E2). */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Reintenta una vez refrescando el CSRF si el servidor lo rechaza. */
  retryCsrf?: boolean;
}

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (method !== 'GET' && csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }
  const res = await fetch(path, {
    method,
    headers,
    credentials: 'same-origin',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (res.status === 403 && options.retryCsrf !== false && method !== 'GET') {
    const probe: { error?: string } | null = await res.json().catch(() => null);
    if (probe?.error === 'csrf_invalid') {
      const meRes = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (meRes.ok) {
        const me = (await meRes.json()) as { csrfToken?: string };
        if (typeof me.csrfToken === 'string') {
          csrfToken = me.csrfToken;
          return request<T>(path, { ...options, retryCsrf: false });
        }
      }
    }
    throw new ApiError(
      403,
      'csrf_invalid',
      'Sesión desactualizada. Recargá la página.',
    );
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ApiError(res.status, data?.error ?? 'error', data?.error);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body }),
};
