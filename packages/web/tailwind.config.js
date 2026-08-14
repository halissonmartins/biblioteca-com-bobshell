/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // === TOKENS DE COR ===
        // Primária — ações principais (reservar, emprestar, devolver)
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',  // base
          600: '#2563eb',  // hover
          700: '#1d4ed8',  // active / pressed
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Danger — ações destrutivas, erros
        danger: {
          50:  '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',  // base
          600: '#dc2626',  // hover
          700: '#b91c1c',
        },
        // Success — confirmações, disponibilidade
        success: {
          50:  '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',  // base
          600: '#16a34a',  // hover
          700: '#15803d',
        },
        // Warning — reservas próximas de expirar
        warning: {
          50:  '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',  // base
          600: '#d97706',
        },
        // Surface — fundos, cards, bordas
        surface: {
          0:   '#ffffff',  // fundo de card / modal
          50:  '#f8fafc',  // fundo da página
          100: '#f1f5f9',  // fundo de input, tabela zebrada
          200: '#e2e8f0',  // borda padrão
          300: '#cbd5e1',  // borda de foco (sem foco)
          700: '#334155',  // texto secundário
          900: '#0f172a',  // texto principal
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Escala tipográfica
        xs:   ['0.75rem',  { lineHeight: '1rem' }],
        sm:   ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem',     { lineHeight: '1.5rem' }],
        lg:   ['1.125rem', { lineHeight: '1.75rem' }],
        xl:   ['1.25rem',  { lineHeight: '1.75rem' }],
        '2xl':['1.5rem',   { lineHeight: '2rem' }],
        '3xl':['1.875rem', { lineHeight: '2.25rem' }],
      },
      spacing: {
        // Escala de espaçamento — apenas múltiplos de 4px
        // 1=4px, 2=8px, 3=12px, 4=16px, 5=20px, 6=24px, 8=32px, 10=40px, 12=48px, 16=64px
        // Não usar valores arbitrários fora desta escala
      },
      borderRadius: {
        none: '0',
        sm:   '0.25rem',   // 4px — inputs pequenos
        DEFAULT: '0.375rem', // 6px — padrão
        md:   '0.5rem',    // 8px — cards, modais
        lg:   '0.75rem',   // 12px — cards grandes
        xl:   '1rem',      // 16px — banners
        full: '9999px',    // badges, avatares
      },
      boxShadow: {
        sm:     '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        DEFAULT:'0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        md:     '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        lg:     '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        // Sombra de modal
        modal:  '0 20px 60px -10px rgb(0 0 0 / 0.3)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
