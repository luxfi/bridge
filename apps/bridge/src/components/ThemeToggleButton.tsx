'use client'
import { Button } from '@hanzo/ui/primitives'
import React, { useState, useEffect  } from 'react'
import { useTheme } from 'next-themes'

const ThemeToggleButton: React.FC = () => {
  const [mounted, setMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  const swap = () => {
    if (theme === 'dark') {
      setTheme('light')
    }
    else {
      setTheme('dark')
    }
  }


  return <Button onClick={swap} variant='outline' size='default' className='font-sans py-3'>theme: {theme}<br/>Press to swap</Button>
}

export default ThemeToggleButton
