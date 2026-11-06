/**
 * Núcleo de cálculo do Nosso Lar.
 *
 * Funções puras: entram as linhas cruas do banco, saem os indicadores. Tudo o
 * que o painel, o financeiro e os relatórios mostram passa por aqui — então é
 * aqui que os testes moram (`calc.test.ts`).
 *
 * ── Convenções financeiras (seção 5 do briefing) ───────────────────────────
 *  · TOTAL GASTO .......... soma do que saiu do bolso: parcelas já pagas
 *                           (tabela `payments`) + despesas adicionais.
 *                           Desconto e frete já estão dentro de `total_paid`,
 *                           então NUNCA são somados outra vez.
 *  · VALOR COMPROMETIDO ... parcelas ainda em aberto.
 *  · VALOR CONTRATADO ..... valor integral das compras, pago ou não.
 *  · SALDO DO ORÇAMENTO ... orçamento total − total gasto.
 *  · ESTIMADO RESTANTE .... preço estimado × quantidade ainda pendente.
 *  · CONCLUSÃO ............ unidades adquiridas ÷ unidades planejadas, apenas
 *                           entre os itens ativos (fora tarefas e "não será
 *                           comprado").
 */

import { cents } from './format';
import type {
  Budget,
  Category,
  ExtraExpense,
  Installment,
  Item,
  ItemStatus,
  Payment,
  Priority,
  Purchase,
} from '@/types/database';
import { PRIORITY_ORDER } from '@/types/database';

/** Tarefas de verificação não entram em orçamento nem em quantidades. */
export const isProduct = (item: Item): boolean => !item.is_task;

/** Itens que continuam no plano de compras. */
export const isActive = (item: Item): boolean => !item.is_task && !item.excluded;

const sum = <T>(rows: readonly T[], pick: (row: T) => number): number =>
  cents(rows.reduce((acc, row) => acc + (Number(pick(row)) || 0), 0));

const monthKeyOf = (iso: string): string => iso.slice(0, 7);

// ───────────────────────────── Itens ────────────────────────────────────────

export interface ItemProgress {
  /** 0 a 1, limitado a 1 mesmo se comprarem mais do que o planejado */
  ratio: number;
  bought: number;
  needed: number;
  pending: number;
  /** total_spent ÷ qty_bought */
  avgUnitPaid: number | null;
  /** negativo = pagou acima do estimado */
  savings: number;
  overEstimate: boolean;
}

export function itemProgress(item: Item): ItemProgress {
  const needed = Number(item.qty_needed) || 0;
  const bought = Number(item.qty_bought) || 0;

  if (item.is_task) {
    return {
      ratio: item.task_done ? 1 : 0,
      bought: item.task_done ? 1 : 0,
      needed: 1,
      pending: item.task_done ? 0 : 1,
      avgUnitPaid: null,
      savings: 0,
      overEstimate: false,
    };
  }

  const ratio = item.excluded ? 1 : needed > 0 ? Math.min(bought / needed, 1) : bought > 0 ? 1 : 0;

  return {
    ratio,
    bought,
    needed,
    pending: Number(item.qty_pending) || 0,
    avgUnitPaid: bought > 0 ? cents(Number(item.total_spent) / bought) : null,
    savings: Number(item.savings) || 0,
    overEstimate:
      bought > 0 && Number(item.unit_price_estimate) > 0 && Number(item.savings) < 0,
  };
}

/** Reproduz em TS o status que o banco calcula — usado para prévias na interface. */
export function deriveStatus(
  input: Pick<Item, 'excluded' | 'is_task' | 'task_done' | 'qty_needed' | 'qty_bought'>,
): ItemStatus {
  if (input.excluded) return 'nao_sera_comprado';
  if (input.is_task) return input.task_done ? 'comprado' : 'pendente';
  const needed = Number(input.qty_needed) || 0;
  const bought = Number(input.qty_bought) || 0;
  if (needed > 0 && bought >= needed) return 'comprado';
  if (bought > 0) return 'parcial';
  return 'pendente';
}

// ──────────────────────────── Compras ───────────────────────────────────────

export interface PurchaseFinance {
  /** valor integral contratado */
  total: number;
  /** já desembolsado (parcelas pagas) */
  paid: number;
  /** ainda devido (parcelas em aberto) */
  open: number;
  installmentsTotal: number;
  installmentsPaid: number;
  /** soma qty × preço unitário − desconto + frete; serve para conferir o total */
  computedTotal: number;
  /** o total informado difere da conta de qty/preço/desconto/frete? */
  totalOverridden: boolean;
}

export function purchaseFinance(
  purchase: Purchase,
  installments: readonly Installment[] = [],
): PurchaseFinance {
  const mine = installments.filter((i) => i.purchase_id === purchase.id);
  const total = cents(Number(purchase.total_paid) || 0);

  // Sem parcelas carregadas, caímos no campo `installments_paid` da compra,
  // que é a fonte da verdade no banco.
  let paid: number;
  if (mine.length > 0) {
    paid = sum(
      mine.filter((i) => i.paid),
      (i) => i.amount,
    );
  } else if (purchase.installments <= 1) {
    paid = purchase.installments_paid >= 1 ? total : 0;
  } else {
    paid = cents((total / purchase.installments) * purchase.installments_paid);
  }

  return {
    total,
    paid: Math.min(paid, total),
    open: cents(Math.max(total - Math.min(paid, total), 0)),
    installmentsTotal: purchase.installments,
    installmentsPaid: purchase.installments_paid,
    computedTotal: computePurchaseTotal(purchase),
    totalOverridden: Math.abs(computePurchaseTotal(purchase) - total) > 0.005,
  };
}

/** qty × preço unitário − desconto + frete. */
export function computePurchaseTotal(
  input: Pick<Purchase, 'qty' | 'unit_price' | 'discount' | 'shipping'>,
): number {
  const gross = (Number(input.qty) || 0) * (Number(input.unit_price) || 0);
  return cents(Math.max(gross - (Number(input.discount) || 0), 0) + (Number(input.shipping) || 0));
}

// ─────────────────────────── Orçamentos ─────────────────────────────────────

export interface BudgetSet {
  /** null = o casal ainda não definiu o orçamento total */
  total: number | null;
  byCategory: Map<string, number>;
  byMonth: Map<string, number>;
}

export function indexBudgets(budgets: readonly Budget[]): BudgetSet {
  const byCategory = new Map<string, number>();
  const byMonth = new Map<string, number>();
  let total: number | null = null;

  for (const b of budgets) {
    const amount = Number(b.amount) || 0;
    if (b.kind === 'total') total = amount;
    else if (b.kind === 'categoria' && b.category_id) byCategory.set(b.category_id, amount);
    else if (b.kind === 'mensal' && b.month) byMonth.set(monthKeyOf(b.month), amount);
  }

  return { total, byCategory, byMonth };
}

// ───────────────────────── Visão consolidada ────────────────────────────────

export interface OverviewInput {
  items: readonly Item[];
  purchases: readonly Purchase[];
  installments: readonly Installment[];
  payments: readonly Payment[];
  budgets: readonly Budget[];
  extraExpenses: readonly ExtraExpense[];
  categories: readonly Category[];
  /** mês de referência "AAAA-MM"; por padrão, o mês corrente */
  monthKey?: string;
  /** hoje em ISO; injetável para os testes */
  today?: string;
}

export interface CategoryBreakdown {
  categoryId: string;
  code: string;
  name: string;
  /** desembolsado na categoria (parcelas pagas + despesas adicionais) */
  spent: number;
  /** valor integral contratado na categoria */
  contracted: number;
  committed: number;
  estimatedTotal: number;
  estimatedRemaining: number;
  budget: number | null;
  /** gasto ÷ orçamento, quando há orçamento */
  usage: number | null;
  /** 'ok' | 'atencao' (>= 80%) | 'estourado' (>= 100%) */
  level: 'ok' | 'atencao' | 'estourado' | null;
  itemsTotal: number;
  itemsDone: number;
  itemsPartial: number;
  itemsPending: number;
  completion: number;
}

export interface MonthBreakdown {
  monthKey: string;
  /** desembolsado no mês */
  spent: number;
  /** parcelas que vencem no mês e ainda não foram pagas */
  committed: number;
  purchaseCount: number;
  budget: number | null;
}

export interface Overview {
  // ── Itens
  /**
   * Produtos que contam no enxoval. Os marcados como "não será comprado"
   * ficam fora — do total, dos concluídos e da porcentagem — e aparecem só
   * em `itemsExcluded`.
   */
  itemsTotal: number;
  itemsDone: number;
  itemsPartial: number;
  itemsPending: number;
  itemsExcluded: number;
  tasksTotal: number;
  tasksDone: number;

  // ── Quantidades
  unitsPlanned: number;
  unitsBought: number;
  unitsPending: number;
  /** 0 a 1 */
  completion: number;

  // ── Dinheiro
  totalSpent: number;
  contractedTotal: number;
  committed: number;
  purchasesSpent: number;
  extrasSpent: number;
  shippingSpent: number;
  assemblySpent: number;
  budgetTotal: number | null;
  balance: number | null;
  budgetUsage: number | null;
  estimatedTotal: number;
  estimatedRemaining: number;
  /** orçamento total − gasto − estimado restante; negativo = não fecha */
  projectedLeftover: number | null;
  savings: number;
  itemsOverEstimate: number;

  // ── Mês de referência
  monthKey: string;
  monthSpent: number;
  monthPurchaseCount: number;
  monthGoal: number | null;

  // ── Recortes
  byCategory: CategoryBreakdown[];
  byMonth: MonthBreakdown[];
  alerts: CategoryBreakdown[];
  statusMix: { status: ItemStatus; count: number }[];
}

export function computeOverview(input: OverviewInput): Overview {
  const {
    items,
    purchases,
    installments,
    payments,
    budgets,
    extraExpenses,
    categories,
    monthKey = new Date().toISOString().slice(0, 7),
  } = input;

  const budgetSet = indexBudgets(budgets);
  const products = items.filter(isProduct);
  const active = items.filter(isActive);
  const tasks = items.filter((i) => i.is_task);

  // ── Contagens de itens
  // "Não será comprado" sai da conta: não é pendência nem conclusão.
  const itemsDone = products.filter((i) => i.status === 'comprado').length;
  const itemsPartial = products.filter((i) => i.status === 'parcial').length;
  const itemsPending = products.filter((i) => i.status === 'pendente').length;
  const itemsExcluded = products.filter((i) => i.status === 'nao_sera_comprado').length;

  // ── Quantidades (só itens ativos)
  const unitsPlanned = active.reduce((acc, i) => acc + (Number(i.qty_needed) || 0), 0);
  const unitsBought = active.reduce(
    (acc, i) => acc + Math.min(Number(i.qty_bought) || 0, Number(i.qty_needed) || 0),
    0,
  );
  const unitsPending = active.reduce((acc, i) => acc + (Number(i.qty_pending) || 0), 0);
  const completion = unitsPlanned > 0 ? Math.min(unitsBought / unitsPlanned, 1) : 0;

  // ── Dinheiro
  const purchasesSpent = sum(payments, (p) => p.amount);
  const extrasSpent = sum(extraExpenses, (e) => e.amount);
  const totalSpent = cents(purchasesSpent + extrasSpent);
  const contractedTotal = cents(sum(purchases, (p) => p.total_paid) + extrasSpent);
  const committed = sum(
    installments.filter((i) => !i.paid),
    (i) => i.amount,
  );
  const shippingSpent = cents(
    sum(purchases, (p) => p.shipping) +
      sum(
        extraExpenses.filter((e) => e.kind === 'frete'),
        (e) => e.amount,
      ),
  );
  const assemblySpent = sum(
    extraExpenses.filter((e) => e.kind === 'montagem' || e.kind === 'instalacao'),
    (e) => e.amount,
  );

  const budgetTotal = budgetSet.total;
  const balance = budgetTotal === null ? null : cents(budgetTotal - totalSpent);
  const budgetUsage = budgetTotal && budgetTotal > 0 ? totalSpent / budgetTotal : null;

  const estimatedTotal = sum(active, (i) => i.estimated_total);
  const estimatedRemaining = sum(active, (i) => i.estimated_remaining);
  const projectedLeftover =
    budgetTotal === null ? null : cents(budgetTotal - totalSpent - estimatedRemaining);
  const savings = sum(active, (i) => i.savings);
  const itemsOverEstimate = active.filter((i) => itemProgress(i).overEstimate).length;

  // ── Mês de referência
  const monthPayments = payments.filter((p) => monthKeyOf(p.paid_at) === monthKey);
  const monthExtras = extraExpenses.filter((e) => monthKeyOf(e.spent_at) === monthKey);
  const monthSpent = cents(sum(monthPayments, (p) => p.amount) + sum(monthExtras, (e) => e.amount));
  const monthPurchaseCount = purchases.filter((p) => monthKeyOf(p.purchased_at) === monthKey).length;

  // ── Por categoria
  const purchaseById = new Map(purchases.map((p) => [p.id, p]));
  const spentByCategory = new Map<string, number>();
  const contractedByCategory = new Map<string, number>();
  const committedByCategory = new Map<string, number>();

  const bump = (map: Map<string, number>, key: string | null | undefined, value: number) => {
    if (!key) return;
    map.set(key, cents((map.get(key) ?? 0) + value));
  };

  for (const pay of payments) {
    bump(spentByCategory, purchaseById.get(pay.purchase_id)?.category_id, Number(pay.amount) || 0);
  }
  for (const purchase of purchases) {
    bump(contractedByCategory, purchase.category_id, Number(purchase.total_paid) || 0);
  }
  for (const inst of installments) {
    if (inst.paid) continue;
    bump(
      committedByCategory,
      purchaseById.get(inst.purchase_id)?.category_id,
      Number(inst.amount) || 0,
    );
  }
  for (const extra of extraExpenses) {
    bump(spentByCategory, extra.category_id, Number(extra.amount) || 0);
    bump(contractedByCategory, extra.category_id, Number(extra.amount) || 0);
  }

  const itemsByCategory = new Map<string, Item[]>();
  for (const item of items) {
    const list = itemsByCategory.get(item.category_id);
    if (list) list.push(item);
    else itemsByCategory.set(item.category_id, [item]);
  }

  const byCategory: CategoryBreakdown[] = categories.map((category) => {
    const own = itemsByCategory.get(category.id) ?? [];
    const ownProducts = own.filter(isProduct);
    const ownActive = own.filter(isActive);
    const planned = ownActive.reduce((acc, i) => acc + (Number(i.qty_needed) || 0), 0);
    const bought = ownActive.reduce(
      (acc, i) => acc + Math.min(Number(i.qty_bought) || 0, Number(i.qty_needed) || 0),
      0,
    );
    const spent = spentByCategory.get(category.id) ?? 0;
    const budget = budgetSet.byCategory.get(category.id) ?? null;
    const usage = budget && budget > 0 ? spent / budget : null;

    return {
      categoryId: category.id,
      code: category.code,
      name: category.name,
      spent,
      contracted: contractedByCategory.get(category.id) ?? 0,
      committed: committedByCategory.get(category.id) ?? 0,
      estimatedTotal: sum(ownActive, (i) => i.estimated_total),
      estimatedRemaining: sum(ownActive, (i) => i.estimated_remaining),
      budget,
      usage,
      level: usage === null ? null : usage >= 1 ? 'estourado' : usage >= 0.8 ? 'atencao' : 'ok',
      itemsTotal: ownActive.length,
      itemsDone: ownProducts.filter((i) => i.status === 'comprado').length,
      itemsPartial: ownProducts.filter((i) => i.status === 'parcial').length,
      itemsPending: ownProducts.filter((i) => i.status === 'pendente').length,
      completion: planned > 0 ? Math.min(bought / planned, 1) : 0,
    };
  });

  // ── Por mês (desembolso realizado + parcelas a vencer)
  const monthMap = new Map<string, MonthBreakdown>();
  const touchMonth = (key: string): MonthBreakdown => {
    let row = monthMap.get(key);
    if (!row) {
      row = {
        monthKey: key,
        spent: 0,
        committed: 0,
        purchaseCount: 0,
        budget: budgetSet.byMonth.get(key) ?? null,
      };
      monthMap.set(key, row);
    }
    return row;
  };

  for (const pay of payments) {
    const row = touchMonth(monthKeyOf(pay.paid_at));
    row.spent = cents(row.spent + (Number(pay.amount) || 0));
  }
  for (const extra of extraExpenses) {
    const row = touchMonth(monthKeyOf(extra.spent_at));
    row.spent = cents(row.spent + (Number(extra.amount) || 0));
  }
  for (const purchase of purchases) {
    touchMonth(monthKeyOf(purchase.purchased_at)).purchaseCount += 1;
  }
  for (const inst of installments) {
    if (inst.paid || !inst.due_date) continue;
    const row = touchMonth(monthKeyOf(inst.due_date));
    row.committed = cents(row.committed + (Number(inst.amount) || 0));
  }
  for (const key of budgetSet.byMonth.keys()) touchMonth(key);

  const byMonth = [...monthMap.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  return {
    itemsTotal: products.length - itemsExcluded,
    itemsDone,
    itemsPartial,
    itemsPending,
    itemsExcluded,
    tasksTotal: tasks.length,
    tasksDone: tasks.filter((t) => t.task_done).length,

    unitsPlanned,
    unitsBought,
    unitsPending,
    completion,

    totalSpent,
    contractedTotal,
    committed,
    purchasesSpent,
    extrasSpent,
    shippingSpent,
    assemblySpent,
    budgetTotal,
    balance,
    budgetUsage,
    estimatedTotal,
    estimatedRemaining,
    projectedLeftover,
    savings,
    itemsOverEstimate,

    monthKey,
    monthSpent,
    monthPurchaseCount,
    monthGoal: budgetSet.byMonth.get(monthKey) ?? null,

    byCategory,
    byMonth,
    alerts: byCategory
      .filter((c) => c.level === 'atencao' || c.level === 'estourado')
      .sort((a, b) => (b.usage ?? 0) - (a.usage ?? 0)),
    statusMix: [
      { status: 'comprado' as ItemStatus, count: itemsDone },
      { status: 'parcial' as ItemStatus, count: itemsPartial },
      { status: 'pendente' as ItemStatus, count: itemsPending },
    ],
  };
}

// ──────────────────── Busca, filtro e ordenação da lista ────────────────────

export type ItemSort = 'nome' | 'preco' | 'prioridade' | 'pendente' | 'categoria';

export interface ItemFilters {
  search?: string;
  categoryId?: string | 'todas';
  priority?: Priority | 'todas';
  status?: ItemStatus | 'todas';
  /** esconde comprados e "não será comprado" */
  hideDone?: boolean;
  /** mostra apenas o que ainda falta */
  onlyPending?: boolean;
  /** 'produtos' | 'tarefas' | 'todos' */
  kind?: 'produtos' | 'tarefas' | 'todos';
  sort?: ItemSort;
  sortDir?: 'asc' | 'desc';
}

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export function filterItems(
  items: readonly Item[],
  filters: ItemFilters,
  categories: readonly Category[] = [],
): Item[] {
  const {
    search = '',
    categoryId = 'todas',
    priority = 'todas',
    status = 'todas',
    hideDone = false,
    onlyPending = false,
    kind = 'produtos',
    sort = 'categoria',
    sortDir = 'asc',
  } = filters;

  const needle = normalize(search);
  const categoryOrder = new Map(categories.map((c, index) => [c.id, index]));

  const result = items.filter((item) => {
    if (kind === 'produtos' && item.is_task) return false;
    if (kind === 'tarefas' && !item.is_task) return false;
    if (categoryId !== 'todas' && item.category_id !== categoryId) return false;
    if (priority !== 'todas' && item.priority !== priority) return false;
    if (status !== 'todas' && item.status !== status) return false;
    if (hideDone && (item.status === 'comprado' || item.status === 'nao_sera_comprado')) return false;
    if (onlyPending && item.status !== 'pendente' && item.status !== 'parcial') return false;

    if (needle) {
      const haystack = normalize(
        `${item.name} ${item.subcategory ?? ''} ${item.notes ?? ''} ${item.unit}`,
      );
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const direction = sortDir === 'desc' ? -1 : 1;

  result.sort((a, b) => {
    let delta = 0;
    switch (sort) {
      case 'nome':
        delta = normalize(a.name).localeCompare(normalize(b.name), 'pt-BR');
        break;
      case 'preco':
        delta = (Number(a.unit_price_estimate) || 0) - (Number(b.unit_price_estimate) || 0);
        break;
      case 'prioridade':
        delta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        break;
      case 'pendente':
        delta = (Number(b.qty_pending) || 0) - (Number(a.qty_pending) || 0);
        break;
      case 'categoria':
      default: {
        const ca = categoryOrder.get(a.category_id) ?? 999;
        const cb = categoryOrder.get(b.category_id) ?? 999;
        delta = ca - cb || a.sort_order - b.sort_order;
        break;
      }
    }
    if (delta === 0) {
      delta = normalize(a.name).localeCompare(normalize(b.name), 'pt-BR');
      return delta; // o desempate alfabético não inverte
    }
    return delta * direction;
  });

  return result;
}

/**
 * Próximos itens prioritários: o que ainda falta, do mais essencial para o
 * mais opcional, priorizando o que já foi começado.
 */
export function nextPriorityItems(items: readonly Item[], limit = 6): Item[] {
  return items
    .filter((i) => isActive(i) && (i.status === 'pendente' || i.status === 'parcial'))
    .sort((a, b) => {
      const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (byPriority !== 0) return byPriority;
      const aStarted = a.status === 'parcial' ? 0 : 1;
      const bStarted = b.status === 'parcial' ? 0 : 1;
      if (aStarted !== bStarted) return aStarted - bStarted;
      return (
        (Number(b.estimated_remaining) || 0) - (Number(a.estimated_remaining) || 0) ||
        normalize(a.name).localeCompare(normalize(b.name), 'pt-BR')
      );
    })
    .slice(0, limit);
}

/** Últimas compras, da mais recente para a mais antiga. */
export function recentPurchases(purchases: readonly Purchase[], limit = 6): Purchase[] {
  return [...purchases]
    .sort(
      (a, b) =>
        b.purchased_at.localeCompare(a.purchased_at) || b.created_at.localeCompare(a.created_at),
    )
    .slice(0, limit);
}

/** Parcelas em aberto, da mais próxima de vencer para a mais distante. */
export function upcomingInstallments(
  installments: readonly Installment[],
  limit = 12,
): Installment[] {
  return installments
    .filter((i) => !i.paid)
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.number - b.number)
    .slice(0, limit);
}
