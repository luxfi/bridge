'use client'
import { useSwapDataState } from '@/context/swap';
import { useSettingsState } from '@/context/settings';
import Processing from './Processing';

const Component: React.FC = () => {

    const { swap } = useSwapDataState()
    const settings = useSettingsState()

    return swap ? (<Processing settings={settings} swap={swap} />) : null
}

export default Component;
