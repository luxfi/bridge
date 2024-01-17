import React from 'react'

import type { Metadata } from 'next'

import {
  IconDescriptor,
  TemplateString,
  Author,
  ThemeColorDescriptor
} from './next-metadata-types'

const Icons: React.FC<{icons: IconDescriptor[]}> = ({
  icons
}) => {
  return <>
  {icons.map(({url, ...rest}: IconDescriptor, index) => (
    <link {...rest} href={
      (typeof url === 'string') ? (url as string) : (url.href)
    }/>
  )}
  </>
}

const Title: React.FC<{title: string | TemplateString | null | undefined}> = ({
  title
}) => {

  if (!title) {
    return null
  }
  if (typeof title === 'object') {
    if ('default' in title) {
      return (
        <title>{title.default}</title>
      )
    }
    else if ('absolute' in title) {
      return (
        <title>{title.absolute}</title>
      )
    }
  }
  return <title>{title as string}</title>
}

const Authors: React.FC<{
  authors: null | undefined | Author | Array<Author>
}> = ({
  authors
}) => {

  const Author: React.FC<{author: Author}> = ({author}) => (<>
    {author.name && <meta name="author" content={author.name}  />}
    {author.url && <link rel="author" href={
      (typeof author.url === 'string') ? (author.url as string) : (author.url.href)
    }/>}
  </>)

  if (!authors) {
    return null
  }

  if (Array.isArray(authors)) {
    return (<>
      {authors.map((el: Author, index) => (
        <Author author={el} key={`authors-${index}`} /> 
      ))}
    </>)
  }
  return (<Author author={authors as Author} />) 
}

const Keywords: React.FC<{keywords: undefined | null | string | Array<string>}> = ({
  keywords 
}) => {
  if (!keywords) return null
  const content = (Array.isArray(keywords) ? keywords.join(', ') : keywords as string)
  return (<meta name="keywords" content={content} />)
}

const ThemeColor: React.FC<{
  thColors: null | undefined | string | ThemeColorDescriptor | ThemeColorDescriptor[]
}> = ({
  thColors
}) => {

  const ThColor: React.FC<{thColor: ThemeColorDescriptor}> = ({thColor}) => {
    const toSpread: any = {
      content: thColor.color
    }

    if ('media' in thColor) {
      toSpread.media = thColor.media
    }

    return <meta name="theme-color" {...toSpread}/>
  }

  if (!thColors) {
    return null
  }

  if (Array.isArray(thColors)) {
    return (<>
      {thColors.map((el: ThemeColorDescriptor, index) => (
        <ThColor thColor={el} key={`theme-colors-${index}`} /> 
      ))}
    </>)
  }
  else if (typeof thColors === 'string') {
    <meta name="theme-color" content={thColors as string}/> 
  }
  return (<ThColor thColor={thColors as ThemeColorDescriptor} />) 
}

const Manifest: React.FC<{
  manifest: undefined | null | string | URL
}> = ({
  manifest
}) => (
  manifest && (<link rel="manifest" href={
      (typeof manifest === 'string') ? (manifest as string) : (manifest.href)
  }/>)
)


  // For use with pages router only.
  // App router does this automatically if you export the metadata object
const HeadMetadataComponent: React.FC<{
  metadata: Metadata
}> = ({
  metadata
}) => {
  return <>
    <Title title={metadata.title}/>
    {metadata.description && (      
      <meta name="description" content={metadata.description} />
    )}
    {metadata.applicationName && (      
      <meta name="application-name" content={metadata.applicationName} />
    )}
    <Authors authors={metadata.authors} />
    <Keywords keywords={metadata.keywords} />
    <ThemeColor thColors={metadata.themeColor} />
      {/* Icons: We only support this format for now */}
    <Icons icons={metadata.icons as IconDescriptor[]} />
    <Manifest manifest={metadata.manifest} />
  </>
}

export default HeadMetadataComponent
