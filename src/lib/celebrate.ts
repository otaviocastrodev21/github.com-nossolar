/**
 * Confete leve, sem dependência: um <canvas> por cima da tela durante ~2,5 s.
 * Não faz nada se a pessoa pediu menos movimento.
 */

const CORES = ['#78815C', '#9BA382', '#C6A77D', '#DABF9B', '#434A2A', '#F0DCC3', '#FAB219'];

interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  giro: number;
  vg: number;
  w: number;
  h: number;
  cor: string;
  vida: number;
}

let ativo = false;

export function celebrate(opcoes: { origin?: { x: number; y: number }; amount?: number } = {}) {
  if (typeof window === 'undefined' || ativo) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ativo = true;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const largura = window.innerWidth;
  const altura = window.innerHeight;
  canvas.width = largura * dpr;
  canvas.height = altura * dpr;
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '80',
  });
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  ctx.scale(dpr, dpr);

  const ox = (opcoes.origin?.x ?? 0.5) * largura;
  const oy = (opcoes.origin?.y ?? 0.35) * altura;
  const total = opcoes.amount ?? 110;

  const particulas: Particula[] = Array.from({ length: total }, () => {
    const angulo = Math.random() * Math.PI * 2;
    const forca = 4 + Math.random() * 7;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(angulo) * forca,
      vy: Math.sin(angulo) * forca - 5,
      giro: Math.random() * Math.PI,
      vg: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 4,
      cor: CORES[Math.floor(Math.random() * CORES.length)],
      vida: 1,
    };
  });

  const inicio = performance.now();
  const passo = (agora: number) => {
    const decorrido = agora - inicio;
    ctx.clearRect(0, 0, largura, altura);
    for (const p of particulas) {
      p.vy += 0.22;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.giro += p.vg;
      p.vida = Math.max(0, 1 - decorrido / 2600);
      ctx.save();
      ctx.globalAlpha = p.vida;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.fillStyle = p.cor;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.giro * 2)));
      ctx.restore();
    }
    if (decorrido < 2600) requestAnimationFrame(passo);
    else {
      canvas.remove();
      ativo = false;
    }
  };
  requestAnimationFrame(passo);
}
