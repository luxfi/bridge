import { ServerOff } from "lucide-react"
import Link from "next/link"

const Error500: React.FC = () => (
  <div className="flex h-full items-center justify-center p-5 w-full flex-1 text-foreground">
    <div className="text-center">
      <div className="inline-flex rounded-full relative">
        <svg xmlns="http://www.w3.org/2000/svg" width="116" height="116" viewBox="0 0 116 116" fill="#E43636">
            <circle cx="58" cy="58" r="58" fillOpacity="0.1" />
            <circle cx="58" cy="58" r="45" fillOpacity="0.5" />
            <circle cx="58" cy="58" r="30" />
        </svg>
        <ServerOff className="absolute top-[calc(50%-16px)] right-[calc(50%-16px)] h-8 w-auto" />
      </div>
      <h1 className="mt-5 text-[36px] font-bold lg:text-[50px]">500 - Oops</h1>
      <p className="my-5 lg:text-lg">Something went wrong. Try to refresh this page or <br /> feel free to contact us if the problem presists.</p>
      <Link href={'https://help.lux.network'} target="" className="w-1/2 px-5 py-2 text-sm tracking-wide transition-colors duration-200 bg-primary-lux rounded-lg shrink-0 sm:w-auto hover:bg-primary-lux/80">
        Contact support
      </Link>
    </div>
  </div>
)

export default Error500
