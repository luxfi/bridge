import React from 'react'
import { X } from 'lucide-react'
import toast, { ToastBar, Toaster } from 'react-hot-toast'


const ToasterComponent: React.FC = () => (
  <Toaster 
    position='top-center' 
    toastOptions={{
      duration: 3000,
      style: {
        background: '#131E36',
        color: '#a4afc8'
      },
      position: 'top-center',
      error: {
        duration: Infinity,
      },
    }}
  />
)

export default ToasterComponent
