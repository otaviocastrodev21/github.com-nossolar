/**
 * Onde o Nosso Lar está rodando.
 *
 * O mesmo código atende três formas de uso:
 *   · aba do navegador;
 *   · aplicativo instalado pelo navegador (PWA), em qualquer sistema;
 *   · aplicativo de computador empacotado com Electron.
 *
 * Cada uma muda pequenos detalhes da interface — oferecer instalação só faz
 * sentido na primeira, por exemplo.
 */

export interface DesktopBridge {
  isDesktop: true;
  platform: NodeJS.Platform | string;
  versions: { electron: string; chrome: string };
  onNavigate: (callback: (path: string) => void) => () => void;
  onRefresh: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    nossoLar?: DesktopBridge;
  }
}

/** A ponte do Electron, quando existe. */
export const desktop: DesktopBridge | null =
  typeof window !== 'undefined' && window.nossoLar?.isDesktop ? window.nossoLar : null;

export const isDesktop = (): boolean => desktop !== null;

/** Instalado e aberto fora do navegador (PWA ou Electron). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (isDesktop()) return true;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (window.matchMedia?.('(display-mode: minimal-ui)').matches) return true;
  // Safari no iOS usa uma propriedade própria.
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

/** iPhone e iPad: a instalação é manual, pelo menu Compartilhar. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Nome amigável do sistema, para textos de ajuda. */
export function platformLabel(): string {
  if (typeof navigator === 'undefined') return 'seu dispositivo';
  const value = desktop?.platform ?? '';
  if (value === 'win32') return 'Windows';
  if (value === 'darwin') return 'macOS';
  if (value === 'linux') return 'Linux';

  const ua = navigator.userAgent;
  if (isIOS()) return 'iPhone ou iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'seu dispositivo';
}

/**
 * Evento que o Chrome, o Edge e os navegadores derivados disparam quando a
 * instalação é possível. Guardamos para oferecer no momento certo.
 */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
