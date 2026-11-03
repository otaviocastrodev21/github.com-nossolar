import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Info, Receipt, Wand2 } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '@/components/ui/Modal';
import { Button, Notice } from '@/components/ui/primitives';
import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { useSpace } from '@/contexts/SpaceContext';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import { cents, money, parseNumberBR, quantity, todayISO, unitFor, uuid } from '@/lib/format';
import { computePurchaseTotal } from '@/lib/calc';
import { PAYMENT_LABEL } from '@/types/database';
import type { Item, PaymentMethod, Purchase } from '@/types/database';

interface FormState {
  itemId: string;
  description: string;
  qty: string;
  unitPrice: string;
  discount: string;
  shipping: string;
  totalPaid: string;
  totalTouched: boolean;
  purchasedAt: string;
  store: string;
  paymentMethod: PaymentMethod;
  buyerId: string;
  installments: string;
  installmentsPaid: string;
  firstDueDate: string;
  notes: string;
  productUrl: string;
  receiptUrl: string;
}

const emptyForm = (today: string): FormState => ({
  itemId: '',
  description: '',
  qty: '1',
  unitPrice: '',
  discount: '',
  shipping: '',
  totalPaid: '',
  totalTouched: false,
  purchasedAt: today,
  store: '',
  paymentMethod: 'pix',
  buyerId: '',
  installments: '1',
  installmentsPaid: '1',
  firstDueDate: '',
  notes: '',
  productUrl: '',
  receiptUrl: '',
});

const asText = (value: number | null | undefined): string =>
  value === null || value === undefined || value === 0 ? '' : String(value).replace('.', ',');

export function PurchaseForm({
  open,
  onClose,
  purchase,
  presetItem,
}: {
  open: boolean;
  onClose: () => void;
  /** quando informado, o formulário edita essa compra */
  purchase?: Purchase | null;
  /** item já escolhido (ao registrar a compra direto do checklist) */
  presetItem?: Item | null;
}) {
  const { items, categories, members, createPurchase, updatePurchase } = useSpace();
  const { user } = useSession();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(() => emptyForm(todayISO()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const clientToken = useRef<string>(uuid());

  const editing = Boolean(purchase);

  // (Re)inicializa ao abrir.
  useEffect(() => {
    if (!open) return;

    clientToken.current = uuid();
    setErrors({});
    setShowMore(false);

    if (purchase) {
      setForm({
        itemId: purchase.item_id ?? '',
        description: purchase.description,
        qty: String(purchase.qty).replace('.', ','),
        unitPrice: asText(purchase.unit_price),
        discount: asText(purchase.discount),
        shipping: asText(purchase.shipping),
        totalPaid: String(purchase.total_paid).replace('.', ','),
        totalTouched: true,
        purchasedAt: purchase.purchased_at,
        store: purchase.store ?? '',
        paymentMethod: purchase.payment_method,
        buyerId: purchase.buyer_id ?? '',
        installments: String(purchase.installments),
        installmentsPaid: String(purchase.installments_paid),
        firstDueDate: purchase.first_due_date ?? '',
        notes: purchase.notes ?? '',
        productUrl: purchase.product_url ?? '',
        receiptUrl: purchase.receipt_url ?? '',
      });
      setShowMore(
        purchase.installments > 1 ||
          Boolean(purchase.store || purchase.notes || purchase.product_url || purchase.receipt_url),
      );
      return;
    }

    const base = emptyForm(todayISO());
    base.buyerId = user?.id ?? '';
    if (presetItem) {
      base.itemId = presetItem.id;
      base.description = presetItem.name;
      // Sugere a quantidade que ainda falta, limitada a 1 para tarefas.
      const pending = presetItem.is_task ? 1 : Number(presetItem.qty_pending) || 1;
      base.qty = String(pending > 0 ? pending : 1).replace('.', ',');
      if (Number(presetItem.unit_price_estimate) > 0) {
        base.unitPrice = asText(presetItem.unit_price_estimate);
      }
      base.productUrl = presetItem.product_url ?? '';
    }
    setForm(base);
  }, [open, purchase, presetItem, user?.id]);

  const selectedItem = useMemo(
    () => items.find((candidate) => candidate.id === form.itemId) ?? null,
    [items, form.itemId],
  );

  const parsed = useMemo(() => {
    const qty = parseNumberBR(form.qty);
    const unitPrice = parseNumberBR(form.unitPrice);
    const discount = parseNumberBR(form.discount);
    const shipping = parseNumberBR(form.shipping);
    const computed = computePurchaseTotal({
      qty: Number.isNaN(qty) ? 0 : qty,
      unit_price: Number.isNaN(unitPrice) ? 0 : unitPrice,
      discount: Number.isNaN(discount) ? 0 : discount,
      shipping: Number.isNaN(shipping) ? 0 : shipping,
    });
    const typedTotal = parseNumberBR(form.totalPaid);
    const total = form.totalTouched && !Number.isNaN(typedTotal) ? typedTotal : computed;
    const installments = Math.max(1, Math.round(parseNumberBR(form.installments) || 1));
    const installmentsPaid = Math.max(0, Math.round(parseNumberBR(form.installmentsPaid) || 0));

    return {
      qty: Number.isNaN(qty) ? 0 : qty,
      unitPrice: Number.isNaN(unitPrice) ? 0 : unitPrice,
      discount: Number.isNaN(discount) ? 0 : discount,
      shipping: Number.isNaN(shipping) ? 0 : shipping,
      computed,
      total,
      installments,
      installmentsPaid: Math.min(installmentsPaid, installments),
      installmentValue: installments > 0 ? cents(total / installments) : total,
      paid: cents((total / installments) * Math.min(installmentsPaid, installments)),
    };
  }, [form]);

  // O total acompanha a conta enquanto a pessoa não digitar um valor próprio.
  const totalDisplay = form.totalTouched
    ? form.totalPaid
    : parsed.computed > 0
      ? String(parsed.computed.toFixed(2)).replace('.', ',')
      : '';

  const groupedItems = useMemo(() => {
    const byCategory = new Map<string, Item[]>();
    for (const item of items) {
      const list = byCategory.get(item.category_id);
      if (list) list.push(item);
      else byCategory.set(item.category_id, [item]);
    }
    return categories
      .map((category) => ({
        category,
        items: (byCategory.get(category.id) ?? []).sort((a, b) => a.sort_order - b.sort_order),
      }))
      .filter((group) => group.items.length > 0);
  }, [items, categories]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key as string]) setErrors(({ [key as string]: _drop, ...rest }) => rest);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (!form.itemId && !form.description.trim()) {
      next.description = 'Escolha um item do enxoval ou descreva o que foi comprado.';
    }
    if (!(parsed.qty > 0)) {
      next.qty = 'Informe uma quantidade maior que zero.';
    } else if (selectedItem && !selectedItem.allow_fraction && !Number.isInteger(parsed.qty)) {
      next.qty = `"${selectedItem.name}" não aceita quantidade fracionada.`;
    }
    if (!(parsed.total >= 0) || Number.isNaN(parsed.total)) {
      next.totalPaid = 'Informe o valor total pago.';
    }
    if (!form.purchasedAt) {
      next.purchasedAt = 'Informe a data da compra.';
    }
    if (parsed.installments < 1 || parsed.installments > 60) {
      next.installments = 'O número de parcelas deve ficar entre 1 e 60.';
    }
    if (parsed.installmentsPaid > parsed.installments) {
      next.installmentsPaid = 'Não pode haver mais parcelas pagas do que o total.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setBusy(true);
    try {
      const payload = {
        item_id: form.itemId || null,
        description: form.description.trim() || selectedItem?.name || '',
        qty: parsed.qty,
        unit_price: parsed.unitPrice,
        discount: parsed.discount,
        shipping: parsed.shipping,
        total_paid: cents(parsed.total),
        purchased_at: form.purchasedAt,
        store: form.store.trim() || null,
        payment_method: form.paymentMethod,
        buyer_id: form.buyerId || user?.id || null,
        installments: parsed.installments,
        installments_paid: parsed.installmentsPaid,
        first_due_date: parsed.installments > 1 ? form.firstDueDate || null : null,
        notes: form.notes.trim() || null,
        product_url: form.productUrl.trim() || null,
        receipt_url: form.receiptUrl.trim() || null,
      };

      if (purchase) {
        await updatePurchase(purchase.id, payload);
        toast.success('Compra atualizada.', 'As quantidades e os totais foram recalculados.');
      } else {
        await createPurchase({ ...payload, client_token: clientToken.current });
        toast.success(
          'Compra registrada.',
          selectedItem
            ? `${quantity(parsed.qty)} ${selectedItem.unit} de "${selectedItem.name}".`
            : undefined,
        );
      }
      onClose();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Não foi possível salvar.';
      setErrors({ form: message });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const pendingAfter = selectedItem && !selectedItem.is_task
    ? Math.max(
        Number(selectedItem.qty_needed) -
          (Number(selectedItem.qty_bought) -
            (purchase?.item_id === selectedItem.id ? Number(purchase.qty) : 0) +
            parsed.qty),
        0,
      )
    : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Editar compra' : 'Registrar compra'}
      subtitle="Os campos obrigatórios são quantidade, valor e data. O resto é opcional."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            <Receipt className="h-4 w-4" aria-hidden />
            {editing ? 'Salvar alterações' : 'Registrar compra'}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {errors.form ? (
          <Notice tone="critical" icon={<Info className="h-4.5 w-4.5" />}>
            {errors.form}
          </Notice>
        ) : null}

        {/* ── Item ── */}
        <Field
          label="Item do enxoval"
          htmlFor="compra-item"
          hint="Deixe em branco para registrar uma compra avulsa (descreva abaixo)."
        >
          <Select
            id="compra-item"
            value={form.itemId}
            onChange={(event) => {
              const nextId = event.target.value;
              const item = items.find((candidate) => candidate.id === nextId) ?? null;
              setForm((current) => ({
                ...current,
                itemId: nextId,
                description: item ? item.name : current.description,
                qty: item
                  ? String(item.is_task ? 1 : Number(item.qty_pending) || 1).replace('.', ',')
                  : current.qty,
                unitPrice:
                  item && Number(item.unit_price_estimate) > 0 && !current.totalTouched
                    ? asText(item.unit_price_estimate)
                    : current.unitPrice,
              }));
            }}
          >
            <option value="">Compra avulsa (sem item vinculado)</option>
            {groupedItems.map(({ category, items: groupItems }) => (
              <optgroup key={category.id} label={`${category.code} · ${category.name}`}>
                {groupItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.is_task ? ' (tarefa)' : ` — falta ${quantity(item.qty_pending)} ${unitFor(Number(item.qty_pending), item.unit)}`}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>

        <Field
          label="Descrição"
          htmlFor="compra-desc"
          required={!form.itemId}
          error={errors.description}
          hint={form.itemId ? 'Preenchido pelo item; pode ajustar.' : undefined}
        >
          <Input
            id="compra-desc"
            value={form.description}
            maxLength={200}
            onChange={(event) => set('description', event.target.value)}
            placeholder="ex.: Jogo de pratos de porcelana"
          />
        </Field>

        {/* ── Essenciais ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <Field
            label="Quantidade"
            htmlFor="compra-qty"
            required
            error={errors.qty}
            hint={
              selectedItem
                ? selectedItem.allow_fraction
                  ? 'Aceita valores fracionados.'
                  : `Em ${selectedItem.unit}`
                : undefined
            }
          >
            <Input
              id="compra-qty"
              data-autofocus="true"
              inputMode="decimal"
              className="tnum"
              value={form.qty}
              invalid={Boolean(errors.qty)}
              onChange={(event) => set('qty', event.target.value)}
            />
          </Field>

          <Field label="Preço unitário" htmlFor="compra-unit">
            <MoneyInput
              id="compra-unit"
              value={form.unitPrice}
              onChange={(event) => set('unitPrice', event.target.value)}
            />
          </Field>

          <Field
            label="Data da compra"
            htmlFor="compra-data"
            required
            error={errors.purchasedAt}
            className="col-span-2 sm:col-span-1"
          >
            <Input
              id="compra-data"
              type="date"
              className="tnum"
              value={form.purchasedAt}
              invalid={Boolean(errors.purchasedAt)}
              max={todayISO()}
              onChange={(event) => set('purchasedAt', event.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <Field label="Desconto" htmlFor="compra-desconto">
            <MoneyInput
              id="compra-desconto"
              value={form.discount}
              onChange={(event) => set('discount', event.target.value)}
            />
          </Field>

          <Field label="Frete" htmlFor="compra-frete">
            <MoneyInput
              id="compra-frete"
              value={form.shipping}
              onChange={(event) => set('shipping', event.target.value)}
            />
          </Field>

          <Field
            className="col-span-2 sm:col-span-1"
            label="Total pago"
            htmlFor="compra-total"
            required
            error={errors.totalPaid}
            hint={
              form.totalTouched && Math.abs(parsed.computed - parsed.total) > 0.005
                ? `A conta daria ${money(parsed.computed)}.`
                : 'Calculado automaticamente; pode substituir.'
            }
          >
            <MoneyInput
              id="compra-total"
              value={totalDisplay}
              invalid={Boolean(errors.totalPaid)}
              onChange={(event) => {
                setForm((current) => ({
                  ...current,
                  totalPaid: event.target.value,
                  totalTouched: true,
                }));
                if (errors.totalPaid) setErrors(({ totalPaid: _drop, ...rest }) => rest);
              }}
            />
          </Field>
        </div>

        {form.totalTouched && Math.abs(parsed.computed - parsed.total) > 0.005 ? (
          <button
            type="button"
            onClick={() => setForm((current) => ({ ...current, totalTouched: false }))}
            className="inline-flex w-fit items-center gap-1.5 text-[0.8125rem] font-medium text-olive-700 underline decoration-olive-300 underline-offset-2 hover:decoration-olive-600 touch:-my-2.5 touch:py-2.5"
          >
            <Wand2 className="h-3.5 w-3.5" aria-hidden />
            Usar o total calculado ({money(parsed.computed)})
          </button>
        ) : null}

        {/* ── Resumo em tempo real ── */}
        <div className="rounded-xl border border-cream-400 bg-cream-200/70 px-4 py-3">
          <p className="eyebrow">Como vai ficar</p>
          <dl className="mt-2 grid gap-x-5 gap-y-1.5 text-[0.875rem] sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-secondary">Valor da compra</dt>
              <dd className="tnum font-semibold text-ink">{money(parsed.total)}</dd>
            </div>
            {parsed.installments > 1 ? (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-secondary">Parcelas</dt>
                  <dd className="tnum text-ink">
                    {parsed.installments} × {money(parsed.installmentValue)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-secondary">Já pago</dt>
                  <dd className="tnum text-ink">{money(parsed.paid)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-secondary">A vencer</dt>
                  <dd className="tnum text-ink">{money(cents(parsed.total - parsed.paid))}</dd>
                </div>
              </>
            ) : null}
            {parsed.qty > 0 && parsed.total > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-secondary">Preço por unidade</dt>
                <dd className="tnum text-ink">{money(cents(parsed.total / parsed.qty))}</dd>
              </div>
            ) : null}
            {pendingAfter !== null ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-secondary">Ficará pendente</dt>
                <dd className="tnum text-ink">
                  {quantity(pendingAfter)} {selectedItem?.unit}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        {/* ── Mais detalhes ── */}
        <button
          type="button"
          onClick={() => setShowMore((current) => !current)}
          aria-expanded={showMore}
          className="inline-flex w-fit items-center gap-1.5 rounded-lg text-[0.875rem] font-medium text-ink-secondary transition hover:text-ink touch:-my-2.5 touch:py-2.5"
        >
          <ChevronDown
            className={clsx('h-4 w-4 transition-transform', showMore && 'rotate-180')}
            aria-hidden
          />
          {showMore ? 'Menos detalhes' : 'Mais detalhes (loja, pagamento, parcelas, links)'}
        </button>

        {showMore ? (
          <div className="flex flex-col gap-4 rounded-xl border border-cream-400 bg-cream-50/60 p-4 animate-rise-in">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Loja" htmlFor="compra-loja">
                <Input
                  id="compra-loja"
                  value={form.store}
                  onChange={(event) => set('store', event.target.value)}
                  placeholder="ex.: Casas Bahia"
                />
              </Field>

              <Field label="Forma de pagamento" htmlFor="compra-pagamento">
                <Select
                  id="compra-pagamento"
                  value={form.paymentMethod}
                  onChange={(event) => set('paymentMethod', event.target.value as PaymentMethod)}
                >
                  {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((method) => (
                    <option key={method} value={method}>
                      {PAYMENT_LABEL[method]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Responsável pela compra" htmlFor="compra-responsavel">
              <Select
                id="compra-responsavel"
                value={form.buyerId}
                onChange={(event) => set('buyerId', event.target.value)}
              >
                <option value="">Não informado</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.profile?.display_name || 'Participante'}
                    {member.user_id === user?.id ? ' (você)' : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              <Field label="Número de parcelas" htmlFor="compra-parcelas" error={errors.installments}>
                <Input
                  id="compra-parcelas"
                  inputMode="numeric"
                  className="tnum"
                  value={form.installments}
                  invalid={Boolean(errors.installments)}
                  onChange={(event) => set('installments', event.target.value)}
                />
              </Field>

              <Field
                label="Parcelas já pagas"
                htmlFor="compra-pagas"
                error={errors.installmentsPaid}
                hint="As N primeiras parcelas contam como desembolsadas."
              >
                <Input
                  id="compra-pagas"
                  inputMode="numeric"
                  className="tnum"
                  value={form.installmentsPaid}
                  invalid={Boolean(errors.installmentsPaid)}
                  onChange={(event) => set('installmentsPaid', event.target.value)}
                />
              </Field>

              <Field
                className="col-span-2 sm:col-span-1"
                label="1º vencimento"
                htmlFor="compra-vencimento"
                hint={parsed.installments > 1 ? 'As demais seguem de mês em mês.' : 'Só para parceladas.'}
              >
                <Input
                  id="compra-vencimento"
                  type="date"
                  className="tnum"
                  disabled={parsed.installments <= 1}
                  value={form.firstDueDate}
                  onChange={(event) => set('firstDueDate', event.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Link do produto" htmlFor="compra-link">
                <Input
                  id="compra-link"
                  type="url"
                  inputMode="url"
                  value={form.productUrl}
                  onChange={(event) => set('productUrl', event.target.value)}
                  placeholder="https://"
                />
              </Field>

              <Field label="Nota fiscal ou comprovante" htmlFor="compra-nf">
                <Input
                  id="compra-nf"
                  value={form.receiptUrl}
                  onChange={(event) => set('receiptUrl', event.target.value)}
                  placeholder="link ou número da nota"
                />
              </Field>
            </div>

            <Field label="Observações" htmlFor="compra-obs">
              <Textarea
                id="compra-obs"
                value={form.notes}
                onChange={(event) => set('notes', event.target.value)}
                placeholder="Cor, tamanho, garantia, quem indicou…"
              />
            </Field>

            {parsed.installments > 1 ? (
              <Checkbox
                checked={parsed.installmentsPaid === parsed.installments}
                onChange={(allPaid) =>
                  set('installmentsPaid', allPaid ? form.installments : '1')
                }
                label="Todas as parcelas já foram pagas"
                hint="Marque quando a compra estiver totalmente quitada."
              />
            ) : null}
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
