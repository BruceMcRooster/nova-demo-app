/**
 * Utility functions for checking model capabilities
 */

import type { Model } from '@/types/chat'

export const supportsImageInput = (model: Model | undefined): boolean => {
  if (!model) return false
  return (
    model.architecture?.input_modalities?.includes('image') ||
    model.id?.includes('vision') ||
    model.id?.includes('vl-') ||
    model.name?.toLowerCase().includes('vision')
  )
}

export const supportsAudioInput = (model: Model | undefined): boolean => {
  if (!model) return false
  return (
    model.architecture?.input_modalities?.includes('audio') ||
    model.id?.includes('whisper') ||
    model.id?.includes('speech') ||
    model.name?.toLowerCase().includes('audio')
  )
}

export const supportsImageGeneration = (model: Model | undefined): boolean => {
  if (!model) return false
  return (
    model.architecture?.output_modalities?.includes('image') ||
    model.id?.includes('flux') ||
    model.id?.includes('dalle') ||
    model.id?.includes('midjourney') ||
    model.id?.includes('stable-diffusion')
  )
}
