import { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from './media';

/** A pessoa pediu ao sistema menos movimento. */
export function useReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

const suave = (t: number) => 1 - Math.pow(1 - t, 4);

/**
 * Número que sobe até o valor (e desliza entre valores quando ele muda).
 * Sem movimento pedido, ou sem requestAnimationFrame, vai direto ao valor.
 */
export function useCountUp(alvo: number, duracao = 900) {
  const reduzido = useReducedMotion();
  const [valor, setValor] = useState(reduzido ? alvo : 0);
  const atual = useRef(reduzido ? alvo : 0);

  useEffect(() => {
    if (reduzido || typeof requestAnimationFrame !== 'function' || !Number.isFinite(alvo)) {
      atual.current = alvo;
      setValor(alvo);
      return;
    }
    const de = atual.current;
    const inicio = performance.now();
    let quadro = 0;
    const passo = (agora: number) => {
      const t = Math.min((agora - inicio) / duracao, 1);
      const v = de + (alvo - de) * suave(t);
      atual.current = v;
      setValor(v);
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [alvo, duracao, reduzido]);

  return valor;
}

/**
 * Luz que segue o mouse dentro de cada `.card`: um único ouvinte no
 * documento grava a posição do ponteiro em --mx/--my do cartão sob ele.
 * Só com mouse — num toque não há "passar por cima".
 */
export function useSpotlight() {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) {
      return;
    }
    let pendente: { el: HTMLElement; x: number; y: number } | null = null;
    let quadro = 0;

    const pintar = () => {
      quadro = 0;
      if (!pendente) return;
      pendente.el.style.setProperty('--mx', `${pendente.x}px`);
      pendente.el.style.setProperty('--my', `${pendente.y}px`);
      pendente = null;
    };

    const mover = (evento: PointerEvent) => {
      const alvo = (evento.target as Element | null)?.closest?.('.card') as HTMLElement | null;
      if (!alvo) return;
      const caixa = alvo.getBoundingClientRect();
      pendente = { el: alvo, x: evento.clientX - caixa.left, y: evento.clientY - caixa.top };
      if (!quadro) quadro = requestAnimationFrame(pintar);
    };

    document.addEventListener('pointermove', mover, { passive: true });
    return () => {
      document.removeEventListener('pointermove', mover);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, []);
}
