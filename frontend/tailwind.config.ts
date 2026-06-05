import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#f7f7f4',
        ink: '#171717',
        muted: '#6f6f69',
        line: '#deded7',
      },
      boxShadow: {
        executive: '0 18px 50px rgba(17, 24, 39, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
