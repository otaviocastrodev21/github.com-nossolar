import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

type Tone = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  tone: Tone;
  message: string;
  detail?: string;
}

interface ToastApi {
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  warning: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<Tone, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5" style={{ color: 'var(--status-good)' }} aria-hidden />,
  error: <XCircle className="h-5 w-5" style={{ color: 'var(--status-critical)' }} aria-hidden />,
  warning: (
    <AlertTriangle className="h-5 w-5" style={{ color: 'var(--status-warning)' }} aria-hidden />
  ),
  info: <Info className="h-5 w-5 text-ink-muted" aria-hidden />,
};

const PREFIX: Record<Tone, string> = {
  success: 'Sucesso',
  error: 'Erro',
  warning: 'Atenção',
  info: 'Aviso',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: Tone, message: string, detail?: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, tone, message, detail }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, detail) => push('success', message, detail),
      error: (message, detail) => push('error', message, detail),
      warning: (message, detail) => push('warning', message, detail),
      info: (message, detail) => push('info', message, detail),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          aria-atomic="false"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-4 sm:inset-x-auto sm:right-4 sm:items-end"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className={clsx(
                'pointer-events-auto flex w-full max-w-sm animate-rise-in items-start gap-3',
                'rounded-xl border border-cream-400 bg-cream-50 px-4 py-3 shadow-pop',
              )}
            >
              <span className="mt-0.5 shrink-0">{ICONS[toast.tone]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.875rem] font-medium leading-snug text-ink">
                  <span className="sr-only">{PREFIX[toast.tone]}: </span>
                  {toast.message}
                </p>
                {toast.detail ? (
                  <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-muted">
                    {toast.detail}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Fechar aviso"
                className="-mr-1 -mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-muted transition hover:bg-greige-100 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast precisa estar dentro de <ToastProvider>.');
  return context;
}
