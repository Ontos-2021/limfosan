import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

interface ToastApi {
  toasts: Toast[];
  push: (text: string, kind?: Toast['kind']) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (text: string, kind: Toast['kind'] = 'info') => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((prev) => [...prev.slice(-3), { id, text, kind }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toasts, push, dismiss }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-label="Avisos">
        {toasts.map((toast) => (
          <button
            key={toast.id}
            className={`toast toast-${toast.kind}`}
            onClick={() => dismiss(toast.id)}
          >
            {toast.text}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToasts fuera de ToastProvider');
  return ctx;
}
