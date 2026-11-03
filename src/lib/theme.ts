import { useSyncExternalStore } from 'react';

/**
 * Tema claro, escuro ou o do sistema.
 *
 * O CSS já segue o sistema sozinho (`prefers-color-scheme`), antes de qualquer
 * JavaScript. Este módulo só entra quando a pessoa escolhe: grava a escolha e
 * põe `.light` ou `.dark` no <html>, o que vence a preferência do sistema.
 * Importado primeiro em main.tsx, para a classe estar lá antes da primeira
 * pintura do React.
 */

export type ThemeMode = 'system' | 'light' | 'dark';

const CHAVE = 'nosso-lar-tema';
const ouvintes = new Set<() => void>();

const consulta =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function lerModo(): ThemeMode {
  try {
    const salvo = localStorage.getItem(CHAVE);
    return salvo === 'light' || salvo === 'dark' ? salvo : 'system';
  } catch {
    return 'system';
  }
}

let modo: ThemeMode = typeof window !== 'undefined' ? lerModo() : 'system';

export function resolvedTheme(m: ThemeMode = modo): 'light' | 'dark' {
  if (m !== 'system') return m;
  return consulta?.matches ? 'dark' : 'light';
}

function aplicar() {
  if (typeof document === 'undefined') return;
  const raiz = document.documentElement;
  raiz.classList.toggle('dark', modo === 'dark');
  raiz.classList.toggle('light', modo === 'light');

  // A barra do navegador e a do sistema no celular acompanham o fundo.
  const cor = resolvedTheme() === 'dark' ? '#121110' : '#F7F6F2';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cor);
}

export function setThemeMode(proximo: ThemeMode) {
  modo = proximo;
  try {
    if (proximo === 'system') localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, proximo);
  } catch {
    // Sem armazenamento (modo privado), a escolha vale até fechar.
  }
  aplicar();
  ouvintes.forEach((avisar) => avisar());
}

consulta?.addEventListener?.('change', () => {
  aplicar();
  ouvintes.forEach((avisar) => avisar());
});

aplicar();

function inscrever(avisar: () => void) {
  ouvintes.add(avisar);
  return () => ouvintes.delete(avisar);
}

/** Modo escolhido e o tema que está de fato na tela. */
export function useTheme() {
  const atual = useSyncExternalStore(inscrever, () => modo, () => 'system' as ThemeMode);
  const efetivo = useSyncExternalStore(
    inscrever,
    () => resolvedTheme(),
    () => 'light' as const,
  );
  return { mode: atual, resolved: efetivo, setMode: setThemeMode };
}
