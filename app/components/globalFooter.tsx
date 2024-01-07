import Link from "next/link";
import TwitterLogo from "./icons/TwitterLogo";
import DiscordLogo from "./icons/DiscordLogo";
import GitHubLogo from "./icons/GitHubLogo";
import YoutubeLogo from "./icons/YoutubeLogo";

const GLobalFooter = () => {

    const footerNavigation = {
        main: [
            { name: 'Product', href: '/' },
            { name: 'Company', href: '/company' },
            { name: 'FAQ', href: '/faq' },
            { name: 'Privacy Policy', href: 'https://lux.partners/privacy' },
            { name: 'Terms of Services', href: 'https://lux.partners/terms' },
            { name: 'Docs', href: 'https://docs.bridge.lux.network' },
        ],
        social: [
            {
                name: 'Twitter',
                href: 'https://twitter.com/luxdefi',
                icon: () => (
                    <TwitterLogo className="h-6 w-6" aria-hidden="true" />
                ),
            },
            {
                name: 'Discord',
                href: 'https://discord.gg/XsD63KMbV2',
                icon: () => (
                    <DiscordLogo className="h-6 w-6" aria-hidden="true" />
                ),
            },
            {
                name: 'GitHub',
                href: 'https://github.com/luxdefi',
                icon: () => (
                    <GitHubLogo className="h-6 w-6" aria-hidden="true" />
                ),
            },
            {
                name: 'YouTube',
                href: 'https://www.youtube.com/@luxdefi',
                icon: () => (
                    <YoutubeLogo className="h-6 w-6" aria-hidden="true" />
                ),
            },
        ],
    }

    return (
        <footer className="z-0 hidden md:flex fixed bottom-0 py-4 justify-between items-center w-full px-6 lg:px-8 mt-auto">
            <div>
                <div className="flex mt-3 md:mt-0 gap-6">
                    <Link target="_blank" href="https://lux.partners/privacy" className="text-xs leading-6 text-muted text-muted-primary-text-muted underline hover:no-underline hover:text-opacity-70 duration-200 transition-all">
                        Privacy Policy
                    </Link>
                    <Link target="_blank" href="https://lux.partners/terms" className="text-xs leading-6 text-muted text-muted-primary-text-muted underline hover:no-underline hover:text-opacity-70 duration-200 transition-all">
                        Terms of Services
                    </Link>
                </div>
                <p className="text-center text-xs text-muted text-muted-primary-text-muted leading-6">
                    &copy; {new Date().getFullYear()} Lux Partners Limited. All rights reserved.
                </p>
            </div>
            <div className="flex space-x-6">
                {footerNavigation.social.map((item) => (
                    <Link target="_blank" key={item.name} href={item.href} className="text-gray-400 hover:text-gray-500">
                        <span className="sr-only">{item.name}</span>
                        <item.icon />
                    </Link>
                ))}
            </div>

        </footer>
    )
}

export default GLobalFooter
