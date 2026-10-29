import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { friendlyError, supabase } from '@/lib/supabase';
import { useSession } from './SessionContext';
import { computeOverview, type Overview } from '@/lib/calc';
import { currentMonthKey, monthKeyToISO } from '@/lib/format';
import type {
  ActivityEntry,
  Budget,
  BudgetKind,
  Category,
  ExtraExpense,
  Installment,
  Item,
  ItemWritable,
  Payment,
  Profile,
  Purchase,
  PurchaseWritable,
  Space,
  SpaceCode,
  SpaceMember,
} from '@/types/database';

const ACTIVE_SPACE_KEY = 'nosso-lar.space';

/** localStorage pode falhar (janela privada, site data bloqueado). */
function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* preferência não essencial */
  }
}

export interface SpaceData {
  categories: Category[];
  items: Item[];
  purchases: Purchase[];
  installments: Installment[];
  payments: Payment[];
  budgets: Budget[];
  extraExpenses: ExtraExpense[];
  members: SpaceMember[];
  codes: SpaceCode[];
  activity: ActivityEntry[];
}

const EMPTY_DATA: SpaceData = {
  categories: [],
  items: [],
  purchases: [],
  installments: [],
  payments: [],
  budgets: [],
  extraExpenses: [],
  members: [],
  codes: [],
  activity: [],
};

interface SpaceValue extends SpaceData {
  loading: boolean;
  /** recarregando em segundo plano (mantemos a tela anterior visível) */
  refreshing: boolean;
  error: string | null;
  spaces: Space[];
  space: Space | null;
  monthKey: string;
  setMonthKey: (monthKey: string) => void;
  overview: Overview;
  /** mapa de categoria por id, para lookups rápidos */
  categoryById: Map<string, Category>;
  itemById: Map<string, Item>;
  memberName: (userId: string | null | undefined) => string;
  isOwner: boolean;

  refresh: () => Promise<void>;
  selectSpace: (spaceId: string) => void;

  createSpace: (name: string) => Promise<string>;
  updateSpace: (patch: Partial<Pick<Space, 'name' | 'tagline' | 'monthly_goal'>>) => Promise<void>;
  seedCatalog: () => Promise<number>;

  /** gera um código para ligar outro aparelho (ou o de recuperação) */
  createCode: (kind?: SpaceCode['kind'], label?: string) => Promise<SpaceCode>;
  revokeCode: (codeId: string) => Promise<void>;
  joinWithCode: (code: string) => Promise<string>;
  removeMember: (userId: string) => Promise<void>;
  leaveSpace: () => Promise<void>;

  createItem: (input: Partial<ItemWritable> & { name: string; category_id: string }) => Promise<Item>;
  updateItem: (itemId: string, patch: Partial<ItemWritable>) => Promise<void>;
  deleteItem: (itemId: string) => Promise<void>;
  duplicateItem: (itemId: string) => Promise<Item>;

  createPurchase: (input: Partial<PurchaseWritable> & { client_token?: string }) => Promise<Purchase>;
  updatePurchase: (purchaseId: string, patch: Partial<PurchaseWritable>) => Promise<void>;
  deletePurchase: (purchaseId: string) => Promise<void>;

  setBudget: (
    kind: BudgetKind,
    amount: number,
    options?: { categoryId?: string; monthKey?: string },
  ) => Promise<void>;
  deleteBudget: (budgetId: string) => Promise<void>;

  createCategory: (input: { code: string; name: string; icon?: string }) => Promise<Category>;
  updateCategory: (categoryId: string, patch: Partial<Pick<Category, 'name' | 'icon' | 'sort_order'>>) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;

  createExtraExpense: (
    input: Omit<ExtraExpense, 'id' | 'space_id' | 'created_at' | 'updated_at' | 'created_by'>,
  ) => Promise<void>;
  updateExtraExpense: (expenseId: string, patch: Partial<ExtraExpense>) => Promise<void>;
  deleteExtraExpense: (expenseId: string) => Promise<void>;
}

const SpaceContext = createContext<SpaceValue | null>(null);

export function SpaceProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(() => readStored(ACTIVE_SPACE_KEY));
  const [data, setData] = useState<SpaceData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthKey, setMonthKey] = useState<string>(() => currentMonthKey());

  const loadedSpaceRef = useRef<string | null>(null);
  const refreshTimer = useRef<number | null>(null);

  const space = useMemo(
    () => spaces.find((candidate) => candidate.id === activeSpaceId) ?? null,
    [spaces, activeSpaceId],
  );

  /* ─────────────────────────── Espaços do usuário ───────────────────────── */

  const loadSpaces = useCallback(async () => {
    if (!user) {
      setSpaces([]);
      return [];
    }

    const { data: rows, error: queryError } = await supabase
      .from('space_members')
      .select('role, space:spaces(*)')
      .eq('user_id', user.id);

    if (queryError) throw new Error(friendlyError(queryError));

    const list = (rows ?? [])
      .map((row) => (row as unknown as { space: Space | null }).space)
      .filter((candidate): candidate is Space => Boolean(candidate))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    setSpaces(list);
    return list;
  }, [user]);

  /* ───────────────────────── Dados do espaço ativo ──────────────────────── */

  const loadSpaceData = useCallback(async (spaceId: string) => {
    const [
      categories,
      items,
      purchases,
      installments,
      payments,
      budgets,
      extras,
      members,
      codes,
      activity,
    ] = await Promise.all([
      supabase.from('categories').select('*').eq('space_id', spaceId).order('sort_order'),
      supabase.from('items').select('*').eq('space_id', spaceId).order('sort_order'),
      supabase
        .from('purchases')
        .select('*')
        .eq('space_id', spaceId)
        .order('purchased_at', { ascending: false }),
      supabase.from('installments').select('*').eq('space_id', spaceId).order('due_date'),
      supabase.from('payments').select('*').eq('space_id', spaceId).order('paid_at'),
      supabase.from('budgets').select('*').eq('space_id', spaceId),
      supabase
        .from('extra_expenses')
        .select('*')
        .eq('space_id', spaceId)
        .order('spent_at', { ascending: false }),
      supabase.from('space_members').select('*').eq('space_id', spaceId),
      supabase
        .from('space_codes')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('activity_log')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .limit(120),
    ]);

    const firstError = [
      categories.error,
      items.error,
      purchases.error,
      installments.error,
      payments.error,
      budgets.error,
      extras.error,
      members.error,
      codes.error,
      activity.error,
    ].find(Boolean);

    if (firstError) throw new Error(friendlyError(firstError));

    const memberRows = (members.data ?? []) as SpaceMember[];
    const userIds = memberRows.map((row) => row.user_id);

    let profiles: Profile[] = [];
    if (userIds.length > 0) {
      const { data: profileRows } = await supabase.from('profiles').select('*').in('id', userIds);
      profiles = (profileRows ?? []) as Profile[];
    }
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

    return {
      categories: (categories.data ?? []) as Category[],
      items: (items.data ?? []) as Item[],
      purchases: (purchases.data ?? []) as Purchase[],
      installments: (installments.data ?? []) as Installment[],
      payments: (payments.data ?? []) as Payment[],
      budgets: (budgets.data ?? []) as Budget[],
      extraExpenses: (extras.data ?? []) as ExtraExpense[],
      members: memberRows.map((row) => ({ ...row, profile: profileById.get(row.user_id) ?? null })),
      codes: (codes.data ?? []) as SpaceCode[],
      activity: (activity.data ?? []) as ActivityEntry[],
    } satisfies SpaceData;
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;

    const isFirstLoad = loadedSpaceRef.current === null;
    if (isFirstLoad) setLoading(true);
    else setRefreshing(true);

    try {
      const list = await loadSpaces();

      // Espaço salvo saiu do ar (ou a pessoa saiu dele): cai no primeiro.
      let targetId = activeSpaceId;
      if (!targetId || !list.some((candidate) => candidate.id === targetId)) {
        targetId = list[0]?.id ?? null;
        setActiveSpaceId(targetId);
        writeStored(ACTIVE_SPACE_KEY, targetId);
      }

      if (!targetId) {
        setData(EMPTY_DATA);
        loadedSpaceRef.current = null;
        setError(null);
        return;
      }

      const next = await loadSpaceData(targetId);
      setData(next);
      loadedSpaceRef.current = targetId;
      setError(null);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, activeSpaceId, loadSpaces, loadSpaceData]);

  // Recarrega quando muda o usuário ou o espaço selecionado.
  useEffect(() => {
    if (!user) {
      setSpaces([]);
      setData(EMPTY_DATA);
      loadedSpaceRef.current = null;
      setLoading(false);
      return;
    }
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeSpaceId]);

  /* ───────────────── Realtime: sincronização entre dispositivos ─────────── */

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, 450);
  }, [refresh]);

  useEffect(() => {
    if (!user || !activeSpaceId) return;

    const channel = supabase.channel(`space:${activeSpaceId}`);
    const tables = [
      'items',
      'purchases',
      'installments',
      'payments',
      'budgets',
      'extra_expenses',
      'categories',
      'space_members',
      'space_codes',
      'spaces',
      'activity_log',
    ];

    for (const table of tables) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(table === 'spaces' ? {} : { filter: `space_id=eq.${activeSpaceId}` }),
        },
        scheduleRefresh,
      );
    }

    channel.subscribe();

    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [user, activeSpaceId, scheduleRefresh]);

  // Ao voltar para a aba, confere se o parceiro mexeu em algo.
  useEffect(() => {
    if (!user || !activeSpaceId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user, activeSpaceId, scheduleRefresh]);

  /* ───────────────────────────── Derivados ──────────────────────────────── */

  const overview = useMemo(
    () =>
      computeOverview({
        items: data.items,
        purchases: data.purchases,
        installments: data.installments,
        payments: data.payments,
        budgets: data.budgets,
        extraExpenses: data.extraExpenses,
        categories: data.categories,
        monthKey,
      }),
    [data, monthKey],
  );

  const categoryById = useMemo(
    () => new Map(data.categories.map((category) => [category.id, category])),
    [data.categories],
  );

  const itemById = useMemo(() => new Map(data.items.map((item) => [item.id, item])), [data.items]);

  const memberName = useCallback(
    (userId: string | null | undefined) => {
      if (!userId) return '—';
      const member = data.members.find((candidate) => candidate.user_id === userId);
      const nome = member?.profile?.display_name?.trim();
      if (nome && nome !== 'Participante') return nome;
      return userId === user?.id ? 'Você' : 'Participante';
    },
    [data.members, user?.id],
  );

  const isOwner = useMemo(
    () =>
      data.members.some((member) => member.user_id === user?.id && member.role === 'dono'),
    [data.members, user?.id],
  );

  /* ──────────────────────────── Mutações ────────────────────────────────── */

  const requireSpace = useCallback((): string => {
    if (!activeSpaceId) throw new Error('Nenhum espaço selecionado.');
    return activeSpaceId;
  }, [activeSpaceId]);

  const selectSpace = useCallback((spaceId: string) => {
    setActiveSpaceId(spaceId);
    writeStored(ACTIVE_SPACE_KEY, spaceId);
    loadedSpaceRef.current = null;
  }, []);

  const createSpace = useCallback(
    async (name: string) => {
      const { data: spaceId, error: rpcError } = await supabase.rpc('create_space', {
        p_name: name.trim() || 'Nosso Lar',
      });
      if (rpcError) throw new Error(friendlyError(rpcError));
      const id = spaceId as string;
      setActiveSpaceId(id);
      writeStored(ACTIVE_SPACE_KEY, id);
      loadedSpaceRef.current = null;
      await refresh();
      return id;
    },
    [refresh],
  );

  const updateSpace = useCallback(
    async (patch: Partial<Pick<Space, 'name' | 'tagline' | 'monthly_goal'>>) => {
      const spaceId = requireSpace();
      const { error: updateError } = await supabase.from('spaces').update(patch).eq('id', spaceId);
      if (updateError) throw new Error(friendlyError(updateError));
      await refresh();
    },
    [requireSpace, refresh],
  );

  const seedCatalog = useCallback(async () => {
    const spaceId = requireSpace();
    const { data: count, error: rpcError } = await supabase.rpc('seed_space_catalog', {
      p_space: spaceId,
    });
    if (rpcError) throw new Error(friendlyError(rpcError));
    await refresh();
    return Number(count ?? 0);
  }, [requireSpace, refresh]);

  const createCode = useCallback(
    async (kind: SpaceCode['kind'] = 'pareamento', label?: string) => {
      const spaceId = requireSpace();
      const { data: row, error: rpcError } = await supabase.rpc('create_access_code', {
        p_space: spaceId,
        p_kind: kind,
        p_label: label ?? null,
      });
      if (rpcError) throw new Error(friendlyError(rpcError));
      await refresh();
      return row as SpaceCode;
    },
    [requireSpace, refresh],
  );

  const revokeCode = useCallback(
    async (codeId: string) => {
      const { error: deleteError } = await supabase.from('space_codes').delete().eq('id', codeId);
      if (deleteError) throw new Error(friendlyError(deleteError));
      await refresh();
    },
    [refresh],
  );

  const joinWithCode = useCallback(
    async (code: string) => {
      const { data: spaceId, error: rpcError } = await supabase.rpc('join_with_code', {
        p_code: code.trim(),
      });
      if (rpcError) throw new Error(friendlyError(rpcError));
      const id = spaceId as string;
      setActiveSpaceId(id);
      writeStored(ACTIVE_SPACE_KEY, id);
      loadedSpaceRef.current = null;
      await refresh();
      return id;
    },
    [refresh],
  );

  const removeMember = useCallback(
    async (userId: string) => {
      const spaceId = requireSpace();
      const { error: deleteError } = await supabase
        .from('space_members')
        .delete()
        .eq('space_id', spaceId)
        .eq('user_id', userId);
      if (deleteError) throw new Error(friendlyError(deleteError));
      await refresh();
    },
    [requireSpace, refresh],
  );

  const leaveSpace = useCallback(async () => {
    const spaceId = requireSpace();
    const { error: rpcError } = await supabase.rpc('leave_space', { p_space: spaceId });
    if (rpcError) throw new Error(friendlyError(rpcError));
    setActiveSpaceId(null);
    writeStored(ACTIVE_SPACE_KEY, null);
    loadedSpaceRef.current = null;
    await refresh();
  }, [requireSpace, refresh]);

  const createItem = useCallback(
    async (input: Partial<ItemWritable> & { name: string; category_id: string }) => {
      const spaceId = requireSpace();
      const { data: row, error: insertError } = await supabase
        .from('items')
        .insert({
          space_id: spaceId,
          category_id: input.category_id,
          name: input.name.trim(),
          subcategory: input.subcategory ?? null,
          unit: input.unit ?? 'unidade',
          qty_needed: input.qty_needed ?? 1,
          unit_price_estimate: input.unit_price_estimate ?? 0,
          priority: input.priority ?? 'importante',
          excluded: input.excluded ?? false,
          allow_fraction: input.allow_fraction ?? false,
          qty_open: input.qty_open ?? false,
          conditional: input.conditional ?? false,
          notes: input.notes ?? null,
          product_url: input.product_url ?? null,
          is_custom: true,
          created_by: user?.id ?? null,
        })
        .select('*')
        .single();

      if (insertError) throw new Error(friendlyError(insertError));
      await refresh();
      return row as Item;
    },
    [requireSpace, refresh, user?.id],
  );

  const updateItem = useCallback(
    async (itemId: string, patch: Partial<ItemWritable>) => {
      const { error: updateError } = await supabase.from('items').update(patch).eq('id', itemId);
      if (updateError) throw new Error(friendlyError(updateError));
      await refresh();
    },
    [refresh],
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      const { error: deleteError } = await supabase.from('items').delete().eq('id', itemId);
      if (deleteError) throw new Error(friendlyError(deleteError));
      await refresh();
    },
    [refresh],
  );

  const duplicateItem = useCallback(
    async (itemId: string) => {
      const original = data.items.find((item) => item.id === itemId);
      if (!original) throw new Error('Item não encontrado.');

      return createItem({
        category_id: original.category_id,
        name: `${original.name} (cópia)`,
        subcategory: original.subcategory,
        unit: original.unit,
        qty_needed: original.qty_needed,
        unit_price_estimate: original.unit_price_estimate,
        priority: original.priority,
        allow_fraction: original.allow_fraction,
        qty_open: original.qty_open,
        conditional: original.conditional,
        notes: original.notes,
        product_url: original.product_url,
      });
    },
    [data.items, createItem],
  );

  const createPurchase = useCallback(
    async (input: Partial<PurchaseWritable> & { client_token?: string }) => {
      const spaceId = requireSpace();
      const { data: row, error: insertError } = await supabase
        .from('purchases')
        .insert({
          space_id: spaceId,
          item_id: input.item_id ?? null,
          category_id: input.category_id ?? null,
          description: input.description ?? '',
          qty: input.qty ?? 1,
          unit_price: input.unit_price ?? 0,
          discount: input.discount ?? 0,
          shipping: input.shipping ?? 0,
          total_paid: input.total_paid ?? 0,
          purchased_at: input.purchased_at ?? new Date().toISOString().slice(0, 10),
          store: input.store ?? null,
          payment_method: input.payment_method ?? 'pix',
          buyer_id: input.buyer_id ?? user?.id ?? null,
          installments: input.installments ?? 1,
          installments_paid: input.installments_paid ?? 1,
          first_due_date: input.first_due_date ?? null,
          notes: input.notes ?? null,
          product_url: input.product_url ?? null,
          receipt_url: input.receipt_url ?? null,
          ...(input.client_token ? { client_token: input.client_token } : {}),
        })
        .select('*')
        .single();

      if (insertError) throw new Error(friendlyError(insertError));
      await refresh();
      return row as Purchase;
    },
    [requireSpace, refresh, user?.id],
  );

  const updatePurchase = useCallback(
    async (purchaseId: string, patch: Partial<PurchaseWritable>) => {
      const { error: updateError } = await supabase
        .from('purchases')
        .update(patch)
        .eq('id', purchaseId);
      if (updateError) throw new Error(friendlyError(updateError));
      await refresh();
    },
    [refresh],
  );

  const deletePurchase = useCallback(
    async (purchaseId: string) => {
      const { error: deleteError } = await supabase.from('purchases').delete().eq('id', purchaseId);
      if (deleteError) throw new Error(friendlyError(deleteError));
      await refresh();
    },
    [refresh],
  );

  const setBudget = useCallback(
    async (
      kind: BudgetKind,
      amount: number,
      options?: { categoryId?: string; monthKey?: string },
    ) => {
      const spaceId = requireSpace();
      const { error: rpcError } = await supabase.rpc('set_budget', {
        p_space: spaceId,
        p_kind: kind,
        p_amount: amount,
        p_category: options?.categoryId ?? null,
        p_month: options?.monthKey ? monthKeyToISO(options.monthKey) : null,
      });
      if (rpcError) throw new Error(friendlyError(rpcError));
      await refresh();
    },
    [requireSpace, refresh],
  );

  const deleteBudget = useCallback(
    async (budgetId: string) => {
      const { error: deleteError } = await supabase.from('budgets').delete().eq('id', budgetId);
      if (deleteError) throw new Error(friendlyError(deleteError));
      await refresh();
    },
    [refresh],
  );

  const createCategory = useCallback(
    async (input: { code: string; name: string; icon?: string }) => {
      const spaceId = requireSpace();
      const { data: row, error: insertError } = await supabase
        .from('categories')
        .insert({
          space_id: spaceId,
          code: input.code.trim().toUpperCase().slice(0, 12),
          name: input.name.trim(),
          icon: input.icon ?? 'package',
          sort_order: (data.categories[data.categories.length - 1]?.sort_order ?? 0) + 1,
        })
        .select('*')
        .single();
      if (insertError) throw new Error(friendlyError(insertError));
      await refresh();
      return row as Category;
    },
    [requireSpace, refresh, data.categories],
  );

  const updateCategory = useCallback(
    async (categoryId: string, patch: Partial<Pick<Category, 'name' | 'icon' | 'sort_order'>>) => {
      const { error: updateError } = await supabase
        .from('categories')
        .update(patch)
        .eq('id', categoryId);
      if (updateError) throw new Error(friendlyError(updateError));
      await refresh();
    },
    [refresh],
  );

  const deleteCategory = useCallback(
    async (categoryId: string) => {
      const used = data.items.some((item) => item.category_id === categoryId);
      if (used) {
        throw new Error(
          'Esta categoria ainda tem itens. Mova ou exclua os itens antes de removê-la.',
        );
      }
      const { error: deleteError } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryId);
      if (deleteError) throw new Error(friendlyError(deleteError));
      await refresh();
    },
    [data.items, refresh],
  );

  const createExtraExpense = useCallback(
    async (
      input: Omit<ExtraExpense, 'id' | 'space_id' | 'created_at' | 'updated_at' | 'created_by'>,
    ) => {
      const spaceId = requireSpace();
      const { error: insertError } = await supabase.from('extra_expenses').insert({
        ...input,
        space_id: spaceId,
        buyer_id: input.buyer_id ?? user?.id ?? null,
        created_by: user?.id ?? null,
      });
      if (insertError) throw new Error(friendlyError(insertError));
      await refresh();
    },
    [requireSpace, refresh, user?.id],
  );

  const updateExtraExpense = useCallback(
    async (expenseId: string, patch: Partial<ExtraExpense>) => {
      const { error: updateError } = await supabase
        .from('extra_expenses')
        .update(patch)
        .eq('id', expenseId);
      if (updateError) throw new Error(friendlyError(updateError));
      await refresh();
    },
    [refresh],
  );

  const deleteExtraExpense = useCallback(
    async (expenseId: string) => {
      const { error: deleteError } = await supabase
        .from('extra_expenses')
        .delete()
        .eq('id', expenseId);
      if (deleteError) throw new Error(friendlyError(deleteError));
      await refresh();
    },
    [refresh],
  );

  const value: SpaceValue = {
    ...data,
    loading,
    refreshing,
    error,
    spaces,
    space,
    monthKey,
    setMonthKey,
    overview,
    categoryById,
    itemById,
    memberName,
    isOwner,
    refresh,
    selectSpace,
    createSpace,
    updateSpace,
    seedCatalog,
    createCode,
    revokeCode,
    joinWithCode,
    removeMember,
    leaveSpace,
    createItem,
    updateItem,
    deleteItem,
    duplicateItem,
    createPurchase,
    updatePurchase,
    deletePurchase,
    setBudget,
    deleteBudget,
    createCategory,
    updateCategory,
    deleteCategory,
    createExtraExpense,
    updateExtraExpense,
    deleteExtraExpense,
  };

  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function useSpace(): SpaceValue {
  const context = useContext(SpaceContext);
  if (!context) throw new Error('useSpace precisa estar dentro de <SpaceProvider>.');
  return context;
}
