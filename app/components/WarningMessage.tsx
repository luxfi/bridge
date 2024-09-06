import { AlertOctagon, Scroll } from "lucide-react";
import { FC } from "react";

type messageType = 'warning' | 'informing'

type Props = {
    children: JSX.Element | JSX.Element[] | string;
    messageType?: messageType;
    className?: string
}

function constructIcons(messageType: messageType) {

    let iconStyle: JSX.Element

    switch (messageType) {
        case 'warning':
            iconStyle = <AlertOctagon className="sm:h-5 h-4  inline sm:block" />;
            break;
        case 'informing':
            iconStyle = <Scroll className="sm:h-5 h-4  inline sm:block" />;
            break;
    }
    return iconStyle
}

const WarningMessage: FC<Props> = (({ children, className, messageType = 'warning' }) => {
    return (
        <div className={`flex-col w-full rounded-md bg-level-1 border border-[#404040] shadow-lg px-3.5 py-3 ${className}`}>
            <div className='flex items-center'>
                <div className={`mr-2 hidden sm:inline p-2 rounded-lg bg-level-2 `}>
                    {constructIcons(messageType)}
                </div>
                <div className={`text-xs sm:text-sm leading-5 ${messageType == 'warning' ? 'font-semibold' : "  font-normal"}`}>
                    <span className={`sm:hidden mr-1 pb-1.5 pt-1 px-1 rounded-md bg-level-2 "}`}>
                        {constructIcons(messageType)}
                    </span>
                    <span>{children}</span>
                </div>
            </div>
        </div>
    )
})

export default WarningMessage;