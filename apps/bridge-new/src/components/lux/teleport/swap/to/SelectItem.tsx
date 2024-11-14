import type { Network } from '@/types/teleport'
import Image from 'next/image'

const SelectItem: React.FC<{
  network: Network
}> = ({ network }) => (
  <div className="flex items-center justify-between w-full">
    <div className="flex items-center">
      <div className="flex-shrink-0 h-6 w-6 relative">
        <Image
          src={network.logo}
          alt="Project Logo"
          height="40"
          width="40"
          loading="eager"
          className="rounded-full object-contain"
        />
      </div>
      <div className="ml-4 flex items-center gap-3 justify-between w-full">
        <p className="text-md font-medium">{network.display_name}</p>
      </div>
    </div>
    <div>{network.status === 'active' && 'active'}</div>
  </div>
)

export default SelectItem
