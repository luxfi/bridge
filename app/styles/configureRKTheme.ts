import { darkTheme, type Theme } from '@rainbow-me/rainbowkit'

import resolveConfig from 'tailwindcss/resolveConfig'
import tailwindConfig from '../tailwind.config'

  // @ts-ignore
const {theme: twTheme} = resolveConfig(tailwindConfig) as any


export default (): Theme => {

  const theme = darkTheme({
    accentColor: twTheme.colors.primary.lux,
    accentColorForeground: twTheme.colors.primary.fg,
    borderRadius: 'medium',
    fontStack: 'system',
    overlayBlur: 'small',
  })

  theme.fonts.body = 'var(--font-inter)'

  theme.colors.modalBackground = twTheme.colors.level[1]
  theme.colors.modalBorder = twTheme.colors.level[2]
  theme.colors.modalText = twTheme.colors.foreground
  theme.colors.modalTextDim = twTheme.colors.muted[3]
  theme.colors.modalTextSecondary = twTheme.colors.muted.DEFAULT
  //theme.colors.actionButtonBorder = twTheme.colors.muted[2]
  //theme.colors.actionButtonBorderMobile = twTheme.colors.muted[2]
  theme.colors.closeButton = twTheme.colors.muted.DEFAULT
  theme.colors.closeButtonBackground = twTheme.colors.level[2]
  theme.colors.generalBorder = twTheme.colors.muted[3]
  theme.colors.generalBorderDim = twTheme.colors.muted[4]


  return theme
}
