import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  ListChecks,
  Menu,
  Monitor,
  Moon,
  RefreshCw,
  Settings,
  ShoppingBag,
  Sun,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '@/contexts/SessionContext';
import { useSpace } from '@/contexts/SpaceContext';
import { useToast } from '@/contexts/ToastContext';
import { initials, percentPoints } from '@/lib/format';
import { Meter } from '@/components/dashboard/figures';
import { Logo } from '@/components/ui/primitives';
import { ConnectionBanner, InstallPrompt, UpdatePrompt } from './AppStatus';
import { desktop } from '@/lib/runtime';
import { useTheme, type ThemeMode } from '@/lib/theme';
import { useSpotlight } from '@/lib/motion';
import { celebrate } from '@/lib/celebrate';
import type { ItemStatus } from '@/types/database';

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
      className="group flex min-w-0 items-center gap-3 rounded-xl px-1 py-1 transition hover:opacity-95"
    >
      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-wood-100 via-cream-50 to-olive-100 shadow-card ring-1 ring-wood-300/70 transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105">
        <Logo className="h-6 w-6" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[0.9375rem] font-semibold leading-tight tracking-[-0.01em] text-ink">
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
    <nav aria-label="Seções do sistema" className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'group relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium transition-all duration-300',
              isActive
                ? 'bg-gradient-to-r from-olive-100 via-olive-100/70 to-transparent text-olive-700 shadow-[inset_0_0_0_1px_rgb(var(--olive-300)/0.7)]'
                : 'text-ink-secondary hover:bg-cream-50/70 hover:pl-4 hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              {/* barra acesa à esquerda do item ativo */}
              <span
                aria-hidden
                className={clsx(
                  'absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-olive-500 to-wood-500 transition-all duration-300',
                  isActive ? 'h-5 opacity-100 shadow-glow' : 'h-0 opacity-0',
                )}
              />
              <Icon
                className={clsx(
                  'h-[1.125rem] w-[1.125rem] shrink-0 transition-transform duration-300',
                  isActive ? 'text-olive-600' : 'group-hover:scale-110',
                )}
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

/**
 * As porcentagens na barra lateral: o enxoval em destaque e, logo abaixo, a
 * primeira compra e os materiais de construção. Cada uma abre a sua lista.
 */
function ProgressSummary({ onNavigate }: { onNavigate?: () => void }) {
  const { overview } = useSpace();
  const enxoval = overview.byList.itens;

  return (
    <div className="flex flex-col gap-2">
      <NavLink
        to="/checklist"
        onClick={onNavigate}
        className="group relative block overflow-hidden rounded-2xl border border-cream-400/70 bg-gradient-to-br from-cream-50/80 via-olive-100/50 to-wood-100/60 p-3.5 shadow-card transition hover:border-olive-300"
      >
        <span aria-hidden className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-olive-300/40 blur-2xl" />
        <div className="flex items-baseline justify-between gap-2">
          <span className="eyebrow">Enxoval</span>
          <span className="tnum text-[1.0625rem] font-semibold text-ink">
            {percentPoints(enxoval.completion * 100)}
          </span>
        </div>
        <Meter
          ratio={enxoval.completion}
          size="sm"
          className="mt-2"
          label={`Progresso do enxoval: ${percentPoints(enxoval.completion * 100)}`}
        />
        <p className="mt-2 text-[0.75rem] leading-snug text-ink-muted">
          {enxoval.itemsDone} de {enxoval.itemsTotal} itens concluídos
        </p>
      </NavLink>

      {(['pc', 'construcao'] as const).map((chave) => {
        const prog = overview.byList[chave];
        const rotulo = chave === 'pc' ? 'Primeira compra' : 'Materiais de construção';
        return (
          <NavLink
            key={chave}
            to={`/checklist?lista=${chave}`}
            onClick={onNavigate}
            className="block rounded-xl border border-cream-400/70 bg-cream-50/50 px-3.5 py-2.5 transition hover:border-olive-300 hover:bg-cream-50"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="eyebrow">{rotulo}</span>
              <span className="tnum text-[0.875rem] font-semibold text-ink">
                {percentPoints(prog.completion * 100)}
              </span>
            </div>
            <Meter
              ratio={prog.completion}
              size="xs"
              className="mt-1.5"
              label={`${rotulo}: ${percentPoints(prog.completion * 100)}`}
            />
            <p className="mt-1.5 text-[0.6875rem] leading-snug text-ink-muted">
              {prog.itemsDone} de {prog.itemsTotal} itens
            </p>
          </NavLink>
        );
      })}
    </div>
  );
}

function Members() {
  const { members } = useSpace();
  const { user } = useSession();

  if (members.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2" title="Participantes do espaço">
      {members.slice(0, 3).map((member) => (
        <span
          key={member.user_id}
          className={clsx(
            'relative grid h-9 w-9 place-items-center rounded-full text-[0.6875rem] font-semibold ring-2 ring-cream-100 transition-transform duration-300 hover:z-10 hover:-translate-y-0.5 hover:scale-110',
            member.user_id === user?.id
              ? 'bg-gradient-to-br from-olive-500 to-olive-700 text-cream-50'
              : 'bg-gradient-to-br from-wood-300 to-wood-400 text-ink',
          )}
          title={`${member.profile?.display_name || 'Participante'}${
            member.role === 'dono' ? ' · criou o espaço' : ''
          }`}
        >
          {initials(member.profile?.display_name)}
        </span>
      ))}
      {members.length > 3 ? (
        <span className="relative grid h-9 w-9 place-items-center rounded-full bg-greige-200 text-[0.6875rem] font-semibold text-ink-secondary ring-2 ring-cream-100">
          +{members.length - 3}
        </span>
      ) : null}
    </div>
  );
}

const TEMAS: { mode: ThemeMode; label: string; icon: LucideIcon }[] = [
  { mode: 'light', label: 'Tema claro', icon: Sun },
  { mode: 'dark', label: 'Tema escuro', icon: Moon },
  { mode: 'system', label: 'Tema do sistema', icon: Monitor },
];

/** Alterna claro → escuro → sistema. O ícone entra com um pulo ao trocar. */
export function ThemeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();
  const indice = Math.max(
    0,
    TEMAS.findIndex((t) => t.mode === mode),
  );
  const atual = TEMAS[indice];
  const proximo = TEMAS[(indice + 1) % TEMAS.length];
  const Icon = atual.icon;

  return (
    <button
      type="button"
      onClick={() => setMode(proximo.mode)}
      title={`${atual.label} — clique para ${proximo.label.toLowerCase()}`}
      aria-label={`${atual.label}. Mudar para ${proximo.label.toLowerCase()}`}
      className={clsx(
        'grid h-10 w-10 place-items-center rounded-xl border border-greige-300/80 bg-cream-50/70 text-ink-secondary backdrop-blur transition hover:-translate-y-px hover:bg-cream-50 hover:text-ink',
        className,
      )}
    >
      <Icon key={atual.mode} className="h-4 w-4 animate-pop-in" aria-hidden />
    </button>
  );
}

function ContaRodape({ onNavigate }: { onNavigate?: () => void }) {
  const { displayName, user } = useSession();
  return (
    <NavLink
      to="/configuracoes"
      onClick={onNavigate}
      className="group flex items-center gap-2.5 rounded-xl border-t border-cream-400/70 px-1 pt-4 transition"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-olive-500 to-olive-700 text-[0.75rem] font-semibold text-cream-50 shadow-card transition-transform duration-300 group-hover:scale-105">
        {initials(displayName)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[0.875rem] font-medium leading-tight text-ink">
          {displayName}
        </span>
        <span className="block truncate text-[0.75rem] leading-tight text-ink-muted">
          {user?.email ?? 'Sua conta'}
        </span>
      </span>
    </NavLink>
  );
}

/**
 * Comemora quando um item passa a "comprado" — seja pela própria pessoa, seja
 * pelo par em outro aparelho (chega pelo Realtime). E de novo, maior, quando o
 * enxoval inteiro fica pronto. A primeira carga só registra o estado.
 */
function useCelebrations() {
  const { items, overview } = useSpace();
  const toast = useToast();
  const anteriores = useRef<Map<string, ItemStatus> | null>(null);
  const completo = useRef<boolean | null>(null);

  useEffect(() => {
    const antes = anteriores.current;
    anteriores.current = new Map(items.map((item) => [item.id, item.status]));
    if (!antes) return;

    const novos = items.filter(
      (item) => item.status === 'comprado' && antes.has(item.id) && antes.get(item.id) !== 'comprado',
    );
    if (novos.length > 0) {
      celebrate({ amount: 90 });
      toast.success(
        novos.length === 1 ? `${novos[0].name}: comprado!` : `${novos.length} itens comprados!`,
        'Mais um passo para o lar de vocês.',
      );
    }
  }, [items, toast]);

  useEffect(() => {
    const agora = overview.itemsTotal > 0 && overview.completion >= 1;
    if (completo.current === false && agora) {
      celebrate({ amount: 220, origin: { x: 0.5, y: 0.25 } });
      toast.success('Enxoval completo!', 'Todos os itens planejados foram comprados.');
    }
    completo.current = agora;
  }, [overview.completion, overview.itemsTotal, toast]);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { refresh, refreshing } = useSpace();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useSpotlight();
  useCelebrations();

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
      <aside className="side-bar sticky top-0 hidden h-dvh w-[17.5rem] shrink-0 flex-col gap-5 border-r border-cream-400/70 px-4 py-5 lg:flex">
        <Brand />
        <ProgressSummary />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavList />
        </div>
        <ContaRodape />
      </aside>

      {/* ── Gaveta (celular/tablet) ── */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-scrim/45 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="relative z-10 flex h-full w-[17.5rem] max-w-[85vw] animate-rise-in flex-col gap-5 border-r border-cream-400/70 bg-cream-100/90 px-4 py-5 shadow-pop backdrop-blur-2xl">
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
            <ProgressSummary onNavigate={() => setDrawerOpen(false)} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <NavList onNavigate={() => setDrawerOpen(false)} />
            </div>
            <ContaRodape onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}

      {/* ── Conteúdo ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-bar sticky top-0 z-30 flex items-center gap-3 border-b border-cream-400/60 px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-greige-300/80 bg-cream-50/70 text-ink-secondary transition hover:bg-cream-50 lg:hidden"
          >
            <Menu className="h-[1.125rem] w-[1.125rem]" aria-hidden />
          </button>

          <div className="min-w-0 flex-1 lg:hidden">
            <Brand />
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {refreshing ? (
              <span className="hidden items-center gap-1.5 text-[0.75rem] text-ink-muted sm:flex">
                <span className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-olive-500" aria-hidden />
                Sincronizando
              </span>
            ) : null}
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void refresh()}
              title="Atualizar dados"
              aria-label="Atualizar dados"
              className="group/sync grid h-10 w-10 place-items-center rounded-xl border border-greige-300/80 bg-cream-50/70 text-ink-secondary backdrop-blur transition hover:-translate-y-px hover:bg-cream-50 hover:text-ink"
            >
              <RefreshCw
                className={clsx(
                  'h-4 w-4 transition-transform duration-500',
                  refreshing ? 'animate-spin' : 'group-hover/sync:rotate-180',
                )}
                aria-hidden
              />
            </button>
            <div className="hidden sm:block">
              <Members />
            </div>
          </div>
        </header>

        <main
          id="conteudo"
          className="min-w-0 flex-1 px-4 py-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8 lg:pb-10"
        >
          <ConnectionBanner />
          {/* A chave reinicia a animação a cada troca de tela. */}
          <div key={location.pathname} className="animate-page-in">
            {children}
          </div>
        </main>
      </div>

      {/* ── Navegação inferior (celular): pílula flutuante de vidro ── */}
      <nav
        aria-label="Navegação rápida"
        className="fixed inset-x-3 z-40 lg:hidden"
        style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <ul className="glass-bar grid grid-cols-5 gap-1 rounded-[1.375rem] border border-cream-400/70 p-1.5 shadow-pop">
          {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
            <li key={to} className="min-w-0">
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'relative flex flex-col items-center gap-0.5 rounded-2xl px-1 py-2 text-[0.6875rem] font-medium transition-all duration-300',
                    isActive
                      ? 'bg-gradient-to-b from-olive-100 to-olive-200/70 text-olive-700 shadow-[inset_0_0_0_1px_rgb(var(--olive-300)/0.6)]'
                      : 'text-ink-muted active:scale-95',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={clsx(
                        'h-5 w-5 transition-transform duration-300',
                        isActive && '-translate-y-0.5 scale-110 text-olive-600',
                      )}
                      aria-hidden
                    />
                    <span className="max-w-full truncate">{label}</span>
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
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:mb-7">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon ? (
          <span className="relative isolate mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-wood-100 via-cream-50 to-olive-100 text-wood-600 shadow-card ring-1 ring-wood-300/60">
            <span aria-hidden className="absolute inset-0 -z-10 rounded-2xl bg-wood-300/40 blur-xl" />
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="text-gradient text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[1.75rem]">
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
