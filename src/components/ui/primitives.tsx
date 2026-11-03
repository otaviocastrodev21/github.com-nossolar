import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';
import { Link, type LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/* ──────────────────────────────── Botão ─────────────────────────────────── */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'wood';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<Variant, string> = {
  // btn-primary (index.css): degradê, brilho no topo e reflexo ao passar o mouse.
  primary: 'btn-primary text-cream-50 border-olive-700/60',
  secondary:
    'bg-cream-50/70 text-ink border-greige-300/90 shadow-[inset_0_1px_0_rgb(255_255_255/0.5)] backdrop-blur hover:bg-cream-50 hover:border-greige-400 hover:-translate-y-px active:bg-cream-200',
  ghost: 'bg-transparent text-ink-secondary border-transparent hover:bg-greige-100/80 hover:text-ink',
  danger:
    'bg-cream-50/70 text-status-critical border-status-critical/40 hover:bg-status-critical hover:text-white hover:border-status-critical hover:shadow-[0_8px_20px_-8px_rgb(208_59_59/0.6)]',
  wood: 'bg-gradient-to-b from-wood-300 to-wood-400 text-ink border-wood-400 hover:from-wood-400 hover:to-wood-500 active:to-wood-600',
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
        'transition-[background-color,border-color,color,box-shadow,transform] duration-200',
        'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-55',
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
        'flex flex-wrap items-start justify-between gap-3 border-b border-cream-400/60 px-5 py-4 sm:px-6',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-wood-100 to-wood-200 text-wood-600 ring-1 ring-wood-300/50">
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
        <span className="relative isolate grid h-14 w-14 animate-float place-items-center rounded-2xl bg-gradient-to-br from-wood-100 to-olive-100 text-olive-600 ring-1 ring-cream-400">
          <span aria-hidden className="absolute inset-0 -z-10 rounded-2xl bg-olive-300/40 blur-xl" />
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
    <div className="grid min-h-[60vh] place-items-center" role="status">
      <div className="flex flex-col items-center gap-4 text-ink-muted">
        <span className="relative isolate grid h-16 w-16 place-items-center rounded-2xl bg-cream-100/80 shadow-card ring-1 ring-cream-400 backdrop-blur">
          <span aria-hidden className="absolute inset-0 -z-10 animate-soft-pulse rounded-2xl bg-olive-300/50 blur-2xl" />
          <Logo className="h-9 w-9" animated />
        </span>
        <p className="animate-soft-pulse text-[0.875rem]">{label}</p>
      </div>
    </div>
  );
}

/* ──────────────────────────────── Marca ─────────────────────────────────── */

/** A casinha com o visto. `animated` desenha os traços, um depois do outro. */
export function Logo({ className, animated }: { className?: string; animated?: boolean }) {
  const traco = (atraso: number, comprimento: number) =>
    animated
      ? {
          strokeDasharray: comprimento,
          ['--draw-length' as string]: comprimento,
          animationDelay: `${atraso}ms`,
        }
      : undefined;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        d="M6 15.2 16 7l10 8.2"
        fill="none"
        className={clsx('stroke-wood-600', animated && 'animate-draw')}
        style={traco(0, 28)}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 14.6V24.5h13V14.6"
        fill="none"
        className={clsx('stroke-ink', animated && 'animate-draw')}
        style={traco(220, 34)}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.8 19.4l2.5 2.5 4.4-5.2"
        fill="none"
        className={clsx('stroke-olive-600', animated && 'animate-draw')}
        style={traco(480, 12)}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
    info: 'border-greige-300/80 bg-cream-200/70',
    warning: 'border-status-warning/45 bg-tint-warning/80',
    critical: 'border-status-critical/40 bg-tint-critical/80',
    good: 'border-olive-300 bg-olive-100/80',
  } as const;

  const dots = {
    info: 'var(--text-muted)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-critical)',
    good: 'var(--status-good)',
  } as const;

  return (
    <div
      className={clsx(
        'flex animate-rise-in flex-wrap items-start gap-3 rounded-xl border px-4 py-3 backdrop-blur',
        tones[tone],
      )}
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
        'transition-[background-color,border-color,color,box-shadow,transform] duration-200',
        'active:scale-[0.97]',
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
