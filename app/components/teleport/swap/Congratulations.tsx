"use client"
import React from 'react';
import Confetti from "react-confetti";
import useWindowDimensions from "@/hooks/useWindowDimensions";

interface IProps {
    // close: () => void
}

const Contratulations = (props: IProps) => {

    const { windowSize } = useWindowDimensions();

    // const init = () => {
    //     setTimeout(() => {
    //         props.close();
    //     }, 10000)
    // }

    // React.useEffect(() => {
    //     init();
    // }, []);

    return (
        <div className='!fixed top-0 right-0 left-0 bottom-0'>
            <div className='!z-[100000000000000]' style={{ zIndex: '10000000000000!important' }}>
                <Confetti width={windowSize.width} height={windowSize.height} recycle={false} />
            </div>
        </div>
    )
}

export default Contratulations;