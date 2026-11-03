import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/* ──────────────────────────────── Botão ─────────────────────────────────── */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'wood';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-olive-600 text-cream-50 border-olive-600 hover:bg-olive-700 hover:border-olive-700 active:bg-olive-800 shadow-sm',
  secondary:
    'bg-cream-50 text-ink border-greige-300 hover:bg-cream-100 hover:border-greige-400 active:bg-cream-200',
  ghost: 'bg-transparent text-ink-secondary border-transparent hover:bg-greige-100 hover:text-ink',
  danger:
    'bg-cream-50 text-status-critical border-status-critical/40 hover:bg-status-critical hover:text-white hover:border-status-critical',
  wood: 'bg-wood-400 text-ink border-wood-400 hover:bg-wood-500 hover:border-wood-500 active:bg-wood-600 active:text-cream-50',
};

const SIZES: Record<Size, string> = {
  // touch:h-10 — no dedo, 40px é o mínimo confortável; com mouse, 36px basta.
  sm: 'h-9 touch:h-10 px-3 text-[0.8125rem] gap-1.5',
  md: 'h-10 px-4 text-[0.875rem] gap-2',
  lg: 'h-12 px-5 text-[0.9375rem] gap-2',
  icon: 'h-10 w-10 p-0 gap-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-xl border font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
        'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
});

/* ──────────────────────────────── Cartão ────────────────────────────────── */

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article' | 'li';
}) {
  return <Tag className={clsx('card', className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex flex-wrap items-start justify-between gap-3 border-b border-cream-400/70 px-5 py-4 sm:px-6',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-wood-100 text-wood-600">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-[1.0625rem] font-semibold leading-tight text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ──────────────────────────── Etiquetas / chips ─────────────────────────── */

export function Chip({
  children,
  className,
  dot,
  icon,
  title,
}: {
  children: ReactNode;
  className?: string;
  /** cor do ponto de identidade; o texto permanece em tinta */
  dot?: string;
  icon?: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5',
        'text-[0.75rem] font-medium leading-5',
        className ?? 'border-greige-300 bg-cream-200 text-ink-secondary',
      )}
    >
      {dot ? (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full ring-2 ring-cream-100"
          style={{ background: dot }}
        />
      ) : null}
      {icon}
      {children}
    </span>
  );
}

/* ──────────────────────────── Estados vazios ────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
      )}
    >
      {icon ? (
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-greige-100 text-ink-muted">
          {icon}
        </span>
      ) : null}
      <h3 className="text-[0.9375rem] font-semibold text-ink">{title}</h3>
      {description ? (
        <p className="max-w-md text-[0.875rem] leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/* ──────────────────────────────── Carga ─────────────────────────────────── */

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={clsx('inline-flex items-center gap-2 text-ink-muted', className)}>
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label ? <span className="text-[0.875rem]">{label}</span> : <span className="sr-only">Carregando…</span>}
    </span>
  );
}

export function FullPageLoader({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-ink-muted">
        <Loader2 className="h-7 w-7 animate-spin text-olive-600" aria-hidden />
        <p className="text-[0.875rem]">{label}</p>
      </div>
    </div>
  );
}

/* ────────────────────────── Caixa de aviso ──────────────────────────────── */

export function Notice({
  tone = 'info',
  title,
  children,
  icon,
  action,
}: {
  tone?: 'info' | 'warning' | 'critical' | 'good';
  title?: ReactNode;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    info: 'border-greige-300 bg-cream-200',
    warning: 'border-status-warning/45 bg-[#FFF8E6]',
    critical: 'border-status-critical/40 bg-[#FDF0F0]',
    good: 'border-olive-300 bg-olive-100',
  } as const;

  const dots = {
    info: 'var(--text-muted)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-critical)',
    good: 'var(--status-good)',
  } as const;

  return (
    <div
      className={clsx('flex flex-wrap items-start gap-3 rounded-xl border px-4 py-3', tones[tone])}
    >
      <span className="mt-0.5 shrink-0" style={{ color: dots[tone] }} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-[0.875rem] leading-relaxed text-ink">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={clsx(title && 'mt-0.5 text-ink-secondary')}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* ───────────────────── Botão que navega (react-router) ──────────────────── */

export function LinkButton({
  to,
  variant = 'secondary',
  size = 'md',
  block,
  className,
  children,
  ...rest
}: {
  to: string;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<LinkProps, 'to' | 'className' | 'children'>) {
  return (
    <Link
      to={to}
      className={clsx(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-xl border font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
        'active:scale-[0.985]',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}
