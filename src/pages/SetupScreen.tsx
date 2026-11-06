import { Database, FileCode2, KeyRound, Terminal } from 'lucide-react';
import { Card } from '@/components/ui/primitives';

const STEPS = [
  {
    icon: Database,
    title: 'Crie um projeto no Supabase',
    body: (
      <>
        Acesse{' '}
        <a
          className="font-medium text-olive-700 underline decoration-olive-300 underline-offset-2 hover:decoration-olive-600"
          href="https://supabase.com/dashboard"
          target="_blank"
          rel="noreferrer noopener"
        >
          supabase.com/dashboard
        </a>{' '}
        e crie um projeto novo. Escolha a região mais próxima e guarde a senha do banco.
      </>
    ),
  },
  {
    icon: FileCode2,
    title: 'Prepare o banco de dados',
    body: (
      <>
        No projeto, abra <strong>SQL Editor</strong>, cole todo o conteúdo do arquivo{' '}
        <code className="rounded bg-cream-300 px-1.5 py-0.5 font-mono text-[0.8125rem]">
          supabase/schema.sql
        </code>{' '}
        e execute. Isso cria as tabelas, as políticas de segurança e os 174 itens da lista inicial
        do enxoval.
      </>
    ),
  },
  {
    icon: KeyRound,
    title: 'Copie as chaves do projeto',
    body: (
      <>
        Em <strong>Project Settings → API</strong>, copie a <em>Project URL</em> e a chave{' '}
        <em>anon public</em>.
      </>
    ),
  },
  {
    icon: Terminal,
    title: 'Configure o arquivo .env',
    body: (
      <>
        Duplique <code className="rounded bg-cream-300 px-1.5 py-0.5 font-mono text-[0.8125rem]">.env.example</code>{' '}
        como <code className="rounded bg-cream-300 px-1.5 py-0.5 font-mono text-[0.8125rem]">.env</code>,
        preencha as duas variáveis e reinicie o servidor com{' '}
        <code className="rounded bg-cream-300 px-1.5 py-0.5 font-mono text-[0.8125rem]">npm run dev</code>.
      </>
    ),
  },
];

export function SetupScreen() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-4 py-10 sm:px-6">
      <header className="mb-7 text-center">
        <p className="eyebrow">Nosso Lar</p>
        <h1 className="mt-1.5 text-[1.75rem] font-semibold tracking-[-0.015em] text-ink sm:text-[2rem]">
          Falta conectar o banco de dados
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-[0.9375rem] leading-relaxed text-ink-secondary">
          O sistema guarda tudo no Supabase, para que os dados continuem disponíveis depois de
          fechar o navegador e fiquem sincronizados entre os dispositivos do casal. São quatro
          passos, uma única vez.
        </p>
      </header>

      <Card className="card-pad">
        <ol className="flex flex-col gap-5">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="flex gap-4">
              <span className="relative flex flex-col items-center">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-olive-100 text-olive-700 ring-1 ring-olive-300">
                  <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden />
                </span>
                {index < STEPS.length - 1 ? (
                  <span className="mt-2 w-px flex-1 bg-cream-400" aria-hidden />
                ) : null}
              </span>
              <div className="min-w-0 flex-1 pb-1">
                <h2 className="text-[0.9375rem] font-semibold text-ink">
                  <span className="tnum mr-1.5 text-ink-muted">{index + 1}.</span>
                  {title}
                </h2>
                <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-secondary">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 rounded-xl border border-cream-400 bg-cream-200/70 p-4">
          <p className="eyebrow">Conteúdo esperado do .env</p>
          <pre className="mt-2 overflow-x-auto font-mono text-[0.8125rem] leading-relaxed text-ink-secondary">
{`VITE_SUPABASE_URL=https://seuprojeto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...`}
          </pre>
        </div>

        <p className="mt-5 text-[0.8125rem] leading-relaxed text-ink-muted">
          O passo a passo completo, incluindo publicação, está no{' '}
          <code className="rounded bg-cream-300 px-1.5 py-0.5 font-mono">README.md</code> do projeto.
        </p>
      </Card>
    </div>
  );
}
