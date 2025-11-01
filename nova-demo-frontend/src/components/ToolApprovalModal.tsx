/**
 * Tool call approval modal dialog
 */

import type { ToolCall } from '@/types/chat'

interface ToolApprovalModalProps {
  show: boolean
  toolCalls: ToolCall[]
  onApprove: () => void
  onDecline: () => void
}

export const ToolApprovalModal = ({
  show,
  toolCalls,
  onApprove,
  onDecline,
}: ToolApprovalModalProps) => {
  if (!show) return null

  return (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-white/20 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold mb-4 text-white">🔧 Tool Usage Request</h3>
        <p className="text-white/80 mb-4">The AI wants to use the following tools:</p>
        <div className="space-y-2 mb-6">
          {toolCalls.map((toolCall, index) => (
            <div key={index} className="bg-white/10 rounded p-3">
              <div className="font-medium text-white">
                🔧 {toolCall.function?.name || 'Unknown Tool'}
              </div>
              {toolCall.function?.description && (
                <div className="text-sm text-white/70 mt-1">{toolCall.function.description}</div>
              )}
              <div className="text-xs text-white/60 mt-2">
                Arguments:{' '}
                {JSON.stringify(JSON.parse(toolCall.function?.arguments || '{}'), null, 2)}
              </div>
            </div>
          ))}
        </div>
        <p className="text-white/80 mb-4">Do you approve this action?</p>
        <div className="flex gap-3">
          <button
            onClick={onApprove}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium transition-colors"
          >
            ✅ Approve
          </button>
          <button
            onClick={onDecline}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-medium transition-colors"
          >
            ❌ Decline
          </button>
        </div>
      </div>
    </div>
  )
}
