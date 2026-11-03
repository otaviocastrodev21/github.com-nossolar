import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Info, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { SENHA_MINIMA, useSession } from '@/contexts/SessionContext';
import { Button, Card, Notice } from '@/components/ui/primitives';
import { Field, Input, SegmentedControl } from '@/components/ui/form';

type Aba = 'entrar' | 'criar';

/**
 * Entrar ou criar conta. Quem chega aqui com a sessão antiga, sem cadastro,
 * vê "Criar conta" primeiro: é o caminho que leva junto o que já foi
 * registrado neste aparelho.
 */
export function AuthScreen() {
  const { signIn, signUp, isAnonymous } = useSession();

  const [aba, setAba] = useState<Aba>(isAnonymous ? 'criar' : 'entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const primeiroCampo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    primeiroCampo.current?.focus();
  }, [aba]);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      if (aba === 'entrar') await signIn(email, senha);
      else await signUp(nome, email, senha);
    } catch (caught) {
      setErro(caught instanceof Error ? caught.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <header className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-wood-400/25 ring-1 ring-wood-300">
            <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
              <path d="M6 15.2 16 7l10 8.2" fill="none" stroke="#906D3B" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9.5 14.6V24.5h13V14.6" fill="none" stroke="#242424" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12.8 19.4l2.5 2.5 4.4-5.2" fill="none" stroke="#5C643F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h1 className="text-[1.625rem] font-semibold tracking-[-0.015em] text-ink">Nosso Lar</h1>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-secondary">
            Nosso enxoval, nossos planos.
          </p>
        </header>

        <Card className="card-pad">
          <SegmentedControl
            label="Entrar ou criar conta"
            className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
            value={aba}
            onChange={(proxima) => {
              setAba(proxima);
              setErro(null);
            }}
            options={[
              {
                value: 'entrar',
                label: (
                  <>
                    <LogIn className="h-3.5 w-3.5" aria-hidden /> Entrar
                  </>
                ),
              },
              {
                value: 'criar',
                label: (
                  <>
                    <UserPlus className="h-3.5 w-3.5" aria-hidden /> Criar conta
                  </>
                ),
              },
            ]}
          />

          {isAnonymous ? (
            <div className="mt-4">
              <Notice tone="info" icon={<ShieldCheck className="h-4.5 w-4.5" />} title="Agora o Nosso Lar tem conta">
                {aba === 'criar'
                  ? 'Crie a conta aqui e tudo o que já foi registrado neste aparelho vai junto. Depois, é só entrar com o mesmo e-mail nos outros aparelhos.'
                  : 'Se a lista de vocês já está numa conta, entre com ela. O que foi registrado só neste aparelho fica para trás.'}
              </Notice>
            </div>
          ) : null}

          <form className="mt-5 flex flex-col gap-4" onSubmit={(evento) => void enviar(evento)} noValidate>
            {aba === 'criar' ? (
              <Field
                label="Como podemos te chamar?"
                htmlFor="auth-nome"
                required
                hint="É o nome que aparece ao lado de cada compra que você registrar."
              >
                <Input
                  id="auth-nome"
                  ref={primeiroCampo}
                  value={nome}
                  maxLength={40}
                  autoComplete="given-name"
                  placeholder="Ana"
                  onChange={(evento) => setNome(evento.target.value)}
                />
              </Field>
            ) : null}

            <Field label="E-mail" htmlFor="auth-email" required>
              <Input
                id="auth-email"
                ref={aba === 'entrar' ? primeiroCampo : undefined}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                placeholder="voce@exemplo.com"
                onChange={(evento) => setEmail(evento.target.value)}
              />
            </Field>

            <Field
              label="Senha"
              htmlFor="auth-senha"
              required
              hint={aba === 'criar' ? `Pelo menos ${SENHA_MINIMA} caracteres.` : undefined}
            >
              <div className="relative">
                <Input
                  id="auth-senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  autoComplete={aba === 'criar' ? 'new-password' : 'current-password'}
                  value={senha}
                  className="pr-12"
                  onChange={(evento) => setSenha(evento.target.value)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-ink-muted hover:text-ink"
                  aria-label={mostrarSenha ? 'Esconder a senha' : 'Mostrar a senha'}
                  aria-pressed={mostrarSenha}
                  onClick={() => setMostrarSenha((atual) => !atual)}
                >
                  {mostrarSenha ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </Field>

            {erro ? (
              <Notice tone="critical" icon={<Info className="h-4.5 w-4.5" />}>
                <span role="alert">{erro}</span>
              </Notice>
            ) : null}

            <Button type="submit" variant="primary" size="lg" block loading={ocupado}>
              {aba === 'entrar' ? 'Entrar' : 'Criar conta'}
            </Button>
          </form>
        </Card>

        <p className="mt-5 px-2 text-center text-[0.8125rem] leading-relaxed text-ink-muted">
          {aba === 'entrar'
            ? 'Use o mesmo e-mail no computador, no site e no celular: todos mostram a mesma lista.'
            : 'Para dividir a lista com seu par, cada um pode ter a própria conta e se conectar em Configurações → Conectar outro aparelho.'}
        </p>
      </div>
    </div>
  );
}
