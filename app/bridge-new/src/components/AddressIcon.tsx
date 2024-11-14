'use client'
import { useEffect, useRef } from "react";
import Jazzicon from "@metamask/jazzicon";

const AddressIcon: React.FC<{
  address: string;
  size: number;
}> = ({ 
  address, 
  size 
}) => {

    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (address && ref.current) {
            ref.current.innerHTML = "";
            const iconElement = Jazzicon(size, parseInt(address.slice(2, 10), 16)) as HTMLElement
            if(iconElement){
                iconElement.style.display = 'block'
                ref.current.appendChild(iconElement);
            }
        }
    }, [address, size]);

    return <div ref={ref as any} />
}
export default AddressIcon
