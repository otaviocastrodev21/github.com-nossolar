import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CircleAlert,
  CreditCard,
  LayoutDashboard,
  PackageCheck,
  PiggyBank,
  Plus,
  ShoppingBag,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
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
import { HeroFigure, Meter, StackedBar, StatTile, BulletRow } from '@/components/dashboard/figures';
import { CategorySpendChart, MonthlySpendChart } from '@/components/dashboard/charts';
import { PurchaseForm } from '@/components/purchases/PurchaseForm';
import { useSpace } from '@/contexts/SpaceContext';
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
  const [purchaseOpen, setPurchaseOpen] = useState(false);

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
      <PageHeader
        icon={<LayoutDashboard className="h-5 w-5" aria-hidden />}
        title="Painel"
        description={
          <>
            {space?.tagline ?? 'Nosso enxoval, nossos planos.'} Todos os números vêm das compras e
            dos orçamentos que vocês registram.
          </>
        }
        actions={
          <>
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
          </>
        }
      />

      <div className="flex flex-col gap-5">
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

        {/* ── Conclusão do enxoval ── */}
        <Card className="card-pad">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_1fr] lg:gap-8">
            <div>
              <HeroFigure
                label="Conclusão do enxoval"
                value={percentPoints(overview.completion * 100)}
                caption={
                  <>
                    {quantity(overview.unitsBought)} de {quantity(overview.unitsPlanned)} unidades
                    planejadas
                  </>
                }
              >
                <Meter
                  ratio={overview.completion}
                  className="mt-3"
                  label={`Progresso geral: ${percentPoints(overview.completion * 100)}`}
                />
                <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-muted">
                  Considera apenas itens ativos: tarefas de verificação e itens marcados como “não
                  será comprado” ficam de fora da conta.
                </p>
              </HeroFigure>
            </div>

            <div className="flex flex-col justify-center gap-5">
              <div>
                <h2 className="mb-3 text-[0.9375rem] font-semibold text-ink">
                  Situação dos {integer(overview.itemsTotal)} itens cadastrados
                </h2>
                <StackedBar
                  total={overview.itemsTotal}
                  segments={overview.statusMix.map((entry) => ({
                    key: entry.status,
                    label: STATUS_LABEL[entry.status],
                    value: entry.count,
                    color: STATUS_FILL[entry.status],
                  }))}
                />
              </div>

              {overview.tasksTotal > 0 ? (
                <div className="rounded-xl border border-cream-400 bg-cream-200/60 px-4 py-3">
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
                  <p className="mt-2 text-[0.75rem] text-ink-muted">
                    Não entram no orçamento nem nas quantidades compradas.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        {/* ── Indicadores ── */}
        <section>
          <h2 className="eyebrow mb-3">Indicadores</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile
              label="Total efetivamente gasto"
              value={money(overview.totalSpent)}
              icon={<Wallet className="h-4 w-4" aria-hidden />}
              sub={
                overview.extrasSpent > 0
                  ? `inclui ${money(overview.extrasSpent)} de despesas adicionais`
                  : 'parcelas pagas e compras quitadas'
              }
            />
            <StatTile
              label="Orçamento total"
              value={overview.budgetTotal === null ? 'Não definido' : money(overview.budgetTotal)}
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
              value={overview.balance === null ? '—' : money(overview.balance)}
              icon={<PiggyBank className="h-4 w-4" aria-hidden />}
              tone={overview.balance !== null && overview.balance < 0 ? 'critical' : null}
              sub={overview.balance === null ? 'depende do orçamento total' : undefined}
            />
            <StatTile
              label="Falta comprar (estimado)"
              value={money(overview.estimatedRemaining)}
              icon={<PackageCheck className="h-4 w-4" aria-hidden />}
              sub={`${plural(overview.itemsPending + overview.itemsPartial, 'item em aberto', 'itens em aberto')}`}
            />

            <StatTile
              label="Itens comprados"
              value={integer(overview.itemsDone)}
              icon={<PackageCheck className="h-4 w-4" aria-hidden />}
              sub={`de ${integer(overview.itemsTotal)} cadastrados`}
            />
            <StatTile
              label="Parcialmente comprados"
              value={integer(overview.itemsPartial)}
              sub="já começados, falta completar"
            />
            <StatTile
              label="Itens pendentes"
              value={integer(overview.itemsPending)}
              sub={
                overview.itemsExcluded > 0
                  ? `${integer(overview.itemsExcluded)} marcados como "não será comprado"`
                  : 'nenhuma unidade comprada ainda'
              }
            />
            <StatTile
              label="Acima do preço estimado"
              value={integer(overview.itemsOverEstimate)}
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
              value={money(overview.committed)}
              icon={<CreditCard className="h-4 w-4" aria-hidden />}
              sub="valor ainda devido em compras parceladas"
            />
            <StatTile
              label={`Compras em ${monthLongBR(monthKey)}`}
              value={money(overview.monthSpent)}
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
              value={money(overview.contractedTotal)}
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
