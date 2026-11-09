/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        ink: { 950: '#04252B', 900: '#07323A', 800: '#0B434C', 700: '#115661', 300: '#7FB8B2', 200: '#A9D2CD' },
        brand: { 50: '#ECFAF7', 100: '#D0F2EB', 500: '#14A596', 600: '#0F8F83', 700: '#0B7269' },
        canvas: '#F3F7F8',
        line: '#E3ECEE',
      },
      boxShadow: {
        card: '0 1px 2px rgba(7,50,58,.04), 0 6px 18px -8px rgba(7,50,58,.10)',
        lift: '0 2px 4px rgba(7,50,58,.05), 0 14px 28px -12px rgba(7,50,58,.18)',
      },
      borderRadius: { xl2: '1.125rem' },
    },
  },
  plugins: [],
};
