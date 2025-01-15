import type { Wallet } from '@/domain/types'

const WalletIcons: React.FC<{ 
  wallets: Wallet[] 
}> = ({ 
  wallets 
}) => {

  const starting = wallets.slice(0, 2)

  return (
    <div className='-space-x-2 flex'>
      { starting.map((w) => (
        w.connector ? (
          <w.icon className='flex-shrink-0 h-6 w-6' />
        ) : null
      ))}
      {wallets.length > 2 && (
        <div className='h-6 w-6 flex-shrink-0 rounded-full justify-center p-1 overlfow-hidden text-xs'>
          <span>
            <span>+</span>
            {wallets.length - 2}
          </span>
        </div>
      )}
    </div>
  )
}

export default WalletIcons
