/**
 * Chat input area with file upload buttons
 */

import { useRef } from 'react'
import type { ImageData, AudioData, PdfData, Model } from '@/types/chat'
import { ImagePreview, AudioPreview, PdfPreview } from './FilePreview'
import { Spinner } from './Spinner'
import {
  handleImageUpload,
  handleAudioUpload,
  handlePdfUpload,
} from '@/utils/fileHandlers'
import {
  supportsImageInput,
  supportsAudioInput,
  supportsImageGeneration,
} from '@/utils/modelCapabilities'

interface ChatInputProps {
  inputValue: string
  onInputChange: (value: string) => void
  onSend: () => void
  uploadedImage: ImageData | null
  uploadedAudio: AudioData | null
  uploadedPdf: PdfData | null
  onImageUpload: (image: ImageData) => void
  onAudioUpload: (audio: AudioData) => void
  onPdfUpload: (pdf: PdfData) => void
  onImageRemove: () => void
  onAudioRemove: () => void
  onPdfRemove: () => void
  currentlyStreaming: boolean
  currentlySending: boolean
  selectedModel: Model | undefined
  mcpEnabled: boolean
  mcpToolsCount: number
  mcpAutoApprove: boolean
}

export const ChatInput = ({
  inputValue,
  onInputChange,
  onSend,
  uploadedImage,
  uploadedAudio,
  uploadedPdf,
  onImageUpload,
  onAudioUpload,
  onPdfUpload,
  onImageRemove,
  onAudioRemove,
  onPdfRemove,
  currentlyStreaming,
  currentlySending,
  selectedModel,
  mcpEnabled,
  mcpToolsCount,
  mcpAutoApprove,
}: ChatInputProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="p-6 border-t border-white/20">
      {/* File Previews */}
      {uploadedImage && <ImagePreview image={uploadedImage} onRemove={onImageRemove} />}
      {uploadedAudio && <AudioPreview audio={uploadedAudio} onRemove={onAudioRemove} />}
      {uploadedPdf && <PdfPreview pdf={uploadedPdf} onRemove={onPdfRemove} />}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            handleImageUpload(file, onImageUpload, alert)
          }
        }}
        className="hidden"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            handleAudioUpload(file, onAudioUpload, alert)
          }
        }}
        className="hidden"
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            handlePdfUpload(file, onPdfUpload, alert)
          }
        }}
        className="hidden"
      />

      {/* Input area */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your message..."
          className="flex-1 p-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={currentlyStreaming}
        />

        {/* PDF upload button */}
        <button
          onClick={() => pdfInputRef.current?.click()}
          disabled={currentlyStreaming}
          className="px-4 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          title="Upload PDF"
        >
          📄
        </button>

        {/* Audio upload button */}
        <button
          onClick={() => audioInputRef.current?.click()}
          disabled={currentlyStreaming}
          className="px-4 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          title="Upload audio"
        >
          🎵
        </button>

        {/* Image upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={currentlyStreaming}
          className="px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
          title="Upload image"
        >
          📷
        </button>

        {/* Send button */}
        <button
          onClick={onSend}
          disabled={
            (!inputValue.trim() && !uploadedImage && !uploadedAudio && !uploadedPdf) ||
            currentlyStreaming
          }
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {currentlyStreaming ? currentlySending ? 'Sending...' : <Spinner /> : 'Send'}
        </button>
      </div>

      {/* Help text */}
      <div className="text-xs text-white/50 mt-2">
        <span>Press Enter to send</span>
        {selectedModel && (
          <>
            {supportsImageInput(selectedModel) && <span> • Upload images with 📷 button</span>}
            {supportsAudioInput(selectedModel) && <span> • Upload audio with 🎵 button</span>}
            <span> • Upload PDFs with 📄 button</span>
            {supportsImageGeneration(selectedModel) && <span> • Ask for image generation</span>}
            {mcpEnabled && mcpToolsCount > 0 && (
              <span>
                {' '}
                • MCP tools enabled (🔧 {mcpToolsCount} tools
                {mcpAutoApprove ? ', auto-approved' : ', requires approval'})
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
