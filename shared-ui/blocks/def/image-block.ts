import type { Dimensions } from '../../types'
import type Block from './block'

interface ImageBlock extends Block {
  blockType: 'image'
  image?: string,      
  dim:  Dimensions 
}

export {
  type ImageBlock as default,
}