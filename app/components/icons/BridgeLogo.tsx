import { FC } from "react";

interface Props {
    className?: string
}

const BridgeLogo: FC<Props> = (({ className }) => {
    return (
        <>
          <svg className={className} xmlns="http://www.w3.org/2000/svg" width="302" height="77" viewBox="0 0 302 77" fill="white"></svg>
        </>
    )
})

export default BridgeLogo;
