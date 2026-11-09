import { useMemo, useState } from 'react';
import {
  FileBarChart,
  FileDown,
  FileSpreadsheet,
  FileText,
  ListChecks,
  Scale,
  Table2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button, Card, CardHeader, EmptyState, Notice } from '@/components/ui/primitives';
import { EstimateVsActual, type DumbbellRow } from '@/components/dashboard/charts';
import { useSpace } from '@/contexts/SpaceContext';
import { useToast } from '@/contexts/ToastContext';
import {
  exportCategorySummary,
  exportChecklist,
  exportEstimateVsActual,
  exportFinanceReport,
  exportPending,
  exportPurchases,
  exportSelectedList,
} from '@/lib/export-actions';
import { integer, money, percentPoints } from '@/lib/format';
import { isActive } from '@/lib/calc';

export function Reports() {
  const {
    items,
    categories,
    purchases,
    installments,
    extraExpenses,
    overview,
    memberName,
    space,
  } = useSpace();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const context = useMemo(
    () => ({ items, categories, memberName, spaceName: space?.name }),
    [items, categories, memberName, space?.name],
  );

  const run = async (id: string, action: () => Promise<void>, message: string) => {
    setBusy(id);
    try {
      await action();
      toast.success(message);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Não foi possível gerar o arquivo.');
    } finally {
      setBusy(null);
    }
  };

  const comparable = useMemo<DumbbellRow[]>(
    () =>
      items
        .filter(
          (item) =>
            isActive(item) &&
            Number(item.unit_price_estimate) > 0 &&
            Number(item.qty_bought) > 0,
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          estimated: Number(item.qty_bought) * Number(item.unit_price_estimate),
          actual: Number(item.total_spent),
        }))
        .sort((a, b) => b.actual - a.actual)
        .slice(0, 14),
    [items],
  );

  const pendingItems = useMemo(
    () => items.filter((item) => isActive(item) && Number(item.qty_pending) > 0),
    [items],
  );

  const EXPORTS = [
    {
      id: 'checklist',
      icon: FileSpreadsheet,
      title: 'Checklist completo',
      format: 'Excel (.xlsx)',
      description:
        'Todos os itens com categoria, quantidades, preços, totais, status e observações, mais uma aba de resumo.',
      count: `${integer(items.length)} linhas`,
      action: () => exportChecklist(context, overview),
    },
    {
      id: 'pendentes',
      icon: ListChecks,
      title: 'Itens pendentes',
      format: 'Excel (.xlsx)',
      description:
        'O que ainda falta comprar, ordenado por prioridade, com o valor estimado restante e uma aba de tarefas em aberto.',
      count: `${integer(pendingItems.length)} itens`,
      action: () => exportPending(context),
      disabled: pendingItems.length === 0,
    },
    {
      id: 'compras',
      icon: Table2,
      title: 'Histórico de compras',
      format: 'CSV',
      description:
        'Uma linha por compra, com desconto, frete, total, valor já pago, valor a vencer e responsável.',
      count: `${integer(purchases.length)} registros`,
      action: () => exportPurchases(purchases, context, installments),
      disabled: purchases.length === 0,
    },
    {
      id: 'financeiro',
      icon: FileText,
      title: 'Relatório financeiro',
      format: 'PDF',
      description:
        'Indicadores, orçamento por categoria, evolução mensal, histórico de compras e despesas adicionais.',
      count: 'documento completo',
      action: () =>
        exportFinanceReport({ overview, purchases, installments, extraExpenses, context }),
    },
    {
      id: 'categorias',
      icon: FileSpreadsheet,
      title: 'Resumo de gastos por categoria',
      format: 'Excel (.xlsx)',
      description:
        'Orçamento, gasto, uso do orçamento, comprometido e falta estimado por categoria, com uma aba por mês.',
      count: `${integer(categories.length)} categorias`,
      action: () => exportCategorySummary(overview, space?.name),
    },
    {
      id: 'estimado',
      icon: Scale,
      title: 'Estimado × realizado',
      format: 'Excel (.xlsx)',
      description:
        'Comparativo item por item entre o preço estimado das unidades compradas e o valor realmente pago.',
      count: `${integer(comparable.length)} itens comparáveis`,
      action: () => exportEstimateVsActual(context),
      disabled: comparable.length === 0,
    },
    {
      id: 'lista',
      icon: FileDown,
      title: 'Lista de compras (pendentes)',
      format: 'Excel (.xlsx)',
      description:
        'Lista enxuta para levar à loja: item, quantidade a comprar, preço estimado e total. Para escolher itens específicos, use a seleção na página Pendentes.',
      count: `${integer(pendingItems.length)} itens`,
      action: () => exportSelectedList(pendingItems, context, 'Lista de compras'),
      disabled: pendingItems.length === 0,
    },
  ] as const;

  return (
    <>
      <PageHeader
        icon={<FileBarChart className="h-5 w-5" aria-hidden />}
        title="Relatórios"
        description="Tudo o que o sistema mostra pode sair em arquivo, com quantidades, preços, totais e status. Os valores saem no padrão brasileiro."
      />

      <div className="stagger flex flex-col gap-5">
        {/* ── Painel-resumo ── */}
        <Card className="card-pad">
          <h2 className="eyebrow mb-3">O que entra nos relatórios agora</h2>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Summary label="Itens cadastrados" value={integer(items.length)} />
            <Summary label="Compras registradas" value={integer(purchases.length)} />
            <Summary label="Total efetivamente gasto" value={money(overview.totalSpent)} />
            <Summary label="Conclusão do enxoval" value={percentPoints(overview.completion * 100)} />
            <Summary
              label="Conclusão da primeira compra"
              value={percentPoints(overview.byList.pc.completion * 100)}
            />
            <Summary
              label="Conclusão dos materiais de construção"
              value={percentPoints(overview.byList.construcao.completion * 100)}
            />
          </dl>
        </Card>

        {/* ── Exportações ── */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {EXPORTS.map((item) => {
            const Icon = item.icon;
            const disabled = 'disabled' in item ? Boolean(item.disabled) : false;
            return (
              <Card as="article" key={item.id} className="flex flex-col gap-3 p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-olive-100 text-olive-700">
                    <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[0.9375rem] font-semibold leading-snug text-ink">
                      {item.title}
                    </h3>
                    <p className="text-[0.75rem] font-medium uppercase tracking-wide text-ink-muted">
                      {item.format} · {item.count}
                    </p>
                  </div>
                </div>

                <p className="flex-1 text-[0.875rem] leading-relaxed text-ink-secondary">
                  {item.description}
                </p>

                <Button
                  variant={disabled ? 'secondary' : 'primary'}
                  block
                  disabled={disabled}
                  loading={busy === item.id}
                  onClick={() => void run(item.id, item.action, `${item.title} exportado.`)}
                >
                  <FileDown className="h-4 w-4" aria-hidden />
                  {disabled ? 'Sem dados para exportar' : 'Baixar'}
                </Button>
              </Card>
            );
          })}
        </div>

        {/* ── Comparativo estimado × realizado ── */}
        <Card>
          <CardHeader
            icon={<Scale className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Estimado × realizado"
            subtitle="Para cada item comprado, o estimado das unidades adquiridas e o que foi pago de fato"
          />
          <div className="px-5 py-5 sm:px-6">
            <EstimateVsActual rows={comparable} />
          </div>
        </Card>

        {/* ── Resumo por categoria em tabela ── */}
        <Card>
          <CardHeader
            icon={<Table2 className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Resumo por categoria"
            subtitle="Os mesmos números que saem no Excel e no PDF"
          />
          {overview.byCategory.length === 0 ? (
            <EmptyState compact title="Nenhuma categoria cadastrada" />
          ) : (
            <div className="scroll-x">
              <table className="w-full min-w-[52rem] text-[0.875rem]">
                <caption className="sr-only">Resumo financeiro por categoria</caption>
                <thead>
                  <tr className="border-b border-cream-400 text-left text-[0.75rem] uppercase tracking-wide text-ink-muted">
                    {/* A categoria fica parada enquanto os números rolam: é uma
                        tabela de comparação, cartões destruiriam a leitura cruzada. */}
                    <th scope="col" className="sticky left-0 z-[1] max-sm:w-[10rem] max-sm:min-w-[10rem] bg-cream-100 px-4 py-3 font-semibold sm:px-5">
                      Categoria
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Itens</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Conclusão</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Orçamento</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Gasto</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Uso</th>
                    <th scope="col" className="px-3 py-3 text-right font-semibold">Comprometido</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold">Falta estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.byCategory.map((row) => (
                    <tr key={row.categoryId} className="border-b border-cream-300/80 last:border-0">
                      <td className="sticky left-0 z-[1] max-sm:w-[10rem] max-sm:min-w-[10rem] bg-cream-100 px-4 py-2.5 text-ink sm:px-5">
                        <span className="mr-1.5 font-semibold text-ink-muted">{row.code}</span>
                        {row.name}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                        {integer(row.itemsDone)}/{integer(row.itemsTotal)}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                        {percentPoints(row.completion * 100)}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                        {row.budget === null ? '—' : money(row.budget)}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right font-medium text-ink">
                        {money(row.spent)}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                        {row.usage === null ? '—' : percentPoints(row.usage * 100)}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right text-ink-secondary">
                        {row.committed > 0 ? money(row.committed) : '—'}
                      </td>
                      <td className="tnum px-5 py-2.5 text-right text-ink-secondary">
                        {row.estimatedRemaining > 0 ? money(row.estimatedRemaining) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-cream-400 bg-cream-200/60">
                    {/* #f4f2ec = o cream-200/60 da linha já composto sobre o cartão:
                        a célula fixa precisa de fundo opaco. */}
                    <th scope="row" className="sticky left-0 z-[1] max-sm:w-[10rem] max-sm:min-w-[10rem] bg-cream-200 px-4 py-3 text-left font-semibold text-ink sm:px-5">
                      Total
                      <span className="block text-[0.6875rem] font-normal text-ink-muted">
                        itens e conclusão: só o enxoval
                      </span>
                    </th>
                    <td className="tnum px-3 py-3 text-right text-ink">
                      {integer(overview.itemsDone)}/{integer(overview.itemsTotal)}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-ink">
                      {percentPoints(overview.completion * 100)}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-ink">
                      {overview.budgetTotal === null ? '—' : money(overview.budgetTotal)}
                    </td>
                    <td className="tnum px-3 py-3 text-right font-semibold text-ink">
                      {money(overview.totalSpent)}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-ink">
                      {overview.budgetUsage === null
                        ? '—'
                        : percentPoints(overview.budgetUsage * 100)}
                    </td>
                    <td className="tnum px-3 py-3 text-right text-ink">
                      {money(overview.committed)}
                    </td>
                    <td className="tnum px-5 py-3 text-right text-ink">
                      {money(overview.estimatedRemaining)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        <Notice tone="info" icon={<FileDown className="h-4.5 w-4.5" />}>
          Os arquivos CSV usam ponto e vírgula e acentuação UTF-8, então abrem direto no Excel em
          português. Para uma lista de compras com itens escolhidos a dedo, selecione os itens na
          página <strong>Itens pendentes</strong> e use o botão “Lista de compras”.
        </Notice>
      </div>
    </>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.8125rem] text-ink-secondary">{label}</dt>
      <dd className="tnum text-[1.25rem] font-semibold text-ink">{value}</dd>
    </div>
  );
}
