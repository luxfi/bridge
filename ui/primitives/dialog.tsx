import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { classNames } from "../util/classNames"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

interface DialogPortalProps extends React.PropsWithChildren<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>> {
    className?: string;
}

const DialogPortal = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Portal>,
    DialogPortalProps
>(({ className, children, ...props }, ref) => (
    <DialogPrimitive.Portal {...props}>
        <div className={classNames("fixed inset-0 z-50 flex items-end justify-center sm:items-center", className)}>
            {children}
        </div>
    </DialogPrimitive.Portal>
))
DialogPortal.displayName = 'DialogPortal'

interface DialogOverlayProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> {
    className?: string;
}

const DialogOverlay = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Overlay>,
    DialogOverlayProps
>(({ className, ...props }, ref) => (
    <div className={classNames("fixed inset-0 z-50 flex items-end justify-center sm:items-center", className)}>
      <DialogPrimitive.Overlay ref={ref} {...props} />
    </div>
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName


interface DialogCloseProps extends React.PropsWithChildren<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>> {
    className?: string;
}

const DialogClose = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Close>,
    DialogCloseProps
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Close
        ref={ref}
        className={classNames(
            "absolute right-4 top-3 p-1 justify-self-start hover:brightness-105 hover:scale-110 duration-100 ring-1 ring-secondary-400 transition bg-secondary-500 hover:text-primary-text focus:outline-none rounded-full items-center",
            className
        )}
        {...props}
    >
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
    </DialogPrimitive.Close>
))

DialogClose.displayName = DialogPrimitive.Close.displayName

const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
    <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
            ref={ref}
            className={classNames(
                "fixed z-50 grid w-full gap-4 rounded-t-lg bg-secondary-800 p-4 shadow-lg animate-in data-[state=open]:fade-in-90 data-[state=open]:slide-in-from-bottom-10 sm:max-w-sm sm:rounded-lg sm:zoom-in-90 data-[state=open]:sm:slide-in-from-bottom-0",
                className
            )}
            {...props}
        >
            {children}
            <DialogClose />
        </DialogPrimitive.Content>
    </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={classNames(
            "flex flex-col space-y-1.5 text-center sm:text-left",
            className
        )}
        {...props}
    />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={classNames(
            "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
            className
        )}
        {...props}
    />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={classNames(
            "text-lg font-semibold leading-none tracking-tight text-primary-text",
            className
        )}
        {...props}
    />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        className={classNames("text-sm text-secondary-text", className)}
        {...props}
    />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
    Dialog,
    DialogTrigger,
    DialogOverlay,
    DialogClose,
    DialogPortal,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
}
