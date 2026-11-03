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
 * Luz que segue o mouse dentro dos cartões.
 *
 * Um único elemento (.card-spot) é levado para dentro do cartão sob o
 * ponteiro; o brilho é pintado uma vez e o movimento é só `transform`, que o
 * navegador resolve na placa de vídeo sem repintar nem recalcular o cartão.
 * Antes eram variáveis CSS no próprio cartão: elas são herdadas, então cada
 * movimento recalculava o estilo de todas as linhas dentro dele e repintava
 * um degradê do tamanho do cartão.
 *
 * Só com mouse — num toque não há "passar por cima" —, nunca com "reduzir
 * movimento", e não nos cartões muito altos (uma categoria inteira do
 * Checklist): neles a luz mal se nota e compor a camada custa caro.
 */
const ALTURA_MAXIMA = 640;

export function useSpotlight() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const luz = document.createElement('span');
    luz.className = 'card-spot';
    luz.setAttribute('aria-hidden', 'true');
    const brilho = document.createElement('span');
    luz.appendChild(brilho);

    let cartao: HTMLElement | null = null;
    let caixa: DOMRect | null = null;
    let x = 0;
    let y = 0;
    let quadro = 0;

    const pintar = () => {
      quadro = 0;
      if (!cartao) return;
      // A caixa é lida uma vez por quadro, no máximo; só muda com rolagem.
      if (!caixa) caixa = cartao.getBoundingClientRect();
      brilho.style.transform = `translate3d(${x - caixa.left}px, ${y - caixa.top}px, 0)`;
    };

    const sair = () => {
      luz.removeAttribute('data-on');
      cartao = null;
      caixa = null;
    };

    const mover = (evento: PointerEvent) => {
      x = evento.clientX;
      y = evento.clientY;
      let alvo = (evento.target as Element | null)?.closest?.('.card') as HTMLElement | null;
      if (alvo && alvo !== cartao && alvo.offsetHeight > ALTURA_MAXIMA) alvo = null;
      if (alvo !== cartao) {
        if (!alvo) {
          if (cartao) sair();
          return;
        }
        cartao = alvo;
        caixa = null;
        alvo.appendChild(luz);
        luz.setAttribute('data-on', '');
      }
      if (!quadro) quadro = requestAnimationFrame(pintar);
    };

    const rolou = () => {
      caixa = null;
    };

    document.addEventListener('pointermove', mover, { passive: true });
    document.addEventListener('pointerleave', sair);
    window.addEventListener('scroll', rolou, { passive: true, capture: true });
    window.addEventListener('resize', rolou, { passive: true });
    return () => {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerleave', sair);
      window.removeEventListener('scroll', rolou, { capture: true });
      window.removeEventListener('resize', rolou);
      if (quadro) cancelAnimationFrame(quadro);
      luz.remove();
    };
  }, []);
}
