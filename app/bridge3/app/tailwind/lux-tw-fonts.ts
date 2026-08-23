import type { TwFontDesc } from '@hanzo/ui/tailwind'


/* NOTE: /next/load-and-return....ts depends on this file! */

export default [
  {
    fontFamily: ['var(--font-inter)'], // do not provide fall-backs due to next bug
    cssVar: '--font-inter',
    twName: 'sans'
  },
  {
    // Zen carries the display roles. The wide, monumental cut they were set in is
    // weight and tracking, applied in style/lux-fonts.css — not a second family.
    fontFamily: ['Zen'],
    twName: 'nav'
  },
  {
    fontFamily: ['Zen'],
    twName: 'heading'
  },
  {
    twName: 'serif',
    fontFamily: ['ui-serif', 'Georgia', 'Cambria', '"Times New Roman"', 'Times']
  },
  {
    twName: 'mono',
    fontFamily: [
      'ui-monospace',
      'SFMono-Regular',
      'Menlo',
      'Monaco',
      'Consolas',
      '"Liberation Mono"',
      '"Courier New"',
      'monospace',
    ] 
  }

] as TwFontDesc[]