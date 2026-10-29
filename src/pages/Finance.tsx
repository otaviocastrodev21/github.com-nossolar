import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CircleAlert,
  CreditCard,
  Pencil,
  PiggyBank,
  Plus,
  Target,
  Trash2,
  TrendingDown,
  Truck,
  Wallet,
  Wrench,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button, Card, CardHeader, Chip, EmptyState, Notice } from '@/components/ui/primitives';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { BulletRow, Meter, StatTile } from '@/components/dashboard/figures';
import { MonthlySpendChart } from '@/components/dashboard/charts';
import { useSpace } from '@/contexts/SpaceContext';
import { useToast } from '@/contexts/ToastContext';
import { upcomingInstallments } from '@/lib/calc';
import {
  currentMonthKey,
  dateBR,
  integer,
  money,
  monthLongBR,
  parseNumberBR,
  percentPoints,
  todayISO,
} from '@/lib/format';
import { VIZ } from '@/lib/viz';
import { EXTRA_KIND_LABEL } from '@/types/database';
import type { ExtraExpense, ExtraExpenseKind } from '@/types/database';

export function Finance() {
  const {
    overview,
    budgets,
    categories,
    installments,
    purchases,
    extraExpenses,
    members,
    categoryById,
    memberName,
    monthKey,
    space,
    setBudget,
    deleteBudget,
    updateSpace,
    createExtraExpense,
    updateExtraExpense,
    deleteExtraExpense,
  } = useSpace();
  const toast = useToast();

  const [budgetModal, setBudgetModal] = useState<
    { kind: 'total' } | { kind: 'categoria'; categoryId: string } | { kind: 'mensal' } | null
  >(null);
  const [extraModal, setExtraModal] = useState<ExtraExpense | 'novo' | null>(null);
  const [confirmDeleteExtra, setConfirmDeleteExtra] = useState<ExtraExpense | null>(null);
  const [confirmDeleteBudget, setConfirmDeleteBudget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const upcoming = useMemo(() => upcomingInstallments(installments, 12), [installments]);
  const purchaseById = useMemo(
    () => new Map(purchases.map((purchase) => [purchase.id, purchase])),
    [purchases],
  );

  const monthBudget = budgets.find(
    (budget) => budget.kind === 'mensal' && budget.month?.slice(0, 7) === monthKey,
  );
  const totalBudget = budgets.find((budget) => budget.kind === 'total');

  const guard = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Não foi possível concluir.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        icon={<Wallet className="h-5 w-5" aria-hidden />}
        title="Financeiro"
        description="Orçamento, desembolso real e compromissos futuros. Desconto e frete já entram no total de cada compra — nunca são somados duas vezes."
        actions={
          <Button variant="primary" onClick={() => setBudgetModal({ kind: 'total' })}>
            <Target className="h-4 w-4" aria-hidden />
            {overview.budgetTotal === null ? 'Definir orçamento' : 'Editar orçamento total'}
          </Button>
        }
      />

      <div className="flex flex-col gap-5">
        {/* ── Orçamento total ── */}
        <Card className="card-pad">
          {overview.budgetTotal === null ? (
            <EmptyState
              icon={<Target className="h-5 w-5" aria-hidden />}
              title="Orçamento total ainda não definido"
              description="Informe quanto o casal pretende investir no enxoval. Saldo, alertas e projeções passam a aparecer imediatamente."
              action={
                <Button variant="primary" onClick={() => setBudgetModal({ kind: 'total' })}>
                  <Target className="h-4 w-4" aria-hidden />
                  Definir orçamento total
                </Button>
              }
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-8">
              <div>
                <p className="eyebrow">Orçamento total do enxoval</p>
                <p className="mt-1 text-[2.25rem] font-semibold leading-none tracking-[-0.02em] text-ink">
                  {money(overview.budgetTotal)}
                </p>
                <Meter
                  ratio={overview.budgetUsage ?? 0}
                  className="mt-3"
                  tone={
                    (overview.budgetUsage ?? 0) >= 1
                      ? 'critical'
                      : (overview.budgetUsage ?? 0) >= 0.8
                        ? 'warning'
                        : 'default'
                  }
                  label={`Uso do orçamento: ${percentPoints((overview.budgetUsage ?? 0) * 100)}`}
                />
                <p className="mt-2 flex items-center gap-1.5 text-[0.875rem] text-ink-secondary">
                  {(overview.budgetUsage ?? 0) >= 1 ? (
                    <CircleAlert
                      className="h-4 w-4"
                      style={{ color: VIZ.status.critical }}
                      aria-hidden
                    />
                  ) : (overview.budgetUsage ?? 0) >= 0.8 ? (
                    <AlertTriangle
                      className="h-4 w-4"
                      style={{ color: VIZ.status.warning }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="tnum">
                    {percentPoints((overview.budgetUsage ?? 0) * 100)} utilizado
                  </span>
                </p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setBudgetModal({ kind: 'total' })}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Editar
                  </Button>
                  {totalBudget ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDeleteBudget(totalBudget.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      Remover
                    </Button>
                  ) : null}
                </div>
              </div>

              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Line label="Total efetivamente gasto" value={money(overview.totalSpent)} strong />
                <Line
                  label="Saldo do orçamento"
                  value={money(overview.balance ?? 0)}
                  strong
                  tone={(overview.balance ?? 0) < 0 ? 'critical' : undefined}
                />
                <Line label="Valor total contratado" value={money(overview.contractedTotal)} />
                <Line label="Comprometido em parcelas" value={money(overview.committed)} />
                <Line label="Valor estimado restante" value={money(overview.estimatedRemaining)} />
                <Line
                  label="Projeção ao concluir"
                  value={money(overview.projectedLeftover ?? 0)}
                  tone={(overview.projectedLeftover ?? 0) < 0 ? 'critical' : undefined}
                />
              </dl>
            </div>
          )}
        </Card>

        {/* ── Indicadores financeiros ── */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile
            label="Compras (parcelas pagas)"
            value={money(overview.purchasesSpent)}
            icon={<Wallet className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            label="Gastos com frete"
            value={money(overview.shippingSpent)}
            icon={<Truck className="h-4 w-4" aria-hidden />}
            sub="frete das compras + despesas de frete"
          />
          <StatTile
            label="Montagem e instalação"
            value={money(overview.assemblySpent)}
            icon={<Wrench className="h-4 w-4" aria-hidden />}
          />
          <StatTile
            label={overview.savings >= 0 ? 'Economia frente ao estimado' : 'Acima do estimado'}
            value={money(Math.abs(overview.savings))}
            icon={<TrendingDown className="h-4 w-4" aria-hidden />}
            tone={overview.savings < 0 ? 'warning' : null}
            sub={`${integer(overview.itemsOverEstimate)} itens acima do previsto`}
          />
        </div>

        {/* ── Meta mensal ── */}
        <Card>
          <CardHeader
            icon={<PiggyBank className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Meta mensal de compras"
            subtitle="Quanto o casal pretende gastar por mês"
            action={
              <Button size="sm" variant="secondary" onClick={() => setBudgetModal({ kind: 'mensal' })}>
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Definir meta de {monthLongBR(monthKey)}
              </Button>
            }
          />
          <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div>
                <p className="eyebrow">Meta padrão (todos os meses)</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <span className="tnum text-[1.375rem] font-semibold text-ink">
                    {space?.monthly_goal ? money(space.monthly_goal) : 'Não definida'}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const typed = window.prompt(
                        'Meta mensal padrão (em reais). Deixe vazio para remover.',
                        space?.monthly_goal ? String(space.monthly_goal).replace('.', ',') : '',
                      );
                      if (typed === null) return;
                      const trimmed = typed.trim();
                      const amount = trimmed === '' ? null : parseNumberBR(trimmed);
                      if (amount !== null && (Number.isNaN(amount) || amount < 0)) {
                        toast.error('Informe um valor válido.');
                        return;
                      }
                      void guard(
                        () => updateSpace({ monthly_goal: amount }),
                        amount === null ? 'Meta mensal removida.' : 'Meta mensal atualizada.',
                      );
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Alterar
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-cream-400 bg-cream-200/60 px-4 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[0.875rem] font-medium text-ink">
                    {monthLongBR(monthKey)}
                  </span>
                  <span className="tnum text-[0.875rem] text-ink">
                    {money(overview.monthSpent)}
                    {overview.monthGoal ? (
                      <span className="text-ink-muted"> / {money(overview.monthGoal)}</span>
                    ) : null}
                  </span>
                </div>
                <Meter
                  ratio={
                    overview.monthGoal && overview.monthGoal > 0
                      ? overview.monthSpent / overview.monthGoal
                      : 0
                  }
                  size="sm"
                  className="mt-2"
                  tone={
                    overview.monthGoal && overview.monthSpent / overview.monthGoal >= 1
                      ? 'critical'
                      : overview.monthGoal && overview.monthSpent / overview.monthGoal >= 0.8
                        ? 'warning'
                        : overview.monthGoal
                          ? 'default'
                          : 'muted'
                  }
                  label={`Gasto em ${monthLongBR(monthKey)}`}
                />
                <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[0.75rem] text-ink-muted">
                  <span>{integer(overview.monthPurchaseCount)} compras no mês</span>
                  {monthBudget ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteBudget(monthBudget.id)}
                      className="underline decoration-greige-400 underline-offset-2 hover:text-ink-secondary"
                    >
                      remover meta deste mês
                    </button>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="min-w-0">
              <MonthlySpendChart rows={overview.byMonth} monthlyGoal={space?.monthly_goal ?? null} />
            </div>
          </div>
        </Card>

        {/* ── Orçamento por categoria ── */}
        <Card>
          <CardHeader
            icon={<Target className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Orçamento por categoria"
            subtitle="Alertas automáticos ao atingir 80% e 100% do limite"
          />
          <div className="divide-y divide-cream-300/80 px-5 sm:px-6">
            {overview.byCategory.map((row) => {
              const budgetRow = budgets.find(
                (budget) => budget.kind === 'categoria' && budget.category_id === row.categoryId,
              );
              return (
                <div key={row.categoryId} className="flex flex-wrap items-center gap-3 py-1">
                  <div className="min-w-0 flex-1">
                    <BulletRow
                      label={`${row.code} · ${row.name}`}
                      spent={row.spent}
                      budget={row.budget}
                      estimatedRemaining={row.estimatedRemaining}
                    />
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      title={`Definir orçamento de ${row.name}`}
                      aria-label={`Definir orçamento de ${row.name}`}
                      onClick={() => setBudgetModal({ kind: 'categoria', categoryId: row.categoryId })}
                      className="grid h-9 w-9 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    {budgetRow ? (
                      <button
                        type="button"
                        title={`Remover orçamento de ${row.name}`}
                        aria-label={`Remover orçamento de ${row.name}`}
                        onClick={() => setConfirmDeleteBudget(budgetRow.id)}
                        className="grid h-9 w-9 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── Parcelas a vencer ── */}
        <Card>
          <CardHeader
            icon={<CalendarClock className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Parcelas a vencer"
            subtitle={`${money(overview.committed)} ainda comprometidos`}
          />
          {upcoming.length === 0 ? (
            <EmptyState
              compact
              icon={<CreditCard className="h-5 w-5" aria-hidden />}
              title="Nenhuma parcela em aberto"
              description="Compras parceladas aparecem aqui com o valor e o vencimento de cada parcela."
            />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[34rem] text-[0.875rem]">
                <caption className="sr-only">Parcelas em aberto</caption>
                <thead>
                  <tr className="border-b border-cream-400 text-left text-[0.75rem] uppercase tracking-wide text-ink-muted">
                    <th scope="col" className="px-5 py-3 font-semibold">Compra</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Parcela</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Valor</th>
                    <th scope="col" className="px-5 py-3 font-semibold">Vencimento</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((installment) => {
                    const purchase = purchaseById.get(installment.purchase_id);
                    const overdue =
                      installment.due_date !== null && installment.due_date < todayISO();
                    return (
                      <tr
                        key={installment.id}
                        className="border-b border-cream-300/80 last:border-0"
                      >
                        <td className="px-5 py-3 text-ink">
                          {purchase?.description ?? 'Compra'}
                          {purchase?.category_id ? (
                            <span className="block text-[0.8125rem] text-ink-muted">
                              {categoryById.get(purchase.category_id)?.name}
                            </span>
                          ) : null}
                        </td>
                        <td className="tnum px-3 py-3 text-ink-secondary">
                          {installment.number}/{purchase?.installments ?? '?'}
                        </td>
                        <td className="tnum px-3 py-3 text-right font-medium text-ink">
                          {money(installment.amount)}
                        </td>
                        <td className="px-5 py-3">
                          <span className="tnum text-ink-secondary">
                            {dateBR(installment.due_date)}
                          </span>
                          {overdue ? (
                            <Chip
                              className="ml-2 border-status-critical/40 bg-[#FDF0F0] text-ink"
                              icon={
                                <CircleAlert
                                  className="h-3 w-3"
                                  style={{ color: VIZ.status.critical }}
                                  aria-hidden
                                />
                              }
                            >
                              Vencida
                            </Chip>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="px-5 py-3 text-[0.8125rem] leading-relaxed text-ink-muted sm:px-6">
            As parcelas são geradas pelo banco a partir de cada compra. Para registrar que mais uma
            parcela foi quitada, edite a compra e aumente o campo “Parcelas já pagas”.
          </p>
        </Card>

        {/* ── Despesas adicionais ── */}
        <Card>
          <CardHeader
            icon={<Truck className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Despesas adicionais"
            subtitle="Frete avulso, montagem, instalação e taxas"
            action={
              <Button size="sm" variant="primary" onClick={() => setExtraModal('novo')}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Nova despesa
              </Button>
            }
          />
          {extraExpenses.length === 0 ? (
            <EmptyState
              compact
              icon={<Wrench className="h-5 w-5" aria-hidden />}
              title="Nenhuma despesa adicional"
              description="Use esta seção para gastos que não são um item do enxoval: montagem de móveis, instalação de ar-condicionado, frete separado."
            />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[42rem] text-[0.875rem]">
                <caption className="sr-only">Despesas adicionais</caption>
                <thead>
                  <tr className="border-b border-cream-400 text-left text-[0.75rem] uppercase tracking-wide text-ink-muted">
                    <th scope="col" className="px-5 py-3 font-semibold">Descrição</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Tipo</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Categoria</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Valor</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Data</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Responsável</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {extraExpenses.map((expense) => (
                    <tr key={expense.id} className="border-b border-cream-300/80 last:border-0">
                      <td className="px-5 py-3 text-ink">
                        {expense.description}
                        {expense.notes ? (
                          <span className="block text-[0.8125rem] italic text-ink-muted">
                            {expense.notes}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <Chip>{EXTRA_KIND_LABEL[expense.kind]}</Chip>
                      </td>
                      <td className="px-3 py-3 text-ink-secondary">
                        {expense.category_id
                          ? (categoryById.get(expense.category_id)?.name ?? '—')
                          : '—'}
                      </td>
                      <td className="tnum px-3 py-3 text-right font-medium text-ink">
                        {money(expense.amount)}
                      </td>
                      <td className="tnum px-3 py-3 text-ink-secondary">
                        {dateBR(expense.spent_at)}
                      </td>
                      <td className="px-3 py-3 text-ink-secondary">
                        {memberName(expense.buyer_id)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-0.5">
                          <button
                            type="button"
                            title="Editar despesa"
                            aria-label={`Editar despesa ${expense.description}`}
                            onClick={() => setExtraModal(expense)}
                            className="grid h-9 w-9 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            title="Excluir despesa"
                            aria-label={`Excluir despesa ${expense.description}`}
                            onClick={() => setConfirmDeleteExtra(expense)}
                            className="grid h-9 w-9 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-cream-400 bg-cream-200/60">
                    <th scope="row" colSpan={3} className="px-5 py-3 text-left font-semibold text-ink">
                      Total
                    </th>
                    <td className="tnum px-3 py-3 text-right font-semibold text-ink">
                      {money(overview.extrasSpent)}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        <Notice tone="info" icon={<Wallet className="h-4.5 w-4.5" />} title="Como as contas fecham">
          <ul className="mt-1 list-disc space-y-1 pl-4">
            <li>
              <strong>Total gasto</strong> = parcelas já pagas das compras + despesas adicionais.
            </li>
            <li>
              <strong>Valor contratado</strong> = valor integral das compras, pago ou não.
            </li>
            <li>
              <strong>Comprometido</strong> = parcelas ainda em aberto.
            </li>
            <li>
              O desconto e o frete já estão dentro do total de cada compra, então nunca são somados
              novamente.
            </li>
          </ul>
        </Notice>
      </div>

      {/* ══ Modais ══ */}
      <BudgetModal
        target={budgetModal}
        onClose={() => setBudgetModal(null)}
        busy={busy}
        onSave={async (amount, extra) => {
          if (!budgetModal) return;
          const ok = await guard(
            () =>
              setBudget(budgetModal.kind, amount, {
                categoryId: budgetModal.kind === 'categoria' ? budgetModal.categoryId : undefined,
                monthKey: budgetModal.kind === 'mensal' ? extra : undefined,
              }),
            'Orçamento atualizado.',
          );
          if (ok) setBudgetModal(null);
        }}
        currentAmount={
          budgetModal?.kind === 'total'
            ? overview.budgetTotal
            : budgetModal?.kind === 'categoria'
              ? (overview.byCategory.find((row) => row.categoryId === budgetModal.categoryId)
                  ?.budget ?? null)
              : (overview.monthGoal ?? null)
        }
        categoryLabel={
          budgetModal?.kind === 'categoria'
            ? (categoryById.get(budgetModal.categoryId)?.name ?? '')
            : undefined
        }
      />

      <ExtraExpenseModal
        expense={extraModal}
        onClose={() => setExtraModal(null)}
        busy={busy}
        categories={categories}
        members={members}
        onSave={async (payload) => {
          const ok = await guard(
            () =>
              extraModal && extraModal !== 'novo'
                ? updateExtraExpense(extraModal.id, payload)
                : createExtraExpense(payload),
            extraModal && extraModal !== 'novo' ? 'Despesa atualizada.' : 'Despesa registrada.',
          );
          if (ok) setExtraModal(null);
        }}
      />

      <ConfirmDialog
        open={confirmDeleteExtra !== null}
        onClose={() => setConfirmDeleteExtra(null)}
        loading={busy}
        title="Excluir despesa"
        message={
          <>
            Excluir <strong>{confirmDeleteExtra?.description}</strong> no valor de{' '}
            <strong>{money(confirmDeleteExtra?.amount ?? 0)}</strong>? O total gasto será
            recalculado.
          </>
        }
        onConfirm={() => {
          const expense = confirmDeleteExtra;
          if (!expense) return;
          void guard(() => deleteExtraExpense(expense.id), 'Despesa excluída.').then(() =>
            setConfirmDeleteExtra(null),
          );
        }}
      />

      <ConfirmDialog
        open={confirmDeleteBudget !== null}
        onClose={() => setConfirmDeleteBudget(null)}
        loading={busy}
        title="Remover orçamento"
        message="Sem esse orçamento, os alertas de limite correspondentes deixam de aparecer. Os gastos registrados não são afetados."
        confirmLabel="Remover"
        onConfirm={() => {
          const id = confirmDeleteBudget;
          if (!id) return;
          void guard(() => deleteBudget(id), 'Orçamento removido.').then(() =>
            setConfirmDeleteBudget(null),
          );
        }}
      />
    </>
  );
}

/* ─────────────────────────────── Auxiliares ─────────────────────────────── */

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'critical';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-cream-300/70 pb-2 last:border-0">
      <dt className="text-[0.875rem] text-ink-secondary">{label}</dt>
      <dd
        className={
          strong
            ? 'tnum text-[1.0625rem] font-semibold text-ink'
            : 'tnum text-[0.9375rem] text-ink'
        }
      >
        {tone === 'critical' ? (
          <span className="inline-flex items-center gap-1.5">
            <CircleAlert className="h-4 w-4" style={{ color: VIZ.status.critical }} aria-hidden />
            {value}
          </span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function BudgetModal({
  target,
  onClose,
  onSave,
  busy,
  currentAmount,
  categoryLabel,
}: {
  target: { kind: 'total' } | { kind: 'categoria'; categoryId: string } | { kind: 'mensal' } | null;
  onClose: () => void;
  onSave: (amount: number, monthKey?: string) => Promise<void>;
  busy: boolean;
  currentAmount: number | null;
  categoryLabel?: string;
}) {
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(currentMonthKey());
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Carrega o valor atual só na abertura.
  if (target && !initialized) {
    setAmount(currentAmount !== null ? String(currentAmount).replace('.', ',') : '');
    setInitialized(true);
  }
  if (!target && initialized) setInitialized(false);

  if (!target) return null;

  const title =
    target.kind === 'total'
      ? 'Orçamento total do enxoval'
      : target.kind === 'categoria'
        ? `Orçamento de ${categoryLabel}`
        : 'Meta de um mês específico';

  const submit = () => {
    const parsed = parseNumberBR(amount);
    if (Number.isNaN(parsed) || parsed < 0) {
      setError('Informe um valor maior ou igual a zero.');
      return;
    }
    setError(null);
    void onSave(parsed, target.kind === 'mensal' ? month : undefined);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={title}
      subtitle="Os alertas aparecem automaticamente em 80% e 100% do limite."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {target.kind === 'mensal' ? (
          <Field label="Mês" htmlFor="orc-mes" required>
            <Input
              id="orc-mes"
              type="month"
              className="tnum"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </Field>
        ) : null}

        <Field label="Valor" htmlFor="orc-valor" required error={error}>
          <MoneyInput
            id="orc-valor"
            data-autofocus="true"
            value={amount}
            invalid={Boolean(error)}
            onChange={(event) => {
              setAmount(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}

function ExtraExpenseModal({
  expense,
  onClose,
  onSave,
  busy,
  categories,
  members,
}: {
  expense: ExtraExpense | 'novo' | null;
  onClose: () => void;
  onSave: (
    payload: Omit<ExtraExpense, 'id' | 'space_id' | 'created_at' | 'updated_at' | 'created_by'>,
  ) => Promise<void>;
  busy: boolean;
  categories: { id: string; code: string; name: string }[];
  members: { user_id: string; profile?: { display_name: string } | null }[];
}) {
  const editing = expense !== null && expense !== 'novo' ? expense : null;
  const [form, setForm] = useState({
    description: '',
    kind: 'frete' as ExtraExpenseKind,
    amount: '',
    spentAt: todayISO(),
    categoryId: '',
    store: '',
    buyerId: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const key = editing?.id ?? (expense === 'novo' ? 'novo' : null);
  if (key !== null && loadedId !== key) {
    setLoadedId(key);
    setErrors({});
    setForm(
      editing
        ? {
            description: editing.description,
            kind: editing.kind,
            amount: String(editing.amount).replace('.', ','),
            spentAt: editing.spent_at,
            categoryId: editing.category_id ?? '',
            store: editing.store ?? '',
            buyerId: editing.buyer_id ?? '',
            notes: editing.notes ?? '',
          }
        : {
            description: '',
            kind: 'frete',
            amount: '',
            spentAt: todayISO(),
            categoryId: '',
            store: '',
            buyerId: '',
            notes: '',
          },
    );
  }
  if (key === null && loadedId !== null) setLoadedId(null);

  if (expense === null) return null;

  const submit = () => {
    const next: Record<string, string> = {};
    if (!form.description.trim()) next.description = 'Descreva a despesa.';
    const parsed = parseNumberBR(form.amount);
    if (Number.isNaN(parsed) || parsed < 0) next.amount = 'Informe um valor válido.';
    if (!form.spentAt) next.spentAt = 'Informe a data.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    void onSave({
      description: form.description.trim(),
      kind: form.kind,
      amount: parsed,
      spent_at: form.spentAt,
      category_id: form.categoryId || null,
      store: form.store.trim() || null,
      buyer_id: form.buyerId || null,
      notes: form.notes.trim() || null,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Editar despesa adicional' : 'Nova despesa adicional'}
      subtitle="Frete avulso, montagem, instalação, taxas — tudo que não é um item do enxoval."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Descrição" htmlFor="d-desc" required error={errors.description}>
          <Input
            id="d-desc"
            data-autofocus="true"
            value={form.description}
            maxLength={200}
            invalid={Boolean(errors.description)}
            onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
            placeholder="ex.: Montagem do guarda-roupa"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tipo" htmlFor="d-tipo">
            <Select
              id="d-tipo"
              value={form.kind}
              onChange={(event) =>
                setForm((c) => ({ ...c, kind: event.target.value as ExtraExpenseKind }))
              }
            >
              {(Object.keys(EXTRA_KIND_LABEL) as ExtraExpenseKind[]).map((kind) => (
                <option key={kind} value={kind}>
                  {EXTRA_KIND_LABEL[kind]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Valor" htmlFor="d-valor" required error={errors.amount}>
            <MoneyInput
              id="d-valor"
              value={form.amount}
              invalid={Boolean(errors.amount)}
              onChange={(event) => setForm((c) => ({ ...c, amount: event.target.value }))}
            />
          </Field>

          <Field label="Data" htmlFor="d-data" required error={errors.spentAt}>
            <Input
              id="d-data"
              type="date"
              className="tnum"
              value={form.spentAt}
              invalid={Boolean(errors.spentAt)}
              onChange={(event) => setForm((c) => ({ ...c, spentAt: event.target.value }))}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoria" htmlFor="d-categoria" hint="Para somar no orçamento da categoria.">
            <Select
              id="d-categoria"
              value={form.categoryId}
              onChange={(event) => setForm((c) => ({ ...c, categoryId: event.target.value }))}
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.code} · {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Responsável" htmlFor="d-responsavel">
            <Select
              id="d-responsavel"
              value={form.buyerId}
              onChange={(event) => setForm((c) => ({ ...c, buyerId: event.target.value }))}
            >
              <option value="">Não informado</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.profile?.display_name || 'Participante'}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Loja ou prestador" htmlFor="d-loja">
          <Input
            id="d-loja"
            value={form.store}
            onChange={(event) => setForm((c) => ({ ...c, store: event.target.value }))}
          />
        </Field>

        <Field label="Observações" htmlFor="d-obs">
          <Textarea
            id="d-obs"
            value={form.notes}
            onChange={(event) => setForm((c) => ({ ...c, notes: event.target.value }))}
          />
        </Field>
      </div>
    </Modal>
  );
}
