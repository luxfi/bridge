import { useRouter } from "next/router";
import { IntercomProvider } from 'react-use-intercom';
import { SWRConfig } from 'swr'

import PagesRouterFontVars from '@luxdefi/ui/next/pages-router-font-vars'

import '../styles/globals.css'
import '../styles/dialog-transition.css'

const INTERCOM_APP_ID = 'o1kmvctg'
import "@rainbow-me/rainbowkit/styles.css";

function App({ Component, pageProps }) {

  const router = useRouter()

  return (<>
    <PagesRouterFontVars />
    <SWRConfig value={{ revalidateOnFocus: false}}>
      <IntercomProvider appId={INTERCOM_APP_ID} initializeDelay={2500}>
        <Component key={router.asPath} {...pageProps} />
      </IntercomProvider>
    </SWRConfig>
  </>)
}

export default App
