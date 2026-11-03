import { useEffect, useMemo, useState } from 'react';
import { Info, Save } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button, Notice } from '@/components/ui/primitives';
import { Checkbox, Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { useSpace } from '@/contexts/SpaceContext';
import { useToast } from '@/contexts/ToastContext';
import { money, parseNumberBR } from '@/lib/format';
import { PRIORITY_LABEL, UNIT_OPTIONS } from '@/types/database';
import type { Item, Priority, Unit } from '@/types/database';

interface FormState {
  name: string;
  categoryId: string;
  subcategory: string;
  unit: Unit;
  qtyNeeded: string;
  unitPrice: string;
  priority: Priority;
  allowFraction: boolean;
  qtyOpen: boolean;
  conditional: boolean;
  excluded: boolean;
  notes: string;
  productUrl: string;
}

export function ItemForm({
  open,
  onClose,
  item,
  defaultCategoryId,
}: {
  open: boolean;
  onClose: () => void;
  /** quando informado, edita o item */
  item?: Item | null;
  defaultCategoryId?: string;
}) {
  const { categories, items, createItem, updateItem } = useSpace();
  const toast = useToast();

  const [form, setForm] = useState<FormState>(() => ({
    name: '',
    categoryId: defaultCategoryId ?? '',
    subcategory: '',
    unit: 'unidade',
    qtyNeeded: '1',
    unitPrice: '',
    priority: 'importante',
    allowFraction: false,
    qtyOpen: false,
    conditional: false,
    excluded: false,
    notes: '',
    productUrl: '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const editing = Boolean(item);

  useEffect(() => {
    if (!open) return;
    setErrors({});

    if (item) {
      setForm({
        name: item.name,
        categoryId: item.category_id,
        subcategory: item.subcategory ?? '',
        unit: item.unit,
        qtyNeeded: String(item.qty_needed).replace('.', ','),
        unitPrice:
          Number(item.unit_price_estimate) > 0
            ? String(item.unit_price_estimate).replace('.', ',')
            : '',
        priority: item.priority,
        allowFraction: item.allow_fraction,
        qtyOpen: item.qty_open,
        conditional: item.conditional,
        excluded: item.excluded,
        notes: item.notes ?? '',
        productUrl: item.product_url ?? '',
      });
      return;
    }

    setForm({
      name: '',
      categoryId: defaultCategoryId ?? categories[0]?.id ?? '',
      subcategory: '',
      unit: 'unidade',
      qtyNeeded: '1',
      unitPrice: '',
      priority: 'importante',
      allowFraction: false,
      qtyOpen: false,
      conditional: false,
      excluded: false,
      notes: '',
      productUrl: '',
    });
  }, [open, item, defaultCategoryId, categories]);

  // Sugere subcategorias já usadas na categoria escolhida.
  const subcategorySuggestions = useMemo(() => {
    const found = new Set<string>();
    for (const candidate of items) {
      if (candidate.category_id === form.categoryId && candidate.subcategory) {
        found.add(candidate.subcategory);
      }
    }
    return [...found].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [items, form.categoryId]);

  const parsedQty = parseNumberBR(form.qtyNeeded);
  const parsedPrice = parseNumberBR(form.unitPrice);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (errors[key as string]) setErrors(({ [key as string]: _drop, ...rest }) => rest);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = 'Dê um nome ao item.';
    if (!form.categoryId) next.categoryId = 'Escolha a categoria.';
    if (Number.isNaN(parsedQty) || parsedQty <= 0) {
      next.qtyNeeded = 'Informe uma quantidade maior que zero.';
    } else if (!form.allowFraction && !Number.isInteger(parsedQty)) {
      next.qtyNeeded = 'Para usar quantidade fracionada, marque a opção abaixo.';
    }
    if (form.unitPrice && (Number.isNaN(parsedPrice) || parsedPrice < 0)) {
      next.unitPrice = 'Informe um valor válido.';
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
        category_id: form.categoryId,
        name: form.name.trim(),
        subcategory: form.subcategory.trim() || null,
        unit: form.unit,
        qty_needed: parsedQty,
        unit_price_estimate: Number.isNaN(parsedPrice) ? 0 : parsedPrice,
        priority: form.priority,
        allow_fraction: form.allowFraction,
        qty_open: form.qtyOpen,
        conditional: form.conditional,
        excluded: form.excluded,
        notes: form.notes.trim() || null,
        product_url: form.productUrl.trim() || null,
      };

      if (item) {
        await updateItem(item.id, payload);
        toast.success('Item atualizado.');
      } else {
        await createItem({ ...payload, name: payload.name, category_id: payload.category_id });
        toast.success('Item adicionado ao checklist.');
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

  const estimatedTotal =
    !Number.isNaN(parsedQty) && !Number.isNaN(parsedPrice) ? parsedQty * parsedPrice : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Editar item' : 'Adicionar item'}
      subtitle={
        editing
          ? 'As quantidades compradas vêm das compras registradas e não são editadas aqui.'
          : 'Quantidades e prioridades são sugestões — ajuste como preferirem.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            <Save className="h-4 w-4" aria-hidden />
            {editing ? 'Salvar alterações' : 'Adicionar item'}
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

        {item?.is_task ? (
          <Notice tone="info" icon={<Info className="h-4.5 w-4.5" />} title="Tarefa de verificação">
            Tarefas não entram no orçamento nem nas quantidades compradas. Se houver um gasto real
            ligado a ela, registre uma compra vinculada a esta tarefa.
          </Notice>
        ) : null}

        <Field label="Nome" htmlFor="item-nome" required error={errors.name}>
          <Input
            id="item-nome"
            data-autofocus="true"
            value={form.name}
            maxLength={160}
            invalid={Boolean(errors.name)}
            onChange={(event) => set('name', event.target.value)}
            placeholder="ex.: Jogo de taças de vinho"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Categoria" htmlFor="item-categoria" required error={errors.categoryId}>
            <Select
              id="item-categoria"
              value={form.categoryId}
              invalid={Boolean(errors.categoryId)}
              onChange={(event) => set('categoryId', event.target.value)}
            >
              <option value="">Selecione…</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.code} · {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Subcategoria" htmlFor="item-sub">
            <Input
              id="item-sub"
              value={form.subcategory}
              list={subcategorySuggestions.length > 0 ? 'sub-sugestoes' : undefined}
              onChange={(event) => set('subcategory', event.target.value)}
              placeholder="ex.: Mesa posta"
            />
            {subcategorySuggestions.length > 0 ? (
              <datalist id="sub-sugestoes">
                {subcategorySuggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            ) : null}
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <Field
            label="Quantidade necessária"
            htmlFor="item-qtd"
            required
            error={errors.qtyNeeded}
          >
            <Input
              id="item-qtd"
              inputMode="decimal"
              className="tnum"
              value={form.qtyNeeded}
              invalid={Boolean(errors.qtyNeeded)}
              onChange={(event) => set('qtyNeeded', event.target.value)}
            />
          </Field>

          <Field label="Unidade de controle" htmlFor="item-unidade">
            <Select
              id="item-unidade"
              value={form.unit}
              onChange={(event) => set('unit', event.target.value as Unit)}
            >
              {UNIT_OPTIONS.filter((unit) => unit !== 'tarefa' || item?.is_task).map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            className="col-span-2 sm:col-span-1"
            label="Preço estimado unitário"
            htmlFor="item-preco"
            error={errors.unitPrice}
            hint={
              estimatedTotal > 0 ? `Total estimado: ${money(estimatedTotal)}` : 'Deixe 0 até pesquisar.'
            }
          >
            <MoneyInput
              id="item-preco"
              value={form.unitPrice}
              invalid={Boolean(errors.unitPrice)}
              onChange={(event) => set('unitPrice', event.target.value)}
            />
          </Field>
        </div>

        <Field label="Prioridade" htmlFor="item-prioridade">
          <Select
            id="item-prioridade"
            value={form.priority}
            onChange={(event) => set('priority', event.target.value as Priority)}
          >
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Link do produto" htmlFor="item-link">
          <Input
            id="item-link"
            type="url"
            inputMode="url"
            value={form.productUrl}
            onChange={(event) => set('productUrl', event.target.value)}
            placeholder="https://"
          />
        </Field>

        <Field label="Observações" htmlFor="item-obs">
          <Textarea
            id="item-obs"
            value={form.notes}
            onChange={(event) => set('notes', event.target.value)}
            placeholder="Medidas, modelo desejado, dependências da casa…"
          />
        </Field>

        <div className="flex flex-col gap-3 rounded-xl border border-cream-400 bg-cream-50/60 p-4">
          <Checkbox
            checked={form.allowFraction}
            onChange={(value) => set('allowFraction', value)}
            label="Aceita quantidade fracionada"
            hint="Para itens vendidos por peso ou volume, como arroz e detergente."
          />
          <Checkbox
            checked={form.qtyOpen}
            onChange={(value) => set('qtyOpen', value)}
            label="Quantidade a definir"
            hint='Marca o item como "conforme necessidade" na lista.'
          />
          <Checkbox
            checked={form.conditional}
            onChange={(value) => set('conditional', value)}
            label="Depende da estrutura da residência"
            hint="Ex.: coifa, suporte de papel, detector de fumaça."
          />
          <Checkbox
            checked={form.excluded}
            onChange={(value) => set('excluded', value)}
            label="Não será comprado"
            hint="Sai das quantidades pendentes e do valor estimado restante, mas o histórico de compras é mantido."
          />
        </div>
      </form>
    </Modal>
  );
}
