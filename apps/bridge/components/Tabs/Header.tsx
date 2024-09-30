import { motion } from "framer-motion"
import { FC } from "react"
import { Tab } from "./Index"
import { WithdrawType } from "../../lib/BridgeApiClient"

type HeaderProps = {
    tab: Tab,
    activeTabId: string,
    onCLick: (id: WithdrawType) => void
}

const Header: FC<{
  tab: Tab,
  activeTabId: string,
  onCLick: (id: WithdrawType) => void
}> = ({ 
  tab, 
  onCLick, 
  activeTabId 
}) => ( 
  <button
    type="button"
    key={tab.id}
    onClick={() => onCLick(tab.id)}
    className={`${activeTabId === tab.id ? "text-muted-3" : "text-muted-4 hover:text-muted-3"
        } grow rounded-md text-left relative py-3 px-5 text-sm transition bg-level-1`}
    style={{
        WebkitTapHighlightColor: "transparent",
    }}
  >
    <div className="flex flex-row items-center gap-2">
      <span className="z-30 relative">{tab.icon}</span>
      {activeTabId === tab.id && (
        <motion.span
            layoutId="bubble"
            className="absolute inset-0 z-29 bg-level-1/40  border-2 border-[#404040]"
            style={{ borderRadius: '6px' }}
            transition={{ type: "spring", bounce: 0.1, duration: 0.3 }}
        />
      )}
      <span className="z-30 relative">{tab.label}</span>
    </div>
  </button>
)

export default Header
