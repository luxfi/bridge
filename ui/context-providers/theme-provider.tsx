"use client"

import React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps } from "next-themes/dist/types"

const ThemeProvider: React.FC<ThemeProviderProps> = ({ children, ...props }) => (
  <NextThemesProvider 
    attribute="class" 
    {...props}
    value={{
      light: 'lux-light-theme',
      dark: 'lux-dark-theme'
    }}
  >
    {children}
  </NextThemesProvider>
)

export default ThemeProvider
