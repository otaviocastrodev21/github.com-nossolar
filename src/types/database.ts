/**
 * Tipos das tabelas do Supabase.
 *
 * Os campos marcados como "derivado" são mantidos pelo banco (colunas geradas
 * ou triggers). O cliente não tem permissão de escrita neles — ver
 * `supabase/migrations/0003_rls.sql`.
 */

export type Priority = 'essencial' | 'importante' | 'opcional';

export type ItemStatus = 'pendente' | 'parcial' | 'comprado' | 'nao_sera_comprado';

export type Unit =
  | 'unidade'
  | 'peça'
  | 'par'
  | 'jogo'
  | 'conjunto'
  | 'pacote'
  | 'embalagem'
  | 'lote'
  | 'tarefa';

export type PaymentMethod =
  | 'dinheiro'
  | 'pix'
  | 'debito'
  | 'credito'
  | 'boleto'
  | 'transferencia'
  | 'outro';

export type BudgetKind = 'total' | 'categoria' | 'mensal';

export type ExtraExpenseKind = 'frete' | 'montagem' | 'instalacao' | 'taxa' | 'outros';

export type MemberRole = 'dono' | 'membro';

/** Para que serve um código de acesso ao espaço. */
export type CodeKind = 'pareamento' | 'recuperacao';

export interface Profile {
  id: string;
  /** nulo nas sessões anônimas antigas, de antes do cadastro */
  email: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface Space {
  id: string;
  name: string;
  tagline: string;
  monthly_goal: number | null;
  /** nulo se a conta de quem criou foi apagada — o espaço continua */
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SpaceMember {
  space_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
  profile?: Profile | null;
}

/**
 * Código que liga um aparelho ao espaço. Liga contas diferentes (uma de
 * cada pessoa do casal) ao mesmo espaço.
 *
 *  · pareamento  — curto, uso único, vale 24 horas
 *  · recuperacao — mais longo, sem prazo, reutilizável, um por espaço
 */
export interface SpaceCode {
  id: string;
  space_id: string;
  code: string;
  kind: CodeKind;
  label: string | null;
  created_by: string | null;
  created_at: string;
  /** null = não expira */
  expires_at: string | null;
  /** null = usos ilimitados */
  uses_left: number | null;
  use_count: number;
  last_used_at: string | null;
}

export interface Category {
  id: string;
  space_id: string;
  code: string;
  name: string;
  icon: string;
  sort_order: number;
  created_at: string;
}

export interface Item {
  id: string;
  space_id: string;
  category_id: string;
  name: string;
  subcategory: string | null;
  unit: Unit;
  qty_needed: number;
  unit_price_estimate: number;
  priority: Priority;

  /** derivado · soma das quantidades compradas */
  qty_bought: number;
  /** derivado · soma do valor integral das compras */
  total_spent: number;
  /** derivado · soma das parcelas já quitadas */
  paid_amount: number;
  /** derivado */
  last_purchase_at: string | null;

  excluded: boolean;
  is_task: boolean;
  task_done: boolean;
  allow_fraction: boolean;
  qty_open: boolean;
  conditional: boolean;
  is_custom: boolean;

  notes: string | null;
  product_url: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  /** derivado · quantidade que ainda falta (0 para tarefas e itens excluídos) */
  qty_pending: number;
  /** derivado · qty_needed × preço estimado */
  estimated_total: number;
  /** derivado · qty_pending × preço estimado */
  estimated_remaining: number;
  /** derivado · estimado das unidades compradas − valor real pago */
  savings: number;
  /** derivado · total_spent ÷ qty_bought */
  avg_unit_paid: number | null;
  /** derivado */
  status: ItemStatus;
}

export interface Purchase {
  id: string;
  space_id: string;
  item_id: string | null;
  category_id: string | null;
  description: string;
  qty: number;
  unit_price: number;
  discount: number;
  shipping: number;
  /** valor integral da compra — desconto e frete já considerados */
  total_paid: number;
  purchased_at: string;
  store: string | null;
  payment_method: PaymentMethod;
  buyer_id: string | null;
  installments: number;
  installments_paid: number;
  first_due_date: string | null;
  notes: string | null;
  product_url: string | null;
  receipt_url: string | null;
  client_token: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** derivada de `purchases` — somente leitura */
export interface Installment {
  id: string;
  space_id: string;
  purchase_id: string;
  number: number;
  amount: number;
  due_date: string | null;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
}

/** derivada das parcelas pagas — o livro-caixa do casal */
export interface Payment {
  id: string;
  space_id: string;
  purchase_id: string;
  installment_id: string;
  amount: number;
  paid_at: string;
  method: string | null;
  created_at: string;
}

export interface Budget {
  id: string;
  space_id: string;
  kind: BudgetKind;
  category_id: string | null;
  /** primeiro dia do mês, em ISO (apenas para kind = 'mensal') */
  month: string | null;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface ExtraExpense {
  id: string;
  space_id: string;
  category_id: string | null;
  description: string;
  kind: ExtraExpenseKind;
  amount: number;
  spent_at: string;
  store: string | null;
  buyer_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityEntry {
  id: number;
  space_id: string;
  actor_id: string | null;
  entity: string;
  entity_id: string | null;
  action: 'criado' | 'atualizado' | 'excluido';
  summary: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** Campos que o cliente pode enviar ao criar/editar um item. */
export type ItemWritable = Pick<
  Item,
  | 'category_id'
  | 'name'
  | 'subcategory'
  | 'unit'
  | 'qty_needed'
  | 'unit_price_estimate'
  | 'priority'
  | 'excluded'
  | 'task_done'
  | 'allow_fraction'
  | 'qty_open'
  | 'conditional'
  | 'notes'
  | 'product_url'
>;

/** Campos que o cliente pode enviar ao criar/editar uma compra. */
export type PurchaseWritable = Pick<
  Purchase,
  | 'item_id'
  | 'category_id'
  | 'description'
  | 'qty'
  | 'unit_price'
  | 'discount'
  | 'shipping'
  | 'total_paid'
  | 'purchased_at'
  | 'store'
  | 'payment_method'
  | 'buyer_id'
  | 'installments'
  | 'installments_paid'
  | 'first_due_date'
  | 'notes'
  | 'product_url'
  | 'receipt_url'
>;

export const PRIORITY_LABEL: Record<Priority, string> = {
  essencial: 'Essencial',
  importante: 'Importante',
  opcional: 'Opcional',
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  essencial: 0,
  importante: 1,
  opcional: 2,
};

export const STATUS_LABEL: Record<ItemStatus, string> = {
  pendente: 'Pendente',
  parcial: 'Parcialmente comprado',
  comprado: 'Comprado',
  nao_sera_comprado: 'Não será comprado',
};

export const STATUS_SHORT: Record<ItemStatus, string> = {
  pendente: 'Pendente',
  parcial: 'Parcial',
  comprado: 'Comprado',
  nao_sera_comprado: 'Não será',
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  outro: 'Outro',
};

export const EXTRA_KIND_LABEL: Record<ExtraExpenseKind, string> = {
  frete: 'Frete',
  montagem: 'Montagem',
  instalacao: 'Instalação',
  taxa: 'Taxa',
  outros: 'Outros',
};

export const UNIT_OPTIONS: Unit[] = [
  'unidade',
  'peça',
  'par',
  'jogo',
  'conjunto',
  'pacote',
  'embalagem',
  'lote',
  'tarefa',
];
