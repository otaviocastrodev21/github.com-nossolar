import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { friendlyError, isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

/**
 * Conta com e-mail e senha.
 *
 * A mesma conta entra em qualquer aparelho — app de computador, site ou
 * celular — e vê o mesmo espaço, sem código de pareamento.
 *
 * Aparelhos que já usavam o Nosso Lar antes do cadastro têm uma sessão
 * anônima guardada. Ela não dá acesso às telas: a pessoa cria a conta ali
 * mesmo e a sessão anônima *vira* a conta (`updateUser`), mantendo o mesmo
 * id — e, com ele, o espaço e tudo o que já foi registrado.
 */

interface SessionValue {
  /** ainda lendo a sessão guardada no aparelho */
  loading: boolean;
  session: Session | null;
  user: User | null;
  /** sessão antiga, sem cadastro: precisa criar a conta (ou entrar) para continuar */
  isAnonymous: boolean;
  profile: Profile | null;
  /** nome que a outra pessoa vê ao lado de cada compra */
  displayName: string;
  setDisplayName: (nome: string) => Promise<void>;
  /** a pessoa ainda não disse como quer ser chamada */
  needsName: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, senha: string) => Promise<void>;
  /** cria a conta — ou converte a sessão anônima deste aparelho, mantendo os dados */
  signUp: (nome: string, email: string, senha: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

const NOME_PADRAO = 'Participante';

export const SENHA_MINIMA = 8;

function validar(email: string, senha: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  if (senha.length < SENHA_MINIMA) {
    throw new Error(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const user = session?.user ?? null;
  const isAnonymous = Boolean(user?.is_anonymous);

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
        if (!data.session) return;

        // `getSession` só lê o aparelho. Uma conta apagada no servidor deixaria
        // o token guardado e toda escrita falharia por chave estrangeira, então
        // confirmamos antes. Só descarta quando o servidor nega (401/403): um
        // erro de rede não tem status e não pode derrubar quem está sem internet.
        const { error: checkError } = await supabase.auth.getUser();
        if (checkError?.status === 401 || checkError?.status === 403) {
          console.warn('[Nosso Lar] A sessão guardada não vale mais.', checkError.message);
          await supabase.auth.signOut({ scope: 'local' });
          return;
        }
        if (!cancelado) setSession(data.session);
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
  }, []);

  // Pelo id e pelo e-mail, não pelo objeto: renovar o token troca o objeto a
  // cada hora, e criar a conta muda só o e-mail.
  const userId = user?.id;
  const userEmail = user?.email;
  useEffect(() => {
    if (!userId) return;
    void carregarPerfil(userId);
  }, [userId, userEmail, carregarPerfil]);

  // Só o nome: o e-mail do perfil quem grava é o banco (migração 0006), a
  // partir da conta — o cliente nem tem permissão nessa coluna.
  const gravarNome = useCallback(async (userId: string, nome: string) => {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ display_name: nome, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (updateError) throw new Error(friendlyError(updateError));
  }, []);

  const setDisplayName = useCallback(
    async (nome: string) => {
      if (!user) return;
      const limpo = nome.trim();
      if (!limpo) throw new Error('Informe um nome.');

      await gravarNome(user.id, limpo);
      await supabase.auth.updateUser({ data: { display_name: limpo } });
      setProfile((atual) => (atual ? { ...atual, display_name: limpo } : atual));
    },
    [user, gravarNome],
  );

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    await carregarPerfil(user.id);
  }, [user, carregarPerfil]);

  const signIn = useCallback(async (email: string, senha: string) => {
    const limpo = email.trim().toLowerCase();
    if (!limpo || !senha) throw new Error('Informe o e-mail e a senha.');

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: limpo,
      password: senha,
    });
    if (authError) throw new Error(friendlyError(authError));
  }, []);

  const signUp = useCallback(
    async (nome: string, email: string, senha: string) => {
      const nomeLimpo = nome.trim();
      const emailLimpo = email.trim().toLowerCase();
      if (!nomeLimpo) throw new Error('Diga como podemos te chamar.');
      validar(emailLimpo, senha);

      const { data: atual } = await supabase.auth.getSession();

      if (atual.session?.user.is_anonymous) {
        // Converte a identidade deste aparelho: mesmo id, mesmo espaço.
        const { data, error: authError } = await supabase.auth.updateUser({
          email: emailLimpo,
          password: senha,
          data: { display_name: nomeLimpo },
        });
        if (authError) throw new Error(friendlyError(authError));
        if (data.user) {
          await gravarNome(data.user.id, nomeLimpo).catch(() => undefined);
          await carregarPerfil(data.user.id);
          // O token antigo ainda diz "anônimo"; um novo traz a conta.
          await supabase.auth.refreshSession();
        }
        return;
      }

      const { data, error: authError } = await supabase.auth.signUp({
        email: emailLimpo,
        password: senha,
        options: { data: { display_name: nomeLimpo } },
      });
      if (authError) throw new Error(friendlyError(authError));
      if (!data.session) {
        throw new Error('Conta criada. Confirme o e-mail que enviamos e depois entre.');
      }
    },
    [gravarNome, carregarPerfil],
  );

  const signOut = useCallback(async () => {
    const { error: authError } = await supabase.auth.signOut();
    // Sem internet o servidor não responde, mas o aparelho precisa sair mesmo assim.
    if (authError) await supabase.auth.signOut({ scope: 'local' });
    setProfile(null);
    setSession(null);
  }, []);

  const displayName = profile?.display_name?.trim() || NOME_PADRAO;

  const value = useMemo<SessionValue>(
    () => ({
      loading,
      session,
      user,
      isAnonymous,
      profile,
      displayName,
      setDisplayName,
      needsName: Boolean(profile) && displayName === NOME_PADRAO,
      refreshProfile,
      signIn,
      signUp,
      signOut,
    }),
    [
      loading,
      session,
      user,
      isAnonymous,
      profile,
      displayName,
      setDisplayName,
      refreshProfile,
      signIn,
      signUp,
      signOut,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const contexto = useContext(SessionContext);
  if (!contexto) throw new Error('useSession precisa estar dentro de <SessionProvider>.');
  return contexto;
}
