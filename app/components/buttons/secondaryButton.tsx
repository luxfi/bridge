import { FC, MouseEventHandler } from "react"

type buttonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

type SecondaryButtonProps = {
    size?: buttonSize
    onClick?: MouseEventHandler<HTMLButtonElement>
    className?: string,
    disabled?: boolean
    children?: React.ReactNode
}

const SecondaryButton: FC<SecondaryButtonProps> = ({ size = 'md', onClick, children, className, disabled }) => {

    let defaultStyle = 'rounded-md duration-200 break-keep transition hover:bg-level-1 border border-[#404040] hover:border-[#404040] font-semibold shadow-sm cursor-pointer ' + className

    switch (size) {
        case 'xs':
            defaultStyle += " px-2 py-1 text-xs";
            break;
        case 'sm':
            defaultStyle += " px-2 py-1 text-sm";
            break;
        case 'md':
            defaultStyle += " px-2.5 py-1.5 text-sm";
            break;
        case 'lg':
            defaultStyle += " px-3 py-2 text-sm";
            break;
        case 'xl':
            defaultStyle += " px-3.5 py-2.5 text-sm";
            break;
    }

    return (
        <button
            type="button"
            className={defaultStyle}
            onClick={onClick}
            disabled={disabled}
        >
            {children}
        </button>
    )
}

export default SecondaryButton
