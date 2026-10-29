import { useEffect, useRef, useState } from 'react';
import { Home, Info, KeyRound, Smartphone, Sparkles } from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { useSpace } from '@/contexts/SpaceContext';
import { useToast } from '@/contexts/ToastContext';
import { Button, Card, Notice } from '@/components/ui/primitives';
import { Field, Input, SegmentedControl } from '@/components/ui/form';
import { CodeInput } from '@/components/ui/CodeInput';

/**
 * Primeira tela de quem abre o aplicativo. Não há cadastro nem senha: ou a
 * pessoa começa um espaço, ou entra no espaço que já existe com um código.
 */
export function Onboarding() {
  const { createSpace, joinWithCode } = useSpace();
  const { displayName, setDisplayName } = useSession();
  const toast = useToast();

  const [aba, setAba] = useState<'criar' | 'entrar'>('criar');
  const [nomeEspaco, setNomeEspaco] = useState('Nosso Lar');
  const [meuNome, setMeuNome] = useState(() =>
    displayName === 'Participante' ? '' : displayName,
  );
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoNome = useRef<HTMLInputElement>(null);

  useEffect(() => {
    campoNome.current?.focus();
  }, []);

  /** Salva o nome antes de criar ou entrar — é o que a outra pessoa vai ver. */
  const guardarNome = async () => {
    const limpo = meuNome.trim();
    if (!limpo) return;
    try {
      await setDisplayName(limpo);
    } catch {
      // Não vale travar a entrada por causa do nome; dá para ajustar depois.
    }
  };

  const criar = async () => {
    if (!meuNome.trim()) {
      setErro('Diga como podemos te chamar — é o nome que aparece em cada compra.');
      campoNome.current?.focus();
      return;
    }

    setOcupado(true);
    setErro(null);
    try {
      await guardarNome();
      await createSpace(nomeEspaco);
      toast.success('Espaço criado!', 'A lista inicial do enxoval já está no checklist.');
    } catch (caught) {
      const mensagem = caught instanceof Error ? caught.message : 'Não foi possível criar.';
      setErro(mensagem);
      toast.error(mensagem);
    } finally {
      setOcupado(false);
    }
  };

  const entrar = async () => {
    if (!meuNome.trim()) {
      setErro('Diga como podemos te chamar antes de entrar.');
      campoNome.current?.focus();
      return;
    }

    setOcupado(true);
    setErro(null);
    try {
      await guardarNome();
      await joinWithCode(codigo);
      toast.success('Pronto!', 'Vocês agora dividem a mesma lista.');
    } catch (caught) {
      const mensagem = caught instanceof Error ? caught.message : 'Não foi possível entrar.';
      setErro(mensagem);
      toast.error(mensagem);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-lg">
        <header className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-wood-400/25 ring-1 ring-wood-300">
            <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
              <path
                d="M6 15.2 16 7l10 8.2"
                fill="none"
                stroke="#906D3B"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 14.6V24.5h13V14.6"
                fill="none"
                stroke="#242424"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12.8 19.4l2.5 2.5 4.4-5.2"
                fill="none"
                stroke="#5C643F"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h1 className="text-[1.625rem] font-semibold tracking-[-0.015em] text-ink">Nosso Lar</h1>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-secondary">
            Nosso enxoval, nossos planos.
          </p>
        </header>

        <Card className="card-pad">
          <Field
            label="Como podemos te chamar?"
            htmlFor="meu-nome"
            required
            hint="É o nome que aparece ao lado de cada compra que você registrar."
          >
            <Input
              id="meu-nome"
              ref={campoNome}
              value={meuNome}
              maxLength={40}
              autoComplete="given-name"
              placeholder="Ana"
              onChange={(evento) => {
                setMeuNome(evento.target.value);
                setErro(null);
              }}
            />
          </Field>

          <div className="mt-5">
            <SegmentedControl
              label="O que você quer fazer"
              className="w-full"
              value={aba}
              onChange={(proxima) => {
                setAba(proxima);
                setErro(null);
              }}
              options={[
                {
                  value: 'criar',
                  label: (
                    <span className="flex flex-1 items-center justify-center gap-1.5">
                      <Home className="h-3.5 w-3.5" aria-hidden /> Começar do zero
                    </span>
                  ),
                },
                {
                  value: 'entrar',
                  label: (
                    <span className="flex flex-1 items-center justify-center gap-1.5">
                      <KeyRound className="h-3.5 w-3.5" aria-hidden /> Tenho um código
                    </span>
                  ),
                },
              ]}
            />
          </div>

          {erro ? (
            <div className="mt-4">
              <Notice tone="critical" icon={<Info className="h-4.5 w-4.5" />}>
                {erro}
              </Notice>
            </div>
          ) : null}

          {aba === 'criar' ? (
            <div className="mt-5 flex flex-col gap-4">
              <Field
                label="Nome do espaço"
                htmlFor="espaco"
                required
                hint="Dá para mudar depois nas configurações."
              >
                <Input
                  id="espaco"
                  value={nomeEspaco}
                  maxLength={80}
                  onChange={(evento) => setNomeEspaco(evento.target.value)}
                  placeholder="Nosso Lar"
                />
              </Field>

              <Notice tone="good" icon={<Sparkles className="h-4.5 w-4.5" />} title="Já vem pronto">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>14 categorias e 208 linhas do enxoval cadastradas.</li>
                  <li>Preços em R$ 0,00, para vocês preencherem conforme pesquisarem.</li>
                  <li>Nada marcado como comprado, nenhum valor inventado.</li>
                </ul>
              </Notice>

              <Button variant="primary" size="lg" block loading={ocupado} onClick={criar}>
                Criar nosso espaço
              </Button>
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-4">
              <Field
                label="Código de acesso"
                htmlFor="codigo"
                required
                hint="Peça no aparelho que já está no espaço: Configurações → Conectar outro aparelho."
              >
                <CodeInput id="codigo" value={codigo} onChange={setCodigo} onEnter={entrar} />
              </Field>

              <Notice tone="info" icon={<Smartphone className="h-4.5 w-4.5" />}>
                Serve tanto o código de pareamento (para ligar este aparelho ao espaço) quanto o de
                recuperação (se você perdeu o acesso).
              </Notice>

              <Button
                variant="primary"
                size="lg"
                block
                loading={ocupado}
                disabled={codigo.replace(/[^A-Za-z0-9]/g, '').length < 6}
                onClick={entrar}
              >
                Entrar no espaço
              </Button>
            </div>
          )}
        </Card>

        <p className="mt-5 px-2 text-center text-[0.8125rem] leading-relaxed text-ink-muted">
          Sem cadastro e sem senha: este aparelho já tem uma identidade própria. Guarde o código de
          recuperação depois de entrar — é o caminho de volta se os dados do navegador forem
          apagados.
        </p>
      </div>
    </div>
  );
}
