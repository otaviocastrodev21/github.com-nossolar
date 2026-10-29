/**
 * Camada fina sobre `exports.ts`.
 *
 * As bibliotecas de Excel e PDF somam centenas de kB; carregá-las na abertura
 * faria o casal esperar por algo que talvez nem use. Aqui cada ação importa o
 * módulo pesado só quando a pessoa clica em exportar.
 */

import type { Overview } from './calc';
import type { ExportContext } from './exports';
import type { ExtraExpense, Installment, Item, Purchase } from '@/types/database';

const load = () => import('./exports');

export async function exportChecklist(context: ExportContext, overview: Overview): Promise<void> {
  (await load()).exportChecklistXLSX(context, overview);
}

export async function exportPending(context: ExportContext): Promise<void> {
  (await load()).exportPendingXLSX(context);
}

export async function exportPurchases(
  purchases: readonly Purchase[],
  context: ExportContext,
  installments: readonly Installment[] = [],
): Promise<void> {
  (await load()).exportPurchasesCSV(purchases, context, installments);
}

export async function exportCategorySummary(
  overview: Overview,
  spaceName?: string,
): Promise<void> {
  (await load()).exportCategorySummaryXLSX(overview, spaceName);
}

export async function exportEstimateVsActual(context: ExportContext): Promise<void> {
  (await load()).exportEstimateVsActualXLSX(context);
}

export async function exportSelectedList(
  selected: readonly Item[],
  context: ExportContext,
  title?: string,
): Promise<void> {
  (await load()).exportSelectedListXLSX(selected, context, title);
}

export async function exportFinanceReport(options: {
  overview: Overview;
  purchases: readonly Purchase[];
  installments: readonly Installment[];
  extraExpenses: readonly ExtraExpense[];
  context: ExportContext;
}): Promise<void> {
  (await load()).exportFinanceReportPDF(options);
}

export type { ExportContext };
