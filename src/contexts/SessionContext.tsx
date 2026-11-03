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
import type { Session, User } from '@supabase/supabase-js';
import { friendlyError, isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

/**
 * Sessão sem cadastro.
 *
 * Não há tela de login. No primeiro uso o aplicativo abre uma sessão anônima
 * do Supabase: este aparelho passa a ter uma identidade própria, com
 * `auth.uid()` de verdade, e todo o Row Level Security continua valendo.
 *
 * A sessão fica guardada no navegador. Limpar os dados do site derruba o
 * acesso — por isso o espaço oferece um código de recuperação, que é o
 * caminho de volta (ver Configurações).
 */

interface SessionValue {
  /** ainda decidindo se existe sessão, ou abrindo uma */
  loading: boolean;
  /** a sessão anônima não pôde ser aberta */
  error: string | null;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** nome que a outra pessoa vê ao lado de cada compra */
  displayName: string;
  setDisplayName: (nome: string) => Promise<void>;
  /** a pessoa ainda não disse como quer ser chamada */
  needsName: boolean;
  refreshProfile: () => Promise<void>;
  /** encerra a sessão deste aparelho — exige o código de recuperação para voltar */
  disconnectDevice: () => Promise<void>;
  retry: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

const NOME_PADRAO = 'Participante';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tentativa, setTentativa] = useState(0);

  // Impede abrir duas sessões anônimas se o efeito rodar duas vezes
  // (StrictMode em desenvolvimento faz exatamente isso).
  const abrindo = useRef(false);

  const user = session?.user ?? null;

  const carregarPerfil = useCallback(async (userId: string) => {
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (queryError) {
      console.warn('[Nosso Lar] Não foi possível ler o perfil:', queryError.message);
      return;
    }
    if (data) setProfile(data as Profile);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let cancelado = false;

    const preparar = async () => {
      try {
        const { data } = await supabase.auth.getSession();

        if (data.session) {
          // `getSession` apenas lê o que está guardado no aparelho; não
          // pergunta ao servidor se a identidade ainda existe. Sem cadastro,
          // essa identidade é a única que temos — se ela tiver desaparecido do
          // banco, toda escrita falha por chave estrangeira e o "Tentar
          // novamente" nunca sai do lugar. Então confirmamos antes de confiar.
          const { error: checkError } = await supabase.auth.getUser();

          // Só descarta quando o servidor nega a identidade. Um erro de rede
          // não tem status, e NÃO pode derrubar a sessão: ficar sem internet
          // apagaria o único acesso deste aparelho ao espaço.
          const identidadeNegada = checkError?.status === 401 || checkError?.status === 403;

          if (!identidadeNegada) {
            if (!cancelado) setSession(data.session);
            return;
          }

          console.warn(
            '[Nosso Lar] A identidade guardada não vale mais; abrindo outra.',
            checkError?.message,
          );
          await supabase.auth.signOut({ scope: 'local' });
          if (cancelado) return;
        }

        // Primeiro uso neste aparelho: abre a identidade silenciosamente.
        if (abrindo.current) return;
        abrindo.current = true;

        const { data: nova, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) throw anonError;
        if (!cancelado) setSession(nova.session);
      } catch (caught) {
        if (cancelado) return;
        const mensagem = friendlyError(caught);
        setError(
          /anonymous/i.test(String((caught as Error)?.message ?? ''))
            ? 'As sessões anônimas estão desativadas neste projeto Supabase. ' +
                'Ative em Authentication → Sign In / Providers → Anonymous sign-ins.'
            : mensagem,
        );
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    void preparar();

    const { data: inscricao } = supabase.auth.onAuthStateChange((_evento, proxima) => {
      setSession(proxima);
      if (!proxima) setProfile(null);
    });

    return () => {
      cancelado = true;
      inscricao.subscription.unsubscribe();
    };
  }, [tentativa]);

  useEffect(() => {
    if (!user) return;
    void carregarPerfil(user.id);
  }, [user, carregarPerfil]);

  const setDisplayName = useCallback(
    async (nome: string) => {
      if (!user) return;
      const limpo = nome.trim();
      if (!limpo) throw new Error('Informe um nome.');

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ display_name: limpo, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (updateError) throw new Error(friendlyError(updateError));

      await supabase.auth.updateUser({ data: { display_name: limpo } });
      setProfile((atual) => (atual ? { ...atual, display_name: limpo } : atual));
    },
    [user],
  );

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await carregarPerfil(user.id);
  }, [user, carregarPerfil]);

  const disconnectDevice = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    abrindo.current = false;
    setTentativa((n) => n + 1); // abre uma identidade nova e limpa
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    abrindo.current = false;
    setTentativa((n) => n + 1);
  }, []);

  const displayName = profile?.display_name?.trim() || NOME_PADRAO;

  const value = useMemo<SessionValue>(
    () => ({
      loading,
      error,
      session,
      user,
      profile,
      displayName,
      setDisplayName,
      needsName: Boolean(profile) && displayName === NOME_PADRAO,
      refreshProfile,
      disconnectDevice,
      retry,
    }),
    [
      loading,
      error,
      session,
      user,
      profile,
      displayName,
      setDisplayName,
      refreshProfile,
      disconnectDevice,
      retry,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const contexto = useContext(SessionContext);
  if (!contexto) throw new Error('useSession precisa estar dentro de <SessionProvider>.');
  return contexto;
}
