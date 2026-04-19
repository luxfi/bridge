/**
 * Vite SPA shim for `next/font/google`.
 * Returns a no-op Font descriptor — fonts loaded via @font-face in index.html.
 */
export interface FontDescriptor {
  className: string
  variable: string
  style: { fontFamily: string }
}

function font(name: string): (_opts?: unknown) => FontDescriptor {
  const cssVar = `--font-${name.toLowerCase().replace(/\s+/g, '-')}`
  return () => ({
    className: '',
    variable: cssVar,
    style: { fontFamily: name },
  })
}

export const Inter = font('Inter')
export const Roboto = font('Roboto')
export const Open_Sans = font('Open Sans')
export const Lato = font('Lato')
export const Poppins = font('Poppins')
