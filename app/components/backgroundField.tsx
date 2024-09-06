'use client'
import { FC, PropsWithChildren } from "react";
import CopyButton from "./buttons/copyButton";
import QRCodeModal from "./QRCodeWallet";
import useWindowDimensions from "../hooks/useWindowDimensions";
import ExploreButton from "./buttons/exploreButton";

const BackgroundField: FC< {
  Copiable?: boolean;
  QRable?: boolean;
  Explorable?: boolean;
  toCopy?: string | number;
  toExplore?: string;
  header?: JSX.Element | JSX.Element[] | string;
  highlited?: boolean,
  withoutBorder?: boolean,
} & PropsWithChildren> = (({ 
  Copiable, 
  toCopy, 
  header, 
  children, 
  QRable, 
  highlited, 
  withoutBorder, 
  Explorable, 
  toExplore 
}) => {

    const { isMobile } = useWindowDimensions()

    return (
        <div className="relative w-full">
            {
                highlited &&
                <div className="absolute -inset-2">
                    <div className="animate-pulse w-full h-full mx-auto rotate-180 opacity-30 blur-lg filter" style={{ background: 'linear-gradient(90deg, #E42575 -0.55%, #A6335E 22.86%, #E42575 48.36%, #ED6EA3 73.33%, #E42575 99.34%)' }}></div>
                </div>
            }
            <div className={`w-full relative px-3 py-3 shadow-sm ${withoutBorder ? '' : 'border-[#404040] rounded-md border bg-level-1'}`}>
                {
                    header && <p className="block font-semibold text-sm ">
                        {header}
                    </p>
                }
                <div className="flex justify-between w-full mt-1 space-x-2">
                    <div className="w-full pt-0.5">{children}</div>
                    <div className="space-x-2 flex self-start">
                        {
                            QRable && toCopy &&
                            <QRCodeModal qrUrl={toCopy?.toLocaleString()} iconSize={isMobile ? 20 : 16} className='p-1.5 bg-gray-700 hover:bg-gray-500 hover:text-foreground rounded' />
                        }
                        {
                            Copiable && toCopy &&
                            <CopyButton iconSize={isMobile ? 20 : 16} toCopy={toCopy} className='p-1.5 bg-gray-700 hover:bg-gray-500 hover:text-foreground rounded' />
                        }
                        {
                            Explorable && toExplore &&
                            <ExploreButton href={toExplore} target="_blank" iconSize={isMobile ? 20 : 16} className='p-1.5 hover:text-foreground rounded' />
                        }
                    </div>
                </div>
            </div>
        </div>
    )
})

export default BackgroundField
