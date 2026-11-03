import { useMemo, useState } from 'react';
import {
  ChevronDown,
  Copy,
  ExternalLink,
  LayoutGrid,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '@/components/layout/AppShell';
import { Button, Card, Chip, EmptyState, Notice } from '@/components/ui/primitives';
import { Checkbox, Input, SegmentedControl, Select } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Meter } from '@/components/dashboard/figures';
import { ItemForm } from '@/components/checklist/ItemForm';
import { ItemDetail } from '@/components/checklist/ItemDetail';
import { QuoteBadge } from '@/components/checklist/QuoteComparison';
import { PurchaseForm } from '@/components/purchases/PurchaseForm';
import { useSpace } from '@/contexts/SpaceContext';
import { useToast } from '@/contexts/ToastContext';
import { filterItems, itemProgress, type ItemSort } from '@/lib/calc';
import { integer, money, percentPoints, quantity, unitFor } from '@/lib/format';
import { PRIORITY_CHIP, STATUS_CHIP, STATUS_FILL } from '@/lib/viz';
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_SHORT } from '@/types/database';
import type { Item, ItemStatus, Priority } from '@/types/database';

export function Checklist() {
  const { items, categories, purchases, overview, updateItem, deleteItem, duplicateItem } =
    useSpace();
  const toast = useToast();

  // ── Filtros
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | 'todas'>('todas');
  const [priority, setPriority] = useState<Priority | 'todas'>('todas');
  const [status, setStatus] = useState<ItemStatus | 'todas'>('todas');
  const [sort, setSort] = useState<ItemSort>('categoria');
  const [hideDone, setHideDone] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [kind, setKind] = useState<'produtos' | 'tarefas'>('produtos');
  const [view, setView] = useState<'lista' | 'cards'>('lista');
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Diálogos
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [detail, setDetail] = useState<Item | null>(null);
  const [purchaseFor, setPurchaseFor] = useState<Item | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [editPurchaseId, setEditPurchaseId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      filterItems(
        items,
        { search, categoryId, priority, status, hideDone, onlyPending, kind, sort },
        categories,
      ),
    [items, search, categoryId, priority, status, hideDone, onlyPending, kind, sort, categories],
  );

  // A visão em lista agrupa por categoria; a de cards é um fluxo contínuo.
  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of filtered) {
      const list = map.get(item.category_id);
      if (list) list.push(item);
      else map.set(item.category_id, [item]);
    }
    return categories
      .filter((category) => map.has(category.id))
      .map((category) => ({ category, items: map.get(category.id) ?? [] }));
  }, [filtered, categories]);

  const activeFilters =
    (search ? 1 : 0) +
    (categoryId !== 'todas' ? 1 : 0) +
    (priority !== 'todas' ? 1 : 0) +
    (status !== 'todas' ? 1 : 0) +
    (hideDone ? 1 : 0) +
    (onlyPending ? 1 : 0);

  const clearFilters = () => {
    setSearch('');
    setCategoryId('todas');
    setPriority('todas');
    setStatus('todas');
    setHideDone(false);
    setOnlyPending(false);
  };

  const act = async (id: string, action: () => Promise<unknown>, message: string) => {
    setBusyId(id);
    try {
      await action();
      toast.success(message);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Não foi possível concluir.');
    } finally {
      setBusyId(null);
    }
  };

  /** O checkbox não "resolve" o item sozinho: ele abre o registro da compra. */
  const handleQuickCheck = (item: Item) => {
    if (item.is_task) {
      void act(
        item.id,
        () => updateItem(item.id, { task_done: !item.task_done }),
        item.task_done ? 'Tarefa reaberta.' : 'Tarefa marcada como verificada.',
      );
      return;
    }
    if (item.status === 'comprado') {
      setDetail(item);
      return;
    }
    setPurchaseFor(item);
    setPurchaseOpen(true);
  };

  const openEdit = (item: Item) => {
    setEditing(item);
    setFormOpen(true);
    setDetail(null);
  };

  const editingPurchase = editPurchaseId
    ? (purchases.find((purchase) => purchase.id === editPurchaseId) ?? null)
    : null;

  return (
    <>
      <PageHeader
        icon={<ListChecks className="h-5 w-5" aria-hidden />}
        title="Checklist do enxoval"
        description={
          <>
            {integer(overview.itemsTotal)} produtos e {integer(overview.tasksTotal)} tarefas de
            verificação. As quantidades e prioridades iniciais são sugestões — editem à vontade.
          </>
        }
        actions={
          <>
            <SegmentedControl
              label="Forma de exibição"
              value={view}
              onChange={setView}
              options={[
                { value: 'lista', label: <ListChecks className="h-4 w-4" />, title: 'Lista' },
                { value: 'cards', label: <LayoutGrid className="h-4 w-4" />, title: 'Cards' },
              ]}
            />
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Adicionar item
            </Button>
          </>
        }
      />

      {/* ═══ Barra de filtros (uma linha, acima de tudo que ela filtra) ═══ */}
      <Card className="mb-5 p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                aria-hidden
              />
              <label className="sr-only" htmlFor="busca">
                Buscar item por nome
              </label>
              <Input
                id="busca"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, subcategoria ou observação…"
                className="pl-10"
              />
            </div>

            <SegmentedControl
              label="Tipo de registro"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'produtos', label: 'Produtos' },
                { value: 'tarefas', label: 'Tarefas' },
              ]}
            />

            <Button
              variant={filtersOpen || activeFilters > 0 ? 'secondary' : 'ghost'}
              onClick={() => setFiltersOpen((current) => !current)}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filtros
              {activeFilters > 0 ? (
                <span className="tnum ml-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-olive-600 px-1 text-[0.6875rem] font-semibold text-cream-50">
                  {activeFilters}
                </span>
              ) : null}
              <ChevronDown
                className={clsx('h-3.5 w-3.5 transition-transform', filtersOpen && 'rotate-180')}
                aria-hidden
              />
            </Button>
          </div>

          {filtersOpen ? (
            <div className="flex flex-col gap-3 border-t border-cream-400 pt-3 animate-rise-in">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="label" htmlFor="f-categoria">
                    Categoria
                  </label>
                  <Select
                    id="f-categoria"
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    <option value="todas">Todas as categorias</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.code} · {category.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="label" htmlFor="f-prioridade">
                    Prioridade
                  </label>
                  <Select
                    id="f-prioridade"
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

                <div>
                  <label className="label" htmlFor="f-status">
                    Status
                  </label>
                  <Select
                    id="f-status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as ItemStatus | 'todas')}
                  >
                    <option value="todas">Todos</option>
                    {(Object.keys(STATUS_LABEL) as ItemStatus[]).map((value) => (
                      <option key={value} value={value}>
                        {STATUS_LABEL[value]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="label" htmlFor="f-ordem">
                    Ordenar por
                  </label>
                  <Select
                    id="f-ordem"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as ItemSort)}
                  >
                    <option value="categoria">Categoria</option>
                    <option value="nome">Nome</option>
                    <option value="preco">Preço estimado</option>
                    <option value="prioridade">Prioridade</option>
                    <option value="pendente">Quantidade pendente</option>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <Checkbox
                  checked={hideDone}
                  onChange={setHideDone}
                  label="Ocultar itens concluídos"
                />
                <Checkbox
                  checked={onlyPending}
                  onChange={setOnlyPending}
                  label="Mostrar apenas pendentes"
                />
                {activeFilters > 0 ? (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Limpar filtros
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <p className="text-[0.8125rem] text-ink-muted">
            Mostrando <strong className="tnum text-ink-secondary">{integer(filtered.length)}</strong>{' '}
            {kind === 'tarefas' ? 'tarefas' : 'itens'}
            {activeFilters > 0 ? ' com os filtros aplicados' : ''}.
          </p>
        </div>
      </Card>

      {kind === 'tarefas' ? (
        <div className="mb-5">
          <Notice tone="info" icon={<ListChecks className="h-4.5 w-4.5" />} title="Tarefas de verificação">
            Não são produtos: não entram no orçamento, no valor estimado restante nem nas
            quantidades compradas. Se houver uma despesa real ligada a alguma delas, registre uma
            compra vinculada à tarefa.
          </Notice>
        </div>
      ) : null}

      {/* ═══ Lista / cards ═══ */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="h-5 w-5" aria-hidden />}
            title="Nenhum item encontrado"
            description={
              activeFilters > 0
                ? 'Tente afrouxar os filtros ou limpar a busca.'
                : 'Adicione um item personalizado para começar.'
            }
            action={
              activeFilters > 0 ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Adicionar item
                </Button>
              )
            }
          />
        </Card>
      ) : view === 'cards' ? (
        <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <ItemCardView
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onCheck={() => handleQuickCheck(item)}
              onOpen={() => setDetail(item)}
              onEdit={() => openEdit(item)}
              onBuy={() => {
                setPurchaseFor(item);
                setPurchaseOpen(true);
              }}
            />
          ))}
        </div>
      ) : (
        <div className="stagger flex flex-col gap-5">
          {grouped.map(({ category, items: groupItems }) => {
            const groupPending = groupItems.reduce(
              (acc, item) => acc + (Number(item.qty_pending) || 0),
              0,
            );
            return (
              <Card key={category.id}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-400/70 px-5 py-3.5 sm:px-6">
                  <h2 className="min-w-0 text-[0.9375rem] font-semibold text-ink">
                    <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-lg bg-wood-100 text-[0.6875rem] font-bold text-wood-600">
                      {category.code}
                    </span>
                    {category.name}
                  </h2>
                  <span className="tnum text-[0.8125rem] text-ink-muted">
                    {integer(groupItems.length)} itens
                    {groupPending > 0 ? ` · faltam ${quantity(groupPending)} unidades` : ''}
                  </span>
                </div>
                <ul className="divide-y divide-cream-300/80">
                  {groupItems.map((item) => (
                    <ItemRowView
                      key={item.id}
                      item={item}
                      busy={busyId === item.id}
                      onCheck={() => handleQuickCheck(item)}
                      onOpen={() => setDetail(item)}
                      onEdit={() => openEdit(item)}
                      onBuy={() => {
                        setPurchaseFor(item);
                        setPurchaseOpen(true);
                      }}
                      onDuplicate={() =>
                        void act(item.id, () => duplicateItem(item.id), 'Item duplicado.')
                      }
                      onDelete={() => setConfirmDelete(item)}
                      onRestore={() =>
                        void act(
                          item.id,
                          () => updateItem(item.id, { excluded: false }),
                          'Item voltou para a lista.',
                        )
                      }
                    />
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      {/* ═══ Diálogos ═══ */}
      <ItemForm
        open={formOpen}
        item={editing}
        defaultCategoryId={categoryId !== 'todas' ? categoryId : undefined}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <ItemDetail
        item={detail}
        onClose={() => setDetail(null)}
        onEdit={openEdit}
        onRegisterPurchase={(item) => {
          setDetail(null);
          setPurchaseFor(item);
          setPurchaseOpen(true);
        }}
        onEditPurchase={(purchaseId) => {
          setDetail(null);
          setEditPurchaseId(purchaseId);
        }}
      />

      <PurchaseForm
        open={purchaseOpen}
        presetItem={purchaseFor}
        onClose={() => {
          setPurchaseOpen(false);
          setPurchaseFor(null);
        }}
      />

      <PurchaseForm
        open={editPurchaseId !== null}
        purchase={editingPurchase}
        onClose={() => setEditPurchaseId(null)}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Excluir item"
        message={
          <>
            Excluir <strong>{confirmDelete?.name}</strong> do checklist? Esta ação não pode ser
            desfeita.
          </>
        }
        onConfirm={() => {
          const item = confirmDelete;
          if (!item) return;
          void act(item.id, () => deleteItem(item.id), 'Item excluído.').then(() =>
            setConfirmDelete(null),
          );
        }}
      />
    </>
  );
}

/* ══════════════════════════════ Linha da lista ════════════════════════════ */

function ItemRowView({
  item,
  busy,
  onCheck,
  onOpen,
  onEdit,
  onBuy,
  onDuplicate,
  onDelete,
  onRestore,
}: {
  item: Item;
  busy: boolean;
  onCheck: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onBuy: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const progress = itemProgress(item);
  const done = item.status === 'comprado';
  const excluded = item.status === 'nao_sera_comprado';

  return (
    <li
      className={clsx(
        'group flex flex-col gap-2 px-5 py-3.5 transition-colors hover:bg-cream-200/50 sm:px-6',
        busy && 'opacity-60',
      )}
    >
      {/* No celular as ações descem para uma linha própria: lado a lado, os
          cinco botões deixavam ~90px para o nome, uma palavra por linha. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 sm:flex-nowrap">
        <span className="pt-0.5">
          <Checkbox
            checked={done}
            disabled={busy || excluded}
            onChange={onCheck}
            label={
              <span className="sr-only">
                {item.is_task ? 'Marcar tarefa como verificada' : 'Registrar compra de'} {item.name}
              </span>
            }
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={onOpen}
              className={clsx(
                // touch:py/-my: área de toque de ~40px sem mover o layout.
                'min-w-0 text-left text-[0.9375rem] font-medium leading-snug transition touch:-my-2.5 touch:min-w-10 touch:py-2.5',
                excluded ? 'text-ink-muted line-through' : 'text-ink hover:text-olive-700',
              )}
            >
              {item.name}
            </button>
            <Chip className={PRIORITY_CHIP[item.priority]}>{PRIORITY_LABEL[item.priority]}</Chip>
            <Chip className={STATUS_CHIP[item.status]} dot={STATUS_FILL[item.status]}>
              {STATUS_SHORT[item.status]}
            </Chip>
            {item.conditional ? <Chip title="Depende da estrutura da residência">Condicional</Chip> : null}
            {item.qty_open ? <Chip title="Quantidade conforme necessidade">Qtd. a definir</Chip> : null}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.8125rem] text-ink-muted">
            {item.is_task ? (
              <span>{item.task_done ? 'Verificada' : 'Pendente de verificação'}</span>
            ) : (
              <>
                <span className="tnum">
                  {quantity(item.qty_bought)}/{quantity(item.qty_needed)}{' '}
                  {unitFor(Number(item.qty_needed), item.unit)}
                </span>
                {item.qty_pending > 0 ? (
                  <span className="tnum">faltam {quantity(item.qty_pending)}</span>
                ) : null}
                <span className="tnum">
                  {Number(item.unit_price_estimate) > 0
                    ? `est. ${money(item.unit_price_estimate)}/${item.unit}`
                    : 'preço estimado em branco'}
                </span>
                {Number(item.total_spent) > 0 ? (
                  <span className="tnum">gasto {money(item.total_spent)}</span>
                ) : null}
                <QuoteBadge itemId={item.id} />
                {progress.overEstimate ? (
                  <span className="tnum font-medium text-ink">
                    {money(Math.abs(progress.savings))} acima do estimado
                  </span>
                ) : null}
              </>
            )}
            {item.subcategory ? <span>{item.subcategory}</span> : null}
          </div>

          {!item.is_task ? (
            <Meter
              ratio={progress.ratio}
              size="xs"
              className="mt-2 max-w-md"
              tone={excluded ? 'muted' : 'default'}
              label={`${item.name}: ${percentPoints(progress.ratio * 100)}`}
            />
          ) : null}
        </div>

        {/* Ações: sempre visíveis no toque; com mouse, em tela grande,
            aparecem ao passar o cursor. A condição é ter mouse, não ser largo
            — num tablet deitado (lg) elas ficavam invisíveis e sem hover. */}
        <div className="-mr-2 flex shrink-0 items-center justify-end gap-0.5 max-sm:-mb-1 max-sm:basis-full sm:mr-0 lg:transition-opacity mouse:lg:opacity-0 mouse:lg:group-hover:opacity-100 mouse:lg:group-focus-within:opacity-100">
          {!item.is_task && !excluded ? (
            <IconAction label={`Registrar compra de ${item.name}`} onClick={onBuy}>
              <ShoppingBag className="h-4 w-4" aria-hidden />
            </IconAction>
          ) : null}
          {item.product_url ? (
            <a
              href={item.product_url}
              target="_blank"
              rel="noreferrer noopener"
              title="Abrir link do produto"
              aria-label={`Abrir link do produto ${item.name}`}
              className="grid h-9 w-9 touch:h-10 touch:w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          ) : null}
          <IconAction label={`Editar ${item.name}`} onClick={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden />
          </IconAction>
          <IconAction label={`Duplicar ${item.name}`} onClick={onDuplicate}>
            <Copy className="h-4 w-4" aria-hidden />
          </IconAction>
          {excluded ? (
            <IconAction label={`Voltar ${item.name} para a lista`} onClick={onRestore}>
              <RotateCcw className="h-4 w-4" aria-hidden />
            </IconAction>
          ) : null}
          <IconAction label={`Excluir ${item.name}`} onClick={onDelete}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </IconAction>
        </div>
      </div>
    </li>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-9 w-9 touch:h-10 touch:w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink"
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════ Card do item ═════════════════════════════ */

function ItemCardView({
  item,
  busy,
  onCheck,
  onOpen,
  onEdit,
  onBuy,
}: {
  item: Item;
  busy: boolean;
  onCheck: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onBuy: () => void;
}) {
  const progress = itemProgress(item);
  const excluded = item.status === 'nao_sera_comprado';

  return (
    <Card
      as="article"
      className={clsx(
        'card-lift flex flex-col gap-3 p-4',
        busy && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2.5">
        <Checkbox
          checked={item.status === 'comprado'}
          disabled={busy || excluded}
          onChange={onCheck}
          label={<span className="sr-only">Marcar {item.name}</span>}
        />
        <button
          type="button"
          onClick={onOpen}
          className={clsx(
            'min-w-0 flex-1 text-left text-[0.9375rem] font-medium leading-snug transition',
            excluded ? 'text-ink-muted line-through' : 'text-ink hover:text-olive-700',
          )}
        >
          {item.name}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip className={PRIORITY_CHIP[item.priority]}>{PRIORITY_LABEL[item.priority]}</Chip>
        <Chip className={STATUS_CHIP[item.status]} dot={STATUS_FILL[item.status]}>
          {STATUS_SHORT[item.status]}
        </Chip>
      </div>

      {!item.is_task ? (
        <>
          <Meter
            ratio={progress.ratio}
            size="xs"
            tone={excluded ? 'muted' : 'default'}
            label={`${item.name}: ${percentPoints(progress.ratio * 100)}`}
          />
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[0.8125rem]">
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Necessário</dt>
              <dd className="tnum text-ink">{quantity(item.qty_needed)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Comprado</dt>
              <dd className="tnum text-ink">{quantity(item.qty_bought)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Estimado</dt>
              <dd className="tnum text-ink">{money(item.estimated_total)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">Gasto</dt>
              <dd className="tnum text-ink">{money(item.total_spent)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="text-[0.8125rem] text-ink-muted">
          {item.task_done ? 'Verificada' : 'Pendente de verificação'}
        </p>
      )}

      {!item.is_task ? <QuoteBadge itemId={item.id} className="self-start" /> : null}

      <div className="mt-auto flex gap-2 pt-1">
        {!item.is_task && !excluded ? (
          <Button size="sm" variant="primary" className="flex-1" onClick={onBuy}>
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
            Comprar
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          Editar
        </Button>
      </div>
    </Card>
  );
}
