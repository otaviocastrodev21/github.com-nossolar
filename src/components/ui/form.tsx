import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import clsx from 'clsx';
import { AlertCircle, Check } from 'lucide-react';

/* ─────────────────────────── Invólucro do campo ─────────────────────────── */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={clsx('min-w-0', className)}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-status-critical">*</span> : null}
        {!required ? <span className="ml-1.5 text-[0.75rem] text-ink-muted">(opcional)</span> : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] text-ink" role="alert">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-critical" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/* ──────────────────────────────── Entradas ──────────────────────────────── */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  prefix?: string;
  suffix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, prefix, suffix, className, ...rest },
  ref,
) {
  if (!prefix && !suffix) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={clsx('field', invalid && 'field-error', className)}
        {...rest}
      />
    );
  }

  return (
    <div
      className={clsx(
        'flex items-center overflow-hidden rounded-xl border bg-cream-50 transition',
        'focus-within:border-olive-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-olive-500/25',
        invalid ? 'border-status-critical' : 'border-greige-300',
        className,
      )}
    >
      {prefix ? (
        <span className="shrink-0 select-none pl-3.5 text-[0.875rem] text-ink-muted">{prefix}</span>
      ) : null}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className="min-w-0 flex-1 bg-transparent px-2.5 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-ink-muted/70"
        {...rest}
      />
      {suffix ? (
        <span className="shrink-0 select-none pr-3.5 text-[0.875rem] text-ink-muted">{suffix}</span>
      ) : null}
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ invalid, className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={clsx(
          'field appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10',
          invalid && 'field-error',
          className,
        )}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%235C5A53' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6.5 8 10.5l4-4'/%3E%3C/svg%3E\")",
        }}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ invalid, className, rows = 3, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={clsx('field resize-y leading-relaxed', invalid && 'field-error', className)}
      {...rest}
    />
  );
});

/** Campo de dinheiro: aceita "1.234,56", "1234,56" ou "R$ 80". */
export const MoneyInput = forwardRef<HTMLInputElement, InputProps>(function MoneyInput(props, ref) {
  return (
    <Input
      ref={ref}
      inputMode="decimal"
      autoComplete="off"
      prefix="R$"
      placeholder="0,00"
      className="tnum"
      {...props}
    />
  );
});

/* ──────────────────────────── Caixa de seleção ──────────────────────────── */

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled,
  className,
  id: providedId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const autoId = useId();
  const id = providedId ?? autoId;

  return (
    <div className={clsx('flex items-start gap-2.5', className)}>
      <span className="relative mt-0.5 inline-flex h-5 w-5 shrink-0">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 h-5 w-5 cursor-pointer appearance-none rounded-md border border-greige-400 bg-cream-50
                     transition checked:border-olive-600 checked:bg-olive-600
                     disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Check
          className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 text-cream-50 opacity-0 transition peer-checked:opacity-100"
          strokeWidth={3}
          aria-hidden
        />
      </span>
      <label htmlFor={id} className={clsx('min-w-0 text-[0.875rem] leading-5', disabled ? 'text-ink-muted' : 'cursor-pointer text-ink')}>
        {label}
        {hint ? <span className="mt-0.5 block text-[0.8125rem] text-ink-muted">{hint}</span> : null}
      </label>
    </div>
  );
}

/* ──────────────────────── Grupo de botões (segmentos) ───────────────────── */

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={clsx(
        'inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-greige-300 bg-cream-200 p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={clsx(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[0.625rem] font-medium transition',
              size === 'sm' ? 'h-8 px-2.5 text-[0.75rem]' : 'h-9 px-3 text-[0.8125rem]',
              active
                ? 'bg-cream-50 text-ink shadow-sm'
                : 'text-ink-muted hover:bg-cream-100 hover:text-ink-secondary',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
