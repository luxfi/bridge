'use client'
import { useState } from 'react'
import { DocIframe } from './docInIframe'
import Modal from './modal/modal'

// REFACTOR MODULE TO USE OURS :aa

const GuideLink: React.FC<{ 
  userGuideUrl: string, 
  text?: string, 
}> = ({ 
  userGuideUrl, 
  text
}) => {
    
  const [showGuide, setShowGuide] = useState(false)

  return (<>
    <span 
      className='text-muted cursor-pointer hover:text-muted-2' 
      onClick={() => {setShowGuide(true)}}
    >
      &nbsp<span>{text}</span>
    </span>
    <Modal
      className='bg-background'
      height='full'
      header={text}
      show={showGuide}
      setShow={setShowGuide}
    >
      <DocIframe onConfirm={() => {setShowGuide(false)}} URl={userGuideUrl} />
    </Modal>
  </>)
}

export default GuideLink
