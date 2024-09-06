import { X } from "lucide-react";
import toast, { ToastBar, Toaster } from "react-hot-toast"
import Navbar from "./navbar"
import GlobalFooter from "./globalFooter";

type Props = {
    children: JSX.Element | JSX.Element[]
}
export default function ThemeWrapper({ children }: Props) {
  return (
    <div className='styled-scroll'>
      <main className="styled-scroll">
        <div className='flex flex-col items-center min-h-screen overflow-hidden relative'>
          <Toaster position="top-center" toastOptions={{
            duration: 5000,
            style: {
              background: '#131E36',
              color: '#a4afc8'
            },
            position: 'top-center',
            error: {
              duration: Infinity,
            },
          }}>
          {(t) => (
            <ToastBar toast={t}>
            {({ icon, message }) => (
              <>
                {icon}
                {message}
                {t.type !== 'loading' && (
                  <button type="button" onClick={() => toast.dismiss(t.id)}><X className="h-5" /></button>
                )}
              </>
            )}
            </ToastBar>
          )}
          </Toaster>
          <Navbar />
          <div className="w-full max-w-lg z-[1] mb-6">
            <div className="flex content-center items-center justify-center space-y-5 flex-col container mx-auto sm:px-6 max-w-lg">
              <div className="flex flex-col w-full text-foreground">
                {children}
              </div>
            </div>
          </div>
          <div id="offset-for-stickyness" className="block md:hidden"></div>
          <GlobalFooter />
        </div>
      </main>
    </div>
  )
}