import BackBtn from "@/helpers/BackButton";
import Link from "next/link";

export default function NotFound() {
    return (
    <section>
        <div className="px-6 py-12 mx-auto">
            <div className="flex flex-col justify-center items-center">
                <p className="text-sm font-medium text-priamry-text">We can’t find that</p>
                <h1 className="mt-3 text-2xl font-semibold text-white md:text-3xl">If you think it’s a mistake, contact us</h1>

                <div className="flex items-center mt-6 gap-x-3">
                    <div className='hover:bg-secondary-600 hover:text-accent-foreground rounded ring-offset-background transition-colors'>
                        <BackBtn />
                    </div>
                    <Link href={'http://discord.gg/bridge'} target="_blank" className="w-1/2 px-5 py-2 text-sm tracking-wide text-white transition-colors duration-200 bg-primary-500 rounded-lg shrink-0 sm:w-auto hover:bg-primary-500/80">
                        Contact support
                    </Link>
                </div>
            </div>
        </div>
    </section>
    )
}