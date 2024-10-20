import React from "react";
import { toast, ToastContainer } from "react-toastify";

type NotificationContextType = {
  showNotification: (msg: string, t: 'warn' | 'error') => void;
};

export const NotificationContext =
  React.createContext<NotificationContextType | null>(null);

export const NotificationProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const showNotification = (msg: string, t: 'warn' | 'error') => {

    if (t === 'warn') {
      toast.warn(msg, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        theme: "dark",
      })
    }
    else if (t === 'error') {
      toast.error(msg, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        theme: "dark",
      })
    } 
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
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
      {children}
    </NotificationContext.Provider>
  );
};
