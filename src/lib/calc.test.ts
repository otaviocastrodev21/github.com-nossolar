import { describe, expect, it } from 'vitest';
import {
  computeOverview,
  computePurchaseTotal,
  deriveStatus,
  filterItems,
  indexBudgets,
  itemProgress,
  nextPriorityItems,
  purchaseFinance,
  upcomingInstallments,
} from './calc';
import { cents, money, parseNumberBR, percentPoints, quantity } from './format';
import type {
  Budget,
  Category,
  ExtraExpense,
  Installment,
  Item,
  Payment,
  Purchase,
} from '@/types/database';

/* ═══════════════════════════ Fábricas de teste ════════════════════════════
   Reproduzem o que o Postgres calcula nas colunas geradas, para que o teste
   exercite a mesma forma de dado que a aplicação recebe do banco.            */

const CAT: Record<string, Category> = {
  cozinha: {
    id: 'cat-cozinha',
    space_id: 's1',
    code: 'D',
    name: 'Cozinha',
    icon: 'utensils',
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
  },
  quarto: {
    id: 'cat-quarto',
    space_id: 's1',
    code: 'A',
    name: 'Quarto do casal',
    icon: 'bed',
    sort_order: 2,
    created_at: '2026-01-01T00:00:00Z',
  },
  seguranca: {
    id: 'cat-seg',
    space_id: 's1',
    code: 'L',
    name: 'Segurança da casa',
    icon: 'shield-check',
    sort_order: 3,
    created_at: '2026-01-01T00:00:00Z',
  },
};

const CATEGORIES = [CAT.cozinha, CAT.quarto, CAT.seguranca];

function makeItem(overrides: Partial<Item> & { id: string; name: string }): Item {
  const base = {
    space_id: 's1',
    category_id: CAT.cozinha.id,
    subcategory: null,
    unit: 'unidade' as const,
    qty_needed: 1,
    unit_price_estimate: 0,
    priority: 'importante' as const,
    qty_bought: 0,
    total_spent: 0,
    paid_amount: 0,
    last_purchase_at: null,
    excluded: false,
    is_task: false,
    task_done: false,
    allow_fraction: false,
    qty_open: false,
    conditional: false,
    is_custom: false,
    notes: null,
    product_url: null,
    sort_order: 0,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };

  const inactive = base.excluded || base.is_task;

  // Espelha as colunas GENERATED de `public.items`.
  return {
    ...base,
    qty_pending: inactive ? 0 : Math.max(base.qty_needed - base.qty_bought, 0),
    estimated_total: inactive ? 0 : cents(base.qty_needed * base.unit_price_estimate),
    estimated_remaining: inactive
      ? 0
      : cents(Math.max(base.qty_needed - base.qty_bought, 0) * base.unit_price_estimate),
    savings:
      inactive || base.unit_price_estimate === 0
        ? 0
        : cents(base.qty_bought * base.unit_price_estimate - base.total_spent),
    avg_unit_paid: base.qty_bought > 0 ? cents(base.total_spent / base.qty_bought) : null,
    status: deriveStatus(base),
  } as Item;
}

function makePurchase(overrides: Partial<Purchase> & { id: string }): Purchase {
  return {
    space_id: 's1',
    item_id: null,
    category_id: CAT.cozinha.id,
    description: 'Compra',
    qty: 1,
    unit_price: 0,
    discount: 0,
    shipping: 0,
    total_paid: 0,
    purchased_at: '2026-03-10',
    store: null,
    payment_method: 'pix',
    buyer_id: 'u1',
    installments: 1,
    installments_paid: 1,
    first_due_date: null,
    notes: null,
    product_url: null,
    receipt_url: null,
    client_token: `tok-${overrides.id}`,
    created_by: 'u1',
    created_at: '2026-03-10T12:00:00Z',
    updated_at: '2026-03-10T12:00:00Z',
    ...overrides,
  };
}

/** Reproduz o trigger `purchases_sync_installments` + `installments_sync_payments`. */
function expand(purchase: Purchase): { installments: Installment[]; payments: Payment[] } {
  const installments: Installment[] = [];
  const payments: Payment[] = [];
  const n = Math.max(purchase.installments, 1);
  const base = cents(purchase.total_paid / n);
  let acc = 0;

  for (let k = 1; k <= n; k += 1) {
    const amount = k < n ? base : cents(purchase.total_paid - acc);
    if (k < n) acc = cents(acc + base);

    const due =
      n === 1
        ? purchase.purchased_at
        : addMonths(purchase.first_due_date ?? purchase.purchased_at, k - 1);
    const paid = k <= purchase.installments_paid;

    const installment: Installment = {
      id: `${purchase.id}-i${k}`,
      space_id: purchase.space_id,
      purchase_id: purchase.id,
      number: k,
      amount,
      due_date: due,
      paid,
      paid_at: paid ? due : null,
      created_at: purchase.created_at,
    };
    installments.push(installment);

    if (paid) {
      payments.push({
        id: `${purchase.id}-p${k}`,
        space_id: purchase.space_id,
        purchase_id: purchase.id,
        installment_id: installment.id,
        amount,
        paid_at: due,
        method: purchase.payment_method,
        created_at: purchase.created_at,
      });
    }
  }

  return { installments, payments };
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return date.toISOString().slice(0, 10);
}

function overviewOf(options: {
  items?: Item[];
  purchases?: Purchase[];
  budgets?: Budget[];
  extraExpenses?: ExtraExpense[];
  monthKey?: string;
}) {
  const purchases = options.purchases ?? [];
  const expanded = purchases.map(expand);

  return computeOverview({
    items: options.items ?? [],
    purchases,
    installments: expanded.flatMap((entry) => entry.installments),
    payments: expanded.flatMap((entry) => entry.payments),
    budgets: options.budgets ?? [],
    extraExpenses: options.extraExpenses ?? [],
    categories: CATEGORIES,
    monthKey: options.monthKey ?? '2026-03',
  });
}

const budget = (
  kind: Budget['kind'],
  amount: number,
  extra: Partial<Budget> = {},
): Budget => ({
  id: `b-${kind}-${extra.category_id ?? extra.month ?? 'total'}`,
  space_id: 's1',
  kind,
  category_id: null,
  month: null,
  amount,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...extra,
});

/* ═════════════════════════ Formatação brasileira ══════════════════════════ */

describe('formatação no padrão brasileiro', () => {
  it('escreve dinheiro como R$ 1.234,56', () => {
    // O Intl usa espaço não separável depois de "R$".
    expect(money(1234.56).replace(/ /g, ' ')).toBe('R$ 1.234,56');
    expect(money(0).replace(/ /g, ' ')).toBe('R$ 0,00');
    expect(money(20.8333).replace(/ /g, ' ')).toBe('R$ 20,83');
  });

  it('lê números digitados por gente de verdade', () => {
    expect(parseNumberBR('1.234,56')).toBe(1234.56);
    expect(parseNumberBR('1234,56')).toBe(1234.56);
    expect(parseNumberBR('R$ 80')).toBe(80);
    expect(parseNumberBR('80.5')).toBe(80.5);
    expect(parseNumberBR('1.234')).toBe(1234);
    expect(parseNumberBR('1.234.567')).toBe(1234567);
    expect(parseNumberBR('')).toBeNaN();
    expect(parseNumberBR('abc')).toBeNaN();
  });

  it('mostra quantidade inteira sem decimais e fracionada com até 3', () => {
    expect(quantity(6)).toBe('6');
    expect(quantity(1.5)).toBe('1,5');
    expect(quantity(0.75)).toBe('0,75');
  });

  it('arredonda percentual em pontos inteiros', () => {
    expect(percentPoints(45.67)).toBe('46%');
    expect(percentPoints(0)).toBe('0%');
    expect(percentPoints(100)).toBe('100%');
  });
});

/* ══════════════════════ Compras parciais e sucessivas ═════════════════════ */

describe('compras parciais e sucessivas do mesmo item', () => {
  it('resolve o exemplo dos 6 pratos do briefing', () => {
    // 6 pratos necessários; compra 4 por R$ 80,00 e depois 2 por R$ 45,00.
    const pratos = makeItem({
      id: 'pratos',
      name: 'Pratos rasos',
      qty_needed: 6,
      qty_bought: 6,
      total_spent: 125,
      paid_amount: 125,
      unit_price_estimate: 25,
      last_purchase_at: '2026-03-20',
    });

    const progress = itemProgress(pratos);

    expect(pratos.qty_needed).toBe(6);
    expect(pratos.qty_bought).toBe(6);
    expect(pratos.qty_pending).toBe(0);
    expect(pratos.total_spent).toBe(125);
    expect(pratos.status).toBe('comprado');
    // 125 ÷ 6 = 20,8333…
    expect(progress.avgUnitPaid).toBeCloseTo(20.83, 2);
    expect(money(progress.avgUnitPaid ?? 0).replace(/ /g, ' ')).toBe('R$ 20,83');
  });

  it('mantém a quantidade pendente depois de uma compra parcial', () => {
    const pratos = makeItem({
      id: 'pratos',
      name: 'Pratos rasos',
      qty_needed: 6,
      qty_bought: 2,
      total_spent: 40,
      paid_amount: 40,
      unit_price_estimate: 25,
    });

    expect(pratos.status).toBe('parcial');
    expect(pratos.qty_pending).toBe(4);
    expect(pratos.estimated_remaining).toBe(100); // 4 × R$ 25,00
    expect(itemProgress(pratos).ratio).toBeCloseTo(2 / 6, 5);
  });

  it('consolida duas compras do mesmo item no total gasto', () => {
    const pratos = makeItem({
      id: 'pratos',
      name: 'Pratos rasos',
      qty_needed: 6,
      qty_bought: 6,
      total_spent: 125,
      paid_amount: 125,
    });

    const overview = overviewOf({
      items: [pratos],
      purchases: [
        makePurchase({ id: 'c1', item_id: 'pratos', qty: 4, total_paid: 80, purchased_at: '2026-03-10' }),
        makePurchase({ id: 'c2', item_id: 'pratos', qty: 2, total_paid: 45, purchased_at: '2026-03-20' }),
      ],
    });

    expect(overview.totalSpent).toBe(125);
    expect(overview.monthPurchaseCount).toBe(2);
    expect(overview.itemsDone).toBe(1);
    expect(overview.unitsPending).toBe(0);
    expect(overview.completion).toBe(1);
  });

  it('não deixa o progresso passar de 100% quando compram mais que o planejado', () => {
    const copos = makeItem({
      id: 'copos',
      name: 'Copos de água',
      qty_needed: 6,
      qty_bought: 8,
      total_spent: 96,
    });

    expect(copos.status).toBe('comprado');
    expect(copos.qty_pending).toBe(0);
    expect(itemProgress(copos).ratio).toBe(1);

    const overview = overviewOf({ items: [copos] });
    expect(overview.completion).toBe(1);
    expect(overview.unitsBought).toBe(6); // limitado ao planejado
  });
});

/* ══════════════════════════════ Status do item ════════════════════════════ */

describe('os quatro estados do item', () => {
  it('deriva pendente, parcial, comprado e não será comprado', () => {
    expect(deriveStatus({ excluded: false, is_task: false, task_done: false, qty_needed: 4, qty_bought: 0 })).toBe('pendente');
    expect(deriveStatus({ excluded: false, is_task: false, task_done: false, qty_needed: 4, qty_bought: 2 })).toBe('parcial');
    expect(deriveStatus({ excluded: false, is_task: false, task_done: false, qty_needed: 4, qty_bought: 4 })).toBe('comprado');
    expect(deriveStatus({ excluded: true, is_task: false, task_done: false, qty_needed: 4, qty_bought: 2 })).toBe('nao_sera_comprado');
  });

  it('usa a conclusão da tarefa como status das tarefas de verificação', () => {
    expect(deriveStatus({ excluded: false, is_task: true, task_done: false, qty_needed: 1, qty_bought: 0 })).toBe('pendente');
    expect(deriveStatus({ excluded: false, is_task: true, task_done: true, qty_needed: 1, qty_bought: 0 })).toBe('comprado');
  });
});

/* ══════════════════ "Não será comprado" e tarefas ═════════════════════════ */

describe('itens fora do plano de compras', () => {
  it('tira o item excluído das pendências e do estimado, preservando o histórico', () => {
    const tv = makeItem({
      id: 'tv',
      name: 'Televisão',
      qty_needed: 1,
      qty_bought: 0,
      unit_price_estimate: 2000,
      excluded: true,
    });
    const sofa = makeItem({
      id: 'sofa',
      name: 'Sofá',
      category_id: CAT.quarto.id,
      qty_needed: 1,
      unit_price_estimate: 3000,
    });

    const overview = overviewOf({ items: [tv, sofa] });

    expect(tv.qty_pending).toBe(0);
    expect(tv.estimated_remaining).toBe(0);
    expect(overview.estimatedRemaining).toBe(3000); // só o sofá
    expect(overview.itemsExcluded).toBe(1);
    expect(overview.unitsPlanned).toBe(1); // o excluído sai do denominador
    expect(overview.itemsTotal).toBe(1); // e da contagem de itens
    expect(overview.statusMix.map((s) => s.status)).not.toContain('nao_sera_comprado');
    // a TV (cozinha, padrão do makeItem) também sai da conta da categoria
    expect(overview.byCategory.find((c) => c.categoryId === CAT.cozinha.id)?.itemsTotal).toBe(0);
    expect(overview.byCategory.find((c) => c.categoryId === CAT.quarto.id)?.itemsTotal).toBe(1);
  });

  it('mantém no total gasto a compra já feita de um item depois excluído', () => {
    const manta = makeItem({
      id: 'manta',
      name: 'Manta decorativa',
      qty_needed: 2,
      qty_bought: 1,
      total_spent: 70,
      paid_amount: 70,
      unit_price_estimate: 80,
      excluded: true,
    });

    const overview = overviewOf({
      items: [manta],
      purchases: [makePurchase({ id: 'c1', item_id: 'manta', qty: 1, total_paid: 70 })],
    });

    expect(manta.status).toBe('nao_sera_comprado');
    expect(manta.qty_pending).toBe(0);
    expect(overview.totalSpent).toBe(70);
    expect(overview.estimatedRemaining).toBe(0);
  });

  it('não contabiliza tarefas de verificação no orçamento nem nas quantidades', () => {
    const tarefa = makeItem({
      id: 'fechaduras',
      name: 'Conferir fechaduras e cópias de chaves',
      category_id: CAT.seguranca.id,
      unit: 'tarefa',
      is_task: true,
      qty_needed: 1,
      unit_price_estimate: 0,
    });
    const prato = makeItem({ id: 'prato', name: 'Prato', qty_needed: 2, unit_price_estimate: 30 });

    const overview = overviewOf({ items: [tarefa, prato] });

    expect(overview.itemsTotal).toBe(1); // só o produto
    expect(overview.tasksTotal).toBe(1);
    expect(overview.unitsPlanned).toBe(2); // a tarefa não entra
    expect(overview.estimatedTotal).toBe(60);
    expect(tarefa.estimated_total).toBe(0);
    expect(tarefa.qty_pending).toBe(0);
  });

  it('conta no total gasto uma despesa real lançada contra uma tarefa', () => {
    const tarefa = makeItem({
      id: 'chuveiros',
      name: 'Conferir funcionamento dos chuveiros',
      category_id: CAT.seguranca.id,
      unit: 'tarefa',
      is_task: true,
      qty_bought: 1,
      total_spent: 150,
      paid_amount: 150,
    });

    const overview = overviewOf({
      items: [tarefa],
      purchases: [
        makePurchase({
          id: 'c1',
          item_id: 'chuveiros',
          category_id: CAT.seguranca.id,
          qty: 1,
          total_paid: 150,
          description: 'Troca de resistência do chuveiro',
        }),
      ],
    });

    expect(overview.totalSpent).toBe(150);
    expect(overview.unitsPlanned).toBe(0);
    expect(overview.completion).toBe(0);
  });
});

/* ════════════════════════ Percentual de conclusão ═════════════════════════ */

describe('percentual de conclusão', () => {
  it('é a proporção de unidades adquiridas entre os itens ativos', () => {
    const overview = overviewOf({
      items: [
        makeItem({ id: 'a', name: 'Pratos', qty_needed: 6, qty_bought: 3 }),
        makeItem({ id: 'b', name: 'Copos', qty_needed: 4, qty_bought: 4 }),
        makeItem({ id: 'c', name: 'Taças', qty_needed: 10, qty_bought: 0, excluded: true }),
      ],
    });

    // (3 + 4) / (6 + 4) = 70%
    expect(overview.completion).toBeCloseTo(0.7, 5);
    expect(percentPoints(overview.completion * 100)).toBe('70%');
  });

  it('é zero quando nada foi planejado', () => {
    expect(overviewOf({ items: [] }).completion).toBe(0);
  });
});

/* ═══════════════════════ Total da compra e overrides ══════════════════════ */

describe('total da compra', () => {
  it('calcula quantidade × unitário − desconto + frete', () => {
    expect(computePurchaseTotal({ qty: 4, unit_price: 25, discount: 0, shipping: 0 })).toBe(100);
    expect(computePurchaseTotal({ qty: 4, unit_price: 25, discount: 10, shipping: 15 })).toBe(105);
    expect(computePurchaseTotal({ qty: 1, unit_price: 19.99, discount: 0, shipping: 0 })).toBe(19.99);
  });

  it('nunca deixa o desconto empurrar o subtotal para negativo', () => {
    expect(computePurchaseTotal({ qty: 1, unit_price: 50, discount: 80, shipping: 10 })).toBe(10);
  });

  it('não soma frete nem desconto de novo sobre o total informado', () => {
    // A pessoa digitou o total da nota: R$ 105,00, com frete já incluído.
    const purchase = makePurchase({
      id: 'c1',
      qty: 4,
      unit_price: 25,
      discount: 10,
      shipping: 15,
      total_paid: 105,
    });
    const finance = purchaseFinance(purchase, expand(purchase).installments);

    expect(finance.total).toBe(105);
    expect(finance.computedTotal).toBe(105);
    expect(finance.totalOverridden).toBe(false);

    const overview = overviewOf({ purchases: [purchase] });
    expect(overview.totalSpent).toBe(105);
    expect(overview.contractedTotal).toBe(105);
  });

  it('sinaliza quando o total informado difere da conta', () => {
    const purchase = makePurchase({
      id: 'c1',
      qty: 4,
      unit_price: 25,
      discount: 0,
      shipping: 0,
      total_paid: 92.5,
    });
    const finance = purchaseFinance(purchase);

    expect(finance.computedTotal).toBe(100);
    expect(finance.total).toBe(92.5);
    expect(finance.totalOverridden).toBe(true);
  });
});

/* ═══════════════════════════ Compras parceladas ═══════════════════════════ */

describe('compras parceladas', () => {
  const parcelada = makePurchase({
    id: 'geladeira',
    item_id: 'geladeira',
    description: 'Geladeira',
    qty: 1,
    unit_price: 3600,
    total_paid: 3600,
    payment_method: 'credito',
    installments: 10,
    installments_paid: 3,
    purchased_at: '2026-03-05',
    first_due_date: '2026-04-05',
  });

  it('separa o valor já pago do saldo futuro', () => {
    const { installments } = expand(parcelada);
    const finance = purchaseFinance(parcelada, installments);

    expect(finance.total).toBe(3600);
    expect(finance.paid).toBe(1080); // 3 × R$ 360,00
    expect(finance.open).toBe(2520); // 7 × R$ 360,00
    expect(finance.paid + finance.open).toBe(finance.total);
  });

  it('fecha a soma das parcelas no total mesmo com arredondamento', () => {
    const compra = makePurchase({ id: 'c1', total_paid: 100, installments: 3, installments_paid: 3 });
    const { installments } = expand(compra);

    expect(installments).toHaveLength(3);
    expect(installments[0].amount).toBe(33.33);
    expect(installments[2].amount).toBe(33.34); // a última absorve o centavo
    const soma = cents(installments.reduce((acc, row) => acc + row.amount, 0));
    expect(soma).toBe(100);
  });

  it('conta só o desembolsado no total gasto e o resto como comprometido', () => {
    const overview = overviewOf({ purchases: [parcelada], monthKey: '2026-04' });

    expect(overview.contractedTotal).toBe(3600);
    expect(overview.totalSpent).toBe(1080);
    expect(overview.committed).toBe(2520);
  });

  it('distribui as parcelas a vencer pelos meses de vencimento', () => {
    const overview = overviewOf({ purchases: [parcelada] });
    const mes = (key: string) => overview.byMonth.find((row) => row.monthKey === key);

    // As três primeiras parcelas (abr, mai, jun) estão pagas: entram como gasto.
    expect(mes('2026-04')?.spent).toBe(360);
    expect(mes('2026-06')?.spent).toBe(360);
    expect(mes('2026-06')?.committed).toBe(0);

    // Da quarta em diante, viram compromisso no mês do vencimento.
    expect(mes('2026-07')?.committed).toBe(360);
    expect(mes('2026-07')?.spent).toBe(0);
    expect(mes('2027-01')?.committed).toBe(360);

    const comprometidoTotal = cents(
      overview.byMonth.reduce((acc, row) => acc + row.committed, 0),
    );
    expect(comprometidoTotal).toBe(overview.committed);
  });

  it('estima o desembolso quando as parcelas não foram carregadas', () => {
    const finance = purchaseFinance(parcelada, []);
    expect(finance.paid).toBe(1080);
    expect(finance.open).toBe(2520);
  });

  it('lista as parcelas em aberto por data de vencimento', () => {
    const { installments } = expand(parcelada);
    const abertas = upcomingInstallments(installments);

    expect(abertas).toHaveLength(7);
    expect(abertas[0].number).toBe(4);
    expect(abertas[0].due_date).toBe('2026-07-05');
  });
});

/* ══════════════════════════════ Orçamento ═════════════════════════════════ */

describe('orçamento', () => {
  it('começa indefinido, sem inventar valor', () => {
    const overview = overviewOf({ items: [makeItem({ id: 'a', name: 'Prato' })] });

    expect(overview.budgetTotal).toBeNull();
    expect(overview.balance).toBeNull();
    expect(overview.budgetUsage).toBeNull();
    expect(overview.projectedLeftover).toBeNull();
    expect(overview.totalSpent).toBe(0);
  });

  it('calcula saldo como orçamento total menos o gasto efetivo', () => {
    const overview = overviewOf({
      budgets: [budget('total', 10000)],
      purchases: [makePurchase({ id: 'c1', total_paid: 2500 })],
    });

    expect(overview.budgetTotal).toBe(10000);
    expect(overview.totalSpent).toBe(2500);
    expect(overview.balance).toBe(7500);
    expect(overview.budgetUsage).toBeCloseTo(0.25, 5);
  });

  it('usa só o desembolsado no saldo de uma compra parcelada', () => {
    const overview = overviewOf({
      budgets: [budget('total', 10000)],
      purchases: [
        makePurchase({ id: 'c1', total_paid: 3600, installments: 10, installments_paid: 2 }),
      ],
    });

    expect(overview.totalSpent).toBe(720);
    expect(overview.balance).toBe(9280);
    expect(overview.committed).toBe(2880);
  });

  it('projeta a sobra descontando o que ainda falta comprar', () => {
    const overview = overviewOf({
      items: [makeItem({ id: 'a', name: 'Sofá', qty_needed: 1, unit_price_estimate: 3000 })],
      budgets: [budget('total', 5000)],
      purchases: [makePurchase({ id: 'c1', total_paid: 1000 })],
    });

    expect(overview.projectedLeftover).toBe(1000); // 5000 − 1000 − 3000
  });

  it('aponta projeção negativa quando o orçamento não fecha', () => {
    const overview = overviewOf({
      items: [makeItem({ id: 'a', name: 'Sofá', qty_needed: 1, unit_price_estimate: 4500 })],
      budgets: [budget('total', 5000)],
      purchases: [makePurchase({ id: 'c1', total_paid: 1000 })],
    });

    expect(overview.projectedLeftover).toBe(-500);
  });

  it('indexa orçamentos por tipo, categoria e mês', () => {
    const set = indexBudgets([
      budget('total', 9000),
      budget('categoria', 1200, { category_id: CAT.cozinha.id }),
      budget('mensal', 800, { month: '2026-03-01' }),
    ]);

    expect(set.total).toBe(9000);
    expect(set.byCategory.get(CAT.cozinha.id)).toBe(1200);
    expect(set.byMonth.get('2026-03')).toBe(800);
  });

  it('inclui despesas adicionais no total gasto, sem dobrar o frete', () => {
    const overview = overviewOf({
      budgets: [budget('total', 5000)],
      purchases: [makePurchase({ id: 'c1', total_paid: 1000, shipping: 50 })],
      extraExpenses: [
        {
          id: 'e1',
          space_id: 's1',
          category_id: CAT.cozinha.id,
          description: 'Montagem do armário',
          kind: 'montagem',
          amount: 200,
          spent_at: '2026-03-15',
          store: null,
          buyer_id: 'u1',
          notes: null,
          created_by: 'u1',
          created_at: '2026-03-15T00:00:00Z',
          updated_at: '2026-03-15T00:00:00Z',
        },
      ],
    });

    // 1000 (já com frete dentro) + 200 de montagem
    expect(overview.totalSpent).toBe(1200);
    expect(overview.extrasSpent).toBe(200);
    expect(overview.assemblySpent).toBe(200);
    expect(overview.shippingSpent).toBe(50);
    expect(overview.balance).toBe(3800);
  });
});

/* ═══════════════════ Alertas de orçamento por categoria ═══════════════════ */

describe('alertas de 80% e 100% do orçamento da categoria', () => {
  const comGasto = (amount: number) =>
    overviewOf({
      items: [makeItem({ id: 'a', name: 'Prato', qty_needed: 1 })],
      budgets: [budget('categoria', 1000, { category_id: CAT.cozinha.id })],
      purchases: [makePurchase({ id: 'c1', category_id: CAT.cozinha.id, total_paid: amount })],
    });

  it('fica em "ok" abaixo de 80%', () => {
    const overview = comGasto(500);
    const cozinha = overview.byCategory.find((row) => row.categoryId === CAT.cozinha.id);

    expect(cozinha?.level).toBe('ok');
    expect(overview.alerts).toHaveLength(0);
  });

  it('alerta em "atenção" a partir de 80%', () => {
    const overview = comGasto(800);
    expect(overview.byCategory.find((row) => row.categoryId === CAT.cozinha.id)?.level).toBe(
      'atencao',
    );
    expect(overview.alerts).toHaveLength(1);
  });

  it('alerta em "estourado" a partir de 100%', () => {
    const overview = comGasto(1000);
    expect(overview.byCategory.find((row) => row.categoryId === CAT.cozinha.id)?.level).toBe(
      'estourado',
    );
    expect(overview.alerts[0].usage).toBe(1);
  });

  it('não gera nível quando a categoria não tem orçamento', () => {
    const overview = overviewOf({
      purchases: [makePurchase({ id: 'c1', category_id: CAT.quarto.id, total_paid: 999 })],
    });
    expect(overview.byCategory.find((row) => row.categoryId === CAT.quarto.id)?.level).toBeNull();
  });
});

/* ═════════════════════ Economia e preço acima do estimado ═════════════════ */

describe('economia por item', () => {
  it('é a diferença entre o estimado das unidades compradas e o valor pago', () => {
    const economia = makeItem({
      id: 'a',
      name: 'Jogo de panelas',
      qty_needed: 1,
      qty_bought: 1,
      unit_price_estimate: 600,
      total_spent: 480,
    });
    expect(economia.savings).toBe(120);
    expect(itemProgress(economia).overEstimate).toBe(false);
  });

  it('fica negativa e marca o item quando paga acima do estimado', () => {
    const acima = makeItem({
      id: 'b',
      name: 'Colchão',
      qty_needed: 1,
      qty_bought: 1,
      unit_price_estimate: 1500,
      total_spent: 1850,
    });
    expect(acima.savings).toBe(-350);
    expect(itemProgress(acima).overEstimate).toBe(true);

    const overview = overviewOf({ items: [acima] });
    expect(overview.itemsOverEstimate).toBe(1);
    expect(overview.savings).toBe(-350);
  });

  it('ignora itens sem preço estimado na conta de economia', () => {
    const semPreco = makeItem({
      id: 'c',
      name: 'Tapete',
      qty_needed: 1,
      qty_bought: 1,
      unit_price_estimate: 0,
      total_spent: 300,
    });
    expect(semPreco.savings).toBe(0);
    expect(itemProgress(semPreco).overEstimate).toBe(false);
    expect(overviewOf({ items: [semPreco] }).itemsOverEstimate).toBe(0);
  });
});

/* ═══════════════════════════ Recorte por mês ══════════════════════════════ */

describe('gastos do mês', () => {
  it('soma apenas o que foi desembolsado no mês de referência', () => {
    const overview = overviewOf({
      purchases: [
        makePurchase({ id: 'c1', total_paid: 300, purchased_at: '2026-02-10' }),
        makePurchase({ id: 'c2', total_paid: 500, purchased_at: '2026-03-04' }),
        makePurchase({ id: 'c3', total_paid: 200, purchased_at: '2026-03-28' }),
      ],
      monthKey: '2026-03',
    });

    expect(overview.monthSpent).toBe(700);
    expect(overview.monthPurchaseCount).toBe(2);
    expect(overview.totalSpent).toBe(1000);
    expect(overview.byMonth.map((row) => row.monthKey)).toEqual(['2026-02', '2026-03']);
  });

  it('traz a meta do mês quando definida', () => {
    const overview = overviewOf({
      budgets: [budget('mensal', 1500, { month: '2026-03-01' })],
      purchases: [makePurchase({ id: 'c1', total_paid: 400, purchased_at: '2026-03-02' })],
      monthKey: '2026-03',
    });

    expect(overview.monthGoal).toBe(1500);
    expect(overview.byMonth.find((row) => row.monthKey === '2026-03')?.budget).toBe(1500);
  });
});

/* ════════════════════ Busca, filtro e ordenação da lista ══════════════════ */

describe('busca, filtros e ordenação do checklist', () => {
  const lista = [
    makeItem({ id: '1', name: 'Pratos rasos', qty_needed: 6, unit_price_estimate: 30, priority: 'essencial' }),
    makeItem({ id: '2', name: 'Taças', qty_needed: 4, unit_price_estimate: 90, priority: 'opcional' }),
    makeItem({
      id: '3',
      name: 'Cortina com varão',
      category_id: CAT.quarto.id,
      qty_needed: 1,
      unit_price_estimate: 150,
      priority: 'essencial',
      subcategory: 'Cortinas',
    }),
    makeItem({ id: '4', name: 'Copos de água', qty_needed: 6, qty_bought: 6, total_spent: 60 }),
    makeItem({ id: '5', name: 'Televisão', qty_needed: 1, excluded: true }),
    makeItem({
      id: '6',
      name: 'Conferir fechaduras',
      category_id: CAT.seguranca.id,
      unit: 'tarefa',
      is_task: true,
    }),
  ];

  it('mostra só produtos por padrão', () => {
    const result = filterItems(lista, {}, CATEGORIES);
    expect(result.map((item) => item.id)).not.toContain('6');
    expect(result).toHaveLength(5);
  });

  it('mostra só tarefas quando pedido', () => {
    const result = filterItems(lista, { kind: 'tarefas' }, CATEGORIES);
    expect(result.map((item) => item.id)).toEqual(['6']);
  });

  it('busca por nome ignorando acentos e caixa', () => {
    expect(filterItems(lista, { search: 'tacas' }, CATEGORIES).map((i) => i.id)).toEqual(['2']);
    expect(filterItems(lista, { search: 'VARÃO' }, CATEGORIES).map((i) => i.id)).toEqual(['3']);
    expect(filterItems(lista, { search: 'cortinas' }, CATEGORIES).map((i) => i.id)).toEqual(['3']);
  });

  it('filtra por categoria, prioridade e status', () => {
    expect(
      filterItems(lista, { categoryId: CAT.quarto.id }, CATEGORIES).map((i) => i.id),
    ).toEqual(['3']);
    expect(filterItems(lista, { priority: 'essencial' }, CATEGORIES).map((i) => i.id).sort()).toEqual(
      ['1', '3'],
    );
    expect(filterItems(lista, { status: 'comprado' }, CATEGORIES).map((i) => i.id)).toEqual(['4']);
  });

  it('oculta concluídos e mostra apenas pendentes', () => {
    const semConcluidos = filterItems(lista, { hideDone: true }, CATEGORIES).map((i) => i.id);
    expect(semConcluidos).not.toContain('4'); // comprado
    expect(semConcluidos).not.toContain('5'); // não será comprado

    const soPendentes = filterItems(lista, { onlyPending: true }, CATEGORIES).map((i) => i.id);
    expect(soPendentes.sort()).toEqual(['1', '2', '3']);
  });

  it('ordena por nome, preço e prioridade', () => {
    // A ordenação por nome roda sobre produtos; a tarefa fica fora por padrão.
    expect(filterItems(lista, { sort: 'nome' }, CATEGORIES)[0].name).toBe('Copos de água');
    expect(filterItems(lista, { sort: 'nome', kind: 'todos' }, CATEGORIES)[0].name).toBe(
      'Conferir fechaduras',
    );
    expect(filterItems(lista, { sort: 'preco', sortDir: 'desc' }, CATEGORIES)[0].id).toBe('3');
    expect(filterItems(lista, { sort: 'prioridade' }, CATEGORIES)[0].priority).toBe('essencial');
  });

  it('prioriza essenciais e itens já começados nos próximos passos', () => {
    const proximos = nextPriorityItems([
      makeItem({ id: 'a', name: 'Opcional pendente', priority: 'opcional', qty_needed: 1 }),
      makeItem({ id: 'b', name: 'Essencial pendente', priority: 'essencial', qty_needed: 2 }),
      makeItem({
        id: 'c',
        name: 'Essencial começado',
        priority: 'essencial',
        qty_needed: 4,
        qty_bought: 1,
        total_spent: 10,
      }),
      makeItem({ id: 'd', name: 'Concluído', qty_needed: 1, qty_bought: 1, total_spent: 5 }),
      makeItem({ id: 'e', name: 'Descartado', qty_needed: 1, excluded: true }),
    ]);

    expect(proximos.map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });
});

/* ══════════════════════ Agregados por categoria ═══════════════════════════ */

describe('recorte por categoria', () => {
  it('soma gasto, comprometido e estimado em cada categoria', () => {
    const overview = overviewOf({
      items: [
        makeItem({ id: '1', name: 'Pratos', qty_needed: 6, qty_bought: 2, unit_price_estimate: 30, total_spent: 55 }),
        makeItem({ id: '2', name: 'Cama', category_id: CAT.quarto.id, qty_needed: 1, unit_price_estimate: 2000 }),
      ],
      budgets: [budget('categoria', 500, { category_id: CAT.cozinha.id })],
      purchases: [
        makePurchase({ id: 'c1', item_id: '1', category_id: CAT.cozinha.id, qty: 2, total_paid: 55 }),
        makePurchase({
          id: 'c2',
          item_id: '2',
          category_id: CAT.quarto.id,
          qty: 1,
          total_paid: 2000,
          installments: 4,
          installments_paid: 1,
        }),
      ],
    });

    const cozinha = overview.byCategory.find((row) => row.categoryId === CAT.cozinha.id);
    const quarto = overview.byCategory.find((row) => row.categoryId === CAT.quarto.id);

    expect(cozinha?.spent).toBe(55);
    expect(cozinha?.budget).toBe(500);
    expect(cozinha?.estimatedRemaining).toBe(120); // 4 pendentes × R$ 30,00
    expect(cozinha?.completion).toBeCloseTo(2 / 6, 5);

    expect(quarto?.contracted).toBe(2000);
    expect(quarto?.spent).toBe(500); // 1 de 4 parcelas
    expect(quarto?.committed).toBe(1500);
  });
});
