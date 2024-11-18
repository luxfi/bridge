'use client'
import React, { useContext } from 'react'
import { toast, ToastContainer } from 'react-toastify'

import '@/styles/other-react-toastify.css'

interface ToastService {
  notify: (msg: string, t: 'warn' | 'error' | 'success' | 'info') => void
}

const ToastContext = React.createContext<ToastService | null>(null)

const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const notify = (msg: string, t: 'warn' | 'error' | 'success' | 'info') => {
    if (t === 'success') {
      toast.success(msg, {
        position: 'top-right',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        theme: 'dark',
      })
    } else if (t === 'info') {
      toast.info(msg, {
        position: 'top-right',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        theme: 'dark',
      })
    } else if (t === 'warn') {
      toast.warn(msg, {
        position: 'top-right',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        theme: 'dark',
      })
    } else if (t === 'error') {
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
    <ToastContext.Provider value={{ notify: notify }}>
      {children}
      <ToastContainer
        position="top-right"
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
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('Invalid ToastContext!')
  }
  return {
    notify: context.notify,
  }
}

export { ToastProvider, useNotify }
