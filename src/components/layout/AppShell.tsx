import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  ListChecks,
  Menu,
  RefreshCw,
  Settings,
  ShoppingBag,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { useSpace } from '@/contexts/SpaceContext';
import { initials, percentPoints } from '@/lib/format';
import { Meter } from '@/components/dashboard/figures';
import { ConnectionBanner, InstallPrompt, UpdatePrompt } from './AppStatus';
import { desktop } from '@/lib/runtime';

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  /** rota exata — só o painel precisa, para não ficar ativo em todas as telas */
  end?: boolean;
}

const NAV: NavEntry[] = [
  { to: '/', label: 'Painel', icon: LayoutDashboard, end: true },
  { to: '/checklist', label: 'Checklist', icon: ListChecks },
  { to: '/compras', label: 'Compras', icon: ShoppingBag },
  { to: '/pendentes', label: 'Pendentes', icon: ClipboardList },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/relatorios', label: 'Relatórios', icon: FileBarChart },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
];

/** Atalhos do rodapé no celular — as telas mais usadas no dia a dia. */
const MOBILE_NAV: NavEntry[] = [NAV[0], NAV[1], NAV[2], NAV[3], NAV[4]];

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  const { space } = useSpace();

  return (
    <NavLink
      to="/"
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl px-1 py-1 transition hover:opacity-90"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-wood-400/25 ring-1 ring-wood-300">
        <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
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
      <span className="min-w-0">
        <span className="block truncate text-[0.9375rem] font-semibold leading-tight text-ink">
          {space?.name ?? 'Nosso Lar'}
        </span>
        <span className="block truncate text-[0.75rem] leading-tight text-ink-muted">
          {space?.tagline ?? 'Nosso enxoval, nossos planos.'}
        </span>
      </span>
    </NavLink>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Seções do sistema" className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium transition',
              isActive
                ? 'bg-olive-100 text-olive-700 ring-1 ring-olive-300'
                : 'text-ink-secondary hover:bg-greige-100 hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={clsx('h-[1.125rem] w-[1.125rem] shrink-0', isActive && 'text-olive-600')}
                aria-hidden
              />
              <span className="truncate">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function ProgressSummary() {
  const { overview } = useSpace();

  return (
    <div className="rounded-xl border border-cream-400 bg-cream-200/70 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">Enxoval</span>
        <span className="tnum text-[0.9375rem] font-semibold text-ink">
          {percentPoints(overview.completion * 100)}
        </span>
      </div>
      <Meter
        ratio={overview.completion}
        size="sm"
        className="mt-2"
        label={`Progresso do enxoval: ${percentPoints(overview.completion * 100)}`}
      />
      <p className="mt-2 text-[0.75rem] leading-snug text-ink-muted">
        {overview.itemsDone} de {overview.itemsTotal} itens concluídos
      </p>
    </div>
  );
}

function Members() {
  const { members } = useSpace();
  const { user } = useSession();

  if (members.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5" title="Participantes do espaço">
      {members.slice(0, 3).map((member) => (
        <span
          key={member.user_id}
          className={clsx(
            'grid h-8 w-8 place-items-center rounded-full text-[0.6875rem] font-semibold ring-2 ring-cream-100',
            member.user_id === user?.id
              ? 'bg-olive-600 text-cream-50'
              : 'bg-wood-300 text-ink',
          )}
          title={`${member.profile?.display_name || 'Participante'}${
            member.role === 'dono' ? ' · criou o espaço' : ''
          }`}
        >
          {initials(member.profile?.display_name)}
        </span>
      ))}
      {members.length > 3 ? (
        <span className="grid h-8 w-8 place-items-center rounded-full bg-greige-200 text-[0.6875rem] font-semibold text-ink-secondary ring-2 ring-cream-100">
          +{members.length - 3}
        </span>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { displayName } = useSession();
  const { refresh, refreshing } = useSpace();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Menu "Ir para" e Ctrl/Cmd+R do aplicativo de computador.
  useEffect(() => {
    if (!desktop) return;
    const stopNavigate = desktop.onNavigate((path) => navigate(path));
    const stopRefresh = desktop.onRefresh(() => void refresh());
    return () => {
      stopNavigate();
      stopRefresh();
    };
  }, [navigate, refresh]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-xl focus:bg-cream-50 focus:px-4 focus:py-2 focus:shadow-pop"
      >
        Ir para o conteúdo
      </a>

      {/* ── Barra lateral (desktop) ── */}
      <aside className="sticky top-0 hidden h-dvh w-[17.5rem] shrink-0 flex-col gap-5 border-r border-cream-400 bg-cream-100 px-4 py-5 lg:flex">
        <Brand />
        <ProgressSummary />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavList />
        </div>
        {/* Sem conta nem senha: aqui vale só lembrar quem está usando. */}
        <NavLink
          to="/configuracoes"
          className="flex items-center gap-2.5 rounded-xl border-t border-cream-400 px-1 pt-4 transition hover:opacity-80"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-olive-600 text-[0.75rem] font-semibold text-cream-50">
            {initials(displayName)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[0.875rem] font-medium leading-tight text-ink">
              {displayName}
            </span>
            <span className="block truncate text-[0.75rem] leading-tight text-ink-muted">
              Este aparelho
            </span>
          </span>
        </NavLink>
      </aside>

      {/* ── Gaveta (celular/tablet) ── */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-ink/35 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="relative z-10 flex h-full w-[17.5rem] max-w-[85vw] animate-rise-in flex-col gap-5 border-r border-cream-400 bg-cream-100 px-4 py-5 shadow-pop">
            <div className="flex items-start justify-between gap-2">
              <Brand onNavigate={() => setDrawerOpen(false)} />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fechar menu"
                className="grid h-9 w-9 touch:h-10 touch:w-10 shrink-0 place-items-center rounded-xl text-ink-muted transition hover:bg-greige-100 hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <ProgressSummary />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <NavList onNavigate={() => setDrawerOpen(false)} />
            </div>
            <NavLink
              to="/configuracoes"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-2.5 rounded-xl border-t border-cream-400 px-1 pt-4"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-olive-600 text-[0.75rem] font-semibold text-cream-50">
                {initials(displayName)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[0.875rem] font-medium leading-tight text-ink">
                  {displayName}
                </span>
                <span className="block truncate text-[0.75rem] leading-tight text-ink-muted">
                  Este aparelho
                </span>
              </span>
            </NavLink>
          </div>
        </div>
      ) : null}

      {/* ── Conteúdo ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-cream-400 bg-cream-100/90 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-greige-300 bg-cream-50 text-ink-secondary transition hover:bg-cream-200 lg:hidden"
          >
            <Menu className="h-[1.125rem] w-[1.125rem]" aria-hidden />
          </button>

          <div className="min-w-0 flex-1 lg:hidden">
            <Brand />
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {refreshing ? (
              <span className="hidden items-center gap-1.5 text-[0.75rem] text-ink-muted sm:flex">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Sincronizando
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => void refresh()}
              title="Atualizar dados"
              aria-label="Atualizar dados"
              className="grid h-10 w-10 place-items-center rounded-xl border border-greige-300 bg-cream-50 text-ink-secondary transition hover:bg-cream-200"
            >
              <RefreshCw className={clsx('h-4 w-4', refreshing && 'animate-spin')} aria-hidden />
            </button>
            <Members />
          </div>
        </header>

        <main
          id="conteudo"
          className="min-w-0 flex-1 px-4 py-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 lg:pb-8"
        >
          <ConnectionBanner />
          {children}
        </main>
      </div>

      {/* ── Navegação inferior (celular) ── */}
      <nav
        aria-label="Navegação rápida"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-cream-400 bg-cream-100/95 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="grid grid-cols-5">
          {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center gap-0.5 px-1 py-2.5 text-[0.6875rem] font-medium transition',
                    isActive ? 'text-olive-700' : 'text-ink-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={clsx('h-5 w-5', isActive && 'text-olive-600')} aria-hidden />
                    <span className="truncate">{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <UpdatePrompt />
      <InstallPrompt />
    </div>
  );
}

/** Cabeçalho padrão das páginas internas. */
export function PageHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-wood-100 text-wood-600">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.01em] text-ink sm:text-[1.5rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-[0.875rem] leading-relaxed text-ink-secondary">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
