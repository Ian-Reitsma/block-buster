/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        // Background system (from tokens)
        'bg-base': 'rgb(var(--bg) / <alpha-value>)',
        'panel-black': 'rgb(var(--panel) / <alpha-value>)',
        'panel-2': 'rgb(var(--panel-2) / <alpha-value>)',
        'panel-3': 'rgb(var(--panel-3) / <alpha-value>)',
        
        // Primary palette (from tokens)
        'block-purple': 'rgb(var(--purple) / <alpha-value>)',
        'block-amber': 'rgb(var(--amber) / <alpha-value>)',
        'block-cyan': 'rgb(var(--cyan) / <alpha-value>)',
        'block-green': 'rgb(var(--green) / <alpha-value>)',
        'block-blue': 'rgb(var(--blue) / <alpha-value>)',
        
        // Accent variants (from tokens)
        'accent': 'rgb(var(--accent) / <alpha-value>)',
        'accent-bright': 'rgb(var(--accent-bright) / <alpha-value>)',
        'blade-amber': 'rgb(var(--accent-bright) / <alpha-value>)',
        'cyan-glow': 'rgb(var(--accent-alt-bright) / <alpha-value>)',
        
        // Status colors (from tokens)
        'status': {
          'ok': 'rgb(var(--good) / <alpha-value>)',
          'warn': 'rgb(var(--warn) / <alpha-value>)',
          'bad': 'rgb(var(--bad) / <alpha-value>)',
          'info': 'rgb(var(--info) / <alpha-value>)'
        },
        
        // Semantic shortcuts
        'good': 'rgb(var(--good) / <alpha-value>)',
        'warn': 'rgb(var(--warn) / <alpha-value>)',
        'bad': 'rgb(var(--bad) / <alpha-value>)',
        'info': 'rgb(var(--info) / <alpha-value>)'
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['IBM Plex Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      fontSize: {
        'xs': 'var(--text-xs)',
        'sm': 'var(--text-sm)',
        'md': 'var(--text-md)',
        'lg': 'var(--text-lg)',
        'xl': 'var(--text-xl)',
        'kpi': 'var(--text-kpi)'
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem'
      },
      borderRadius: {
        'sm': 'var(--radius-sm)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)'
      },
      boxShadow: {
        'sm': 'var(--shadow-1)',
        'md': 'var(--shadow-2)',
        'lg': 'var(--shadow-3)',
        'glow-amber': 'var(--shadow-glow-amber)',
        'glow-cyan': 'var(--shadow-glow-cyan)'
      },
      transitionDuration: {
        '150': 'var(--dur-1)',
        '200': 'var(--dur-2)',
        '300': 'var(--dur-3)',
        '500': 'var(--dur-4)',
        '700': 'var(--dur-5)'
      },
      transitionTimingFunction: {
        'ease': 'var(--ease)',
        'ease-in': 'var(--ease-in)',
        'ease-out': 'var(--ease-out)',
        'bounce': 'var(--ease-bounce)'
      },
      animation: {
        'pulse-subtle': 'pulse 3s var(--ease) infinite',
        'fade-in': 'fadeIn var(--dur-4) var(--ease-in)',
        'slide-up': 'slideUp var(--dur-3) var(--ease-out)'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' }
        }
      }
    }
  },
  plugins: []
};
