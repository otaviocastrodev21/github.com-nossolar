/**
 * Testes das peças que só existem no aplicativo instalável: aviso de conexão,
 * convite de instalação e detecção do ambiente.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConnectionBanner, InstallPrompt } from './AppStatus';
import { isIOS, isStandalone, platformLabel } from '@/lib/runtime';

const setOnline = (value: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
};

const setUserAgent = (value: string) => {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
};

const setTouchPoints = (value: number) => {
  Object.defineProperty(window.navigator, 'maxTouchPoints', { value, configurable: true });
};

/** jsdom não implementa matchMedia. */
const stubMatchMedia = (matches: (query: string) => boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
};

const originalUserAgent = window.navigator.userAgent;

beforeEach(() => {
  setOnline(true);
  setUserAgent(originalUserAgent);
  setTouchPoints(0);
  stubMatchMedia(() => false);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/* ═══════════════════════════ Aviso de conexão ═════════════════════════════ */

describe('ConnectionBanner', () => {
  it('fica fora do caminho quando há internet', () => {
    setOnline(true);
    const { container } = render(<ConnectionBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('avisa que novos registros não serão salvos quando a conexão cai', () => {
    setOnline(false);
    render(<ConnectionBanner />);

    const aviso = screen.getByRole('status');
    expect(aviso).toHaveTextContent('Sem conexão.');
    expect(aviso).toHaveTextContent(/só serão salvos quando a internet voltar/);
  });

  it('aparece e some acompanhando os eventos do navegador', () => {
    setOnline(true);
    render(<ConnectionBanner />);
    expect(screen.queryByRole('status')).toBeNull();

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toBeTruthy();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

/* ════════════════════════ Convite para instalar ═══════════════════════════ */

function fireInstallPrompt() {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' as const });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe('InstallPrompt', () => {
  it('não aparece antes de o navegador dizer que dá para instalar', () => {
    const { container } = render(<InstallPrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('oferece a instalação quando o navegador avisa', () => {
    render(<InstallPrompt />);
    fireInstallPrompt();

    expect(screen.getByText(/Instale o Nosso Lar/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Instalar/ })).toBeTruthy();
  });

  it('chama o navegador ao confirmar a instalação', async () => {
    render(<InstallPrompt />);
    const event = fireInstallPrompt();

    fireEvent.click(screen.getByRole('button', { name: /Instalar/ }));
    await act(async () => {
      await event.userChoice;
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it('não insiste depois de dispensado', () => {
    const primeira = render(<InstallPrompt />);
    fireInstallPrompt();
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    expect(screen.queryByText(/Instale o Nosso Lar/)).toBeNull();

    // Em uma nova visita, continua dispensado.
    primeira.unmount();
    const { container } = render(<InstallPrompt />);
    fireInstallPrompt();
    expect(container).toBeEmptyDOMElement();
  });

  it('não oferece nada quando já está instalado', () => {
    stubMatchMedia((query) => query.includes('standalone'));
    const { container } = render(<InstallPrompt />);
    fireInstallPrompt();
    expect(container).toBeEmptyDOMElement();
  });

  it('no iPhone, explica o caminho manual do Safari', () => {
    vi.useFakeTimers();
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
    render(<InstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(13_000);
    });

    expect(screen.getByText(/Adicionar à Tela de Início/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Instalar/ })).toBeNull();
  });
});

/* ═══════════════════════ Detecção do ambiente ═════════════════════════════ */

describe('detecção do ambiente', () => {
  it('reconhece a janela instalada', () => {
    stubMatchMedia(() => false);
    expect(isStandalone()).toBe(false);

    stubMatchMedia((query) => query.includes('standalone'));
    expect(isStandalone()).toBe(true);
  });

  it('reconhece iPhone, iPad e o resto', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(isIOS()).toBe(true);

    // iPad moderno se apresenta como Macintosh, mas aceita toque.
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    setTouchPoints(5);
    expect(isIOS()).toBe(true);

    setTouchPoints(0);
    expect(isIOS()).toBe(false);
  });

  it('dá nome ao sistema para usar nos textos', () => {
    setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(platformLabel()).toBe('Windows');

    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(platformLabel()).toBe('macOS');

    setUserAgent('Mozilla/5.0 (X11; Linux x86_64)');
    expect(platformLabel()).toBe('Linux');

    setUserAgent('Mozilla/5.0 (Linux; Android 14)');
    expect(platformLabel()).toBe('Android');

    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(platformLabel()).toBe('iPhone ou iPad');
  });
});
