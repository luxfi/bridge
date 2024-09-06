
import React from 'react';
import { useAtom } from 'jotai';
import { useTelepoterAtom } from '@/store/teleport';
import Swap from '@/components/swapComponent'
import Teleporter from '@/components/teleport/swap/Teleporter';

const Swapper: React.FC = () => {
    const [useTeleporter] = useAtom(useTelepoterAtom);

    if (useTeleporter) {
        return <Teleporter />
    } else {
        return <Swap />
    }
}

export default Swapper;
