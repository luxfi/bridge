import { X } from 'lucide-react'
import toast, { ToastBar, Toaster } from 'react-hot-toast'
import type { PropsWithChildren } from 'react'

const Main: React.FC<PropsWithChildren> = ({ children }) => (
  <main className='flex flex-col items-center overflow-hidden relative mt-[44px] md:mt-[80px]'>
    <Toaster position='top-center' toastOptions={{
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
            <button type='button' onClick={() => toast.dismiss(t.id)}><X className='h-5' /></button>
          )}
        </>
      )}
      </ToastBar>
    )}
    </Toaster>
    {children}
    <div id='offset-for-stickyness' className='block md:hidden'></div>
  </main>
)

export default Main
