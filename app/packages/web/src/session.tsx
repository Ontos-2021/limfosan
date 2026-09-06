import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, setCsrfToken } from './api';

export interface SessionUser {
  id: string;
  role: 'guest' | 'user' | 'admin';
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  totpEnabled: boolean;
}

interface SessionState {
  /** loading: comprobando; ready: hay identidad; offline: sin backend. */
  status: 'loading' | 'ready' | 'offline';
  me: SessionUser | null;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    displayName: string;
    inviteCode?: string;
  }) => Promise<{ upgraded: boolean }>;
  logout: () => Promise<void>;
  updateName: (displayName: string) => Promise<void>;
  forgot: (email: string) => Promise<void>;
  reset: (token: string, password: string) => Promise<void>;
  verify: (token: string) => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

interface MeResponse {
  user: SessionUser;
  csrfToken: string;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [me, setMe] = useState<SessionUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<MeResponse>('/api/auth/me');
      setCsrfToken(data.csrfToken);
      setMe(data.user);
      setStatus('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Sin sesión: crear invitado automáticamente (embudo principal).
        try {
          const guest = await api.post<MeResponse>('/api/session/guest', {});
          setCsrfToken(guest.csrfToken);
          setMe(guest.user);
          setStatus('ready');
        } catch {
          setStatus('offline');
        }
      } else {
        setStatus('offline');
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<MeResponse>('/api/auth/login', {
      email,
      password,
    });
    setCsrfToken(data.csrfToken);
    setMe(data.user);
    setStatus('ready');
  }, []);

  const register: SessionState['register'] = useCallback(async (input) => {
    const data = await api.post<MeResponse & { upgraded: boolean }>(
      '/api/auth/register',
      input,
    );
    setCsrfToken(data.csrfToken);
    setMe(data.user);
    setStatus('ready');
    return { upgraded: data.upgraded };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout', {});
    } catch {
      // Igual limpiamos el estado local.
    }
    setCsrfToken(null);
    setMe(null);
    await refresh();
  }, [refresh]);

  const updateName = useCallback(async (displayName: string) => {
    const data = await api.patch<{ user: SessionUser }>('/api/auth/me', {
      displayName,
    });
    setMe(data.user);
  }, []);

  const forgot = useCallback(async (email: string) => {
    await api.post('/api/auth/password/forgot', { email });
  }, []);

  const reset = useCallback(async (token: string, password: string) => {
    await api.post('/api/auth/password/reset', { token, password });
  }, []);

  const verify = useCallback(
    async (token: string) => {
      await api.post('/api/auth/verify', { token });
      await refresh();
    },
    [refresh],
  );

  return (
    <SessionContext.Provider
      value={{
        status,
        me,
        refresh,
        login,
        register,
        logout,
        updateName,
        forgot,
        reset,
        verify,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession fuera de SessionProvider');
  return ctx;
}
