/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.{js,ts,tsx}', './components/**/*.{js,ts,tsx}'],
  darkMode: 'class', // ← 追加
  presets: [require('nativewind/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};
