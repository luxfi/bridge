import { useRouter } from "next/router";
import { IntercomProvider } from 'react-use-intercom';
import { SWRConfig } from 'swr'

import { inter, drukTextWide } from '@luxdefi/ui/style/nextFonts'

import '../styles/globals.css'
import '../styles/dialog-transition.css'


const INTERCOM_APP_ID = 'o1kmvctg'
import "@rainbow-me/rainbowkit/styles.css";

function App({ Component, pageProps }) {
  const router = useRouter()
  return (<>
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
  </>)
}

export default App
