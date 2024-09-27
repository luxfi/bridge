"use client"
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { cn } from "@luxdefi/ui/util"

const buttonClass = 
  'py-2 px-4 flex items-center justify-center-md ' + 
  'text-md font-medium ' + 
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' + 
  'disabled:opacity-50 disabled:pointer-events-none'

// hover:bg-level-2 hover:text-accent-foreground rounded ring-offset-background transition-colors

const BackButton: React.FC<{
  className?: string
  label?: string
}> = ({
  className,
  label='Back'
}) => {

  const router = useRouter();

  const goBack = window?.['navigation' as any]?.['canGoBack' as any] ?
      () => router.back()
      : 
      () => router.push("/")

    return (
      <button
        onClick={goBack}
        className={cn(buttonClass, (className ?? ''))}
      >
        <ChevronLeft className="mr-2 h-4 w-4" />
        <span>{label}</span>
      </button>
    )
}

export default BackButton
