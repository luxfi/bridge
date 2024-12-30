import { type BackendService } from '../types'
import { default as getSettings } from './get-settings'
import { default as getAssetPrice } from './get-asset-price'

export default {
  getSettings, 
  getAssetPrice
} satisfies BackendService