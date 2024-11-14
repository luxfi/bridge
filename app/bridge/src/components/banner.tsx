'use client'
import { X } from 'lucide-react'

import { usePersistedState } from '../hooks/usePersistedState';

const Banner: React.FC<{
  mobileMessage: string;
  desktopMessage: string;
  localStorageId: string;
  className?: string;
}> = ({ 
  localStorageId, 
  desktopMessage, 
  mobileMessage, 
  className 
}) => {

    const localStorageItemKey = `HideBanner-${localStorageId}`;
    let [isVisible, setIsVisible] = usePersistedState(true, localStorageItemKey);
    if (!isVisible) {
        return <></>
    }

    function onClickClose() {
        setIsVisible(false);
    }

    return (
        <div className={className + ' ' + "w-full mx-auto"}>
            <div className="p-2 rounded-lg bg-secondary-lux shadow-lg">
                <div className="flex items-center justify-between flex-wrap">
                    <div className="w-0 flex-1 flex items-center">
                        <span className="flex p-1 text-lg rounded-lg">
                            🥳
                        </span>
                        <p className="ml-3 font-medium  truncate">
                            <span className="md:hidden">{mobileMessage}</span>
                            <span className="hidden md:inline">{desktopMessage}</span>
                        </p>
                    </div>
                    <div className="order-2 flex-shrink-0 sm:order-3 sm:ml-2">
                        <button
                            type="button"
                            onClick={() => onClickClose()}
                            className="-mr-1 flex p-2 rounded-md hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-foreground"
                        >
                            <span className="sr-only">Dismiss</span>
                            <X className="h-4 w-5 " aria-hidden="true" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Banner;