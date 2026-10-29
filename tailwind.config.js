/** @type {import('tailwindcss').Config} */
// สีระบบแบบ iOS (เปลี่ยนตามโหมดสว่าง/มืดผ่านตัวแปรใน globals.css)
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ios: {
          bg: v('bg'),
          card: v('card'),
          label: v('label'),
          secondary: 'var(--label2)',
          tertiary: 'var(--label3)',
          fill: 'var(--fill)',
          separator: 'var(--sep)',
          blue: v('blue'),
          red: v('red'),
          orange: v('orange'),
          green: v('green'),
          indigo: v('indigo'),
          teal: v('teal'),
        },
      },
      borderRadius: {
        widget: '22px',
      },
    },
  },
  plugins: [],
};
