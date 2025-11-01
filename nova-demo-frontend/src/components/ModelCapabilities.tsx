/**
 * Model capabilities display component
 */

import type { Model } from '@/types/chat'
import {
  supportsImageInput,
  supportsAudioInput,
  supportsImageGeneration,
} from '@/utils/modelCapabilities'

interface ModelCapabilitiesProps {
  model: Model | undefined
}

export const ModelCapabilities = ({ model }: ModelCapabilitiesProps) => {
  if (!model) return null

  return (
    <div className="mt-3 text-xs text-white/70">
      <span>Capabilities: </span>
      {supportsImageInput(model) && (
        <span className="bg-green-500/20 text-green-300 px-2 py-1 rounded mr-2">
          👁️ Can view images
        </span>
      )}
      {supportsAudioInput(model) && (
        <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded mr-2">
          🎵 Can process audio
        </span>
      )}
      <span className="bg-red-500/20 text-red-300 px-2 py-1 rounded mr-2">
        📄 Can process PDFs
      </span>
      {supportsImageGeneration(model) && (
        <span className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded mr-2">
          🎨 Can generate images
        </span>
      )}
    </div>
  )
}
