import { useContext } from "react";

import { NotificationContext } from "@/context/notificationProvider";

/**
 * notification context
 * @returns context { showNotification(text:string) }
 */
const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("No notification");
  return {
    showNotification: context.showNotification,
  };
};

export default useNotification;
