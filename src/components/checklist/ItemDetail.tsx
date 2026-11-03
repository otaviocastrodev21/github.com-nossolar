import { useMemo, useState } from 'react';
import {
  Ban,
  Copy,
  ExternalLink,
  Info,
  Pencil,
  Plus,
  RotateCcw,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button, Chip, EmptyState, Notice } from '@/components/ui/primitives';
import { Meter } from '@/components/dashboard/figures';
import { useSpace } from '@/contexts/SpaceContext';
import { useToast } from '@/contexts/ToastContext';
import { dateBR, money, percentPoints, quantity, unitFor } from '@/lib/format';
import { itemProgress, purchaseFinance } from '@/lib/calc';
import { PRIORITY_CHIP, STATUS_CHIP, STATUS_FILL } from '@/lib/viz';
import { PAYMENT_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '@/types/database';
import type { Item } from '@/types/database';

export function ItemDetail({
  item,
  onClose,
  onEdit,
  onRegisterPurchase,
  onEditPurchase,
}: {
  item: Item | null;
  onClose: () => void;
  onEdit: (item: Item) => void;
  onRegisterPurchase: (item: Item) => void;
  onEditPurchase: (purchaseId: string) => void;
}) {
  const {
    purchases,
    installments,
    categoryById,
    memberName,
    updateItem,
    deleteItem,
    duplicateItem,
    deletePurchase,
  } = useSpace();
  const toast = useToast();

  const [confirmDeleteItem, setConfirmDeleteItem] = useState(false);
  const [confirmDeletePurchase, setConfirmDeletePurchase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const history = useMemo(
    () =>
      item
        ? purchases
            .filter((purchase) => purchase.item_id === item.id)
            .sort((a, b) => b.purchased_at.localeCompare(a.purchased_at))
        : [],
    [purchases, item],
  );

  if (!item) return null;

  const progress = itemProgress(item);
  const category = categoryById.get(item.category_id);

  const act = async (action: () => Promise<unknown>, successMessage: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
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
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={item.name}
        subtitle={[category?.name, item.subcategory].filter(Boolean).join(' · ')}
        footer={
          <>
            <Button variant="ghost" onClick={() => onEdit(item)} disabled={busy}>
              <Pencil className="h-4 w-4" aria-hidden />
              Editar
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void act(() => duplicateItem(item.id), 'Item duplicado.').then((ok) => {
                  if (ok) onClose();
                })
              }
            >
              <Copy className="h-4 w-4" aria-hidden />
              Duplicar
            </Button>
            <Button variant="primary" onClick={() => onRegisterPurchase(item)} disabled={busy}>
              <ShoppingBag className="h-4 w-4" aria-hidden />
              Registrar compra
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {/* ── Etiquetas ── */}
          <div className="flex flex-wrap items-center gap-2">
            <Chip className={STATUS_CHIP[item.status]} dot={STATUS_FILL[item.status]}>
              {STATUS_LABEL[item.status]}
            </Chip>
            <Chip className={PRIORITY_CHIP[item.priority]}>{PRIORITY_LABEL[item.priority]}</Chip>
            {item.is_task ? <Chip>Tarefa de verificação</Chip> : null}
            {item.conditional ? <Chip>Depende da residência</Chip> : null}
            {item.qty_open ? <Chip>Quantidade a definir</Chip> : null}
            {item.allow_fraction ? <Chip>Aceita fração</Chip> : null}
            {item.is_custom ? <Chip>Item personalizado</Chip> : null}
          </div>

          {item.notes ? (
            <Notice tone="info" icon={<Info className="h-4.5 w-4.5" />}>
              {item.notes}
            </Notice>
          ) : null}

          {/* ── Progresso ── */}
          {!item.is_task ? (
            <section>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[0.9375rem] font-semibold text-ink">Progresso</h3>
                <span className="tnum text-[0.875rem] text-ink-secondary">
                  {quantity(progress.bought)} de {quantity(progress.needed)}{' '}
                  {unitFor(Number(progress.needed), item.unit)} ·{' '}
                  {percentPoints(progress.ratio * 100)}
                </span>
              </div>
              <Meter
                ratio={progress.ratio}
                className="mt-2"
                tone={item.excluded ? 'muted' : 'default'}
                label={`Progresso de ${item.name}`}
              />
            </section>
          ) : null}

          {/* ── Números ── */}
          <section>
            <h3 className="mb-2 text-[0.9375rem] font-semibold text-ink">Números do item</h3>
            <dl className="grid gap-x-5 gap-y-2 rounded-xl border border-cream-400 bg-cream-200/60 px-4 py-3.5 text-[0.875rem] sm:grid-cols-2">
              {!item.is_task ? (
                <>
                  <Row label="Quantidade necessária">
                    {quantity(item.qty_needed)} {unitFor(Number(item.qty_needed), item.unit)}
                  </Row>
                  <Row label="Quantidade comprada">
                    {quantity(item.qty_bought)} {unitFor(Number(item.qty_bought), item.unit)}
                  </Row>
                  <Row label="Quantidade pendente">
                    {quantity(item.qty_pending)} {unitFor(Number(item.qty_pending), item.unit)}
                  </Row>
                  <Row label="Preço estimado unitário">{money(item.unit_price_estimate)}</Row>
                  <Row label="Total estimado">{money(item.estimated_total)}</Row>
                  <Row label="Falta estimado">{money(item.estimated_remaining)}</Row>
                </>
              ) : null}
              <Row label="Total efetivamente gasto">{money(item.total_spent)}</Row>
              <Row label="Já desembolsado">{money(item.paid_amount)}</Row>
              {item.avg_unit_paid !== null ? (
                <Row label="Preço médio por unidade">{money(item.avg_unit_paid)}</Row>
              ) : null}
              {!item.is_task && Number(item.unit_price_estimate) > 0 && progress.bought > 0 ? (
                <Row label={progress.savings >= 0 ? 'Economia' : 'Acima do estimado'}>
                  {money(Math.abs(progress.savings))}
                </Row>
              ) : null}
              <Row label="Última compra">{dateBR(item.last_purchase_at)}</Row>
              {item.product_url ? (
                <Row label="Link do produto">
                  <a
                    href={item.product_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 font-medium text-olive-700 underline decoration-olive-300 underline-offset-2 hover:decoration-olive-600"
                  >
                    Abrir
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                </Row>
              ) : null}
            </dl>
          </section>

          {/* ── Tarefa ── */}
          {item.is_task ? (
            <section>
              <h3 className="mb-2 text-[0.9375rem] font-semibold text-ink">Verificação</h3>
              <Button
                variant={item.task_done ? 'secondary' : 'primary'}
                disabled={busy}
                onClick={() =>
                  void act(
                    () => updateItem(item.id, { task_done: !item.task_done }),
                    item.task_done ? 'Tarefa reaberta.' : 'Tarefa concluída.',
                  )
                }
              >
                {item.task_done ? (
                  <>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Reabrir tarefa
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" aria-hidden />
                    Marcar como verificada
                  </>
                )}
              </Button>
            </section>
          ) : null}

          {/* ── Histórico de compras ── */}
          <section>
            <h3 className="mb-2 text-[0.9375rem] font-semibold text-ink">
              Histórico de compras{' '}
              <span className="tnum font-normal text-ink-muted">({history.length})</span>
            </h3>

            {history.length === 0 ? (
              <EmptyState
                compact
                title="Nenhuma compra registrada"
                description="Registre uma compra para somar quantidade e valor a este item."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {history.map((purchase) => {
                  const finance = purchaseFinance(purchase, installments);
                  return (
                    <li
                      key={purchase.id}
                      className="rounded-xl border border-cream-400 bg-cream-50 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="tnum text-[0.875rem] font-medium text-ink">
                          {quantity(purchase.qty)} {unitFor(Number(purchase.qty), item.unit)} · {money(purchase.total_paid)}
                        </span>
                        <span className="tnum text-[0.8125rem] text-ink-muted">
                          {dateBR(purchase.purchased_at)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-muted">
                        <span>{PAYMENT_LABEL[purchase.payment_method]}</span>
                        {purchase.installments > 1 ? (
                          <span className="tnum">
                            {purchase.installments}× · pago {money(finance.paid)} · a vencer{' '}
                            {money(finance.open)}
                          </span>
                        ) : null}
                        {purchase.store ? <span>{purchase.store}</span> : null}
                        <span>por {memberName(purchase.buyer_id)}</span>
                      </div>
                      {purchase.notes ? (
                        <p className="mt-1 text-[0.8125rem] italic text-ink-secondary">
                          {purchase.notes}
                        </p>
                      ) : null}
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => onEditPurchase(purchase.id)}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDeletePurchase(purchase.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          Excluir
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── Ações delicadas ── */}
          <section className="border-t border-cream-400 pt-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void act(
                    () => updateItem(item.id, { excluded: !item.excluded }),
                    item.excluded
                      ? 'Item voltou para a lista de compras.'
                      : 'Item marcado como "não será comprado".',
                  )
                }
              >
                {item.excluded ? (
                  <>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    Voltar para a lista
                  </>
                ) : (
                  <>
                    <Ban className="h-3.5 w-3.5" aria-hidden />
                    Não será comprado
                  </>
                )}
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() => setConfirmDeleteItem(true)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Excluir item
              </Button>
            </div>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
              “Não será comprado” preserva o histórico e tira o item das pendências. Excluir
              remove o item do checklist; as compras já registradas continuam no histórico, sem
              vínculo com ele.
            </p>
          </section>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDeleteItem}
        onClose={() => setConfirmDeleteItem(false)}
        loading={busy}
        title="Excluir item"
        message={
          <>
            Tem certeza que quer excluir <strong>{item.name}</strong>?
            {history.length > 0 ? (
              <>
                {' '}
                As {history.length} compra(s) registradas continuam no histórico de compras, mas sem
                vínculo com este item.
              </>
            ) : null}{' '}
            Esta ação não pode ser desfeita.
          </>
        }
        onConfirm={() =>
          void act(() => deleteItem(item.id), 'Item excluído.').then((ok) => {
            setConfirmDeleteItem(false);
            if (ok) onClose();
          })
        }
      />

      <ConfirmDialog
        open={confirmDeletePurchase !== null}
        onClose={() => setConfirmDeletePurchase(null)}
        loading={busy}
        title="Excluir compra"
        message="A quantidade e o valor desta compra serão retirados do item e dos totais. Deseja continuar?"
        onConfirm={() => {
          const id = confirmDeletePurchase;
          if (!id) return;
          void act(
            () => deletePurchase(id),
            'Compra excluída. Quantidades e totais recalculados.',
          ).then(() => setConfirmDeletePurchase(null));
        }}
      />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-cream-300/70 pb-1.5 last:border-0 sm:border-0 sm:pb-0">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="tnum text-right font-medium text-ink">{children}</dd>
    </div>
  );
}
