/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // === TOKENS DE COR — chapa de esmalte vitrificado ===
        // Ver o contrato de direção em index.html.
        // Primária — o oxblood do trilho de zona e de toda ação principal
        primary: {
          50:  '#FAF1F1',
          100: '#F2DDDE',
          200: '#E0B6B8',
          300: '#C88387',
          400: '#A44D53',
          500: '#7B1E24',  // base — chapa de sinalização
          600: '#661319',  // hover
          700: '#520E13',  // active / pressed
          800: '#3D0A0E',
          900: '#280709',
        },
        // Danger — falha e ação destrutiva. Vermelho sinal, mais claro que o
        // oxblood do trilho para não se confundir com "ação principal".
        danger: {
          50:  '#FDF1EE',
          100: '#F9DAD2',
          500: '#C0341B',
          600: '#A22815',
          700: '#7F1D0F',
        },
        // Success — Disponibilidade. Verde sinal de esmalte.
        success: {
          50:  '#EDF5F1',
          100: '#D2E7DD',
          500: '#12664A',
          600: '#0D5039',
          700: '#0A3D2C',
        },
        // Warning — prazo correndo. Amarelo cromo.
        warning: {
          50:  '#FDF6E3',
          100: '#F9E8BC',
          500: '#E8A200',  // chapa e filete — só sobre campo escuro ou como banda
          600: '#B87E00',  // 3,49:1 sobre branco — NÃO usar em texto
          700: '#8A5E00',  // 5,70:1 — o prazo correndo
          800: '#6B4900',  // 8,15:1 — a última hora, um degrau acima do prazo
        },
        // Surface — porcelana fria. Nunca creme: o campo é esmalte, não papel.
        surface: {
          0:   '#FFFFFF',  // chapa de conteúdo
          50:  '#F2F4F3',  // fundo da página — porcelana
          100: '#E7EAE8',  // campo de input, faixa de tabela
          200: '#D3D8D5',  // filete padrão
          300: '#9BA5A0',  // filete forte / placeholder
          700: '#3C4441',  // texto secundário
          900: '#16191A',  // grafite — texto principal
        },
        // Zonas — codificação por gênero, do jeito que a sinalização do prédio
        // separa seções. Todas passam AA com texto branco por cima.
        zone: {
          oxblood: '#7B1E24',
          verde:   '#12664A',
          petroleo:'#12545F',
          indigo:  '#2B3A72',
          laranja: '#A8471B',
          ameixa:  '#5B2B58',
          oliva:   '#4A5320',
        },
      },
      fontFamily: {
        // Barlow Condensed: voz de sinalização, sempre em caixa alta.
        // Barlow: toda prosa, tabela e controle.
        // Azeret Mono: código de Cópia, ISBN, tempo corrido.
        display: ['"Barlow Condensed"', 'Haettenschweiler', 'Impact', 'sans-serif'],
        sans:    ['Barlow', 'system-ui', 'sans-serif'],
        mono:    ['"Azeret Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs:   ['0.75rem',  { lineHeight: '1rem' }],
        sm:   ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem',     { lineHeight: '1.5rem' }],
        lg:   ['1.125rem', { lineHeight: '1.75rem' }],
        xl:   ['1.25rem',  { lineHeight: '1.75rem' }],
        '2xl':['1.5rem',   { lineHeight: '1.875rem' }],
        '3xl':['2rem',     { lineHeight: '2.125rem' }],
        '4xl':['2.75rem',  { lineHeight: '2.75rem' }],
        '5xl':['3.75rem',  { lineHeight: '3.5rem' }],
      },
      letterSpacing: {
        // Caixa alta de sinalização pede abertura; a condensada em display aperta.
        placa: '0.08em',
        legenda: '0.14em',
      },
      spacing: {
        // Escala de espaçamento — apenas múltiplos de 4px
        // 1=4px, 2=8px, 3=12px, 4=16px, 5=20px, 6=24px, 8=32px, 10=40px, 12=48px, 16=64px
        // Não usar valores arbitrários fora desta escala
      },
      borderRadius: {
        // Esmalte é cortado, não moldado. O raio existe para não ferir, não para
        // suavizar: 2px em tudo, e `full` só sobrevive para o spinner.
        none: '0',
        sm:   '2px',
        DEFAULT: '2px',
        md:   '2px',
        lg:   '2px',
        xl:   '2px',
        full: '9999px',
      },
      boxShadow: {
        // Chapa é plana. Separação é filete, não elevação — só o modal, que
        // realmente flutua sobre a página, ganha profundidade.
        sm:     'none',
        DEFAULT:'none',
        md:     'none',
        lg:     'none',
        modal:  '0 24px 64px -12px rgb(22 25 26 / 0.45)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
