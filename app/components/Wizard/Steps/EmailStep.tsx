import { FC } from 'react'
import SendEmail from '../../SendEmail';


const EmailStep: FC<{
  OnNext: () => void;
  disclosureLogin?: boolean
}> = ({ 
  OnNext, 
  disclosureLogin 
}) => (
  <SendEmail disclosureLogin={disclosureLogin} onSend={OnNext} />
)

export default EmailStep