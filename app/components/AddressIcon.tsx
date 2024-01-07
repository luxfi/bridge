import { useEffect, useRef } from "react";
import Jazzicon from "@metamask/jazzicon";

type Props = {
    address: string;
    size: number;
}
const AddressIcon: React.FC<Props> = ({ address, size }) => {
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
