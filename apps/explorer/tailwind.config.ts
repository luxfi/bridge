import animatePlugin from 'tailwindcss-animate'
import defaultColors from 'tailwindcss/colors'
import {colors as luxColors, fontFamily, typographyPlugin} from '@luxdefi/ui/tailwind'

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './node_modules/@luxdefi/ui/**/*.{ts,tsx}'
	],
  theme: {
    extend: {
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    colors: (theme) => ({
      ...{
          // Needed in table
        yellow: defaultColors.yellow,
        red: defaultColors.red,
        green: defaultColors.green,
        gray: defaultColors.gray,
      },
      ...luxColors(theme)
    }),
    fontFamily, 
  },
  plugins: [
    animatePlugin,
    typographyPlugin({ className: 'typography', base: 16 })
  ],
}