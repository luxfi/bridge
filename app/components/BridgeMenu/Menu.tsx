import React, { type PropsWithChildren, type ReactNode } from "react"
import { ChevronRight, ExternalLink } from "lucide-react"
import LinkWrapper from "../LinkWraapper"

  // aa: Do not use React.FC as we add props to the function object below
const Menu = ({ 
  children 
}: PropsWithChildren) => (
  <div className="flex flex-col gap-3 mt-3">
    {children}
    <div style={{ height: '70px' }} />
  </div>
)

const Group = ({ children }: PropsWithChildren) => {
    return (
        <div>
            <div className="divide-y divide-secondary-500 rounded-md bg-level-3 darker-2-class overflow-hidden">
                {children}
            </div>
        </div>
    )
}

const Item = (function Item({ children, pathname, onClick, icon, target = '_self' }: MenuIemProps) {

    return (
        pathname ?
            <LinkWrapper href={pathname} target={target} className="gap-4 flex relative cursor-pointer hover:bg-level-4 darker-3-class select-none w-full items-center px-4 py-3 outline-none text-muted text-muted-primary-text">
                <div>
                    {icon}
                </div>
                <p className="text-muted text-muted-primary-text">{children}</p>
                {
                    target === '_self' ?
                        <ChevronRight className="h-4 w-4 absolute right-3" />
                        :
                        <ExternalLink className="h-4 w-4 absolute right-3" />
                }
            </LinkWrapper>
            :
            <button
                type="button"
                onClick={onClick}
                className={`gap-4 flex relative cursor-pointer hover:bg-level-4 darker-3-class select-none items-center px-4 py-3 outline-none w-full text-muted text-muted-primary-text`}
            >
                <div>
                    {icon}
                </div>
                <p className="text-muted text-muted-primary-text">{children}</p>
                <ChevronRight className="h-4 w-4 absolute right-3" />
            </button>
    )
})

export enum ItemType {
    button = 'button',
    link = 'link'
}

type Target = '_blank' | '_self'

type MenuIemProps = {
    children: ReactNode;
    pathname?: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    icon: JSX.Element;
    target?: Target;
};

const Footer = ({ children }: PropsWithChildren) => {
    return (
        <div className={`text-muted text-muted-primary-text text-base border-t border-secondary-500 fixed inset-x-0 bottom-0 z-30 bg-level-1 darkest-class shadow-widget-footer px-6 py-4 w-full `}>
            {children}
        </div>
    )
}

Menu.Group = Group
Menu.Item = Item
Menu.Footer = Footer

export default Menu