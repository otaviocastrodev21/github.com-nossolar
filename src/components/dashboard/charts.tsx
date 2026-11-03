import { useMemo, useState, type ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import { SegmentedControl } from '@/components/ui/form';
import { EmptyState } from '@/components/ui/primitives';
import { VIZ } from '@/lib/viz';
import { integer, money, moneyCompact, monthShortBR } from '@/lib/format';
import { useIsPhone } from '@/lib/media';
import type { CategoryBreakdown, MonthBreakdown } from '@/lib/calc';

/* ═════════════════════════ Invólucro com visão em tabela ══════════════════
   Todo gráfico tem um gêmeo em tabela: nenhum valor fica preso no tooltip.   */

function ChartCard({
  title,
  subtitle,
  empty,
  chart,
  table,
  action,
}: {
  title: string;
  subtitle?: string;
  empty?: ReactNode;
  chart: ReactNode;
  table: ReactNode;
  action?: ReactNode;
}) {
  const [view, setView] = useState<'grafico' | 'tabela'>('grafico');

  return (
    <section className="card flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-cream-400/70 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-[1.0625rem] font-semibold leading-tight text-ink">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {!empty ? (
            <SegmentedControl
              label="Forma de visualização"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'grafico', label: <BarChart3 className="h-3.5 w-3.5" />, title: 'Gráfico' },
                { value: 'tabela', label: <Table2 className="h-3.5 w-3.5" />, title: 'Tabela' },
              ]}
            />
          ) : null}
        </div>
      </div>

      <div className="min-w-0 px-5 py-5 sm:px-6">
        {empty ?? (view === 'grafico' ? chart : table)}
      </div>
    </section>
  );
}

/* ════════════════════════════════ Tooltip ═════════════════════════════════ */

function VizTooltip({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; color?: string }[];
}) {
  return (
    <div className="pointer-events-none rounded-xl border border-cream-400 bg-cream-50 px-3 py-2 shadow-pop">
      <p className="text-[0.8125rem] font-semibold text-ink">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-[0.8125rem]">
            {row.color ? (
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: row.color }}
              />
            ) : null}
            <span className="text-ink-muted">{row.label}</span>
            <span className="tnum ml-auto font-medium text-ink">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ══════════════════════ Despesas por categoria (barras) ═══════════════════
   Categorias são nominais e são 14 — acima do teto de 8 matizes. O
   comprimento da barra já codifica a magnitude, então usamos UM matiz para
   todas e dobramos a cauda em "Outras categorias".                           */

const TOP_N = 8;

interface CategoryRow {
  name: string;
  code: string;
  spent: number;
  budget: number | null;
  estimatedRemaining: number;
  isOther: boolean;
}

export function CategorySpendChart({ rows }: { rows: CategoryBreakdown[] }) {
  const data = useMemo<CategoryRow[]>(() => {
    const withSpend = rows
      .filter((row) => row.spent > 0)
      .sort((a, b) => b.spent - a.spent)
      .map((row) => ({
        name: row.name,
        code: row.code,
        spent: row.spent,
        budget: row.budget,
        estimatedRemaining: row.estimatedRemaining,
        isOther: false,
      }));

    if (withSpend.length <= TOP_N) return withSpend;

    const head = withSpend.slice(0, TOP_N);
    const tail = withSpend.slice(TOP_N);
    head.push({
      name: `Outras ${tail.length} categorias`,
      code: '—',
      spent: tail.reduce((acc, row) => acc + row.spent, 0),
      budget: null,
      estimatedRemaining: tail.reduce((acc, row) => acc + row.estimatedRemaining, 0),
      isOther: true,
    });
    return head;
  }, [rows]);

  const total = data.reduce((acc, row) => acc + row.spent, 0);
  // A altura cresce com o número de linhas e inclui a faixa do eixo X.
  const height = Math.max(data.length * 40 + 44, 180);
  // No celular o eixo de nomes encolhe e o nome longo é abreviado — o nome
  // inteiro continua no tooltip e na visão de tabela. Antes o gráfico pedia
  // 420px e rolava de lado numa tela de 360.
  const phone = useIsPhone();
  // 116px e no máximo 14 caracteres cabem numa linha a 11,5px; mais que
  // isso o Recharts quebra o rótulo em duas ("Quarto do / casal").
  const nameAxis = phone ? 116 : 150;
  const abreviar = (nome: string) => (phone && nome.length > 14 ? `${nome.slice(0, 12).trimEnd()}…` : nome);

  return (
    <ChartCard
      title="Despesas por categoria"
      subtitle={total > 0 ? `${money(total)} desembolsados até agora` : undefined}
      empty={
        data.length === 0 ? (
          <EmptyState
            compact
            title="Nenhuma despesa registrada"
            description="Assim que vocês registrarem a primeira compra, o gasto por categoria aparece aqui."
          />
        ) : undefined
      }
      chart={
        <div className="scroll-x scroll-x-bleed">
          <div>
            <ResponsiveContainer width="100%" height={height}>
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: 4, right: phone ? 60 : 76, bottom: 8, left: 4 }}
                barCategoryGap={10}
              >
                <CartesianGrid horizontal={false} stroke={VIZ.hairline} />
                <XAxis
                  type="number"
                  tickFormatter={(value: number) => moneyCompact(value)}
                  axisLine={{ stroke: VIZ.hairline }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={nameAxis}
                  tickFormatter={abreviar}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  tick={{ fontSize: 11.5, fill: VIZ.textSecondary }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(120,129,92,0.06)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as CategoryRow;
                    return (
                      <VizTooltip
                        title={row.name}
                        rows={[
                          { label: 'Gasto', value: money(row.spent), color: VIZ.series },
                          ...(row.budget !== null
                            ? [{ label: 'Orçamento', value: money(row.budget) }]
                            : []),
                          ...(row.estimatedRemaining > 0
                            ? [{ label: 'Falta estimado', value: money(row.estimatedRemaining) }]
                            : []),
                        ]}
                      />
                    );
                  }}
                />
                <Bar dataKey="spent" maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive>
                  {data.map((row) => (
                    <Cell
                      key={row.name}
                      fill={row.isOther ? VIZ.reference : VIZ.series}
                    />
                  ))}
                  <LabelList
                    dataKey="spent"
                    position="right"
                    offset={8}
                    formatter={(value: number) => moneyCompact(value)}
                    style={{ fontSize: 11.5, fill: VIZ.textSecondary, fontVariantNumeric: 'tabular-nums' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      }
      table={
        <div className="scroll-x scroll-x-bleed">
          <table className="w-full min-w-[420px] text-[0.875rem]">
            <caption className="sr-only">Despesas por categoria</caption>
            <thead>
              <tr className="border-b border-cream-400 text-left text-[0.75rem] uppercase tracking-wide text-ink-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">Categoria</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Gasto</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Orçamento</th>
                <th scope="col" className="py-2 text-right font-semibold">Falta estimado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.name} className="border-b border-cream-300/80 last:border-0">
                  <td className="py-2 pr-3 text-ink">{row.name}</td>
                  <td className="tnum py-2 pr-3 text-right font-medium text-ink">{money(row.spent)}</td>
                  <td className="tnum py-2 pr-3 text-right text-ink-secondary">
                    {row.budget === null ? '—' : money(row.budget)}
                  </td>
                  <td className="tnum py-2 text-right text-ink-secondary">
                    {row.estimatedRemaining > 0 ? money(row.estimatedRemaining) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-cream-400">
                <th scope="row" className="py-2 pr-3 text-left font-semibold text-ink">Total</th>
                <td className="tnum py-2 pr-3 text-right font-semibold text-ink">{money(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      }
    />
  );
}

/* ═══════════════ Evolução dos gastos por mês (área, 1 série) ══════════════
   Uma série só, então sem caixa de legenda: o título já diz o que é. A meta
   mensal entra como linha de referência (um limiar, não uma segunda série).   */

export function MonthlySpendChart({
  rows,
  monthlyGoal,
}: {
  rows: MonthBreakdown[];
  monthlyGoal: number | null;
}) {
  const phone = useIsPhone();
  const data = useMemo(
    () =>
      rows
        .filter((row) => row.spent > 0 || row.committed > 0)
        .map((row) => ({
          ...row,
          label: monthShortBR(row.monthKey),
        })),
    [rows],
  );

  const lastWithSpend = [...data].reverse().find((row) => row.spent > 0);

  return (
    <ChartCard
      title="Evolução dos gastos por mês"
      subtitle="Valor efetivamente desembolsado em cada mês"
      empty={
        data.length === 0 ? (
          <EmptyState
            compact
            title="Ainda sem histórico mensal"
            description="O gráfico se desenha sozinho conforme vocês registram as compras."
          />
        ) : undefined
      }
      chart={
        <div className="scroll-x scroll-x-bleed">
          {/* A série cabe inteira na largura: o Recharts omite os rótulos que
              colidiriam e o tooltip mostra cada mês. Rolar de lado escondia
              meses sem nenhum indício de que existiam — com as parcelas
              futuras, um ano inteiro sumia à direita. Só uma série muito
              longa (mais de 18 meses) ganha largura mínima e rola. */}
          <div style={{ minWidth: data.length > 18 ? data.length * 40 : undefined }}>
            <ResponsiveContainer width="100%" height={264}>
              <AreaChart data={data} margin={{ top: 20, right: 20, bottom: 8, left: 4 }}>
                <CartesianGrid vertical={false} stroke={VIZ.hairline} />
                <XAxis
                  dataKey="label"
                  axisLine={{ stroke: VIZ.hairline }}
                  tickLine={false}
                  // Sem recuo o último mês ficava colado na borda e o rótulo,
                  // centrado nele, saía cortado ("de…" em vez de "dez/2026").
                  padding={{ left: 18, right: 18 }}
                  interval="preserveStartEnd"
                  minTickGap={phone ? 10 : 6}
                  tickFormatter={(label: string) =>
                    phone ? label.replace(/\/\d{2}(\d{2})$/, '/$1') : label
                  }
                  tick={{ fontSize: 11.5, fill: VIZ.textMuted }}
                />
                <YAxis
                  tickFormatter={(value: number) => moneyCompact(value)}
                  axisLine={false}
                  tickLine={false}
                  // 64px quebrava "R$ 4,5 mil" em duas linhas.
                  width={72}
                  tick={{ fontSize: 11.5, fill: VIZ.textMuted }}
                />
                <Tooltip
                  cursor={{ stroke: VIZ.reference, strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0].payload as MonthBreakdown & { label: string };
                    return (
                      <VizTooltip
                        title={row.label}
                        rows={[
                          { label: 'Desembolsado', value: money(row.spent), color: VIZ.seriesLine },
                          ...(row.committed > 0
                            ? [{ label: 'Parcelas a vencer', value: money(row.committed) }]
                            : []),
                          ...(row.purchaseCount > 0
                            ? [{ label: 'Compras', value: integer(row.purchaseCount) }]
                            : []),
                          ...(row.budget !== null
                            ? [{ label: 'Meta do mês', value: money(row.budget) }]
                            : []),
                        ]}
                      />
                    );
                  }}
                />
                {monthlyGoal && monthlyGoal > 0 ? (
                  <ReferenceLine
                    y={monthlyGoal}
                    stroke={VIZ.reference}
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    label={{
                      value: `Meta ${moneyCompact(monthlyGoal)}`,
                      position: 'insideTopRight',
                      fontSize: 11,
                      fill: VIZ.textMuted,
                    }}
                  />
                ) : null}
                <Area
                  type="monotone"
                  dataKey="spent"
                  stroke={VIZ.seriesLine}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  fill={VIZ.seriesWash}
                  dot={{ r: 4, fill: VIZ.seriesLine, stroke: VIZ.surface, strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: VIZ.seriesLine, stroke: VIZ.surface, strokeWidth: 2 }}
                >
                  {/* Rótulo direto apenas no último ponto com valor. */}
                  <LabelList
                    dataKey="spent"
                    position="top"
                    offset={10}
                    formatter={(value: number) =>
                      lastWithSpend && value === lastWithSpend.spent ? moneyCompact(value) : ''
                    }
                    style={{ fontSize: 11.5, fill: VIZ.textSecondary, fontVariantNumeric: 'tabular-nums' }}
                  />
                </Area>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      }
      table={
        <div className="scroll-x scroll-x-bleed">
          <table className="w-full min-w-[420px] text-[0.875rem]">
            <caption className="sr-only">Gastos por mês</caption>
            <thead>
              <tr className="border-b border-cream-400 text-left text-[0.75rem] uppercase tracking-wide text-ink-muted">
                <th scope="col" className="py-2 pr-3 font-semibold">Mês</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Desembolsado</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">A vencer</th>
                <th scope="col" className="py-2 pr-3 text-right font-semibold">Compras</th>
                <th scope="col" className="py-2 text-right font-semibold">Meta</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.monthKey} className="border-b border-cream-300/80 last:border-0">
                  <td className="py-2 pr-3 text-ink">{row.label}</td>
                  <td className="tnum py-2 pr-3 text-right font-medium text-ink">{money(row.spent)}</td>
                  <td className="tnum py-2 pr-3 text-right text-ink-secondary">
                    {row.committed > 0 ? money(row.committed) : '—'}
                  </td>
                  <td className="tnum py-2 pr-3 text-right text-ink-secondary">
                    {integer(row.purchaseCount)}
                  </td>
                  <td className="tnum py-2 text-right text-ink-secondary">
                    {row.budget === null ? '—' : money(row.budget)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    />
  );
}

/* ═══════════ Estimado × realizado por item (dumbbell, 1 matiz) ════════════
   "Antes → depois" por item: um matiz em dois tons, ligados por um fio.      */

export interface DumbbellRow {
  id: string;
  name: string;
  estimated: number;
  actual: number;
}

export function EstimateVsActual({ rows }: { rows: DumbbellRow[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.max(row.estimated, row.actual)));

  if (rows.length === 0) {
    return (
      <EmptyState
        compact
        title="Nada para comparar ainda"
        description="A comparação aparece quando houver preço estimado preenchido e compra registrada no mesmo item."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[0.8125rem]">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: '#C1C8AE' }} />
          <span className="text-ink-secondary">Estimado</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: '#434A2A' }} />
          <span className="text-ink-secondary">Realizado</span>
        </li>
      </ul>

      <ul className="flex flex-col divide-y divide-cream-300/80">
        {rows.map((row) => {
          const estimatedPct = (row.estimated / max) * 100;
          const actualPct = (row.actual / max) * 100;
          const from = Math.min(estimatedPct, actualPct);
          const to = Math.max(estimatedPct, actualPct);
          const over = row.actual > row.estimated;

          return (
            <li key={row.id} className="py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink">{row.name}</span>
                <span className="tnum shrink-0 text-[0.8125rem]">
                  <span className="text-ink-muted">{money(row.estimated)}</span>
                  <span className="mx-1 text-ink-muted" aria-hidden>→</span>
                  <span className="font-medium text-ink">{money(row.actual)}</span>
                  <span className={over ? 'ml-2 text-ink' : 'ml-2 text-ink-secondary'}>
                    ({over ? '+' : '−'}
                    {money(Math.abs(row.actual - row.estimated)).replace('R$ ', 'R$ ')})
                  </span>
                </span>
              </div>

              <div className="relative mt-2 h-3" role="img" aria-label={`${row.name}: estimado ${money(row.estimated)}, realizado ${money(row.actual)}`}>
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-cream-400" />
                <div
                  className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full"
                  style={{ left: `${from}%`, width: `${Math.max(to - from, 0)}%`, background: '#9BA382' }}
                />
                <span
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
                  style={{ left: `${estimatedPct}%`, background: '#C1C8AE', ['--tw-ring-color' as string]: VIZ.surface }}
                />
                <span
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
                  style={{ left: `${actualPct}%`, background: '#434A2A', ['--tw-ring-color' as string]: VIZ.surface }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
