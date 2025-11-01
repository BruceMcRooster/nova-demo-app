/**
 * Model selection dropdown with search functionality
 */

import { useRef, useEffect, useState } from 'react'
import type { Model } from '@/types/chat'
import {
  supportsImageInput,
  supportsAudioInput,
  supportsImageGeneration,
} from '@/utils/modelCapabilities'

interface ModelSelectorProps {
  availableModels: Model[] | undefined
  selectedModel: string
  onModelSelect: (modelId: string) => void
  disabled?: boolean
}

export const ModelSelector = ({
  availableModels,
  selectedModel,
  onModelSelect,
  disabled = false,
}: ModelSelectorProps) => {
  const [modelSearchOpen, setModelSearchOpen] = useState(false)
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const modelSearchRef = useRef<HTMLDivElement>(null)

  const selectedModelData = availableModels?.find((m) => m.id === selectedModel)

  // Filter models based on search query
  const filteredModels =
    availableModels?.filter(
      (model) =>
        (model.name || model.id).toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
        model.id.toLowerCase().includes(modelSearchQuery.toLowerCase())
    ) || []

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelSearchRef.current && !modelSearchRef.current.contains(event.target as Node)) {
        setModelSearchOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className="relative" ref={modelSearchRef}>
      <button
        onClick={() => setModelSearchOpen(!modelSearchOpen)}
        className="bg-white/10 border border-white/20 rounded px-3 py-1 text-white min-w-[200px] text-left flex items-center justify-between"
        disabled={disabled}
      >
        <div className="flex items-center justify-between flex-1">
          <span className="truncate">{selectedModelData?.name || selectedModel}</span>
          <div className="flex items-center gap-1 ml-2">
            {selectedModelData && supportsImageInput(selectedModelData) && (
              <span className="text-xs text-green-300" title="Supports image input">
                👁️
              </span>
            )}
            {selectedModelData && supportsAudioInput(selectedModelData) && (
              <span className="text-xs text-blue-300" title="Supports audio input">
                🎵
              </span>
            )}
            {selectedModelData && supportsImageGeneration(selectedModelData) && (
              <span className="text-xs text-purple-300" title="Can generate images">
                🎨
              </span>
            )}
          </div>
        </div>
        <svg
          className={`w-4 h-4 transition-transform ${modelSearchOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {modelSearchOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-white/20 rounded-lg shadow-lg z-50 max-h-60 overflow-hidden">
          <div className="p-2 border-b border-white/20">
            <input
              type="text"
              placeholder="Search models..."
              value={modelSearchQuery}
              onChange={(e) => setModelSearchQuery(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded px-2 py-1 text-white placeholder-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div className="max-h-40 overflow-y-auto">
            {filteredModels.length === 0 ? (
              <div className="p-3 text-white/50 text-sm">No models found</div>
            ) : (
              filteredModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onModelSelect(model.id)
                    setModelSearchOpen(false)
                    setModelSearchQuery('')
                  }}
                  className={`w-full text-left p-2 text-sm hover:bg-white/10 border-b border-white/5 last:border-b-0 ${
                    selectedModel === model.id ? 'bg-blue-600/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-white">{model.name || model.id}</div>
                      <div className="text-xs text-white/70 truncate">{model.id}</div>
                    </div>
                    <div className="flex gap-1">
                      {supportsImageInput(model) && (
                        <span
                          className="text-xs bg-green-500/20 text-green-300 px-1 py-0.5 rounded"
                          title="Supports image input"
                        >
                          👁️
                        </span>
                      )}
                      {supportsAudioInput(model) && (
                        <span
                          className="text-xs bg-blue-500/20 text-blue-300 px-1 py-0.5 rounded"
                          title="Supports audio input"
                        >
                          🎵
                        </span>
                      )}
                      {supportsImageGeneration(model) && (
                        <span
                          className="text-xs bg-purple-500/20 text-purple-300 px-1 py-0.5 rounded"
                          title="Can generate images"
                        >
                          🎨
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
