/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Cada tom é uma variável (canais RGB): o tema escuro troca os valores em
      // index.css, e todas as classes — bg-cream-100, text-ink, ring-olive-300 —
      // acompanham sem precisar de `dark:` em cada componente. As rampas são
      // invertidas no escuro, então "50 sobre 600" continua sendo claro sobre
      // escuro ou escuro sobre claro, sempre com contraste.
      colors: {
        // ——— Identidade visual "Nosso Lar" ———
        // Superfícies quentes (no claro, branco quente; no escuro, grafite quente)
        cream: {
          50: 'rgb(var(--cream-50) / <alpha-value>)',
          100: 'rgb(var(--cream-100) / <alpha-value>)',
          200: 'rgb(var(--cream-200) / <alpha-value>)',
          300: 'rgb(var(--cream-300) / <alpha-value>)',
          400: 'rgb(var(--cream-400) / <alpha-value>)',
        },
        // Bege / greige: bordas e neutros
        greige: {
          100: 'rgb(var(--greige-100) / <alpha-value>)',
          200: 'rgb(var(--greige-200) / <alpha-value>)',
          300: 'rgb(var(--greige-300) / <alpha-value>)',
          400: 'rgb(var(--greige-400) / <alpha-value>)',
          500: 'rgb(var(--greige-500) / <alpha-value>)',
        },
        // Madeira clara
        wood: {
          100: 'rgb(var(--wood-100) / <alpha-value>)',
          200: 'rgb(var(--wood-200) / <alpha-value>)',
          300: 'rgb(var(--wood-300) / <alpha-value>)',
          400: 'rgb(var(--wood-400) / <alpha-value>)',
          500: 'rgb(var(--wood-500) / <alpha-value>)',
          600: 'rgb(var(--wood-600) / <alpha-value>)',
        },
        // Verde-oliva: progresso, conclusão e ações positivas
        olive: {
          100: 'rgb(var(--olive-100) / <alpha-value>)',
          200: 'rgb(var(--olive-200) / <alpha-value>)',
          300: 'rgb(var(--olive-300) / <alpha-value>)',
          400: 'rgb(var(--olive-400) / <alpha-value>)',
          500: 'rgb(var(--olive-500) / <alpha-value>)',
          600: 'rgb(var(--olive-600) / <alpha-value>)',
          700: 'rgb(var(--olive-700) / <alpha-value>)',
          800: 'rgb(var(--olive-800) / <alpha-value>)',
        },
        // Tinta
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          secondary: 'rgb(var(--ink-secondary) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
        },
        // Fundos de aviso, um por status
        tint: {
          warning: 'rgb(var(--tint-warning) / <alpha-value>)',
          serious: 'rgb(var(--tint-serious) / <alpha-value>)',
          critical: 'rgb(var(--tint-critical) / <alpha-value>)',
        },
        // Véu atrás de modais e gavetas: escuro nos dois temas
        scrim: '#0E0D0B',
        // Status (escala fixa, sempre com ícone + rótulo)
        status: {
          good: '#0CA30C',
          warning: '#FAB219',
          serious: '#EC835A',
          critical: '#D03B3B',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '"Segoe UI Variable"',
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem', '3xl': '1.5rem' },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        pop: 'var(--shadow-pop)',
        glow: '0 0 0 1px rgb(var(--olive-500) / 0.25), 0 8px 30px -6px rgb(var(--olive-500) / 0.45)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(14px) scale(0.99)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        grow: { from: { transform: 'scaleX(0)' }, to: { transform: 'scaleX(1)' } },
        // troca de tela: sobe, aparece e sai do desfoque
        'page-in': {
          from: { opacity: '0', transform: 'translateY(10px)', filter: 'blur(4px)' },
          to: { opacity: '1', transform: 'none', filter: 'none' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'scale(0.92)' },
          '60%': { opacity: '1', transform: 'scale(1.02)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        shimmer: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(100%)' } },
        draw: { from: { strokeDashoffset: 'var(--draw-length, 60)' }, to: { strokeDashoffset: '0' } },
        'soft-pulse': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.55', transform: 'scale(0.96)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out both',
        'rise-in': 'rise-in 220ms cubic-bezier(0.22,1,0.36,1) both',
        'slide-up': 'slide-up 240ms cubic-bezier(0.22,1,0.36,1) both',
        grow: 'grow 900ms cubic-bezier(0.22,1,0.36,1) both',
        'page-in': 'page-in 420ms cubic-bezier(0.22,1,0.36,1) both',
        'pop-in': 'pop-in 420ms cubic-bezier(0.22,1,0.36,1) both',
        float: 'float 5s ease-in-out infinite',
        shimmer: 'shimmer 2.4s ease-in-out infinite',
        draw: 'draw 900ms cubic-bezier(0.65,0,0.35,1) both',
        'soft-pulse': 'soft-pulse 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [
    // `touch:` vale onde o ponteiro é um dedo (celular, tablet), não pela
    // largura: um notebook estreito com mouse não precisa de alvos maiores, e
    // um tablet deitado com 1024px precisa.
    ({ addVariant }) => {
      addVariant('touch', '@media (pointer: coarse)');
      // `mouse:` para o que só faz sentido com hover de verdade — revelar
      // ações ao passar o cursor. Num tablet não há cursor para passar.
      addVariant('mouse', '@media (hover: hover) and (pointer: fine)');
    },
  ],
};
