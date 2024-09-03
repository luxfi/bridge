import { ComponentType } from 'react'
import YoutubeLogo from '../icons/YoutubeLogo'
import DiscordLogo from './../icons/DiscordLogo'
import GitHubLogo from './../icons/GitHubLogo'
import SubstackLogo from './../icons/SubstackLogo'
import TwitterLogo from './../icons/TwitterLogo'

import { Map as LucideMap} from 'lucide-react'
import { LinkDef } from '@luxdefi/ui/types'

export default [
  {
      title: 'Twitter',
      href: 'https://twitter.com/luxfi',
      icon: <TwitterLogo className="h-5 w-5" aria-hidden="true"/>,
      className: 'plausible-event-title=Twitter'
  },
  {
      title: 'GitHub',
      href: 'https://github.com/luxfi',
      icon: <GitHubLogo className="h-5 w-5" aria-hidden="true"/>,
      className: 'plausible-event-title=GitHub'
  },
  {
      title: 'Discord',
      href: 'https://chat.lux.network',
      icon: <DiscordLogo className="h-5 w-5" aria-hidden="true"/>,
      className: 'plausible-event-title=Discord'
  },
  {
      title: 'YouTube',
      href: 'https://www.youtube.com/@luxfi',
      icon: <YoutubeLogo className="h-5 w-5" aria-hidden="true"/>,
      className: 'plausible-event-title=Youtube'
  },
  {
      title: 'Substack',
      href: 'https://luxdefi.substack.com/',
      icon: <SubstackLogo className="h-5 w-5" aria-hidden="true"/>,
      className: 'plausible-event-title=Substack'
  },
  {
      title: 'Roadmap',
      href: 'https://github.com/orgs/luxdefi/projects/1/views/4',
      icon: <LucideMap className="h-5 w-5" aria-hidden="true"/>,
      className: 'plausible-event-title=Roadmap'
  },
] as (LinkDef & {className: string})[]