/**
 * Cliente Supabase e tradução de erros.
 *
 * As chaves vêm de `.env` (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
 * Sem elas, `isSupabaseConfigured` é falso e a aplicação mostra a tela de
 * configuração em vez de quebrar.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

export const isSupabaseConfigured =
  url.startsWith('http') && anonKey.length > 20 && !url.includes('xxxxxxxx');

/**
 * Cliente real quando há configuração. Quando não há, exportamos um cliente
 * apontando para um endereço inválido — nunca é usado, porque a interface
 * bloqueia antes, mas mantém os tipos simples no resto do código.
 */
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? url : 'http://localhost:54321',
  isSupabaseConfigured ? anonKey : 'sem-configuracao',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'nosso-lar-auth',
    },
    db: { schema: 'public' },
    global: { headers: { 'x-application-name': 'nosso-lar' } },
  },
);

/** Mensagens do Supabase/Postgres traduzidas para o que a pessoa precisa ler. */
const MESSAGES: { match: RegExp; text: string }[] = [
  { match: /invalid login credentials/i, text: 'E-mail ou senha incorretos.' },
  { match: /email not confirmed/i, text: 'Confirme seu e-mail antes de entrar.' },
  {
    match: /user already registered|already been registered/i,
    text: 'Já existe uma conta com este e-mail. Faça login.',
  },
  {
    match: /password should be at least/i,
    text: 'A senha precisa ter pelo menos 6 caracteres.',
  },
  { match: /unable to validate email|invalid email/i, text: 'Informe um e-mail válido.' },
  {
    match: /for security purposes|rate limit|too many requests/i,
    text: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.',
  },
  {
    match: /row-level security|permission denied|42501/i,
    text: 'Você não tem permissão para esta ação neste espaço.',
  },
  {
    match: /duplicate key value|23505/i,
    text: 'Este registro já existe. Verifique se não foi salvo duas vezes.',
  },
  {
    match: /violates foreign key|23503/i,
    text: 'Não foi possível concluir: existe outro registro ligado a este.',
  },
  {
    match: /items_fraction_chk/i,
    text: 'Este item não aceita quantidade fracionada. Use um número inteiro.',
  },
  {
    match: /purchases_installments_paid_chk/i,
    text: 'O número de parcelas pagas não pode ser maior que o total de parcelas.',
  },
  {
    match: /purchases_subject_chk/i,
    text: 'Escolha um item do enxoval ou descreva o que foi comprado.',
  },
  {
    match: /failed to fetch|networkerror|network request failed/i,
    text: 'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
  },
  {
    match: /relation .* does not exist|schema cache|PGRST20[0-9]/i,
    text: 'O banco de dados ainda não foi preparado. Execute o arquivo supabase/schema.sql.',
  },
];

export function friendlyError(error: unknown): string {
  if (!error) return 'Algo deu errado. Tente novamente.';

  const raw =
    typeof error === 'string'
      ? error
      : ((error as { message?: string }).message ??
        (error as { error_description?: string }).error_description ??
        JSON.stringify(error));

  const hint = (error as { hint?: string | null })?.hint;
  const details = (error as { details?: string | null })?.details;
  const haystack = [raw, hint, details].filter(Boolean).join(' · ');

  for (const { match, text } of MESSAGES) {
    if (match.test(haystack)) return text;
  }

  // Mensagens que nós mesmos lançamos no banco já vêm em português.
  if (/^[A-ZÀ-Ú]/.test(raw) && raw.length < 180 && !raw.includes('{')) return raw;

  return 'Não foi possível concluir a operação. Tente novamente.';
}
