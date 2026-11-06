import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CircleAlert,
  CreditCard,
  PackageCheck,
  PiggyBank,
  Plus,
  ShoppingBag,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useIsPhone } from '@/lib/media';
import {
  Button,
  Card,
  CardHeader,
  Chip,
  EmptyState,
  LinkButton,
  Notice,
} from '@/components/ui/primitives';
import { Select } from '@/components/ui/form';
import {
  AnimatedNumber,
  BulletRow,
  Meter,
  ProgressRing,
  StackedBar,
  StatTile,
} from '@/components/dashboard/figures';
import { CategorySpendChart, MonthlySpendChart } from '@/components/dashboard/charts';
import { PurchaseForm } from '@/components/purchases/PurchaseForm';
import { useSpace } from '@/contexts/SpaceContext';
import { useSession } from '@/contexts/SessionContext';
import { nextPriorityItems, recentPurchases } from '@/lib/calc';
import { dateBR, integer, money, monthLongBR, percentPoints, plural, quantity, unitFor } from '@/lib/format';
import { STATUS_FILL, PRIORITY_CHIP } from '@/lib/viz';
import { PRIORITY_LABEL, STATUS_LABEL } from '@/types/database';

export function Dashboard() {
  const {
    overview,
    items,
    purchases,
    categoryById,
    memberName,
    monthKey,
    setMonthKey,
    space,
  } = useSpace();
  const { displayName } = useSession();
  const phone = useIsPhone();
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const hora = new Date().getHours();
  const saudacao = hora < 5 ? 'Boa noite' : hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = displayName === 'Participante' ? '' : displayName.split(/\s+/)[0];
  const emAberto = overview.itemsPending + overview.itemsPartial;

  const monthOptions = useMemo(() => {
    const keys = new Set<string>([monthKey]);
    for (const row of overview.byMonth) keys.add(row.monthKey);
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [overview.byMonth, monthKey]);

  const recent = useMemo(() => recentPurchases(purchases, 6), [purchases]);
  const priority = useMemo(() => nextPriorityItems(items, 6), [items]);

  const budgetUndefined = overview.budgetTotal === null;
  const hasActivity = overview.totalSpent > 0 || purchases.length > 0;

  return (
    <>
      <div className="stagger flex flex-col gap-5">
        {/* ── Topo: saudação, anel do enxoval e os três números que mais importam ── */}
        <Card className="overflow-hidden">
          {/* luzes do topo */}
          <span aria-hidden className="pointer-events-none absolute -left-16 -top-20 -z-10 h-64 w-64 rounded-full bg-wood-300/40 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -bottom-24 right-0 -z-10 h-72 w-72 rounded-full bg-olive-300/40 blur-3xl" />

          <div className="flex flex-wrap items-end justify-between gap-4 px-5 pt-5 sm:px-7 sm:pt-7">
            <div className="min-w-0">
              <p className="eyebrow flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-wood-500" aria-hidden />
                {space?.name ?? 'Nosso Lar'}
              </p>
              <h1 className="text-gradient mt-1 text-[1.875rem] font-semibold leading-tight tracking-[-0.03em] sm:text-[2.375rem]">
                {saudacao}
                {primeiroNome ? `, ${primeiroNome}` : ''}.
              </h1>
              <p className="mt-1 text-[0.9375rem] text-ink-secondary">
                {overview.itemsTotal === 0
                  ? 'O checklist está pronto para começar.'
                  : emAberto === 0
                    ? 'Tudo comprado. A casa está pronta!'
                    : `Faltam ${plural(emAberto, 'item', 'itens')} para completar o enxoval.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="mes-referencia">
                Mês de referência
              </label>
              <Select
                id="mes-referencia"
                className="w-auto min-w-[9.5rem]"
                value={monthKey}
                onChange={(event) => setMonthKey(event.target.value)}
              >
                {monthOptions.map((key) => (
                  <option key={key} value={key}>
                    {monthLongBR(key)}
                  </option>
                ))}
              </Select>
              <Button variant="primary" onClick={() => setPurchaseOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                Registrar compra
              </Button>
            </div>
          </div>

          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-10">
            <div className="flex items-center gap-4 sm:gap-6 lg:flex-col lg:items-start">
              <ProgressRing
                ratio={overview.completion}
                size={phone ? 128 : 168}
                stroke={phone ? 11 : 14}
                label={`Conclusão do enxoval: ${percentPoints(overview.completion * 100)}`}
              >
                <div>
                  <AnimatedNumber
                    value={overview.completion * 100}
                    format={(n) => percentPoints(n)}
                    className="block text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-ink sm:text-[2.25rem]"
                  />
                  <span className="mt-1 block text-[0.75rem] font-medium text-ink-muted">concluído</span>
                </div>
              </ProgressRing>
              <p className="min-w-0 max-w-[16rem] text-[0.8125rem] leading-relaxed text-ink-muted">
                {quantity(overview.unitsBought)} de {quantity(overview.unitsPlanned)} unidades
                planejadas. Tarefas de verificação e itens “não será comprado” ficam de fora.
              </p>
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:first-child]:max-sm:col-span-2">
                {[
                  { rotulo: 'Já gasto', valor: overview.totalSpent, icone: Wallet },
                  { rotulo: 'Falta (estimado)', valor: overview.estimatedRemaining, icone: PackageCheck },
                  {
                    rotulo: overview.balance === null ? 'Em parcelas' : 'Saldo',
                    valor: overview.balance === null ? overview.committed : overview.balance,
                    icone: overview.balance === null ? CreditCard : PiggyBank,
                  },
                ].map(({ rotulo, valor, icone: Icone }) => (
                  <div
                    key={rotulo}
                    className="rounded-2xl border border-cream-400/70 bg-cream-50/60 px-4 py-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.4)] backdrop-blur"
                  >
                    <dt className="flex items-center gap-1.5 text-[0.75rem] font-medium text-ink-muted">
                      <Icone className="h-3.5 w-3.5 text-wood-500" aria-hidden />
                      {rotulo}
                    </dt>
                    <dd className="mt-1 text-[1.25rem] font-semibold tracking-[-0.015em] text-ink">
                      <AnimatedNumber value={valor} format={money} />
                    </dd>
                  </div>
                ))}
              </dl>

              <div>
                <h3 className="mb-2.5 text-[0.8125rem] font-semibold text-ink-secondary">
                  Situação dos {integer(overview.itemsTotal)} itens
                </h3>
                <StackedBar
                  total={overview.itemsTotal}
                  segments={overview.statusMix.map((entry) => ({
                    key: entry.status,
                    label: STATUS_LABEL[entry.status],
                    value: entry.count,
                    color: STATUS_FILL[entry.status],
                  }))}
                />
                {overview.itemsExcluded > 0 ? (
                  <p className="mt-2 text-[0.75rem] text-ink-muted">
                    {plural(overview.itemsExcluded, 'item marcado', 'itens marcados')} como “não será
                    comprado” {overview.itemsExcluded === 1 ? 'fica' : 'ficam'} fora da conta.
                  </p>
                ) : null}
              </div>

              {overview.tasksTotal > 0 ? (
                <div className="rounded-xl border border-cream-400/70 bg-cream-200/50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[0.875rem] font-medium text-ink">
                      Tarefas de verificação da casa
                    </span>
                    <span className="tnum text-[0.875rem] text-ink-secondary">
                      {overview.tasksDone} de {overview.tasksTotal} concluídas
                    </span>
                  </div>
                  <Meter
                    ratio={overview.tasksTotal > 0 ? overview.tasksDone / overview.tasksTotal : 0}
                    size="xs"
                    className="mt-2"
                    label="Progresso das tarefas de verificação"
                  />
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        {/* ── Alertas de orçamento ── */}
        {budgetUndefined ? (
          <Notice
            tone="info"
            icon={<Target className="h-4.5 w-4.5" />}
            title="Orçamento ainda não definido"
            action={
              <LinkButton to="/financeiro" variant="primary" size="sm">
                Definir orçamento
              </LinkButton>
            }
          >
            Enquanto o orçamento total não for informado, o saldo e os alertas de limite ficam em
            branco — nada é estimado por conta própria.
          </Notice>
        ) : null}

        {overview.alerts.map((alert) => (
          <Notice
            key={alert.categoryId}
            tone={alert.level === 'estourado' ? 'critical' : 'warning'}
            icon={
              alert.level === 'estourado' ? (
                <CircleAlert className="h-4.5 w-4.5" />
              ) : (
                <AlertTriangle className="h-4.5 w-4.5" />
              )
            }
            title={
              alert.level === 'estourado'
                ? `${alert.name}: orçamento estourado`
                : `${alert.name}: ${percentPoints((alert.usage ?? 0) * 100)} do orçamento usado`
            }
          >
            {money(alert.spent)} gastos de {money(alert.budget ?? 0)} previstos.
            {alert.estimatedRemaining > 0 ? (
              <> Ainda faltam {money(alert.estimatedRemaining)} estimados nesta categoria.</>
            ) : null}
          </Notice>
        ))}

        {/* ── Indicadores ── */}
        <section>
          <h2 className="eyebrow mb-3">Indicadores</h2>
          <div className="stagger grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile
              label="Total efetivamente gasto"
              value={<AnimatedNumber value={overview.totalSpent} format={money} />}
              icon={<Wallet className="h-4 w-4" aria-hidden />}
              sub={
                overview.extrasSpent > 0
                  ? `inclui ${money(overview.extrasSpent)} de despesas adicionais`
                  : 'parcelas pagas e compras quitadas'
              }
            />
            <StatTile
              label="Orçamento total"
              value={
                overview.budgetTotal === null ? (
                  'Não definido'
                ) : (
                  <AnimatedNumber value={overview.budgetTotal} format={money} />
                )
              }
              icon={<Target className="h-4 w-4" aria-hidden />}
              meter={
                overview.budgetUsage !== null
                  ? {
                      ratio: overview.budgetUsage,
                      tone:
                        overview.budgetUsage >= 1
                          ? 'critical'
                          : overview.budgetUsage >= 0.8
                            ? 'warning'
                            : 'default',
                    }
                  : null
              }
              sub={
                overview.budgetUsage !== null
                  ? `${percentPoints(overview.budgetUsage * 100)} utilizado`
                  : 'defina no Financeiro'
              }
            />
            <StatTile
              label="Saldo disponível"
              value={overview.balance === null ? '—' : <AnimatedNumber value={overview.balance} format={money} />}
              icon={<PiggyBank className="h-4 w-4" aria-hidden />}
              tone={overview.balance !== null && overview.balance < 0 ? 'critical' : null}
              sub={overview.balance === null ? 'depende do orçamento total' : undefined}
            />
            <StatTile
              label="Falta comprar (estimado)"
              value={<AnimatedNumber value={overview.estimatedRemaining} format={money} />}
              icon={<PackageCheck className="h-4 w-4" aria-hidden />}
              sub={`${plural(overview.itemsPending + overview.itemsPartial, 'item em aberto', 'itens em aberto')}`}
            />

            <StatTile
              label="Itens comprados"
              value={<AnimatedNumber value={overview.itemsDone} format={(n) => integer(Math.round(n))} />}
              icon={<PackageCheck className="h-4 w-4" aria-hidden />}
              sub={`de ${integer(overview.itemsTotal)} no enxoval`}
            />
            <StatTile
              label="Parcialmente comprados"
              value={<AnimatedNumber value={overview.itemsPartial} format={(n) => integer(Math.round(n))} />}
              sub="já começados, falta completar"
            />
            <StatTile
              label="Itens pendentes"
              value={<AnimatedNumber value={overview.itemsPending} format={(n) => integer(Math.round(n))} />}
              sub={
                overview.itemsExcluded > 0
                  ? `${integer(overview.itemsExcluded)} "não será comprado" fora da conta`
                  : 'nenhuma unidade comprada ainda'
              }
            />
            <StatTile
              label="Acima do preço estimado"
              value={<AnimatedNumber value={overview.itemsOverEstimate} format={(n) => integer(Math.round(n))} />}
              icon={<TrendingUp className="h-4 w-4" aria-hidden />}
              tone={overview.itemsOverEstimate > 0 ? 'warning' : null}
              sub={
                overview.savings >= 0
                  ? `economia acumulada de ${money(overview.savings)}`
                  : `${money(Math.abs(overview.savings))} acima do previsto`
              }
            />

            <StatTile
              label="Comprometido em parcelas"
              value={<AnimatedNumber value={overview.committed} format={money} />}
              icon={<CreditCard className="h-4 w-4" aria-hidden />}
              sub="valor ainda devido em compras parceladas"
            />
            <StatTile
              label={`Compras em ${monthLongBR(monthKey)}`}
              value={<AnimatedNumber value={overview.monthSpent} format={money} />}
              icon={<CalendarDays className="h-4 w-4" aria-hidden />}
              meter={
                overview.monthGoal && overview.monthGoal > 0
                  ? {
                      ratio: overview.monthSpent / overview.monthGoal,
                      tone:
                        overview.monthSpent / overview.monthGoal >= 1
                          ? 'critical'
                          : overview.monthSpent / overview.monthGoal >= 0.8
                            ? 'warning'
                            : 'default',
                    }
                  : null
              }
              sub={
                overview.monthGoal
                  ? `meta de ${money(overview.monthGoal)} · ${plural(overview.monthPurchaseCount, 'compra', 'compras')}`
                  : `${plural(overview.monthPurchaseCount, 'compra registrada', 'compras registradas')}`
              }
            />
            <StatTile
              label="Valor total contratado"
              value={<AnimatedNumber value={overview.contractedTotal} format={money} />}
              sub="pago + parcelas a vencer"
            />
            <StatTile
              label="Projeção ao concluir"
              value={
                overview.projectedLeftover === null ? '—' : money(overview.projectedLeftover)
              }
              tone={
                overview.projectedLeftover !== null && overview.projectedLeftover < 0
                  ? 'critical'
                  : null
              }
              sub={
                overview.projectedLeftover === null
                  ? 'depende do orçamento total'
                  : overview.projectedLeftover >= 0
                    ? 'sobra prevista após o que falta'
                    : 'falta prevista para fechar o enxoval'
              }
            />
          </div>
        </section>

        {/* ── Gráficos ── */}
        <div className="grid gap-5 xl:grid-cols-2">
          <CategorySpendChart rows={overview.byCategory} />
          <MonthlySpendChart rows={overview.byMonth} monthlyGoal={space?.monthly_goal ?? null} />
        </div>

        {/* ── Orçamento previsto × gasto real ── */}
        <Card>
          <CardHeader
            icon={<Target className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Orçamento previsto × gasto real"
            subtitle="A trilha é o orçamento da categoria; o preenchimento é o que já saiu do bolso."
            action={
              <LinkButton to="/financeiro" variant="ghost" size="sm">
                Ajustar orçamentos
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </LinkButton>
            }
          />
          <div className="px-5 py-3 sm:px-6">
            {overview.byCategory.some((row) => row.budget !== null || row.spent > 0) ? (
              <ul className="divide-y divide-cream-300/80">
                {overview.byCategory
                  .filter((row) => row.budget !== null || row.spent > 0)
                  .sort((a, b) => (b.usage ?? -1) - (a.usage ?? -1) || b.spent - a.spent)
                  .map((row) => (
                    <li key={row.categoryId}>
                      <BulletRow
                        label={row.name}
                        spent={row.spent}
                        budget={row.budget}
                        estimatedRemaining={row.estimatedRemaining}
                      />
                    </li>
                  ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={<Target className="h-5 w-5" aria-hidden />}
                title="Nenhum orçamento por categoria"
                description="Defina um orçamento por categoria no Financeiro para acompanhar os limites e receber alertas em 80% e 100%."
              />
            )}
          </div>
        </Card>

        {/* ── Listas ── */}
        <div className="grid gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader
              icon={<ShoppingBag className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
              title="Últimas compras"
              action={
                <LinkButton to="/compras" variant="ghost" size="sm">
                  Ver todas
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </LinkButton>
              }
            />
            {recent.length === 0 ? (
              <EmptyState
                icon={<ShoppingBag className="h-5 w-5" aria-hidden />}
                title="Nenhuma compra ainda"
                description="Quando vocês registrarem a primeira compra, ela aparece aqui com valor, data e responsável."
                action={
                  <Button variant="primary" size="sm" onClick={() => setPurchaseOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden />
                    Registrar a primeira compra
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-cream-300/80 px-5 sm:px-6">
                {recent.map((purchase) => (
                  <li key={purchase.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                    <span className="min-w-0 flex-1 truncate text-[0.875rem] font-medium text-ink">
                      {purchase.description || 'Compra'}
                    </span>
                    <span className="tnum text-[0.875rem] font-semibold text-ink">
                      {money(purchase.total_paid)}
                    </span>
                    <span className="w-full text-[0.8125rem] text-ink-muted">
                      {dateBR(purchase.purchased_at)} ·{' '}
                      {purchase.category_id
                        ? (categoryById.get(purchase.category_id)?.name ?? 'Sem categoria')
                        : 'Sem categoria'}{' '}
                      · por {memberName(purchase.buyer_id)}
                      {purchase.installments > 1 ? ` · ${purchase.installments}×` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              icon={<PackageCheck className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
              title="Próximos itens prioritários"
              subtitle="Essenciais primeiro, com destaque para o que já foi começado"
              action={
                <LinkButton to="/pendentes" variant="ghost" size="sm">
                  Ver pendências
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </LinkButton>
              }
            />
            {priority.length === 0 ? (
              <EmptyState
                icon={<PackageCheck className="h-5 w-5" aria-hidden />}
                title={hasActivity ? 'Tudo em ordem!' : 'Checklist pronto para começar'}
                description={
                  hasActivity
                    ? 'Não há itens pendentes no momento.'
                    : 'Abra o checklist, ajuste as quantidades e preencha os preços estimados conforme pesquisarem.'
                }
                action={
                  <LinkButton to="/checklist" variant="secondary" size="sm">
                    Abrir checklist
                  </LinkButton>
                }
              />
            ) : (
              <ul className="divide-y divide-cream-300/80 px-5 sm:px-6">
                {priority.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
                    <span className="min-w-0 flex-1 truncate text-[0.875rem] font-medium text-ink">
                      {item.name}
                    </span>
                    <Chip className={PRIORITY_CHIP[item.priority]}>
                      {PRIORITY_LABEL[item.priority]}
                    </Chip>
                    <span className="tnum w-full text-[0.8125rem] text-ink-muted">
                      falta {quantity(item.qty_pending)} {unitFor(Number(item.qty_pending), item.unit)}
                      {Number(item.unit_price_estimate) > 0
                        ? ` · ${money(item.estimated_remaining)} estimados`
                        : ' · preço estimado não preenchido'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <PurchaseForm open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
    </>
  );
}
