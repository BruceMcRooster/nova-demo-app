/**
 * File upload preview components
 */

import type { ImageData, AudioData, PdfData } from '@/types/chat'

interface ImagePreviewProps {
  image: ImageData
  onRemove: () => void
}

export const ImagePreview = ({ image, onRemove }: ImagePreviewProps) => {
  return (
    <div className="mb-4 relative inline-block">
      <img
        src={image.url}
        alt="Upload preview"
        className="max-h-32 rounded-lg border border-white/20"
      />
      <button
        onClick={onRemove}
        className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
      >
        ×
      </button>
    </div>
  )
}

interface AudioPreviewProps {
  audio: AudioData
  onRemove: () => void
}

export const AudioPreview = ({ audio, onRemove }: AudioPreviewProps) => {
  return (
    <div className="mb-4 relative inline-block">
      <div className="bg-white/10 border border-white/20 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-white/70">🎵 Audio file ({audio.format})</span>
          <button
            onClick={onRemove}
            className="bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
          >
            ×
          </button>
        </div>
        <audio
          controls
          src={audio.url}
          className="w-full max-w-sm"
          style={{ filter: 'invert(1) hue-rotate(180deg)' }}
        >
          Your browser does not support the audio element.
        </audio>
      </div>
    </div>
  )
}

interface PdfPreviewProps {
  pdf: PdfData
  onRemove: () => void
}

export const PdfPreview = ({ pdf, onRemove }: PdfPreviewProps) => {
  return (
    <div className="mb-4 relative inline-block">
      <div className="bg-white/10 border border-white/20 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-white/70">📄 PDF file: {pdf.filename}</span>
          <button
            onClick={onRemove}
            className="bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
          >
            ×
          </button>
        </div>
        <div className="flex gap-2">
          <a
            href={pdf.url}
            download={pdf.filename}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
          >
            Download
          </a>
          <a
            href={pdf.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
          >
            Open
          </a>
        </div>
      </div>
    </div>
  )
}
