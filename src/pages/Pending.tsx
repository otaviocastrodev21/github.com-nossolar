import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ClipboardList,
  FileDown,
  ListChecks,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '@/components/layout/AppShell';
import { Button, Card, Chip, EmptyState, Notice } from '@/components/ui/primitives';
import { Checkbox, Input, SegmentedControl, Select } from '@/components/ui/form';
import { Meter, StatTile } from '@/components/dashboard/figures';
import { ItemDetail } from '@/components/checklist/ItemDetail';
import { ItemForm } from '@/components/checklist/ItemForm';
import { PurchaseForm } from '@/components/purchases/PurchaseForm';
import { useSpace } from '@/contexts/SpaceContext';
import { useToast } from '@/contexts/ToastContext';
import { itemProgress } from '@/lib/calc';
import { exportPending, exportSelectedList } from '@/lib/export-actions';
import { integer, money, percentPoints, plural, quantity, unitFor } from '@/lib/format';
import { PRIORITY_CHIP, STATUS_CHIP, STATUS_FILL } from '@/lib/viz';
import { PRIORITY_LABEL, PRIORITY_ORDER, STATUS_SHORT } from '@/types/database';
import type { Item, Priority } from '@/types/database';

export function Pending() {
  const { items, categories, purchases, overview, categoryById, memberName, updateItem, space } =
    useSpace();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('todas');
  const [priority, setPriority] = useState<Priority | 'todas'>('todas');
  const [scope, setScope] = useState<'produtos' | 'tarefas'>('produtos');
  // No celular categoria e prioridade ficam atrás de um botão, como no
  // Checklist: a busca e o seletor produtos/tarefas bastam no dia a dia.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hiddenFilters = (categoryId !== 'todas' ? 1 : 0) + (priority !== 'todas' ? 1 : 0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [exporting, setExporting] = useState<string | null>(null);
  const [detail, setDetail] = useState<Item | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [purchaseFor, setPurchaseFor] = useState<Item | null>(null);
  const [editPurchaseId, setEditPurchaseId] = useState<string | null>(null);

  const pending = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (scope === 'tarefas') {
          if (!item.is_task || item.task_done) return false;
        } else {
          if (item.is_task || item.excluded) return false;
          if (!(Number(item.qty_pending) > 0)) return false;
        }
        if (categoryId !== 'todas' && item.category_id !== categoryId) return false;
        if (priority !== 'todas' && item.priority !== priority) return false;
        if (needle && !`${item.name} ${item.subcategory ?? ''}`.toLowerCase().includes(needle)) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
          Number(b.estimated_remaining) - Number(a.estimated_remaining) ||
          a.name.localeCompare(b.name, 'pt-BR'),
      );
  }, [items, search, categoryId, priority, scope]);

  const byPriority = useMemo(() => {
    const groups: { priority: Priority; items: Item[] }[] = [
      { priority: 'essencial', items: [] },
      { priority: 'importante', items: [] },
      { priority: 'opcional', items: [] },
    ];
    for (const item of pending) {
      groups.find((group) => group.priority === item.priority)?.items.push(item);
    }
    return groups.filter((group) => group.items.length > 0);
  }, [pending]);

  const selectedItems = useMemo(
    () => pending.filter((item) => selected.has(item.id)),
    [pending, selected],
  );

  const selectedTotal = selectedItems.reduce(
    (acc, item) => acc + Number(item.estimated_remaining),
    0,
  );

  const pendingTotal = pending.reduce((acc, item) => acc + Number(item.estimated_remaining), 0);
  const withoutPrice = pending.filter((item) => Number(item.unit_price_estimate) === 0).length;

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) =>
      current.size === pending.length ? new Set() : new Set(pending.map((item) => item.id)),
    );
  };

  const exportContext = {
    items,
    categories,
    memberName,
    spaceName: space?.name,
  };

  const editingPurchase = editPurchaseId
    ? (purchases.find((purchase) => purchase.id === editPurchaseId) ?? null)
    : null;

  const activeFilters =
    (search ? 1 : 0) + (categoryId !== 'todas' ? 1 : 0) + (priority !== 'todas' ? 1 : 0);

  const runExport = async (id: string, action: () => Promise<void>, message: string) => {
    setExporting(id);
    try {
      await action();
      toast.success(message);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Não foi possível exportar.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <PageHeader
        icon={<ClipboardList className="h-5 w-5" aria-hidden />}
        title="Itens pendentes"
        description="O que ainda falta comprar, dos essenciais aos opcionais. Selecione itens para gerar a lista de compras da próxima ida à loja."
        actions={
          <>
            <Button
              variant="secondary"
              loading={exporting === 'pendentes'}
              onClick={() => void runExport('pendentes', () => exportPending(exportContext),
                'Lista de pendentes exportada em Excel.')}
            >
              <FileDown className="h-4 w-4" aria-hidden />
              Exportar pendentes
            </Button>
            <Button
              variant="primary"
              loading={exporting === 'lista'}
              disabled={selectedItems.length === 0}
              onClick={() => void runExport('lista',
                () => exportSelectedList(selectedItems, exportContext, 'Lista de compras'),
                `Lista com ${plural(selectedItems.length, 'item', 'itens')} exportada.`)}
            >
              <ShoppingBag className="h-4 w-4" aria-hidden />
              Lista de compras
              {selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}
            </Button>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Itens em aberto"
          value={integer(overview.itemsPending + overview.itemsPartial)}
          sub={`${integer(overview.itemsPartial)} já começados`}
        />
        <StatTile
          label="Unidades pendentes"
          value={quantity(overview.unitsPending)}
          sub="somando todos os itens ativos"
        />
        <StatTile
          label="Valor estimado restante"
          value={money(overview.estimatedRemaining)}
          sub="preço estimado × quantidade pendente"
        />
        <StatTile
          label="Conclusão do enxoval"
          value={percentPoints(overview.completion * 100)}
          meter={{ ratio: overview.completion }}
        />
      </div>

      {withoutPrice > 0 && scope === 'produtos' ? (
        <div className="mb-5">
          <Notice
            tone="info"
            icon={<ListChecks className="h-4.5 w-4.5" />}
            title={`${plural(withoutPrice, 'item sem preço estimado', 'itens sem preço estimado')}`}
          >
            O valor estimado restante ({money(pendingTotal)}) considera apenas os itens com preço
            preenchido. Conforme vocês pesquisarem os preços, a projeção fica mais fiel.
          </Notice>
        </div>
      ) : null}

      {/* ── Filtros ── */}
      <Card className="mb-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <label className="label" htmlFor="p-busca">
              Buscar
            </label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                  aria-hidden
                />
                <Input
                  id="p-busca"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome ou subcategoria"
                  className="pl-10"
                />
              </div>
              <Button
                variant="secondary"
                className="h-auto shrink-0 self-stretch sm:hidden"
                aria-expanded={filtersOpen}
                aria-controls="filtros-pendentes"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                <span className="max-[380px]:sr-only">Filtros</span>
                {hiddenFilters > 0 ? (
                  <span className="tnum grid h-5 min-w-5 place-items-center rounded-full bg-olive-600 px-1 text-[0.6875rem] font-semibold text-cream-50">
                    {hiddenFilters}
                    <span className="sr-only"> ativos</span>
                  </span>
                ) : null}
                <ChevronDown
                  className={clsx('h-4 w-4 transition-transform', filtersOpen && 'rotate-180')}
                  aria-hidden
                />
              </Button>
            </div>
          </div>

          <div
            id="filtros-pendentes"
            className={clsx('contents', !filtersOpen && 'max-sm:hidden')}
          >
          <div className="min-w-[11rem] max-sm:flex-1">
            <label className="label" htmlFor="p-categoria">
              Categoria
            </label>
            <Select
              id="p-categoria"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="todas">Todas</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.code} · {category.name}
                </option>
              ))}
            </Select>
          </div>

          <div className="min-w-[9rem] max-sm:flex-1">
            <label className="label" htmlFor="p-prioridade">
              Prioridade
            </label>
            <Select
              id="p-prioridade"
              value={priority}
              onChange={(event) => setPriority(event.target.value as Priority | 'todas')}
            >
              <option value="todas">Todas</option>
              {(Object.keys(PRIORITY_LABEL) as Priority[]).map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>
          </div>

          <SegmentedControl
            label="Tipo de pendência"
            value={scope}
            onChange={(next) => {
              setScope(next);
              setSelected(new Set());
            }}
            options={[
              { value: 'produtos', label: 'Produtos' },
              { value: 'tarefas', label: 'Tarefas' },
            ]}
          />

          {activeFilters > 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                setSearch('');
                setCategoryId('todas');
                setPriority('todas');
              }}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              Limpar
            </Button>
          ) : null}
        </div>
      </Card>

      {/* ── Seleção ── */}
      {pending.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
          <Checkbox
            checked={selected.size === pending.length && pending.length > 0}
            onChange={toggleAll}
            label={
              selected.size === pending.length && pending.length > 0
                ? 'Desmarcar todos'
                : `Selecionar todos (${integer(pending.length)})`
            }
          />
          {selected.size > 0 ? (
            <p className="tnum text-[0.875rem] text-ink-secondary">
              {plural(selected.size, 'item selecionado', 'itens selecionados')} ·{' '}
              <strong className="text-ink">{money(selectedTotal)}</strong> estimados
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Lista agrupada por prioridade ── */}
      {pending.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" aria-hidden />}
            title={
              activeFilters > 0
                ? 'Nada encontrado com esses filtros'
                : scope === 'tarefas'
                  ? 'Todas as tarefas foram verificadas'
                  : 'Nenhuma pendência!'
            }
            description={
              activeFilters > 0
                ? 'Afrouxe os filtros para ver mais itens.'
                : scope === 'tarefas'
                  ? 'As verificações da casa estão em ordem.'
                  : 'Todos os itens ativos do enxoval já foram comprados por completo.'
            }
          />
        </Card>
      ) : (
        <div className="stagger flex flex-col gap-5">
          {byPriority.map(({ priority: groupPriority, items: groupItems }) => {
            const groupTotal = groupItems.reduce(
              (acc, item) => acc + Number(item.estimated_remaining),
              0,
            );
            return (
              <Card key={groupPriority}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-400/70 px-5 py-3.5 sm:px-6">
                  <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
                    {PRIORITY_LABEL[groupPriority]}
                    <Chip className={PRIORITY_CHIP[groupPriority]}>
                      {integer(groupItems.length)}
                    </Chip>
                  </h2>
                  {groupTotal > 0 ? (
                    <span className="tnum text-[0.8125rem] text-ink-muted">
                      {money(groupTotal)} estimados
                    </span>
                  ) : null}
                </div>

                <ul className="divide-y divide-cream-300/80">
                  {groupItems.map((item) => {
                    const progress = itemProgress(item);
                    return (
                      <li
                        key={item.id}
                        className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-cream-200/50 sm:px-6"
                      >
                        <span className="pt-0.5">
                          <Checkbox
                            checked={selected.has(item.id)}
                            onChange={() => toggle(item.id)}
                            label={<span className="sr-only">Selecionar {item.name}</span>}
                          />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <button
                              type="button"
                              onClick={() => setDetail(item)}
                              className="min-w-0 text-left text-[0.9375rem] font-medium leading-snug text-ink transition hover:text-olive-700 touch:-my-2.5 touch:min-w-10 touch:py-2.5"
                            >
                              {item.name}
                            </button>
                            <Chip className={STATUS_CHIP[item.status]} dot={STATUS_FILL[item.status]}>
                              {STATUS_SHORT[item.status]}
                            </Chip>
                            <span className="text-[0.8125rem] text-ink-muted">
                              {categoryById.get(item.category_id)?.name}
                            </span>
                          </div>

                          {!item.is_task ? (
                            <>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[0.8125rem] text-ink-muted">
                                <span className="tnum">
                                  falta {quantity(item.qty_pending)} de{' '}
                                  {quantity(item.qty_needed)} {unitFor(Number(item.qty_needed), item.unit)}
                                </span>
                                <span className="tnum">
                                  {Number(item.unit_price_estimate) > 0
                                    ? `${money(item.estimated_remaining)} estimados`
                                    : 'preço estimado em branco'}
                                </span>
                              </div>
                              <Meter
                                ratio={progress.ratio}
                                size="xs"
                                className="mt-2 max-w-md"
                                label={`${item.name}: ${percentPoints(progress.ratio * 100)}`}
                              />
                            </>
                          ) : (
                            <p className="mt-1 text-[0.8125rem] text-ink-muted">
                              Tarefa de verificação — não entra no orçamento.
                            </p>
                          )}
                        </div>

                        <div className="shrink-0">
                          {item.is_task ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                void updateItem(item.id, { task_done: true })
                                  .then(() => toast.success('Tarefa verificada.'))
                                  .catch((caught: unknown) =>
                                    toast.error(
                                      caught instanceof Error
                                        ? caught.message
                                        : 'Não foi possível concluir.',
                                    ),
                                  )
                              }
                            >
                              Verificar
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => setPurchaseFor(item)}
                            >
                              <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
                              Comprar
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <ItemDetail
        item={detail}
        onClose={() => setDetail(null)}
        onEdit={(item) => {
          setDetail(null);
          setEditing(item);
        }}
        onRegisterPurchase={(item) => {
          setDetail(null);
          setPurchaseFor(item);
        }}
        onEditPurchase={(purchaseId) => {
          setDetail(null);
          setEditPurchaseId(purchaseId);
        }}
      />

      <ItemForm open={editing !== null} item={editing} onClose={() => setEditing(null)} />

      <PurchaseForm
        open={purchaseFor !== null}
        presetItem={purchaseFor}
        onClose={() => setPurchaseFor(null)}
      />

      <PurchaseForm
        open={editPurchaseId !== null}
        purchase={editingPurchase}
        onClose={() => setEditPurchaseId(null)}
      />
    </>
  );
}
