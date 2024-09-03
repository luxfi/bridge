"use client"
import React from 'react'
import { BookCopy, Check } from 'lucide-react'

const ClipboardCopier = ({ text, size }: { text: string, size?: number }) => {

    const copyToClipboard = async (text: string) => {
        // Navigator clipboard api needs a secure context (https)
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            // message.info(`Copied ${text}`)
        } else {
            // Use the 'out of viewport hidden text area' trick
            const textArea = document.createElement("textarea");
            textArea.value = text;

            // Move textarea out of the viewport so it's not visible
            textArea.style.position = "absolute";
            textArea.style.left = "-999999px";

            document.body.prepend(textArea);
            textArea.select();

            try {
                document.execCommand("copy");
                // message.info(`Copied ${text}`)
            } catch (error) {
                console.error(error);
            } finally {
                textArea.remove();
            }
        }
    };

    /**
     * 500ms after copying, reDisplay copy icon
     */
    const [isCopied, setIsCopied] = React.useState<boolean>(false);
    const handleCopy = () => {
        try {
            copyToClipboard(text);
            setIsCopied(true);
            setTimeout(() => {
                setIsCopied(false);
            }, 500);
        } catch (err) {
            console.log(err)
        }
    }

    return (
        isCopied ?
            <Check size={20} className='cursor-pointer hover:opacity-50'/> :
            <BookCopy size={20} onClick={handleCopy} className='cursor-pointer hover:opacity-50'/>
    )
}

export default ClipboardCopier;