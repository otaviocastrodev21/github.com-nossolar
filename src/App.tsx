import { Component, Suspense, lazy, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/supabase';
import { SessionProvider, useSession } from '@/contexts/SessionContext';
import { SpaceProvider, useSpace } from '@/contexts/SpaceContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { AppShell } from '@/components/layout/AppShell';
import { Button, Card, FullPageLoader, Notice } from '@/components/ui/primitives';
import { SetupScreen } from '@/pages/SetupScreen';
import { AuthScreen } from '@/pages/AuthScreen';
// As telas internas carregam sob demanda: a abertura não paga pelos gráficos
// (Recharts) nem pelas bibliotecas de relatório de quem só vai ao checklist.
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Checklist = lazy(() => import('@/pages/Checklist').then((m) => ({ default: m.Checklist })));
const Purchases = lazy(() => import('@/pages/Purchases').then((m) => ({ default: m.Purchases })));
const Pending = lazy(() => import('@/pages/Pending').then((m) => ({ default: m.Pending })));
const Finance = lazy(() => import('@/pages/Finance').then((m) => ({ default: m.Finance })));
const Reports = lazy(() => import('@/pages/Reports').then((m) => ({ default: m.Reports })));
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));

/* ─────────────────────────── Barreira de erro ───────────────────────────── */

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Nosso Lar] Erro não tratado:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        <Card className="card-pad w-full max-w-lg">
          <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[#FDF0F0] text-status-critical">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="text-[1.25rem] font-semibold text-ink">Algo saiu do previsto</h1>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-secondary">
            A tela não conseguiu carregar. Recarregar costuma resolver — seus dados estão salvos no
            banco, nada foi perdido.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-xl border border-cream-400 bg-cream-200/70 p-3 font-mono text-[0.75rem] leading-relaxed text-ink-muted">
            {this.state.error.message}
          </pre>
          <Button variant="primary" className="mt-4" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Recarregar a página
          </Button>
        </Card>
      </div>
    );
  }
}

/* ──────────────────────── Roteamento protegido ──────────────────────────── */

function AuthenticatedRoutes() {
  const { loading, spaces, space, error, refresh } = useSpace();

  if (loading) return <FullPageLoader label="Carregando o enxoval…" />;

  // Erro de carga com nenhum dado: mostra a causa e um caminho de saída.
  if (error && spaces.length === 0) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        <Card className="card-pad w-full max-w-lg">
          <Notice tone="critical" icon={<AlertTriangle className="h-4.5 w-4.5" />} title="Não foi possível carregar">
            {error}
          </Notice>
          <Button variant="primary" className="mt-4" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Tentar novamente
          </Button>
        </Card>
      </div>
    );
  }

  // Nenhum espaço e nenhum erro só acontece na janela em que o primeiro está
  // sendo criado — não há tela de entrada em que parar.
  if (!space) return <FullPageLoader label="Preparando o seu espaço…" />;

  return (
    <AppShell>
      <Suspense fallback={<FullPageLoader label="Abrindo a tela…" />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/compras" element={<Purchases />} />
          <Route path="/pendentes" element={<Pending />} />
          <Route path="/financeiro" element={<Finance />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/configuracoes" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

/**
 * Sem conta, só a tela de entrar. A sessão anônima dos aparelhos que usavam
 * o app antes do cadastro também para aqui, para virar conta.
 */
function Gate() {
  const { loading, user, isAnonymous } = useSession();

  if (loading) return <FullPageLoader label="Preparando o Nosso Lar…" />;

  if (!user || isAnonymous) return <AuthScreen />;

  // A chave zera todo o estado do espaço ao trocar de conta: nada da conta
  // anterior pode aparecer, nem por um instante, na seguinte.
  return (
    <SpaceProvider key={user.id}>
      <AuthenticatedRoutes />
    </SpaceProvider>
  );
}

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <ErrorBoundary>
        <SetupScreen />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <SessionProvider>
            <Gate />
          </SessionProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
