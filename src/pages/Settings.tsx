import { useState } from 'react';
import {
  Check,
  Copy,
  History,
  KeyRound,
  LifeBuoy,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  Shield,
  Smartphone,
  Tags,
  Trash2,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/AppShell';
import { Button, Card, CardHeader, Chip, EmptyState, Notice } from '@/components/ui/primitives';
import { Field, Input, MoneyInput } from '@/components/ui/form';
import { CodeInput } from '@/components/ui/CodeInput';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { useSpace } from '@/contexts/SpaceContext';
import { useSession } from '@/contexts/SessionContext';
import { useToast } from '@/contexts/ToastContext';
import clsx from 'clsx';
import { dateBR, dateTimeBR, initials, integer, money, parseNumberBR } from '@/lib/format';

export function Settings() {
  const {
    space,
    members,
    codes,
    categories,
    items,
    activity,
    overview,
    isOwner,
    updateSpace,
    seedCatalog,
    createCode,
    revokeCode,
    joinWithCode,
    spaceIsUntouched,
    removeMember,
    leaveSpace,
    createCategory,
    updateCategory,
    deleteCategory,
    setBudget,
  } = useSpace();
  const { user, displayName, setDisplayName, disconnectDevice } = useSession();
  const toast = useToast();

  const [spaceName, setSpaceName] = useState(space?.name ?? '');
  const [tagline, setTagline] = useState(space?.tagline ?? '');
  const [meuNome, setMeuNome] = useState(displayName === 'Participante' ? '' : displayName);
  const [budgetAmount, setBudgetAmount] = useState(
    overview.budgetTotal !== null ? String(overview.budgetTotal).replace('.', ',') : '',
  );
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState<string | null>(null);
  const [codigoEntrada, setCodigoEntrada] = useState('');
  const [newCategory, setNewCategory] = useState({ code: '', name: '' });
  const [categoryModal, setCategoryModal] = useState<{ id: string; name: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const guard = async (id: string, action: () => Promise<unknown>, message: string) => {
    setBusy(id);
    try {
      await action();
      toast.success(message);
      return true;
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Não foi possível concluir.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  // Um código recém-criado merece destaque enquanto a pessoa copia.
  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 2000);
      toast.success('Código copiado.');
    } catch {
      toast.info('Copie o código manualmente:', code);
    } finally {
      setNovoCodigo(null);
    }
  };

  const espacoIntocado = spaceIsUntouched;

  const entrarComCodigo = async () => {
    const limpo = codigoEntrada.replace(/[^A-Za-z0-9]/g, '');
    if (limpo.length < 6) return;
    const deu = await guard('entrar', () => joinWithCode(codigoEntrada), 'Pronto — vocês agora dividem a mesma lista.');
    if (deu) setCodigoEntrada('');
  };

  const agora = Date.now();
  const valido = (c: { expires_at: string | null; uses_left: number | null }) =>
    (c.expires_at === null || new Date(c.expires_at).getTime() > agora) &&
    (c.uses_left === null || c.uses_left > 0);

  const pareamentos = codes.filter((c) => c.kind === 'pareamento' && valido(c));
  const recuperacao = codes.find((c) => c.kind === 'recuperacao') ?? null;
  const itemsByCategory = new Map<string, number>();
  for (const item of items) {
    itemsByCategory.set(item.category_id, (itemsByCategory.get(item.category_id) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        icon={<SettingsIcon className="h-5 w-5" aria-hidden />}
        title="Configurações"
        description="Nome do espaço, orçamento, categorias, participantes e preferências."
      />

      <div className="flex flex-col gap-5">
        {/* ══ Espaço ══ */}
        <Card>
          <CardHeader
            icon={<SettingsIcon className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="O espaço do casal"
            subtitle="Como o sistema se apresenta para vocês dois"
          />
          <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-2">
            <Field label="Nome do espaço" htmlFor="s-nome" required>
              <Input
                id="s-nome"
                value={spaceName}
                maxLength={80}
                onChange={(event) => setSpaceName(event.target.value)}
              />
            </Field>
            <Field label="Subtítulo" htmlFor="s-tagline">
              <Input
                id="s-tagline"
                value={tagline}
                maxLength={120}
                onChange={(event) => setTagline(event.target.value)}
                placeholder="Nosso enxoval, nossos planos."
              />
            </Field>
            <div className="lg:col-span-2">
              <Button
                variant="primary"
                loading={busy === 'space'}
                disabled={
                  spaceName.trim().length === 0 ||
                  (spaceName === space?.name && tagline === space?.tagline)
                }
                onClick={() =>
                  void guard(
                    'space',
                    () =>
                      updateSpace({
                        name: spaceName.trim(),
                        tagline: tagline.trim() || 'Nosso enxoval, nossos planos.',
                      }),
                    'Espaço atualizado.',
                  )
                }
              >
                <Check className="h-4 w-4" aria-hidden />
                Salvar espaço
              </Button>
            </div>
          </div>
        </Card>

        {/* ══ Orçamento ══ */}
        <Card>
          <CardHeader
            icon={<MoneyIcon />}
            title="Orçamento total"
            subtitle="O mesmo valor que aparece no Financeiro e no painel"
          />
          <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
            <Field
              label="Orçamento total do enxoval"
              htmlFor="s-orcamento"
              hint={
                overview.budgetTotal === null
                  ? 'Ainda não definido — o painel fica sem saldo até vocês informarem.'
                  : `Atual: ${money(overview.budgetTotal)}`
              }
            >
              <MoneyInput
                id="s-orcamento"
                value={budgetAmount}
                onChange={(event) => setBudgetAmount(event.target.value)}
              />
            </Field>
            <div className="flex items-start lg:pt-7">
              <Button
                variant="primary"
                loading={busy === 'budget'}
                onClick={() => {
                  const parsed = parseNumberBR(budgetAmount);
                  if (Number.isNaN(parsed) || parsed < 0) {
                    toast.error('Informe um valor maior ou igual a zero.');
                    return;
                  }
                  void guard('budget', () => setBudget('total', parsed), 'Orçamento atualizado.');
                }}
              >
                <Check className="h-4 w-4" aria-hidden />
                Salvar orçamento
              </Button>
            </div>
          </div>
        </Card>

        {/* ══ Participantes e aparelhos ══ */}
        <Card>
          <CardHeader
            icon={<Users className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Quem tem acesso"
            subtitle="Cada aparelho conectado conta como um acesso ao espaço"
          />

          <ul className="divide-y divide-cream-300/80 px-5 sm:px-6">
            {members.map((member) => (
              <li key={member.user_id} className="flex flex-wrap items-center gap-3 py-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-olive-600 text-[0.8125rem] font-semibold text-cream-50">
                  {initials(member.profile?.display_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-medium text-ink">
                    {member.profile?.display_name || 'Participante'}
                    {member.user_id === user?.id ? (
                      <span className="ml-1.5 text-[0.8125rem] font-normal text-ink-muted">
                        (este aparelho)
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[0.8125rem] text-ink-muted">
                    entrou em {dateBR(member.joined_at)}
                  </p>
                </div>
                <Chip
                  className={
                    member.role === 'dono' ? 'border-wood-300 bg-wood-100 text-wood-600' : undefined
                  }
                >
                  {member.role === 'dono' ? 'Criou o espaço' : 'Participante'}
                </Chip>
                {isOwner && member.user_id !== user?.id ? (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(member.user_id)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    Remover
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>

          {/* ── Conectar outro aparelho ── */}
          <div className="border-t border-cream-400/70 px-5 py-5 sm:px-6">
            <h3 className="mb-1 text-[0.9375rem] font-semibold text-ink">
              Conectar outro aparelho
            </h3>
            <p className="mb-3 text-[0.875rem] leading-relaxed text-ink-secondary">
              Gere um código e digite-o no outro aparelho. Vale por 24 horas e só pode ser usado
              uma vez.
            </p>

            <Button
              variant="primary"
              loading={busy === 'pareamento'}
              onClick={() =>
                void guard('pareamento', async () => {
                  const criado = await createCode('pareamento');
                  setNovoCodigo(criado.code);
                }, 'Código gerado.')
              }
            >
              <Smartphone className="h-4 w-4" aria-hidden />
              Gerar código de pareamento
            </Button>

            {pareamentos.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-2">
                {pareamentos.map((codigo) => (
                  <li
                    key={codigo.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-olive-300 bg-olive-100 px-4 py-3"
                  >
                    <KeyRound className="h-4 w-4 shrink-0 text-olive-700" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p
                        className={clsx(
                          'font-mono text-[1.0625rem] font-semibold tracking-[0.14em] text-ink',
                          novoCodigo === codigo.code && 'animate-rise-in',
                        )}
                      >
                        {codigo.code}
                      </p>
                      <p className="text-[0.75rem] text-ink-muted">
                        vale até {dateTimeBR(codigo.expires_at)}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => void copyCode(codigo.code)}>
                      {copiedCode === codigo.code ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                          Copiar
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy === `revoke-${codigo.id}`}
                      onClick={() =>
                        void guard(`revoke-${codigo.id}`, () => revokeCode(codigo.id), 'Código cancelado.')
                      }
                    >
                      Cancelar
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* ── Entrar em outro espaço ── */}
          <div className="border-t border-cream-400/70 px-5 py-5 sm:px-6">
            <h3 className="mb-1 text-[0.9375rem] font-semibold text-ink">
              Entrar em outro espaço
            </h3>
            <p className="mb-3 text-[0.875rem] leading-relaxed text-ink-secondary">
              Recebeu um código do outro aparelho? Digite aqui. Serve tanto o de pareamento
              quanto o de recuperação.
            </p>

            <Field label="Código de acesso" htmlFor="codigo-entrada" className="max-w-xs">
              <CodeInput
                id="codigo-entrada"
                value={codigoEntrada}
                onChange={setCodigoEntrada}
                onEnter={() => void entrarComCodigo()}
              />
            </Field>

            <Button
              variant="primary"
              className="mt-3"
              loading={busy === "entrar"}
              disabled={codigoEntrada.replace(/[^A-Za-z0-9]/g, "").length < 6}
              onClick={() => void entrarComCodigo()}
            >
              <LogIn className="h-4 w-4" aria-hidden />
              Entrar no espaço
            </Button>

            {espacoIntocado ? (
              <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-muted">
                Este espaço ainda está em branco, então ele será descartado na troca.
              </p>
            ) : (
              <div className="mt-3">
                <Notice tone="warning" icon={<Shield className="h-4.5 w-4.5" />}>
                  O que vocês já registraram aqui fica neste espaço e não vai junto. Entre com um
                  código apenas se a lista de verdade for a do outro aparelho.
                </Notice>
              </div>
            )}
          </div>
          {/* ── Código de recuperação ── */}
          <div className="border-t border-cream-400/70 px-5 py-5 sm:px-6">
            <h3 className="mb-1 flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
              <LifeBuoy className="h-4 w-4 text-wood-600" aria-hidden />
              Código de recuperação
            </h3>
            <p className="mb-3 text-[0.875rem] leading-relaxed text-ink-secondary">
              Sem cadastro, o acesso mora neste aparelho. Se os dados do navegador forem apagados
              ou vocês trocarem de celular, este é o caminho de volta.{' '}
              <strong className="font-medium text-ink">Anote em algum lugar seguro.</strong>
            </p>

            {recuperacao ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-wood-300 bg-wood-100 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[1.125rem] font-semibold tracking-[0.16em] text-ink">
                    {recuperacao.code}
                  </p>
                  <p className="mt-0.5 text-[0.75rem] text-ink-muted">
                    criado em {dateBR(recuperacao.created_at)} · sem prazo de validade
                    {recuperacao.use_count > 0 ? ` · usado ${recuperacao.use_count}×` : ''}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void copyCode(recuperacao.code)}>
                  {copiedCode === recuperacao.code ? (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                      Copiar
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <Notice tone="warning" icon={<LifeBuoy className="h-4.5 w-4.5" />}>
                Nenhum código de recuperação ainda. Sem ele, limpar os dados do navegador significa
                perder o acesso ao espaço.
              </Notice>
            )}

            <Button
              className="mt-3"
              variant={recuperacao ? 'secondary' : 'primary'}
              loading={busy === 'recuperacao'}
              onClick={() =>
                void guard('recuperacao', async () => {
                  const criado = await createCode('recuperacao');
                  setNovoCodigo(criado.code);
                }, recuperacao ? 'Novo código gerado — o anterior deixou de valer.' : 'Código criado.')
              }
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              {recuperacao ? 'Gerar um novo' : 'Criar código de recuperação'}
            </Button>

            <div className="mt-4">
              <Notice tone="info" icon={<Shield className="h-4.5 w-4.5" />} title="O que isso significa">
                Quem tiver o código de recuperação entra no espaço de vocês. Trate como a chave de
                casa: não mande em grupo nem deixe em print. Se vazar, gere um novo — o anterior
                para de funcionar na hora.
              </Notice>
            </div>
          </div>
        </Card>

        {/* ══ Categorias ══ */}
        <Card>
          <CardHeader
            icon={<Tags className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Categorias"
            subtitle={`${integer(categories.length)} categorias no checklist`}
          />
          <ul className="divide-y divide-cream-300/80 px-5 sm:px-6">
            {categories.map((category) => {
              const count = itemsByCategory.get(category.id) ?? 0;
              return (
                <li key={category.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-wood-100 text-[0.75rem] font-bold text-wood-600">
                    {category.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-ink">
                    {category.name}
                  </span>
                  <span className="tnum text-[0.8125rem] text-ink-muted">
                    {integer(count)} {count === 1 ? 'item' : 'itens'}
                  </span>
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      title={`Renomear ${category.name}`}
                      aria-label={`Renomear ${category.name}`}
                      onClick={() => setCategoryModal({ id: category.id, name: category.name })}
                      className="grid h-9 w-9 touch:h-10 touch:w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      title={`Excluir ${category.name}`}
                      aria-label={`Excluir ${category.name}`}
                      disabled={count > 0}
                      onClick={() => setConfirmDeleteCategory(category.id)}
                      className="grid h-9 w-9 touch:h-10 touch:w-10 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-cream-400/70 px-5 py-5 sm:px-6">
            <h3 className="mb-3 text-[0.9375rem] font-semibold text-ink">Nova categoria</h3>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Sigla" htmlFor="s-cat-code" className="w-24" required>
                <Input
                  id="s-cat-code"
                  value={newCategory.code}
                  maxLength={12}
                  onChange={(event) =>
                    setNewCategory((c) => ({ ...c, code: event.target.value.toUpperCase() }))
                  }
                  placeholder="O"
                />
              </Field>
              <Field label="Nome" htmlFor="s-cat-name" className="min-w-[12rem] flex-1" required>
                <Input
                  id="s-cat-name"
                  value={newCategory.name}
                  maxLength={80}
                  onChange={(event) => setNewCategory((c) => ({ ...c, name: event.target.value }))}
                  placeholder="ex.: Área externa"
                />
              </Field>
              <Button
                variant="primary"
                loading={busy === 'category'}
                disabled={!newCategory.code.trim() || !newCategory.name.trim()}
                onClick={() =>
                  void guard(
                    'category',
                    () => createCategory(newCategory),
                    'Categoria criada.',
                  ).then((ok) => {
                    if (ok) setNewCategory({ code: '', name: '' });
                  })
                }
              >
                <Plus className="h-4 w-4" aria-hidden />
                Criar
              </Button>
            </div>
            <p className="mt-2 text-[0.8125rem] text-ink-muted">
              Categorias com itens não podem ser excluídas. Mova ou exclua os itens primeiro.
            </p>
          </div>
        </Card>

        {/* ══ Lista inicial ══ */}
        <Card>
          <CardHeader
            icon={<RotateCcw className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Lista inicial do enxoval"
            subtitle="Recadastrar o que foi excluído, sem duplicar o que já existe"
          />
          <div className="px-5 py-5 sm:px-6">
            <p className="mb-4 text-[0.875rem] leading-relaxed text-ink-secondary">
              O catálogo de referência tem 14 categorias e 208 linhas (202 produtos e 6 tarefas de
              verificação). Esta ação recadastra apenas as linhas que não existem mais no checklist
              de vocês — nada é duplicado, nenhum preço é alterado e nenhuma compra é tocada.
            </p>
            <Button
              variant="secondary"
              loading={busy === 'seed'}
              onClick={() =>
                void guard('seed', async () => {
                  const count = await seedCatalog();
                  toast.info(
                    count > 0
                      ? `${count} item(ns) recadastrado(s).`
                      : 'Nada a recadastrar: a lista já está completa.',
                  );
                }, 'Lista inicial conferida.')
              }
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Restaurar itens faltantes
            </Button>
          </div>
        </Card>

        {/* ══ Você ══ */}
        <Card>
          <CardHeader
            icon={<Users className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Você"
            subtitle="O nome que aparece ao lado de cada compra que você registra"
          />
          <div className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
            <Field label="Seu nome" htmlFor="s-meu-nome" required>
              <Input
                id="s-meu-nome"
                value={meuNome}
                maxLength={40}
                placeholder="Ana"
                onChange={(event) => setMeuNome(event.target.value)}
              />
            </Field>
            <div className="flex items-start lg:pt-7">
              <Button
                variant="primary"
                loading={busy === 'profile'}
                disabled={!meuNome.trim() || meuNome === displayName}
                onClick={() =>
                  void guard('profile', () => setDisplayName(meuNome), 'Nome atualizado.')
                }
              >
                <Check className="h-4 w-4" aria-hidden />
                Salvar nome
              </Button>
            </div>
          </div>
        </Card>

        {/* ══ Histórico ══ */}
        <Card>
          <CardHeader
            icon={<History className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Histórico de alterações"
            subtitle="As 120 alterações mais recentes do espaço"
          />
          {activity.length === 0 ? (
            <EmptyState
              compact
              icon={<History className="h-5 w-5" aria-hidden />}
              title="Nenhuma alteração registrada ainda"
            />
          ) : (
            <ul className="max-h-96 divide-y divide-cream-300/80 overflow-y-auto px-5 sm:px-6">
              {activity.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5">
                  <span className="min-w-0 flex-1 text-[0.875rem] text-ink">{entry.summary}</span>
                  <span className="tnum text-[0.75rem] text-ink-muted">
                    {dateTimeBR(entry.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ══ Sair ══ */}
        <Card className="border-status-critical/30">
          <CardHeader
            icon={<LogOut className="h-[1.125rem] w-[1.125rem]" aria-hidden />}
            title="Sair"
            subtitle="Duas formas de encerrar, com consequências diferentes"
          />
          <div className="flex flex-col gap-5 px-5 py-5 sm:px-6">
            <div>
              <Button variant="secondary" onClick={() => setConfirmDisconnect(true)}>
                <Smartphone className="h-4 w-4" aria-hidden />
                Desconectar este aparelho
              </Button>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
                Limpa a identidade guardada aqui. Os dados do casal ficam intactos, e você volta
                com o código de recuperação.
              </p>
            </div>

            <div className="border-t border-cream-400 pt-5">
              <Button variant="danger" onClick={() => setConfirmLeave(true)}>
                <LogOut className="h-4 w-4" aria-hidden />
                Sair do espaço
              </Button>
              <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-muted">
                Remove este acesso do espaço de vez. Os dados continuam com a outra pessoa. Para
                voltar, você precisará de um código novo.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* ══ Modais ══ */}
      <CategoryRenameModal
        target={categoryModal}
        onClose={() => setCategoryModal(null)}
        busy={busy === 'rename'}
        onSave={(name) => {
          const target = categoryModal;
          if (!target) return;
          void guard('rename', () => updateCategory(target.id, { name }), 'Categoria renomeada.').then(
            (ok) => {
              if (ok) setCategoryModal(null);
            },
          );
        }}
      />

      <ConfirmDialog
        open={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        loading={busy === 'remove'}
        title="Remover participante"
        message="A pessoa perde o acesso ao espaço. As compras que ela registrou continuam no histórico."
        confirmLabel="Remover"
        onConfirm={() => {
          const id = confirmRemove;
          if (!id) return;
          void guard('remove', () => removeMember(id), 'Participante removido.').then(() =>
            setConfirmRemove(null),
          );
        }}
      />

      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        loading={busy === 'disconnect'}
        title="Desconectar este aparelho"
        tone="primary"
        confirmLabel="Desconectar"
        message={
          recuperacao ? (
            <>
              Este aparelho vai esquecer o espaço. Para voltar, use o código de recuperação:{' '}
              <strong className="font-mono">{recuperacao.code}</strong>. Anote antes de continuar.
            </>
          ) : (
            <>
              <strong>Você ainda não tem código de recuperação.</strong> Sem ele, desconectar
              significa perder o acesso a este espaço para sempre. Crie um antes de continuar.
            </>
          )
        }
        onConfirm={() => {
          void guard('disconnect', () => disconnectDevice(), 'Aparelho desconectado.').then(() =>
            setConfirmDisconnect(false),
          );
        }}
      />

      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        loading={busy === 'leave'}
        title="Sair do espaço"
        message="Você deixará de ver os itens, as compras e o orçamento deste espaço. Para voltar, precisará de um código novo, gerado pela outra pessoa."
        confirmLabel="Sair do espaço"
        onConfirm={() => {
          void guard('leave', () => leaveSpace(), 'Você saiu do espaço.').then(() =>
            setConfirmLeave(false),
          );
        }}
      />

      <ConfirmDialog
        open={confirmDeleteCategory !== null}
        onClose={() => setConfirmDeleteCategory(null)}
        loading={busy === 'delcat'}
        title="Excluir categoria"
        message="A categoria será removida do checklist. Orçamentos definidos para ela também saem."
        onConfirm={() => {
          const id = confirmDeleteCategory;
          if (!id) return;
          void guard('delcat', () => deleteCategory(id), 'Categoria excluída.').then(() =>
            setConfirmDeleteCategory(null),
          );
        }}
      />
    </>
  );
}

function MoneyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[1.125rem] w-[1.125rem]" fill="none" aria-hidden>
      <rect x="2.5" y="6" width="19" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 10v4M18 10v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CategoryRenameModal({
  target,
  onClose,
  onSave,
  busy,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onSave: (name: string) => void;
  busy: boolean;
}) {
  const [name, setName] = useState('');
  const [loadedId, setLoadedId] = useState<string | null>(null);

  if (target && loadedId !== target.id) {
    setLoadedId(target.id);
    setName(target.name);
  }
  if (!target && loadedId !== null) setLoadedId(null);

  if (!target) return null;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Renomear categoria"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim()}
            onClick={() => onSave(name.trim())}
          >
            Salvar
          </Button>
        </>
      }
    >
      <Field label="Nome da categoria" htmlFor="cat-nome" required>
        <Input
          id="cat-nome"
          data-autofocus="true"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
    </Modal>
  );
}
