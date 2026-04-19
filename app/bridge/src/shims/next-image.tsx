/**
 * Vite SPA shim for `next/image`. Renders a plain <img>.
 * Strips Next.js-specific props that would warn on <img>.
 */
import React, { type ImgHTMLAttributes } from 'react'

export interface StaticImageData {
  src: string
  width: number
  height: number
  blurDataURL?: string
}

export interface ImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width' | 'height'> {
  src: string | StaticImageData
  alt: string
  width?: number | string
  height?: number | string
  priority?: boolean
  quality?: number
  placeholder?: 'blur' | 'empty'
  blurDataURL?: string
  unoptimized?: boolean
  fill?: boolean
  sizes?: string
  loader?: (args: { src: string; width: number; quality?: number }) => string
  onLoadingComplete?: (img: HTMLImageElement) => void
}

const Image = React.forwardRef<HTMLImageElement, ImageProps>(function Image(
  { src, alt, width, height, priority, quality, placeholder, blurDataURL, unoptimized, fill, sizes, loader, onLoadingComplete, style, ...rest },
  ref,
) {
  const resolvedSrc = typeof src === 'string' ? src : src.src
  const w = typeof width === 'number' ? width : width ? Number(width) : (typeof src !== 'string' ? src.width : undefined)
  const h = typeof height === 'number' ? height : height ? Number(height) : (typeof src !== 'string' ? src.height : undefined)
  const fillStyle: React.CSSProperties | undefined = fill
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }
    : undefined

  return (
    <img
      ref={ref}
      src={resolvedSrc}
      alt={alt}
      width={w}
      height={h}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      sizes={sizes}
      style={{ ...fillStyle, ...style }}
      onLoad={onLoadingComplete ? (e) => onLoadingComplete(e.currentTarget) : undefined}
      {...rest}
    />
  )
})

export default Image
