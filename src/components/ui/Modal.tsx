import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './primitives';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeOnBackdrop?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const restoreTo = useRef<HTMLElement | null>(null);

  const trapFocus = useCallback((event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const nodes = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (node) => node.offsetParent !== null,
    );
    if (nodes.length === 0) return;

    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      trapFocus(event);
    };

    document.addEventListener('keydown', onKeyDown, true);

    // Foca o primeiro campo real, não o botão de fechar.
    const raf = requestAnimationFrame(() => {
      const nodes = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      const target = nodes.find((node) => node.dataset.autofocus === 'true') ?? nodes[1] ?? nodes[0];
      target?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose, trapFocus]);

  if (!open) return null;

  const widths = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  } as const;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 animate-fade-in bg-ink/35 backdrop-blur-[2px]"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx(
          'relative z-10 flex max-h-[92dvh] w-full flex-col animate-slide-up',
          'rounded-t-3xl border border-cream-400 bg-cream-100 shadow-pop sm:rounded-2xl',
          widths[size],
          'sm:mx-4',
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-cream-400/70 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[1.0625rem] font-semibold leading-tight text-ink">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-muted">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="-mr-1.5 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink touch:h-10 touch:w-10"
          >
            <X className="h-4.5 w-4.5" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {children}
        </div>

        {footer ? (
          // No celular os botões dividem a largura (alvo grande, ao alcance do
          // polegar) e o rodapé sobe acima da barra de gestos do iPhone.
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-cream-400/70 bg-cream-200/60 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-4 max-sm:[&>*]:flex-1">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────── Confirmação de exclusão ──────────────────────── */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            data-autofocus="true"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={clsx(
            'grid h-10 w-10 shrink-0 place-items-center rounded-xl',
            tone === 'danger' ? 'bg-[#FDF0F0] text-status-critical' : 'bg-olive-100 text-olive-700',
          )}
          aria-hidden
        >
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-0 text-[0.9375rem] leading-relaxed text-ink-secondary">{message}</div>
      </div>
    </Modal>
  );
}
