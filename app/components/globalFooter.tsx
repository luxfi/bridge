import Link from "next/link";
import TwitterLogo from "./icons/TwitterLogo";
import DiscordLogo from "./icons/DiscordLogo";
import GitHubLogo from "./icons/GitHubLogo";
import YoutubeLogo from "./icons/YoutubeLogo";

const GlobalFooter = () => {

    const footerNavigation = {
        main: [
            { name: 'Product', href: '/' },
            { name: 'Company', href: '/company' },
            { name: 'FAQ', href: '/faq' },
            { name: 'Privacy Policy', href: 'https://docs.bridge.lux.network/information/privacy-policy' },
            { name: 'Terms of Services', href: 'https://docs.bridge.lux.network/information/terms-of-services' },
            { name: 'Docs', href: 'https://docs.bridge.lux.network/onboarding-sdk/' },
        ],
        social: [
            {
                name: 'Twitter',
                href: 'https://twitter.com/luxfi',
                icon: () => (
                    <TwitterLogo className="h-6 w-6" aria-hidden="true" />
                ),
            },
            {
                name: 'Discord',
                href: 'https://chat.lux.network',
                icon: () => (
                    <DiscordLogo className="h-6 w-6" aria-hidden="true" />
                ),
            },
            {
                name: 'GitHub',
                href: 'https://github.com/luxfi',
                icon: () => (
                    <GitHubLogo className="h-6 w-6" aria-hidden="true" />
                ),
            },
            {
                name: 'YouTube',
                href: 'https://www.youtube.com/@luxfi',
                icon: () => (
                    <YoutubeLogo className="h-6 w-6" aria-hidden="true" />
                ),
            },
        ],
    }

    return (
        <footer className="text-muted-2 z-0 hidden md:flex fixed bottom-0 py-4 justify-between items-center w-full px-6 lg:px-8 mt-auto">
            <div>
                <div className="flex mt-3 md:mt-0 gap-6">
                    <Link target="_blank" href="https://docs.bridge.lux.network/information/privacy-policy" className="text-xs leading-6 underline hover:no-underline hover:text-foreground duration-200 transition-all">
                        Privacy Policy
                    </Link>
                    <Link target="_blank" href="https://docs.bridge.lux.network/information/terms-of-services" className="text-xs leading-6 underline hover:no-underline hover:text-foreground duration-200 transition-all">
                        Terms of Services
                    </Link>
                </div>
                <p className="text-center text-xs text-muted-2 leading-6">
                    &copy; {new Date().getFullYear()} Lux Partners Limited. All rights reserved.
                </p>
            </div>
            <div className="flex space-x-6">
                {footerNavigation.social.map((item) => (
                    <Link target="_blank" key={item.name} href={item.href} className="text-muted-2 hover:text-foreground">
                        <span className="sr-only">{item.name}</span>
                        <item.icon />
                    </Link>
                ))}
            </div>

        </footer>
    )
}

export default GlobalFooter
