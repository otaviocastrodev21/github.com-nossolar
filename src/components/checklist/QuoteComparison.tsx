import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { Check, ExternalLink, Pencil, Plus, Scale, Tag, Trash2, Trophy, X } from 'lucide-react';
import { Button, Chip } from '@/components/ui/primitives';
import { Field, Input, MoneyInput } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useSpace } from '@/contexts/SpaceContext';
import { useToast } from '@/contexts/ToastContext';
import { money, parseNumberBR, percentPoints, quantity, unitFor } from '@/lib/format';
import { compareQuotes, normalizeUrl, quoteTotal, storeFromUrl } from '@/lib/quotes';
import type { Item, ItemQuote, ItemQuoteWritable } from '@/types/database';

/* ═════════════════════════ Comparativo de preços ══════════════════════════
   Cotações do item em lojas diferentes, da mais barata para a mais cara.
   Compara pelo preço final (preço + frete): um frete alto pode fazer o
   "mais barato" deixar de ser.                                               */

export function QuoteComparison({ item }: { item: Item }) {
  const { quotesByItem, createQuote, updateQuote, deleteQuote, updateItem } = useSpace();
  const toast = useToast();
  const quotes = quotesByItem.get(item.id) ?? [];
  const cmp = useMemo(() => compareQuotes(quotes), [quotes]);

  const [editing, setEditing] = useState<ItemQuote | 'nova' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ItemQuote | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Não foi possível concluir.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const maiorTotal = cmp.worst ? quoteTotal(cmp.worst) : 0;
  const faltam = Number(item.qty_pending);
  const estimado = Number(item.unit_price_estimate);

  return (
    <section aria-labelledby={`cotacoes-${item.id}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 id={`cotacoes-${item.id}`} className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
          <Scale className="h-4 w-4 text-wood-500" aria-hidden />
          Comparativo de preços{' '}
          <span className="tnum font-normal text-ink-muted">({quotes.length})</span>
        </h3>
        {editing === null ? (
          <Button size="sm" variant="secondary" onClick={() => setEditing('nova')}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Adicionar cotação
          </Button>
        ) : null}
      </div>

      {/* ── Veredito ── */}
      {cmp.best ? (
        <div className="relative mb-3 overflow-hidden rounded-2xl border border-olive-300/80 bg-gradient-to-br from-olive-100 via-olive-100/70 to-wood-100/60 px-4 py-3.5">
          <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-olive-300/40 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-olive-500 to-olive-700 text-cream-50 shadow-glow">
              <Trophy className="h-4.5 w-4.5" aria-hidden />
            </span>
            <div className="min-w-0 text-[0.875rem] leading-relaxed text-ink">
              {!cmp.runnerUp ? (
                <p>
                  <strong>{cmp.best.store}</strong>: {money(quoteTotal(cmp.best))}. Adicione outra
                  cotação para comparar.
                </p>
              ) : cmp.tie ? (
                <p>
                  <strong>{cmp.best.store}</strong> e <strong>{cmp.runnerUp.store}</strong> empatam
                  em {money(quoteTotal(cmp.best))}.
                </p>
              ) : (
                <p className="text-[0.9375rem]">
                  <strong>{cmp.best.store}</strong> está mais barato:{' '}
                  <strong className="tnum text-olive-700">{money(cmp.saving)}</strong> a menos que{' '}
                  {cmp.runnerUp.store}{' '}
                  <span className="tnum text-ink-secondary">({percentPoints(cmp.savingRatio * 100)})</span>.
                </p>
              )}
              {faltam > 1 && cmp.best ? (
                <p className="tnum mt-0.5 text-[0.8125rem] text-ink-secondary">
                  As {quantity(faltam)} {unitFor(faltam, item.unit)} que faltam saem por{' '}
                  {money(cmp.best.price * faltam + cmp.best.shipping)} lá
                  {cmp.runnerUp && !cmp.tie
                    ? ` — ${money(
                        cmp.runnerUp.price * faltam + cmp.runnerUp.shipping - (cmp.best.price * faltam + cmp.best.shipping),
                      )} de economia.`
                    : '.'}
                </p>
              ) : null}
              {Math.abs(cmp.best.price - estimado) >= 0.01 && !item.is_task ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () => updateItem(item.id, { unit_price_estimate: cmp.best!.price }),
                      'Preço estimado atualizado com a melhor cotação.',
                    )
                  }
                  className="mt-1.5 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-olive-700 underline decoration-olive-300 underline-offset-2 hover:decoration-olive-600 touch:-my-2.5 touch:py-2.5"
                >
                  <Tag className="h-3.5 w-3.5" aria-hidden />
                  Usar {money(cmp.best.price)} como preço estimado
                  {estimado > 0 ? ` (hoje ${money(estimado)})` : ''}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Lista ── */}
      {cmp.ranked.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {cmp.ranked.map((quote, posicao) => {
            const total = quoteTotal(quote);
            const melhor = posicao === 0;
            const acima = cmp.best ? total - quoteTotal(cmp.best) : 0;
            const link = normalizeUrl(quote.url);
            if (editing !== 'nova' && editing?.id === quote.id) {
              return (
                <li key={quote.id}>
                  <QuoteForm
                    initial={quote}
                    busy={busy}
                    onCancel={() => setEditing(null)}
                    onSave={(dados) =>
                      void act(() => updateQuote(quote.id, dados), 'Cotação atualizada.').then((ok) => {
                        if (ok) setEditing(null);
                      })
                    }
                  />
                </li>
              );
            }
            return (
              <li
                key={quote.id}
                className={clsx(
                  'group rounded-xl border px-4 py-3 transition',
                  melhor ? 'border-olive-300 bg-cream-50 shadow-card' : 'border-cream-400 bg-cream-50/70',
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={clsx(
                        'tnum grid h-6 w-6 shrink-0 place-items-center rounded-full text-[0.75rem] font-semibold',
                        melhor ? 'bg-gradient-to-br from-olive-500 to-olive-700 text-cream-50' : 'bg-greige-200 text-ink-secondary',
                      )}
                      aria-label={`${posicao + 1}º lugar`}
                    >
                      {posicao + 1}
                    </span>
                    {link ? (
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex min-w-0 items-center gap-1 truncate text-[0.9375rem] font-medium text-ink underline decoration-greige-300 underline-offset-2 hover:decoration-olive-500"
                        title={`Abrir ${quote.store}`}
                      >
                        <span className="truncate">{quote.store}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
                      </a>
                    ) : (
                      <span className="truncate text-[0.9375rem] font-medium text-ink">{quote.store}</span>
                    )}
                    {melhor && cmp.runnerUp && !cmp.tie ? (
                      <Chip className="border-olive-300 bg-olive-100 text-olive-700">
                        <Check className="h-3 w-3" aria-hidden /> Mais barato
                      </Chip>
                    ) : null}
                  </div>
                  <div className="ml-auto text-right">
                    <p className="tnum text-[1.0625rem] font-semibold leading-tight text-ink">{money(total)}</p>
                    {acima > 0 ? (
                      <p className="tnum text-[0.75rem] text-ink-muted">+{money(acima)}</p>
                    ) : null}
                  </div>
                </div>

                {/* barra: o tamanho é o preço final, na mesma escala para todas */}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream-300" aria-hidden>
                  <div
                    className="h-full origin-left animate-grow rounded-full"
                    style={{
                      width: `${maiorTotal > 0 ? Math.max((total / maiorTotal) * 100, 4) : 0}%`,
                      background: melhor
                        ? 'linear-gradient(90deg, var(--series), var(--series-line))'
                        : 'var(--reference)',
                    }}
                  />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-muted">
                  <span className="tnum">
                    {money(quote.price)}
                    {quote.shipping > 0 ? ` + ${money(quote.shipping)} de frete` : ' · frete grátis'}
                  </span>
                  {quote.notes ? <span className="italic text-ink-secondary">{quote.notes}</span> : null}
                  <span className="ml-auto flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(quote)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition hover:bg-greige-100 hover:text-ink touch:h-10 touch:w-10"
                      aria-label={`Editar cotação de ${quote.store}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(quote)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition hover:bg-tint-critical hover:text-status-critical touch:h-10 touch:w-10"
                      aria-label={`Excluir cotação de ${quote.store}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      ) : editing === null ? (
        <button
          type="button"
          onClick={() => setEditing('nova')}
          className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-greige-400 bg-cream-50/50 px-4 py-6 text-center transition hover:border-olive-400 hover:bg-olive-100/40"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-wood-100 to-olive-100 text-olive-600">
            <Scale className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-[0.9375rem] font-semibold text-ink">Compare preços antes de comprar</span>
          <span className="max-w-sm text-[0.8125rem] leading-relaxed text-ink-muted">
            Anote o preço em duas ou mais lojas. O Nosso Lar mostra qual sai mais barato, já
            contando o frete.
          </span>
        </button>
      ) : null}

      {editing === 'nova' ? (
        <div className={clsx(cmp.ranked.length > 0 && 'mt-2')}>
          <QuoteForm
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={(dados) =>
              void act(() => createQuote(item.id, dados), 'Cotação adicionada.').then((ok) => {
                if (ok) setEditing(null);
              })
            }
          />
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        loading={busy}
        title="Excluir cotação"
        message={confirmDelete ? `A cotação de ${confirmDelete.store} sai do comparativo.` : ''}
        confirmLabel="Excluir"
        onConfirm={() => {
          const alvo = confirmDelete;
          if (!alvo) return;
          void act(() => deleteQuote(alvo.id), 'Cotação excluída.').then(() => setConfirmDelete(null));
        }}
      />
    </section>
  );
}

/* ─────────────────────────── Formulário rápido ─────────────────────────── */

function QuoteForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial?: ItemQuote;
  busy: boolean;
  onSave: (dados: ItemQuoteWritable) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [store, setStore] = useState(initial?.store ?? '');
  const [price, setPrice] = useState(initial ? String(initial.price).replace('.', ',') : '');
  const [shipping, setShipping] = useState(
    initial && initial.shipping > 0 ? String(initial.shipping).replace('.', ',') : '',
  );
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [erro, setErro] = useState<string | null>(null);
  // O nome que veio do link pode ser trocado pela pessoa; depois disso, o
  // link não sobrescreve mais o que ela digitou.
  const nomeDoLink = useRef(!initial);
  const primeiro = useRef<HTMLInputElement>(null);

  useEffect(() => {
    primeiro.current?.focus();
  }, []);

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    const nome = store.trim();
    const valor = parseNumberBR(price);
    const frete = shipping.trim() ? parseNumberBR(shipping) : 0;
    if (!nome) return setErro('Diga em que loja ou site está esse preço.');
    if (!Number.isFinite(valor) || valor < 0) return setErro('Informe o preço, por exemplo 430 ou 429,90.');
    if (!Number.isFinite(frete) || frete < 0) return setErro('O frete precisa ser um valor, ou fique em branco.');
    if (url.trim() && !normalizeUrl(url)) return setErro('O link não parece um endereço de site.');
    setErro(null);
    onSave({
      store: nome.slice(0, 80),
      price: Math.round(valor * 100) / 100,
      shipping: Math.round(frete * 100) / 100,
      url: normalizeUrl(url),
      notes: notes.trim() ? notes.trim().slice(0, 300) : null,
    });
  };

  return (
    <form
      onSubmit={enviar}
      noValidate
      className="animate-rise-in rounded-2xl border border-olive-300/80 bg-cream-50 p-4 shadow-card"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.4fr_1fr_0.8fr]">
        <Field label="Link do produto" htmlFor="cot-url" className="col-span-2 sm:col-span-3" hint="Cole o link e o nome da loja aparece sozinho.">
          <Input
            id="cot-url"
            ref={primeiro}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            value={url}
            placeholder="https://…"
            onChange={(evento) => {
              const proximo = evento.target.value;
              setUrl(proximo);
              if (nomeDoLink.current) {
                const nome = storeFromUrl(proximo);
                if (nome) setStore(nome);
              }
            }}
          />
        </Field>
        <Field label="Loja ou site" htmlFor="cot-loja" required className="col-span-2 sm:col-span-1">
          <Input
            id="cot-loja"
            value={store}
            maxLength={80}
            placeholder="Site 1"
            onChange={(evento) => {
              nomeDoLink.current = false;
              setStore(evento.target.value);
            }}
          />
        </Field>
        <Field label="Preço" htmlFor="cot-preco" required>
          <MoneyInput id="cot-preco" value={price} onChange={(evento) => setPrice(evento.target.value)} />
        </Field>
        <Field label="Frete" htmlFor="cot-frete">
          <MoneyInput id="cot-frete" value={shipping} placeholder="grátis" onChange={(evento) => setShipping(evento.target.value)} />
        </Field>
        <Field label="Observação" htmlFor="cot-obs" className="col-span-2 sm:col-span-3">
          <Input
            id="cot-obs"
            value={notes}
            maxLength={300}
            placeholder="Cor, modelo, prazo de entrega, cupom…"
            onChange={(evento) => setNotes(evento.target.value)}
          />
        </Field>
      </div>

      {erro ? (
        <p role="alert" className="mt-3 text-[0.8125rem] font-medium text-status-critical">
          {erro}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2 max-sm:[&>*]:flex-auto">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          <X className="h-4 w-4" aria-hidden />
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          <Check className="h-4 w-4" aria-hidden />
          {initial ? 'Salvar cotação' : 'Adicionar cotação'}
        </Button>
      </div>
    </form>
  );
}

/* ───────────────────── Etiqueta para as listas ─────────────────────────── */

/**
 * Resumo do comparativo numa linha de lista: o melhor preço e onde, e quanto
 * economiza. Nada aparece enquanto não houver cotação.
 */
export function QuoteBadge({ itemId, className }: { itemId: string; className?: string }) {
  const { quotesByItem } = useSpace();
  const quotes = quotesByItem.get(itemId);
  if (!quotes || quotes.length === 0) return null;
  const cmp = compareQuotes(quotes);
  if (!cmp.best) return null;

  const texto =
    quotes.length === 1
      ? `${money(quoteTotal(cmp.best))} em ${cmp.best.store}`
      : cmp.tie
        ? `${money(quoteTotal(cmp.best))} · empate em ${quotes.length} lojas`
        : `melhor ${money(quoteTotal(cmp.best))} em ${cmp.best.store} · −${money(cmp.saving)}`;

  return (
    <span
      className={clsx(
        'tnum inline-flex max-w-full items-start gap-1 rounded-lg border border-olive-300/70 bg-olive-100/70 px-2 py-px text-[0.75rem] font-medium leading-5 text-olive-700',
        className,
      )}
      title={`${quotes.length} ${quotes.length === 1 ? 'cotação' : 'cotações'}: ${cmp.ranked
        .map((q) => `${q.store} ${money(quoteTotal(q))}`)
        .join(' · ')}`}
    >
      <Scale className="mt-1 h-3 w-3 shrink-0" aria-hidden />
      {/* quebra a linha no celular em vez de cortar o valor da economia */}
      <span className="min-w-0">{texto}</span>
    </span>
  );
}
