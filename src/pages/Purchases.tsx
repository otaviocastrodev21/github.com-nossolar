import { useMemo, useState } from 'react';
import {
  ChevronDown,
  CreditCard,
  ExternalLink,
  FileDown,
  Pencil,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { PageHeader } from '@/components/layout/AppShell';
import { Button, Card, Chip, EmptyState } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/Modal';
import { StatTile } from '@/components/dashboard/figures';
import { PurchaseForm } from '@/components/purchases/PurchaseForm';
import { useSpace } from '@/contexts/SpaceContext';
import { useToast } from '@/contexts/ToastContext';
import { purchaseFinance } from '@/lib/calc';
import { cents, dateBR, integer, money, plural, quantity, unitFor } from '@/lib/format';
import { exportPurchases } from '@/lib/export-actions';
import { PAYMENT_LABEL } from '@/types/database';
import type { Purchase } from '@/types/database';

export function Purchases() {
  const {
    purchases,
    installments,
    items,
    categories,
    members,
    categoryById,
    itemById,
    memberName,
    deletePurchase,
    space,
  } = useSpace();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('todas');
  const [buyerId, setBuyerId] = useState('todos');
  const [store, setStore] = useState('todas');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // Abaixo de lg, só a busca fica à mostra: seis campos empilhados ocupavam
  // tela e meia antes da primeira compra aparecer.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState(false);

  const stores = useMemo(() => {
    const found = new Set<string>();
    for (const purchase of purchases) if (purchase.store) found.add(purchase.store);
    return [...found].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [purchases]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return purchases.filter((purchase) => {
      if (categoryId !== 'todas' && purchase.category_id !== categoryId) return false;
      if (buyerId !== 'todos' && purchase.buyer_id !== buyerId) return false;
      if (store !== 'todas' && purchase.store !== store) return false;
      if (from && purchase.purchased_at < from) return false;
      if (to && purchase.purchased_at > to) return false;
      if (needle) {
        const haystack = [
          purchase.description,
          purchase.store ?? '',
          purchase.notes ?? '',
          purchase.item_id ? (itemById.get(purchase.item_id)?.name ?? '') : '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [purchases, categoryId, buyerId, store, from, to, search, itemById]);

  const totals = useMemo(() => {
    let contracted = 0;
    let paid = 0;
    let open = 0;
    let qty = 0;
    for (const purchase of filtered) {
      const finance = purchaseFinance(purchase, installments);
      contracted += finance.total;
      paid += finance.paid;
      open += finance.open;
      qty += Number(purchase.qty) || 0;
    }
    return {
      contracted: cents(contracted),
      paid: cents(paid),
      open: cents(open),
      qty,
      count: filtered.length,
      average: filtered.length > 0 ? cents(contracted / filtered.length) : 0,
    };
  }, [filtered, installments]);

  const activeFilters =
    (search ? 1 : 0) +
    (categoryId !== 'todas' ? 1 : 0) +
    (buyerId !== 'todos' ? 1 : 0) +
    (store !== 'todas' ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0);

  /** Filtros escondidos atrás do botão — a busca já está à vista. */
  const hiddenFilters = activeFilters - (search ? 1 : 0);

  const clearFilters = () => {
    setSearch('');
    setCategoryId('todas');
    setBuyerId('todos');
    setStore('todas');
    setFrom('');
    setTo('');
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await deletePurchase(confirmDelete.id);
      toast.success('Compra excluída.', 'Quantidades e totais recalculados.');
      setConfirmDelete(null);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Não foi possível excluir.');
    } finally {
      setBusy(false);
    }
  };

  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportPurchases(
        filtered,
        { items, categories, memberName, spaceName: space?.name },
        installments,
      );
      toast.success('Histórico exportado em CSV.');
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Não foi possível exportar.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        icon={<ShoppingBag className="h-5 w-5" aria-hidden />}
        title="Compras"
        description="Cada compra registrada atualiza a quantidade comprada, o total gasto e o preço médio do item. Vários registros do mesmo item são consolidados sem perder o histórico."
        actions={
          <>
            <Button
              variant="secondary"
              loading={exporting}
              onClick={() => void handleExport()}
              disabled={filtered.length === 0}
            >
              <FileDown className="h-4 w-4" aria-hidden />
              Exportar CSV
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Registrar compra
            </Button>
          </>
        }
      />

      {/* ── Resumo do recorte ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Valor contratado no recorte"
          value={money(totals.contracted)}
          icon={<Receipt className="h-4 w-4" aria-hidden />}
          sub={plural(totals.count, 'compra', 'compras')}
        />
        <StatTile
          label="Já desembolsado"
          value={money(totals.paid)}
          sub="parcelas quitadas e compras à vista"
        />
        <StatTile
          label="A vencer"
          value={money(totals.open)}
          icon={<CreditCard className="h-4 w-4" aria-hidden />}
          sub="parcelas em aberto"
        />
        <StatTile
          label="Ticket médio"
          value={money(totals.average)}
          sub={`${quantity(totals.qty)} unidades adquiridas`}
        />
      </div>

      {/* ── Filtros ── */}
      <Card className="mb-5 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {/* Até lg a busca divide a linha só com o botão de filtros. */}
          <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
            <label className="label" htmlFor="c-busca">
              Buscar
            </label>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                  aria-hidden
                />
                <Input
                  id="c-busca"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Item, loja ou observação"
                  className="pl-10"
                />
              </div>
              <Button
                variant="secondary"
                className="h-auto shrink-0 self-stretch lg:hidden"
                aria-expanded={filtersOpen}
                aria-controls="filtros-compras"
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

          {/* "contents": no desktop os campos seguem no mesmo grid de seis
              colunas, como se este invólucro não existisse. */}
          <div id="filtros-compras" className={clsx('contents', !filtersOpen && 'max-lg:hidden')}>
          <div>
            <label className="label" htmlFor="c-de">
              De
            </label>
            <Input
              id="c-de"
              type="date"
              className="tnum"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="c-ate">
              Até
            </label>
            <Input
              id="c-ate"
              type="date"
              className="tnum"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor="c-categoria">
              Categoria
            </label>
            <Select
              id="c-categoria"
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

          <div>
            <label className="label" htmlFor="c-responsavel">
              Responsável
            </label>
            <Select
              id="c-responsavel"
              value={buyerId}
              onChange={(event) => setBuyerId(event.target.value)}
            >
              <option value="todos">Todos</option>
              {members.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.profile?.display_name || 'Participante'}
                </option>
              ))}
            </Select>
          </div>

          {stores.length > 0 ? (
            <div>
              <label className="label" htmlFor="c-loja">
                Loja
              </label>
              <Select id="c-loja" value={store} onChange={(event) => setStore(event.target.value)}>
                <option value="todas">Todas</option>
                {stores.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.8125rem] text-ink-muted">
            Mostrando <strong className="tnum text-ink-secondary">{integer(filtered.length)}</strong>{' '}
            de {integer(purchases.length)} registros.
          </p>
          {activeFilters > 0 ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" aria-hidden />
              Limpar filtros
            </Button>
          ) : null}
        </div>
      </Card>

      {/* ── Tabela ── */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShoppingBag className="h-5 w-5" aria-hidden />}
            title={purchases.length === 0 ? 'Nenhuma compra registrada' : 'Nada neste recorte'}
            description={
              purchases.length === 0
                ? 'Registre a primeira compra para acompanhar o quanto já foi gasto e o que ainda falta.'
                : 'Ajuste os filtros para encontrar o que procura.'
            }
            action={
              purchases.length === 0 ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Registrar compra
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
        {/* Até xl, cartões: a tabela pede 896px, mais do que um tablet deitado
            oferece ao lado do menu. Os números são os mesmos da tabela. */}
        <Card className="xl:hidden">
          <ul className="divide-y divide-cream-300/80" aria-label="Histórico de compras">
            {filtered.map((purchase) => {
              const finance = purchaseFinance(purchase, installments);
              const item = purchase.item_id ? itemById.get(purchase.item_id) : null;
              const category = purchase.category_id ? categoryById.get(purchase.category_id) : null;
              const unitPaid = Number(purchase.qty) > 0 ? cents(purchase.total_paid / purchase.qty) : 0;
              const title = purchase.description || item?.name || 'Compra';

              return (
                <li key={purchase.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug text-ink">{title}</p>
                      <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
                        {category ? category.name : 'Sem categoria'}
                        {purchase.store ? ` · ${purchase.store}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tnum font-semibold text-ink">{money(finance.total)}</p>
                      <p className="tnum text-[0.75rem] text-ink-muted">
                        {finance.open > 0 ? `${money(finance.open)} a vencer` : 'tudo pago'}
                      </p>
                    </div>
                  </div>

                  <p className="tnum mt-1.5 text-[0.8125rem] text-ink-secondary">
                    {quantity(purchase.qty)} {item ? unitFor(Number(purchase.qty), item.unit) : 'un.'} ×{' '}
                    {money(unitPaid)}
                    {purchase.discount > 0 ? ` · −${money(purchase.discount)} desconto` : ''}
                    {purchase.shipping > 0 ? ` · +${money(purchase.shipping)} frete` : ''}
                  </p>

                  {purchase.notes ? (
                    <p className="mt-1 text-[0.8125rem] italic text-ink-secondary">{purchase.notes}</p>
                  ) : null}

                  <div className="mt-2 flex items-end gap-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.8125rem] text-ink-muted">
                    <Chip>{PAYMENT_LABEL[purchase.payment_method]}</Chip>
                    {purchase.installments > 1 ? (
                      <Chip
                        icon={<CreditCard className="h-3 w-3" aria-hidden />}
                        title={`${purchase.installments_paid} de ${purchase.installments} parcelas pagas`}
                      >
                        {purchase.installments_paid}/{purchase.installments}×
                      </Chip>
                    ) : null}
                    <span className="tnum whitespace-nowrap">
                      {dateBR(purchase.purchased_at)} · {memberName(purchase.buyer_id)}
                    </span>
                    {purchase.product_url ? (
                      <a
                        href={purchase.product_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-0.5 text-olive-700 underline decoration-olive-300 underline-offset-2"
                      >
                        produto
                        <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    ) : null}
                  </div>

                    <span className="-my-1 -mr-2 flex shrink-0 gap-0.5">
                      <button
                        type="button"
                        title="Editar compra"
                        aria-label={`Editar compra ${title}`}
                        onClick={() => {
                          setEditing(purchase);
                          setFormOpen(true);
                        }}
                        className="grid h-10 w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        title="Excluir compra"
                        aria-label={`Excluir compra ${title}`}
                        onClick={() => setConfirmDelete(purchase)}
                        className="grid h-10 w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <dl className="grid grid-cols-3 gap-2 border-t border-cream-400 bg-cream-200/60 px-4 py-3 text-[0.75rem] sm:px-5">
            <div>
              <dt className="text-ink-muted">Contratado</dt>
              <dd className="tnum text-[0.875rem] font-semibold text-ink">{money(totals.contracted)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Pago</dt>
              <dd className="tnum text-[0.875rem] font-semibold text-ink">{money(totals.paid)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">A vencer</dt>
              <dd className="tnum text-[0.875rem] font-semibold text-ink">{money(totals.open)}</dd>
            </div>
          </dl>
        </Card>

        <Card className="hidden xl:block">
          <div className="scroll-x">
            <table className="w-full min-w-[56rem] text-[0.875rem]">
              <caption className="sr-only">Histórico de compras</caption>
              <thead>
                <tr className="border-b border-cream-400 text-left text-[0.75rem] uppercase tracking-wide text-ink-muted">
                  <th scope="col" className="px-5 py-3 font-semibold">Item / descrição</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Qtd.</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Unitário</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Total</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Pago</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">A vencer</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Data</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Responsável</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((purchase) => {
                  const finance = purchaseFinance(purchase, installments);
                  const item = purchase.item_id ? itemById.get(purchase.item_id) : null;
                  const category = purchase.category_id
                    ? categoryById.get(purchase.category_id)
                    : null;
                  const unitPaid =
                    Number(purchase.qty) > 0 ? cents(purchase.total_paid / purchase.qty) : 0;

                  return (
                    <tr
                      key={purchase.id}
                      className="border-b border-cream-300/80 transition-colors last:border-0 hover:bg-cream-200/50"
                    >
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-ink">
                            {purchase.description || item?.name || 'Compra'}
                          </span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-ink-muted">
                            {category ? <span>{category.name}</span> : <span>Sem categoria</span>}
                            {purchase.store ? <span>· {purchase.store}</span> : null}
                            <Chip>{PAYMENT_LABEL[purchase.payment_method]}</Chip>
                            {purchase.installments > 1 ? (
                              <Chip
                                icon={<CreditCard className="h-3 w-3" aria-hidden />}
                                title={`${purchase.installments_paid} de ${purchase.installments} parcelas pagas`}
                              >
                                {purchase.installments_paid}/{purchase.installments}×
                              </Chip>
                            ) : null}
                            {purchase.product_url ? (
                              <a
                                href={purchase.product_url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-0.5 text-olive-700 underline decoration-olive-300 underline-offset-2 hover:decoration-olive-600"
                              >
                                produto
                                <ExternalLink className="h-3 w-3" aria-hidden />
                              </a>
                            ) : null}
                          </span>
                          {purchase.notes ? (
                            <span className="text-[0.8125rem] italic text-ink-secondary">
                              {purchase.notes}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="tnum px-3 py-3 text-right text-ink">
                        {quantity(purchase.qty)}
                        {item ? (
                          <span className="block text-[0.75rem] text-ink-muted">
                            {unitFor(Number(purchase.qty), item.unit)}
                          </span>
                        ) : null}
                      </td>
                      <td className="tnum px-3 py-3 text-right text-ink-secondary">
                        {money(unitPaid)}
                        {purchase.discount > 0 || purchase.shipping > 0 ? (
                          <span className="block text-[0.75rem] text-ink-muted">
                            {purchase.discount > 0 ? `-${money(purchase.discount)} ` : ''}
                            {purchase.shipping > 0 ? `+${money(purchase.shipping)} frete` : ''}
                          </span>
                        ) : null}
                      </td>
                      <td className="tnum px-3 py-3 text-right font-semibold text-ink">
                        {money(finance.total)}
                      </td>
                      <td className="tnum px-3 py-3 text-right text-ink">{money(finance.paid)}</td>
                      <td className="tnum px-3 py-3 text-right text-ink-secondary">
                        {finance.open > 0 ? money(finance.open) : '—'}
                      </td>
                      <td className="tnum px-3 py-3 text-ink-secondary">
                        {dateBR(purchase.purchased_at)}
                      </td>
                      <td className="px-3 py-3 text-ink-secondary">
                        {memberName(purchase.buyer_id)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-0.5">
                          <button
                            type="button"
                            title="Editar compra"
                            aria-label={`Editar compra ${purchase.description}`}
                            onClick={() => {
                              setEditing(purchase);
                              setFormOpen(true);
                            }}
                            className="grid h-9 w-9 touch:h-10 touch:w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink"
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            title="Excluir compra"
                            aria-label={`Excluir compra ${purchase.description}`}
                            onClick={() => setConfirmDelete(purchase)}
                            className="grid h-9 w-9 touch:h-10 touch:w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-cream-400 bg-cream-200/60">
                  <th scope="row" className="px-5 py-3 text-left font-semibold text-ink">
                    Total do recorte
                  </th>
                  <td className="tnum px-3 py-3 text-right text-ink">{quantity(totals.qty)}</td>
                  <td />
                  <td className="tnum px-3 py-3 text-right font-semibold text-ink">
                    {money(totals.contracted)}
                  </td>
                  <td className="tnum px-3 py-3 text-right font-semibold text-ink">
                    {money(totals.paid)}
                  </td>
                  <td className="tnum px-3 py-3 text-right text-ink-secondary">
                    {money(totals.open)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
        </>
      )}

      <PurchaseForm
        open={formOpen}
        purchase={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        loading={busy}
        title="Excluir compra"
        message={
          <>
            Excluir o registro de <strong>{confirmDelete?.description}</strong> no valor de{' '}
            <strong>{money(confirmDelete?.total_paid ?? 0)}</strong>? A quantidade e o valor serão
            retirados do item e dos totais. O histórico de alterações guarda o registro da exclusão.
          </>
        }
        onConfirm={handleDelete}
      />
    </>
  );
}
