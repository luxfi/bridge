import SendEmail from '../../SendEmail';

const EmailStep: React.FC<{
  OnNext: () => void;
  disclosureLogin?: boolean
}> = ({ 
  OnNext, 
  disclosureLogin 
}) => (
  <SendEmail disclosureLogin={disclosureLogin} onSend={OnNext} />
)

export default EmailStep