import { useRouter } from "next/router";
import { IntercomProvider } from 'react-use-intercom';
import { SWRConfig } from 'swr'

const INTERCOM_APP_ID = 'tovyeyyd'
import "@rainbow-me/rainbowkit/styles.css";
import '../styles/globals.css'
import '../styles/dialog-transition.css'

import { inter, drukTextWide } from '@luxdefi/ui/style/nextFonts'


function App({ Component, pageProps }) {
  const router = useRouter()
  return (
    <>
    <style jsx global>{`
        html {
          --font-inter: ${inter.style.fontFamily};
          --font-druk-text-wide: ${drukTextWide.style.fontFamily};
        }
      `}</style>
    <SWRConfig
      value={{
        revalidateOnFocus: false,
      }}
    >
      <IntercomProvider appId={INTERCOM_APP_ID} initializeDelay={2500}>
        <Component key={router.asPath} {...pageProps} />
      </IntercomProvider>
    </SWRConfig>      
    </>
)
}

export default App
