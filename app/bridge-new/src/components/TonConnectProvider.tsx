/*
import { THEME, TonConnectUIProvider } from '@tonconnect/ui-react'
import { type ThemeData } from '../Models/Theme'
import type { PropsWithChildren } from 'react'

const TonConnectProvider: React.FC<{
  basePath: string 
  themeData: ThemeData
} & PropsWithChildren> = ({ 
  children, 
  basePath, 
  themeData 
}) => {

  const rgbToHex = (rgb: string) => {

    const rgbArray = rgb.match(/\d+/g)
    if (!rgbArray) return ''

    const componentToHex = (c: number): string => {
      var hex = c?.toString(16)
      return hex.length == 1 ? '0' + hex : hex
    }

    return '#' + componentToHex(Number(rgbArray[0])) + componentToHex(Number(rgbArray[1])) + componentToHex(Number(rgbArray[2]))
  }

  return (
    <TonConnectUIProvider
      uiPreferences={{
        theme: THEME.DARK,
        borderRadius: 's',
        colorsSet: {
          [THEME.DARK]: {
            constant: {
              black: '#000000',
              white: '#f1f1f1f1',
            },
            connectButton: {
              background: rgbToHex(themeData.primary?.[500]),
              foreground: rgbToHex(themeData?.secondary?.[800] || ''),
            },
            accent: rgbToHex(themeData.primary?.[500]),
            telegramButton: rgbToHex(themeData.primary?.[500]),
            icon: {
              primary: rgbToHex(themeData.primary?.[500]),
              secondary: rgbToHex(themeData?.secondary?.text || ''),
              tertiary: rgbToHex(themeData.secondary?.[400] || ''),
              success: rgbToHex(themeData.primary?.[500]),
            },
            background: {
              primary: rgbToHex(themeData.secondary?.[900] || ''),
              secondary: rgbToHex(themeData.secondary?.[800] || ''),
              segment: rgbToHex(themeData.secondary?.[200] || ''),
              tint: rgbToHex(themeData.secondary?.[700] || ''),
              qr: '#f1f1f1f1',
            },
            text: {
              primary: rgbToHex(themeData.primary.text),
              secondary: rgbToHex(themeData?.secondary?.text || ''),
            }
          }
        }
      }}
      manifestUrl={`https://${process.env.NEXT_PUBLIC_VERCEL_URL}${basePath ? `/${basePath}` : ''}/tonconnect-manifest.json`}
    >
      {children}
    </TonConnectUIProvider>
  )
}

export default TonConnectProvider
*/