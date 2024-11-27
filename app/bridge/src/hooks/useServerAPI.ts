import axios from 'axios';
import { useNotify } from '@/context/toast-provider';

export const useServerAPI = () => {
  const { notify } = useNotify()
  const serverAPI = axios.create({
    baseURL: process.env.NEXT_PUBLIC_BACKEND_API,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  serverAPI.interceptors.response.use(
    (res) => res,
    (err) => {
      console.log("::axios error:", err)
      if (String(err).includes('Network Error')) {
        notify('Network Conenction Error. Please check your internet connection', 'error')
      } else if (err.response) {
        notify(String(err?.response?.data?.error), 'error')
      } else {
        notify('Failed to run request. Please contract with support team', 'error')
      }
      return Promise.reject(err);
    }
  );
  return { serverAPI }
};
