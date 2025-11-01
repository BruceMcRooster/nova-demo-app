/**
 * Chat header with model selection and MCP controls
 */

import type { Model } from '@/types/chat'
import { ModelSelector } from './ModelSelector'
import { ModelCapabilities } from './ModelCapabilities'
import { MCPControls } from './MCPControls'

interface ChatHeaderProps {
  availableModels: Model[] | undefined
  selectedModel: string
  onModelSelect: (modelId: string) => void
  currentlyStreaming: boolean
  selectedModelData: Model | undefined
  mcpEnabled: boolean
  onMcpEnabledChange: (enabled: boolean) => void
  selectedMcpServer: string
  onMcpServerChange: (server: string) => void
  mcpServers: string[]
  mcpAutoApprove: boolean
  onMcpAutoApproveChange: (autoApprove: boolean) => void
  mcpTools: any[]
}

export const ChatHeader = ({
  availableModels,
  selectedModel,
  onModelSelect,
  currentlyStreaming,
  selectedModelData,
  mcpEnabled,
  onMcpEnabledChange,
  selectedMcpServer,
  onMcpServerChange,
  mcpServers,
  mcpAutoApprove,
  onMcpAutoApproveChange,
  mcpTools,
}: ChatHeaderProps) => {
  return (
    <div className="p-6 border-b border-white/20">
      <h1 className="text-2xl mb-4">Nova Chat Demo</h1>
      <div className="flex items-center gap-4">
        <label className="text-sm">Model:</label>
        <ModelSelector
          availableModels={availableModels}
          selectedModel={selectedModel}
          onModelSelect={onModelSelect}
          disabled={currentlyStreaming}
        />
      </div>

      <ModelCapabilities model={selectedModelData} />

      <MCPControls
        mcpEnabled={mcpEnabled}
        onMcpEnabledChange={onMcpEnabledChange}
        selectedMcpServer={selectedMcpServer}
        onMcpServerChange={onMcpServerChange}
        mcpServers={mcpServers}
        mcpAutoApprove={mcpAutoApprove}
        onMcpAutoApproveChange={onMcpAutoApproveChange}
        mcpTools={mcpTools}
      />
    </div>
  )
}
