/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F6F7F9',
        },
        ink: {
          DEFAULT: '#0F172A',
          muted: '#64748B',
        },
        line: '#E5E8ED',
      },
      // Layered key + ambient shadows tuned for tiles on a white canvas.
      boxShadow: {
        tile: '0 1px 2px rgba(15,23,42,0.05), 0 4px 12px -2px rgba(15,23,42,0.08)',
        'tile-hover': '0 2px 4px rgba(15,23,42,0.05), 0 12px 28px -8px rgba(15,23,42,0.16)',
        pop: '0 4px 8px -2px rgba(15,23,42,0.08), 0 28px 56px -12px rgba(15,23,42,0.22)',
        rail: '0 1px 2px rgba(15,23,42,0.04), 0 2px 8px -2px rgba(15,23,42,0.06)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'none' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.25s ease-out both',
        'fade-in': 'fade-in 0.2s ease-out both',
        'slide-in': 'slide-in 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
      },
    },
  },
  safelist: ['shadow-rail', 'shadow-tile', 'shadow-tile-hover', 'shadow-pop'],
  plugins: [],
}
