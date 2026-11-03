import { type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CircleAlert, TrendingDown, TrendingUp } from 'lucide-react';
import { VIZ } from '@/lib/viz';
import { integer, money, percentPoints } from '@/lib/format';

/* ═══════════════════════════ Número protagonista ═══════════════════════════
   Um por tela. Figuras proporcionais (nunca tabular num) no tamanho grande.   */

export function HeroFigure({
  label,
  value,
  caption,
  children,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="eyebrow">{label}</p>
      <p className="text-[3rem] font-semibold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[3.5rem]">
        {value}
      </p>
      {caption ? <p className="text-[0.875rem] text-ink-secondary">{caption}</p> : null}
      {children}
    </div>
  );
}

/* ═════════════════════════════ Medidor (meter) ═════════════════════════════
   Trilha = passo mais claro da mesma rampa. Preenchimento carrega a gravidade.
   Ponta do dado arredondada em 4px, base reta.                                */

export function Meter({
  ratio,
  tone = 'default',
  size = 'md',
  label,
  className,
}: {
  /** 0 a 1 (valores acima de 1 são achatados; use `tone` para sinalizar) */
  ratio: number;
  tone?: 'default' | 'warning' | 'critical' | 'muted';
  size?: 'xs' | 'sm' | 'md';
  label?: string;
  className?: string;
}) {
  const safe = Math.max(0, Math.min(Number.isFinite(ratio) ? ratio : 0, 1));
  const heights = { xs: 'h-1.5', sm: 'h-2', md: 'h-2.5' } as const;

  const fill =
    tone === 'critical'
      ? VIZ.status.critical
      : tone === 'warning'
        ? VIZ.status.warning
        : tone === 'muted'
          ? VIZ.reference
          : VIZ.series;

  return (
    <div
      className={clsx('w-full overflow-hidden rounded-full', heights[size], className)}
      style={{ background: VIZ.track }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safe * 100)}
      aria-label={label}
    >
      <div
        className="h-full origin-left animate-grow rounded-r-[4px] transition-[width] duration-500"
        style={{ width: `${safe * 100}%`, background: fill }}
      />
    </div>
  );
}

/* ═══════════════════════════════ Stat tile ════════════════════════════════ */

export function StatTile({
  label,
  value,
  sub,
  delta,
  icon,
  meter,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: { value: number; label: string; goodWhenUp?: boolean } | null;
  icon?: ReactNode;
  meter?: { ratio: number; tone?: 'default' | 'warning' | 'critical' | 'muted' } | null;
  tone?: 'warning' | 'critical' | null;
  className?: string;
}) {
  const goodWhenUp = delta?.goodWhenUp ?? true;
  const positive = (delta?.value ?? 0) >= 0;
  const good = positive === goodWhenUp;

  return (
    <div
      className={clsx(
        'card flex flex-col gap-2 p-4 transition-shadow hover:shadow-card-hover sm:p-5',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.8125rem] font-medium leading-snug text-ink-secondary">{label}</p>
        {icon ? <span className="shrink-0 text-wood-500">{icon}</span> : null}
      </div>

      <p
        className={clsx(
          'text-[1.625rem] font-semibold leading-none tracking-[-0.015em]',
          tone === 'critical'
            ? 'text-ink'
            : tone === 'warning'
              ? 'text-ink'
              : 'text-ink',
        )}
      >
        {value}
      </p>

      {meter ? <Meter ratio={meter.ratio} tone={meter.tone} size="xs" label={label} /> : null}

      {delta || sub || tone ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] leading-snug">
          {tone ? (
            <span className="inline-flex items-center gap-1 font-medium text-ink">
              {tone === 'critical' ? (
                <CircleAlert
                  className="h-3.5 w-3.5"
                  style={{ color: VIZ.status.critical }}
                  aria-hidden
                />
              ) : (
                <AlertTriangle
                  className="h-3.5 w-3.5"
                  style={{ color: VIZ.status.warning }}
                  aria-hidden
                />
              )}
              {tone === 'critical' ? 'Limite atingido' : 'Perto do limite'}
            </span>
          ) : null}
          {delta ? (
            <span className="inline-flex items-center gap-1 text-ink-secondary">
              {positive ? (
                <TrendingUp
                  className="h-3.5 w-3.5"
                  style={{ color: good ? VIZ.status.good : VIZ.status.critical }}
                  aria-hidden
                />
              ) : (
                <TrendingDown
                  className="h-3.5 w-3.5"
                  style={{ color: good ? VIZ.status.good : VIZ.status.critical }}
                  aria-hidden
                />
              )}
              {percentPoints(Math.abs(delta.value))} {delta.label}
            </span>
          ) : null}
          {sub ? <span className="text-ink-muted">{sub}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ════════════════════ Barra empilhada (parte-todo ordinal) ═════════════════
   Separação por um vão de 2px na cor da superfície — nunca por contorno.      */

export interface StackSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function StackedBar({
  segments,
  total,
  unitLabel = 'itens',
}: {
  segments: StackSegment[];
  total: number;
  unitLabel?: string;
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  const denominator = total > 0 ? total : 1;

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex h-6 w-full gap-[2px] overflow-hidden rounded-lg"
        style={{ background: VIZ.track }}
        role="img"
        aria-label={visible
          .map((s) => `${s.label}: ${integer(s.value)} ${unitLabel}`)
          .join('; ')}
      >
        {visible.map((segment, index) => {
          const share = (segment.value / denominator) * 100;
          // Rótulo dentro do segmento só quando couber com folga.
          const fits = share >= 14;
          return (
            <div
              key={segment.key}
              className={clsx(
                'flex min-w-0 items-center justify-center overflow-hidden transition-[flex-basis] duration-500',
                index === 0 && 'rounded-l-lg',
                index === visible.length - 1 && 'rounded-r-lg',
              )}
              style={{ flexBasis: `${share}%`, background: segment.color }}
              title={`${segment.label}: ${integer(segment.value)} ${unitLabel}`}
            >
              {fits ? (
                <span
                  className="px-1 text-[0.6875rem] font-semibold tabular-nums"
                  style={{ color: index >= 1 ? '#F7F6F2' : '#242424' }}
                >
                  {integer(segment.value)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5 text-[0.8125rem]">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: segment.color }}
            />
            <span className="text-ink-secondary">{segment.label}</span>
            <span className="tnum font-semibold text-ink">{integer(segment.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ═════════════════ Linha de orçamento × gasto real (bullet) ════════════════
   Um eixo só: a trilha é o orçamento, o preenchimento é o gasto.              */

export function BulletRow({
  label,
  spent,
  budget,
  estimatedRemaining,
}: {
  label: string;
  spent: number;
  budget: number | null;
  estimatedRemaining?: number;
}) {
  const hasBudget = budget !== null && budget > 0;
  const usage = hasBudget ? spent / budget : null;
  const over = usage !== null && usage >= 1;
  const near = usage !== null && usage >= 0.8 && usage < 1;

  return (
    <div className="flex flex-col gap-1.5 py-2">
      {/* basis-auto: se o nome inteiro não cabe ao lado do valor, o valor
          desce para a linha de baixo. Com flex-1 (base 0) quem cedia era o
          nome, truncado até "B · B…" no celular. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="min-w-0 grow basis-auto truncate text-[0.875rem] font-medium text-ink">{label}</span>
        <span className="tnum ml-auto shrink-0 text-[0.875rem] text-ink">
          {money(spent)}
          {hasBudget ? (
            <span className="text-ink-muted"> / {money(budget)}</span>
          ) : (
            <span className="text-ink-muted"> · sem orçamento</span>
          )}
        </span>
      </div>

      <Meter
        ratio={usage ?? 0}
        tone={over ? 'critical' : near ? 'warning' : hasBudget ? 'default' : 'muted'}
        size="sm"
        label={`${label}: gasto ${money(spent)}${hasBudget ? ` de ${money(budget)}` : ''}`}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.75rem] text-ink-muted">
        {usage !== null ? (
          <span className="inline-flex items-center gap-1">
            {over ? (
              <CircleAlert
                className="h-3 w-3"
                style={{ color: VIZ.status.critical }}
                aria-hidden
              />
            ) : near ? (
              <AlertTriangle
                className="h-3 w-3"
                style={{ color: VIZ.status.warning }}
                aria-hidden
              />
            ) : null}
            <span className="tnum">{percentPoints(usage * 100)} do orçamento</span>
          </span>
        ) : null}
        {estimatedRemaining && estimatedRemaining > 0 ? (
          <span className="tnum">Falta estimado: {money(estimatedRemaining)}</span>
        ) : null}
      </div>
    </div>
  );
}
