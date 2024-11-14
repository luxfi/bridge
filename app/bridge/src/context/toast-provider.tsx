'use client'
import React, { useContext } from 'react'
import { toast, ToastContainer } from 'react-toastify'

import '@/styles/other-react-toastify.css'

interface ToastService {
  notify: (msg: string, t: 'warn' | 'error') => void
}

const ToastContext = React.createContext<ToastService | null>(null)

const ToastProvider = ({
  children,
}: {
  children: React.ReactNode
}) => {
  const nofify = (msg: string, t: 'warn' | 'error') => {

    if (t === 'warn') {
      toast.warn(msg, {
        position: 'top-right',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        theme: 'dark',
      })
    }
    else if (t === 'error') {
      toast.error(msg, {
        position: 'top-right',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        theme: 'dark',
      })
    } 
  }

  return (
    <ToastContext.Provider value={{ notify: nofify }}>
      {children}
      <ToastContainer
        position='top-right'
        autoClose={50000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </ToastContext.Provider>
  )
}

const useNotify = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("Invalid ToastContext!")
  }
  return {
    notify: context.notify,
  }
}

export {
  ToastProvider,
  useNotify
}

