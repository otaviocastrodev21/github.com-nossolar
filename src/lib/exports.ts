/**
 * Relatórios e exportações.
 *
 * Excel (.xlsx) via SheetJS, CSV com BOM e ponto e vírgula (abre direto no
 * Excel em português) e PDF via jsPDF + AutoTable. Todos os valores saem no
 * padrão brasileiro.
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  dateBR,
  integer,
  money,
  monthLongBR,
  monthShortBR,
  percentPoints,
  quantity,
  todayISO,
} from './format';
import { itemProgress, purchaseFinance, type Overview } from './calc';
import {
  EXTRA_KIND_LABEL,
  PAYMENT_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Category,
  type ExtraExpense,
  type Installment,
  type Item,
  type Purchase,
} from '@/types/database';

/* ───────────────────────────── Infraestrutura ───────────────────────────── */

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Dá tempo ao navegador de iniciar o download antes de liberar a URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function stamp(spaceName = 'nosso-lar', suffix = ''): string {
  return `${slug(spaceName) || 'nosso-lar'}-${suffix}-${todayISO()}`;
}

/** Larguras de coluna a partir do conteúdo, com teto para não ficar gigante. */
function autoWidths(rows: (string | number)[][]): { wch: number }[] {
  if (rows.length === 0) return [];
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      const length = String(cell ?? '').length + 2;
      widths[index] = Math.min(Math.max(widths[index] ?? 10, length), 52);
    });
  }
  return widths.map((wch) => ({ wch }));
}

function sheetFromRows(rows: (string | number)[][]): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = autoWidths(rows);
  sheet['!freeze'] = { xSplit: '0', ySplit: '1' };
  return sheet;
}

function writeWorkbook(book: XLSX.WorkBook, filename: string): void {
  const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
  download(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${filename}.xlsx`,
  );
}

function writeCSV(rows: (string | number)[][], filename: string): void {
  const escape = (cell: string | number): string => {
    const text = String(cell ?? '');
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const body = rows.map((row) => row.map(escape).join(';')).join('\r\n');
  // BOM para o Excel reconhecer UTF-8.
  download(new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

/* ─────────────────────────── Contexto comum ─────────────────────────────── */

export interface ExportContext {
  items: readonly Item[];
  categories: readonly Category[];
  memberName: (userId: string | null | undefined) => string;
  spaceName?: string;
}

const categoryName = (categories: readonly Category[], id: string | null): string => {
  if (!id) return 'Sem categoria';
  const found = categories.find((category) => category.id === id);
  return found ? `${found.code} · ${found.name}` : 'Sem categoria';
};

const CHECKLIST_HEADER = [
  'Categoria',
  'Subcategoria',
  'Item',
  'Tipo',
  'Prioridade',
  'Unidade',
  'Qtd. necessária',
  'Qtd. comprada',
  'Qtd. pendente',
  'Preço estimado unitário',
  'Total estimado',
  'Total gasto',
  'Preço médio pago',
  'Economia',
  'Status',
  'Conclusão',
  'Última compra',
  'Observações',
  'Link do produto',
];

function checklistRow(item: Item, categories: readonly Category[]): (string | number)[] {
  const progress = itemProgress(item);
  return [
    categoryName(categories, item.category_id),
    item.subcategory ?? '',
    item.name,
    item.is_task ? 'Tarefa de verificação' : 'Produto',
    PRIORITY_LABEL[item.priority],
    item.unit,
    item.is_task ? '' : quantity(item.qty_needed),
    item.is_task ? '' : quantity(item.qty_bought),
    item.is_task ? '' : quantity(item.qty_pending),
    item.is_task ? '' : money(item.unit_price_estimate),
    item.is_task ? '' : money(item.estimated_total),
    money(item.total_spent),
    item.avg_unit_paid !== null ? money(item.avg_unit_paid) : '',
    item.is_task || Number(item.unit_price_estimate) === 0 ? '' : money(item.savings),
    STATUS_LABEL[item.status],
    item.is_task ? (item.task_done ? '100%' : '0%') : percentPoints(progress.ratio * 100),
    dateBR(item.last_purchase_at) === '—' ? '' : dateBR(item.last_purchase_at),
    item.notes ?? '',
    item.product_url ?? '',
  ];
}

/* ═══════════════════════ 1 · Checklist completo (Excel) ═══════════════════ */

export function exportChecklistXLSX(context: ExportContext, overview: Overview): void {
  const { items, categories, spaceName } = context;
  const book = XLSX.utils.book_new();

  const ordered = [...items].sort(
    (a, b) =>
      categoryName(categories, a.category_id).localeCompare(
        categoryName(categories, b.category_id),
        'pt-BR',
      ) || a.sort_order - b.sort_order,
  );

  XLSX.utils.book_append_sheet(
    book,
    sheetFromRows([CHECKLIST_HEADER, ...ordered.map((item) => checklistRow(item, categories))]),
    'Checklist',
  );

  XLSX.utils.book_append_sheet(
    book,
    sheetFromRows([
      ['Indicador', 'Valor'],
      ['Itens cadastrados (produtos)', integer(overview.itemsTotal)],
      ['Comprados integralmente', integer(overview.itemsDone)],
      ['Parcialmente comprados', integer(overview.itemsPartial)],
      ['Pendentes', integer(overview.itemsPending)],
      ['Não serão comprados', integer(overview.itemsExcluded)],
      ['Tarefas de verificação', `${integer(overview.tasksDone)} de ${integer(overview.tasksTotal)}`],
      ['Unidades planejadas', quantity(overview.unitsPlanned)],
      ['Unidades adquiridas', quantity(overview.unitsBought)],
      ['Unidades pendentes', quantity(overview.unitsPending)],
      ['Conclusão do enxoval', percentPoints(overview.completion * 100)],
      ['Total estimado do enxoval', money(overview.estimatedTotal)],
      ['Valor estimado restante', money(overview.estimatedRemaining)],
      ['Total efetivamente gasto', money(overview.totalSpent)],
      ['Comprometido em parcelas', money(overview.committed)],
      [
        'Orçamento total',
        overview.budgetTotal === null ? 'Não definido' : money(overview.budgetTotal),
      ],
      ['Saldo do orçamento', overview.balance === null ? '—' : money(overview.balance)],
      ['Itens acima do preço estimado', integer(overview.itemsOverEstimate)],
      ['Gerado em', dateBR(todayISO())],
    ]),
    'Resumo',
  );

  writeWorkbook(book, stamp(spaceName, 'checklist'));
}

/* ═══════════════════ 2 · Itens pendentes (Excel) ══════════════════════════ */

export function exportPendingXLSX(context: ExportContext): void {
  const { items, categories, spaceName } = context;

  const pending = items
    .filter((item) => !item.is_task && !item.excluded && item.qty_pending > 0)
    .sort(
      (a, b) =>
        PRIORITY_LABEL[a.priority].localeCompare(PRIORITY_LABEL[b.priority]) ||
        Number(b.estimated_remaining) - Number(a.estimated_remaining),
    );

  const rows: (string | number)[][] = [
    [
      'Prioridade',
      'Categoria',
      'Item',
      'Unidade',
      'Qtd. necessária',
      'Qtd. comprada',
      'Qtd. pendente',
      'Preço estimado unitário',
      'Falta estimado',
      'Status',
      'Observações',
      'Link do produto',
    ],
    ...pending.map((item) => [
      PRIORITY_LABEL[item.priority],
      categoryName(categories, item.category_id),
      item.name,
      item.unit,
      quantity(item.qty_needed),
      quantity(item.qty_bought),
      quantity(item.qty_pending),
      money(item.unit_price_estimate),
      money(item.estimated_remaining),
      STATUS_LABEL[item.status],
      item.notes ?? '',
      item.product_url ?? '',
    ]),
  ];

  const totalRemaining = pending.reduce((acc, item) => acc + Number(item.estimated_remaining), 0);
  rows.push([], ['', '', 'TOTAL ESTIMADO RESTANTE', '', '', '', '', '', money(totalRemaining)]);

  const tasks = items.filter((item) => item.is_task && !item.task_done);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheetFromRows(rows), 'Pendentes');

  if (tasks.length > 0) {
    XLSX.utils.book_append_sheet(
      book,
      sheetFromRows([
        ['Tarefa de verificação', 'Prioridade', 'Observações'],
        ...tasks.map((task) => [task.name, PRIORITY_LABEL[task.priority], task.notes ?? '']),
      ]),
      'Tarefas',
    );
  }

  writeWorkbook(book, stamp(spaceName, 'itens-pendentes'));
}

/* ══════════════════ 3 · Histórico de compras (CSV) ═══════════════════════ */

export function exportPurchasesCSV(
  purchases: readonly Purchase[],
  context: ExportContext,
  installments: readonly Installment[] = [],
): void {
  const { items, categories, memberName, spaceName } = context;
  const itemById = new Map(items.map((item) => [item.id, item]));

  const rows: (string | number)[][] = [
    [
      'Data',
      'Item do enxoval',
      'Descrição',
      'Categoria',
      'Quantidade',
      'Unidade',
      'Preço unitário',
      'Desconto',
      'Frete',
      'Total pago',
      'Preço por unidade',
      'Loja',
      'Forma de pagamento',
      'Responsável',
      'Parcelas',
      'Parcelas pagas',
      'Valor já pago',
      'Valor a vencer',
      '1º vencimento',
      'Observações',
      'Link do produto',
      'Nota fiscal',
    ],
    ...[...purchases]
      .sort((a, b) => a.purchased_at.localeCompare(b.purchased_at))
      .map((purchase) => {
        const finance = purchaseFinance(purchase, installments);
        const item = purchase.item_id ? itemById.get(purchase.item_id) : null;
        const unit = Number(purchase.qty) > 0 ? purchase.total_paid / purchase.qty : 0;
        return [
          dateBR(purchase.purchased_at),
          item?.name ?? '',
          purchase.description,
          categoryName(categories, purchase.category_id),
          quantity(purchase.qty),
          item?.unit ?? '',
          money(purchase.unit_price),
          money(purchase.discount),
          money(purchase.shipping),
          money(purchase.total_paid),
          money(unit),
          purchase.store ?? '',
          PAYMENT_LABEL[purchase.payment_method],
          memberName(purchase.buyer_id),
          integer(purchase.installments),
          integer(purchase.installments_paid),
          money(finance.paid),
          money(finance.open),
          purchase.first_due_date ? dateBR(purchase.first_due_date) : '',
          purchase.notes ?? '',
          purchase.product_url ?? '',
          purchase.receipt_url ?? '',
        ];
      }),
  ];

  writeCSV(rows, stamp(spaceName, 'historico-compras'));
}

/* ════════════════ 4 · Resumo de gastos por categoria (Excel) ═════════════ */

export function exportCategorySummaryXLSX(overview: Overview, spaceName?: string): void {
  const rows: (string | number)[][] = [
    [
      'Categoria',
      'Itens',
      'Comprados',
      'Parciais',
      'Pendentes',
      'Conclusão',
      'Orçamento',
      'Gasto (desembolsado)',
      'Uso do orçamento',
      'Contratado',
      'Comprometido',
      'Total estimado',
      'Falta estimado',
      'Situação',
    ],
    ...overview.byCategory.map((row) => [
      `${row.code} · ${row.name}`,
      integer(row.itemsTotal),
      integer(row.itemsDone),
      integer(row.itemsPartial),
      integer(row.itemsPending),
      percentPoints(row.completion * 100),
      row.budget === null ? 'Não definido' : money(row.budget),
      money(row.spent),
      row.usage === null ? '' : percentPoints(row.usage * 100),
      money(row.contracted),
      money(row.committed),
      money(row.estimatedTotal),
      money(row.estimatedRemaining),
      row.level === 'estourado'
        ? 'Orçamento estourado'
        : row.level === 'atencao'
          ? 'Perto do limite'
          : row.level === 'ok'
            ? 'Dentro do orçamento'
            : 'Sem orçamento',
    ]),
  ];

  rows.push([], [
    'TOTAL',
    integer(overview.itemsTotal),
    integer(overview.itemsDone),
    integer(overview.itemsPartial),
    integer(overview.itemsPending),
    percentPoints(overview.completion * 100),
    overview.budgetTotal === null ? 'Não definido' : money(overview.budgetTotal),
    money(overview.totalSpent),
    overview.budgetUsage === null ? '' : percentPoints(overview.budgetUsage * 100),
    money(overview.contractedTotal),
    money(overview.committed),
    money(overview.estimatedTotal),
    money(overview.estimatedRemaining),
    '',
  ]);

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheetFromRows(rows), 'Por categoria');
  XLSX.utils.book_append_sheet(
    book,
    sheetFromRows([
      ['Mês', 'Desembolsado', 'Parcelas a vencer', 'Compras', 'Meta do mês'],
      ...overview.byMonth.map((row) => [
        monthShortBR(row.monthKey),
        money(row.spent),
        money(row.committed),
        integer(row.purchaseCount),
        row.budget === null ? '' : money(row.budget),
      ]),
    ]),
    'Por mês',
  );

  writeWorkbook(book, stamp(spaceName, 'gastos-por-categoria'));
}

/* ═══════════ 5 · Estimado × realizado (Excel) ════════════════════════════ */

export function exportEstimateVsActualXLSX(context: ExportContext): void {
  const { items, categories, spaceName } = context;

  const comparable = items
    .filter(
      (item) =>
        !item.is_task && Number(item.unit_price_estimate) > 0 && Number(item.qty_bought) > 0,
    )
    .sort((a, b) => Number(a.savings) - Number(b.savings));

  const rows: (string | number)[][] = [
    [
      'Categoria',
      'Item',
      'Qtd. comprada',
      'Preço estimado unitário',
      'Preço médio pago',
      'Estimado das unidades compradas',
      'Valor real pago',
      'Diferença',
      'Situação',
    ],
    ...comparable.map((item) => {
      const estimatedForBought = Number(item.qty_bought) * Number(item.unit_price_estimate);
      return [
        categoryName(categories, item.category_id),
        item.name,
        quantity(item.qty_bought),
        money(item.unit_price_estimate),
        item.avg_unit_paid !== null ? money(item.avg_unit_paid) : '',
        money(estimatedForBought),
        money(item.total_spent),
        money(item.savings),
        Number(item.savings) >= 0 ? 'Economia' : 'Acima do estimado',
      ];
    }),
  ];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheetFromRows(rows), 'Estimado x realizado');
  writeWorkbook(book, stamp(spaceName, 'estimado-x-realizado'));
}

/* ═══════════ 6 · Lista de compras selecionadas (Excel) ═══════════════════ */

export function exportSelectedListXLSX(
  selected: readonly Item[],
  context: ExportContext,
  title = 'Lista de compras',
): void {
  const { categories, spaceName } = context;

  const rows: (string | number)[][] = [
    ['Categoria', 'Item', 'Unidade', 'Qtd. a comprar', 'Preço estimado', 'Total estimado', 'Observações'],
    ...selected.map((item) => [
      categoryName(categories, item.category_id),
      item.name,
      item.unit,
      quantity(item.qty_pending > 0 ? item.qty_pending : item.qty_needed),
      money(item.unit_price_estimate),
      money(item.estimated_remaining > 0 ? item.estimated_remaining : item.estimated_total),
      item.notes ?? '',
    ]),
  ];

  const total = selected.reduce(
    (acc, item) =>
      acc + Number(item.estimated_remaining > 0 ? item.estimated_remaining : item.estimated_total),
    0,
  );
  rows.push([], ['', 'TOTAL ESTIMADO', '', '', '', money(total)]);

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheetFromRows(rows), title.slice(0, 31));
  writeWorkbook(book, stamp(spaceName, slug(title)));
}

/* ═══════════════════ 7 · Relatório financeiro (PDF) ══════════════════════ */

export function exportFinanceReportPDF(options: {
  overview: Overview;
  purchases: readonly Purchase[];
  installments: readonly Installment[];
  extraExpenses: readonly ExtraExpense[];
  context: ExportContext;
}): void {
  const { overview, purchases, installments, extraExpenses, context } = options;
  const { categories, memberName, spaceName = 'Nosso Lar' } = context;

  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // ── Cabeçalho
  doc.setFillColor(247, 246, 242);
  doc.rect(0, 0, pageWidth, 92, 'F');
  doc.setTextColor(36, 36, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(spaceName, margin, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(92, 90, 83);
  doc.text('Relatório financeiro do enxoval', margin, 60);
  doc.setFontSize(9);
  doc.setTextColor(122, 119, 109);
  doc.text(
    `Gerado em ${dateBR(todayISO())} · mês de referência: ${monthLongBR(overview.monthKey)}`,
    margin,
    76,
  );

  // ── Indicadores
  autoTable(doc, {
    startY: 112,
    margin: { left: margin, right: margin },
    head: [['Indicador', 'Valor']],
    body: [
      ['Orçamento total', overview.budgetTotal === null ? 'Não definido' : money(overview.budgetTotal)],
      ['Total efetivamente gasto', money(overview.totalSpent)],
      ['  · compras (parcelas pagas)', money(overview.purchasesSpent)],
      ['  · despesas adicionais', money(overview.extrasSpent)],
      ['Saldo do orçamento', overview.balance === null ? '—' : money(overview.balance)],
      ['Valor total contratado', money(overview.contractedTotal)],
      ['Comprometido em parcelas futuras', money(overview.committed)],
      ['Valor estimado restante', money(overview.estimatedRemaining)],
      [
        'Projeção ao concluir o enxoval',
        overview.projectedLeftover === null ? '—' : money(overview.projectedLeftover),
      ],
      ['Gastos com frete', money(overview.shippingSpent)],
      ['Gastos com montagem e instalação', money(overview.assemblySpent)],
      [
        overview.savings >= 0 ? 'Economia frente ao estimado' : 'Excedente frente ao estimado',
        money(Math.abs(overview.savings)),
      ],
      ['Itens acima do preço estimado', integer(overview.itemsOverEstimate)],
      ['Conclusão do enxoval', percentPoints(overview.completion * 100)],
      [
        `Gasto em ${monthLongBR(overview.monthKey)}`,
        `${money(overview.monthSpent)} (${integer(overview.monthPurchaseCount)} compras)`,
      ],
    ],
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 5, textColor: [36, 36, 36] },
    headStyles: {
      fillColor: [120, 129, 92],
      textColor: [253, 252, 250],
      fontStyle: 'bold',
      fontSize: 9.5,
    },
    alternateRowStyles: { fillColor: [247, 246, 242] },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  });

  // ── Por categoria
  const afterKpis = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  autoTable(doc, {
    startY: afterKpis + 24,
    margin: { left: margin, right: margin },
    head: [['Categoria', 'Orçamento', 'Gasto', 'Uso', 'Comprometido', 'Falta estimado']],
    body: overview.byCategory
      .filter((row) => row.budget !== null || row.spent > 0 || row.estimatedRemaining > 0)
      .map((row) => [
        row.name,
        row.budget === null ? '—' : money(row.budget),
        money(row.spent),
        row.usage === null ? '—' : percentPoints(row.usage * 100),
        money(row.committed),
        money(row.estimatedRemaining),
      ]),
    foot: [
      [
        'Total',
        overview.budgetTotal === null ? '—' : money(overview.budgetTotal),
        money(overview.totalSpent),
        overview.budgetUsage === null ? '—' : percentPoints(overview.budgetUsage * 100),
        money(overview.committed),
        money(overview.estimatedRemaining),
      ],
    ],
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4.5 },
    headStyles: { fillColor: [120, 129, 92], textColor: [253, 252, 250], fontSize: 8.5 },
    footStyles: { fillColor: [230, 227, 218], textColor: [36, 36, 36], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 246, 242] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(122, 119, 109);
      doc.text(
        'Nosso Lar · Nosso enxoval, nossos planos.',
        margin,
        doc.internal.pageSize.getHeight() - 20,
      );
    },
  });

  // ── Evolução mensal
  if (overview.byMonth.length > 0) {
    const afterCategories = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;
    autoTable(doc, {
      startY: afterCategories + 24,
      margin: { left: margin, right: margin },
      head: [['Mês', 'Desembolsado', 'Parcelas a vencer', 'Compras', 'Meta do mês']],
      body: overview.byMonth.map((row) => [
        monthShortBR(row.monthKey),
        money(row.spent),
        row.committed > 0 ? money(row.committed) : '—',
        integer(row.purchaseCount),
        row.budget === null ? '—' : money(row.budget),
      ]),
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4.5 },
      headStyles: { fillColor: [120, 129, 92], textColor: [253, 252, 250], fontSize: 8.5 },
      alternateRowStyles: { fillColor: [247, 246, 242] },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });
  }

  // ── Compras
  if (purchases.length > 0) {
    doc.addPage();
    autoTable(doc, {
      startY: 48,
      margin: { left: margin, right: margin },
      head: [['Data', 'Descrição', 'Categoria', 'Qtd.', 'Total', 'Pago', 'A vencer', 'Resp.']],
      body: [...purchases]
        .sort((a, b) => b.purchased_at.localeCompare(a.purchased_at))
        .map((purchase) => {
          const finance = purchaseFinance(purchase, installments);
          return [
            dateBR(purchase.purchased_at),
            purchase.description,
            categoryName(categories, purchase.category_id).replace(/^[A-Z] · /, ''),
            quantity(purchase.qty),
            money(finance.total),
            money(finance.paid),
            finance.open > 0 ? money(finance.open) : '—',
            memberName(purchase.buyer_id),
          ];
        }),
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [120, 129, 92], textColor: [253, 252, 250], fontSize: 8 },
      alternateRowStyles: { fillColor: [247, 246, 242] },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
      didDrawPage: () => {
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(36, 36, 36);
        doc.text('Histórico de compras', margin, 34);
        doc.setFont('helvetica', 'normal');
      },
    });
  }

  // ── Despesas adicionais
  if (extraExpenses.length > 0) {
    const afterPurchases = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY;
    autoTable(doc, {
      startY: afterPurchases + 24,
      margin: { left: margin, right: margin },
      head: [['Data', 'Despesa', 'Tipo', 'Categoria', 'Valor']],
      body: extraExpenses.map((expense) => [
        dateBR(expense.spent_at),
        expense.description,
        EXTRA_KIND_LABEL[expense.kind],
        categoryName(categories, expense.category_id).replace(/^[A-Z] · /, ''),
        money(expense.amount),
      ]),
      foot: [['', 'Total', '', '', money(overview.extrasSpent)]],
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 4.5 },
      headStyles: { fillColor: [120, 129, 92], textColor: [253, 252, 250], fontSize: 8.5 },
      footStyles: { fillColor: [230, 227, 218], textColor: [36, 36, 36], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [247, 246, 242] },
      columnStyles: { 4: { halign: 'right' } },
    });
  }

  doc.save(`${stamp(spaceName, 'relatorio-financeiro')}.pdf`);
}
