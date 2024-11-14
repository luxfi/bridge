'use client'
import { type PropsWithChildren, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const ReactPortal: React.FC<{
    wrapperId: string
} & PropsWithChildren> = ({ 
  children, 
  wrapperId = "react-portal-wrapper" 
}) => {
    const ref = useRef<Element | null>(null);
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        let element = document.getElementById(wrapperId);
        if (!element) {
            element = document.createElement('div');
            element.setAttribute("id", wrapperId);
            document.body.appendChild(element);
        }
        ref.current = element
        setMounted(true)
    }, [wrapperId]);

    return ref.current && mounted ? createPortal(children, ref.current) : null;
};

export default ReactPortal