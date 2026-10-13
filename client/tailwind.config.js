/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        // DnD-themed dark palette
        parchment: {
          50: '#fdf8f0',
          100: '#f9edda',
          200: '#f0d9b0',
        },
        dragon: {
          400: '#e74c3c',  // lighter red — used for text and borders
          500: '#c0392b',  // primary red
          600: '#a93226',
          700: '#8e2219',
        },
        dungeon: {
          700: '#22223b',  // slightly lighter than 800
          800: '#1a1a2e',
          900: '#0f0f1a',
        },
      },
    },
  },
  plugins: [],
};
