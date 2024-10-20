'use client'
import { useCallback } from 'react'
import { type AuthConnectResponse } from '../../../Models/BridgeAuth';
import VerifyEmailCode from '../../VerifyEmailCode';

type Props = {
    OnNext: (res: AuthConnectResponse) => Promise<void>
    disclosureLogin?: boolean
}

const CodeStep: React.FC<Props> = ({ OnNext, disclosureLogin }) => {

    const onSuccessfullVerifyHandler = useCallback(async (res: AuthConnectResponse) => {
        await OnNext(res)
    }, [OnNext]);

    return (
        <VerifyEmailCode onSuccessfullVerify={onSuccessfullVerifyHandler} disclosureLogin={disclosureLogin} />
    )
}

export default CodeStep;