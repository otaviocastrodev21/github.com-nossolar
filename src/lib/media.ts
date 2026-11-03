import { useSyncExternalStore } from 'react';

/**
 * Acompanha uma media query e re-renderiza quando ela muda (girar o tablet,
 * redimensionar a janela).
 *
 * Só para o que CSS não alcança — tipicamente os gráficos, cujas margens e
 * larguras de eixo são números passados ao Recharts. Layout é com classes
 * responsivas do Tailwind, nunca com isto.
 *
 * Sem `matchMedia` (jsdom nos testes, renderização no servidor), responde
 * `false`: a versão larga, que é a que os testes conhecem.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const lista = typeof window !== 'undefined' ? window.matchMedia?.(query) : undefined;
      if (!lista) return () => {};
      lista.addEventListener('change', avisar);
      return () => lista.removeEventListener('change', avisar);
    },
    () => (typeof window !== 'undefined' ? window.matchMedia?.(query).matches ?? false : false),
    () => false,
  );
}

/** Abaixo do breakpoint `sm` do Tailwind (640px): celular em pé. */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 639.98px)');
}
