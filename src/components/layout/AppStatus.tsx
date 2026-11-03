import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { CloudOff, Download, RefreshCw, Share, SquarePlus, X } from 'lucide-react';
import clsx from 'clsx';
import { Button } from '@/components/ui/primitives';
import { VIZ } from '@/lib/viz';
import {
  isDesktop,
  isIOS,
  isStandalone,
  platformLabel,
  type InstallPromptEvent,
} from '@/lib/runtime';

const DISMISS_KEY = 'nosso-lar.instalar-dispensado';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* preferência sem importância se falhar */
  }
}

/* ═══════════════════════════ Faixa de conexão ═════════════════════════════
   Os dados moram no Supabase: sem rede, o que está na tela pode envelhecer.
   Dizer isso é mais honesto do que deixar a pessoa achar que salvou.         */

export function ConnectionBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-status-serious/45 bg-tint-serious px-4 py-3"
    >
      <CloudOff className="h-4.5 w-4.5 shrink-0" style={{ color: VIZ.status.serious }} aria-hidden />
      <p className="min-w-0 flex-1 text-[0.875rem] leading-relaxed text-ink">
        <strong className="font-semibold">Sem conexão.</strong> Você continua navegando pelo que já
        foi carregado, mas novos registros só serão salvos quando a internet voltar.
      </p>
    </div>
  );
}

/* ═══════════════════════ Nova versão disponível ═══════════════════════════
   Atualização nunca é automática: trocar a página no meio do cadastro de uma
   compra perderia o que a pessoa digitou.                                    */

export function UpdatePrompt() {
  // No aplicativo de computador quem atualiza é o instalador, então nem
  // registramos o service worker. O teste é estável durante toda a sessão.
  return isDesktop() ? null : <WebUpdatePrompt />;
}

function WebUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn('[Nosso Lar] Service worker não registrado:', error);
    },
  });

  const [applying, setApplying] = useState(false);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="pointer-events-auto fixed inset-x-4 bottom-4 z-[55] mx-auto w-auto max-w-sm animate-rise-in
                 rounded-xl border border-cream-400 bg-cream-50 p-4 shadow-pop sm:inset-x-auto sm:right-4"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-olive-100 text-olive-700">
          <Download className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-semibold text-ink">Nova versão disponível</p>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-muted">
            Atualize quando terminar o que está fazendo. Nada do que já foi salvo se perde.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={applying}
              onClick={() => {
                setApplying(true);
                void updateServiceWorker(true);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Atualizar agora
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
              Depois
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════ Convite para instalar ══════════════════════════ */

export function InstallPrompt() {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(() => readDismissed());

  useEffect(() => {
    if (isDesktop() || isStandalone() || readDismissed()) return;

    const onPrompt = (incoming: Event) => {
      incoming.preventDefault(); // guardamos para oferecer na hora certa
      setEvent(incoming as InstallPromptEvent);
    };

    const onInstalled = () => {
      setEvent(null);
      setIosHint(false);
      writeDismissed();
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // O Safari não dispara o evento: explicamos o caminho manual.
    let timer: number | undefined;
    if (isIOS()) {
      timer = window.setTimeout(() => setIosHint(true), 12_000);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const visible = !dismissed && (event !== null || iosHint);
  if (!visible) return null;

  const close = () => {
    setDismissed(true);
    writeDismissed();
  };

  const install = async () => {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
    writeDismissed();
  };

  return (
    <div
      className={clsx(
        'pointer-events-auto fixed inset-x-4 bottom-20 z-[54] mx-auto w-auto max-w-sm animate-rise-in',
        'rounded-xl border border-wood-300 bg-wood-100 p-4 shadow-pop',
        'sm:inset-x-auto sm:right-4 sm:bottom-4',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cream-50 text-wood-600">
          <SquarePlus className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-semibold text-ink">
            Instale o Nosso Lar no {platformLabel()}
          </p>

          {event ? (
            <>
              <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-secondary">
                Fica com ícone próprio, abre em janela separada e some a barra do navegador.
              </p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="wood" onClick={() => void install()}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Instalar
                </Button>
                <Button size="sm" variant="ghost" onClick={close}>
                  Agora não
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[0.8125rem] leading-relaxed text-ink-secondary">
              Toque em
              <Share className="inline h-3.5 w-3.5 text-ink" aria-label="Compartilhar" />
              <strong className="font-medium text-ink">Compartilhar</strong>
              e depois em
              <strong className="font-medium text-ink">Adicionar à Tela de Início</strong>.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={close}
          aria-label="Dispensar convite de instalação"
          className="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition hover:bg-wood-200 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
