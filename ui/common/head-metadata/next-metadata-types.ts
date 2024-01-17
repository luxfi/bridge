// from next.js mono
// packages/next/src/lib/metadata/types/metadata-types.ts

export type IconDescriptor = {
  url: string | URL
  type?: string
  sizes?: string
  color?: string
  /** defaults to rel="icon" unless superseded by Icons map */
  rel?: string
  media?: string
  /**
   * @see https://developer.mozilla.org/docs/Web/API/HTMLImageElement/fetchPriority
   */
  fetchPriority?: 'high' | 'low' | 'auto'
}

export type TemplateString =
  | DefaultTemplateString
  | AbsoluteTemplateString
  | AbsoluteString
type DefaultTemplateString = {
  default: string
  template: string
}
type AbsoluteTemplateString = {
  absolute: string
  template: string | null
}
type AbsoluteString = {
  absolute: string
}

export type Author = {
  // renders as <link rel="author"...
  url?: string | URL
  // renders as <meta name="author"...
  name?: string
}

export type ThemeColorDescriptor = {
  color: string
  media?: string
}
