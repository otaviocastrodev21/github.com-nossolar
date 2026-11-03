/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ——— Identidade visual "Nosso Lar" ———
        // Branco quente predominante
        cream: {
          50: '#FDFCFA',
          100: '#F7F6F2', // branco quente (marca)
          200: '#F2EFE8',
          300: '#EFECE4',
          400: '#E6E3DA', // hairline / gridlines
        },
        // Bege / greige
        greige: {
          100: '#EDEAE3',
          200: '#E2DED5',
          300: '#D6D0C6', // bege/greige (marca)
          400: '#C3BCAE',
          500: '#A8A196',
        },
        // Madeira clara
        wood: {
          100: '#FAEEDF',
          200: '#F0DCC3',
          300: '#DABF9B',
          400: '#C6A77D', // madeira clara (marca)
          500: '#AE8C5B',
          600: '#906D3B', // 4.38:1 — ok para texto
        },
        // Verde-oliva: progresso, conclusão e ações positivas (rampa ordinal validada)
        olive: {
          100: '#EFF2E7',
          200: '#DEE2D1',
          300: '#C1C8AE',
          400: '#9BA382', // 2.44:1 — fills com rótulo/tabela
          500: '#78815C', // 3.81:1 — série principal dos gráficos
          600: '#5C643F', // 5.80:1 — linhas, texto de apoio
          700: '#434A2A', // 8.62:1 — passo final da rampa
          800: '#2B3117',
        },
        // Preto fosco: textos e elementos pontuais
        ink: {
          DEFAULT: '#242424',
          secondary: '#5C5A53',
          muted: '#7A776D',
        },
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
        card: '0 1px 2px rgba(36,36,36,0.04), 0 4px 16px -8px rgba(36,36,36,0.10)',
        'card-hover': '0 2px 4px rgba(36,36,36,0.05), 0 10px 28px -10px rgba(36,36,36,0.16)',
        pop: '0 8px 36px -10px rgba(36,36,36,0.28)',
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
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out both',
        'rise-in': 'rise-in 220ms cubic-bezier(0.22,1,0.36,1) both',
        'slide-up': 'slide-up 240ms cubic-bezier(0.22,1,0.36,1) both',
        grow: 'grow 520ms cubic-bezier(0.22,1,0.36,1) both',
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
