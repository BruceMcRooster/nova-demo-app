import { createFileRoute } from '@tanstack/react-router'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import 'highlight.js/styles/github-dark.css'

// Types
import type { Message, ImageData, AudioData, PdfData } from '@/types/chat'

// Hooks
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { useMCP } from '@/hooks/useMCP'
import { useChatStreaming } from '@/hooks/useChatStreaming'
import { useToolApproval } from '@/hooks/useToolApproval'

// Components
import { ChatHeader } from '@/components/ChatHeader'
import { ChatMessages } from '@/components/ChatMessages'
import { ChatInput } from '@/components/ChatInput'
import { ToolApprovalModal } from '@/components/ToolApprovalModal'

export const Route = createFileRoute('/')({
  component: ChatDemo,
})
function ChatDemo() {
  // State management
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [lastMessage, setLastMessage] = useState<string>('')
  const [inputValue, setInputValue] = useState('')
  const [uploadedImage, setUploadedImage] = useState<ImageData | null>(null)
  const [uploadedAudio, setUploadedAudio] = useState<AudioData | null>(null)
  const [uploadedPdf, setUploadedPdf] = useState<PdfData | null>(null)
  const [selectedModel, setSelectedModel] = useState('qwen/qwen3-vl-30b-a3b-instruct')
  const [mcpEnabled, setMcpEnabled] = useState(false)
  const [selectedMcpServer, setSelectedMcpServer] = useState('cmu_api')
  const [mcpAutoApprove, setMcpAutoApprove] = useState(true)

  // Fetch available models
  const { data: availableModels } = useAvailableModels()
  const selectedModelData = availableModels?.find((m) => m.id === selectedModel)

  // MCP integration
  const { mcpServers, mcpTools } = useMCP(mcpEnabled, selectedMcpServer)

  // Tool approval handling
  const { showToolApproval, pendingToolCalls, handleToolCallApproval, requestToolApproval } =
    useToolApproval(chatMessages, selectedModel, selectedMcpServer, (message) =>
      setChatMessages((prev) => [...prev, message])
    )

  // Streaming chat
  const { currentlyStreaming, currentlySending } = useChatStreaming({
    chatMessages,
    selectedModel,
    mcpEnabled,
    selectedMcpServer,
    mcpAutoApprove,
    lastMessage,
    onMessageUpdate: (content, image) => {
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content,
        ...(image && { image }),
        timestamp: new Date(),
      }

      setChatMessages((prev) => {
        if (prev.length === 0 || prev[prev.length - 1].role !== 'assistant') {
          return [...prev, assistantMessage]
        } else {
          const newMessages = [...prev]
          newMessages[newMessages.length - 1] = assistantMessage
          return newMessages
        }
      })
    },
    onToolCallsRequest: requestToolApproval,
  })

  // Message sending handler
  const handleSendMessage = () => {
    if (!inputValue.trim() && !uploadedImage && !uploadedAudio && !uploadedPdf) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content:
        inputValue.trim() ||
        (uploadedImage
          ? 'Image uploaded'
          : uploadedAudio
            ? 'Audio uploaded'
            : 'PDF uploaded'),
      image: uploadedImage || undefined,
      audio: uploadedAudio || undefined,
      pdf: uploadedPdf || undefined,
      timestamp: new Date(),
    }

    setChatMessages((prev) => [...prev, userMessage])
    setLastMessage(
      inputValue.trim() ||
        (uploadedImage
          ? 'Describe this image'
          : uploadedAudio
            ? 'Transcribe this audio'
            : 'Analyze this document')
    )

    // Reset inputs
    setInputValue('')
    setUploadedImage(null)
    setUploadedAudio(null)
    setUploadedPdf(null)
  }

  return (
    <div
      className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-100 to-blue-100 p-4 text-white"
      style={{
        background:
          'linear-gradient(180deg, #101C1C -89.89%, #101C1C -5.74%, #173C46 32.51%, #226981 56.18%, #33B2E2 71.72%, #F1EDE6 85.34%, #FF8945 101.72%), #CCC',
      }}
    >
      <div className="w-full max-w-4xl h-[80vh] flex flex-col rounded-[20px] bg-[#101C1C]">
        <ChatHeader
          availableModels={availableModels}
          selectedModel={selectedModel}
          onModelSelect={setSelectedModel}
          currentlyStreaming={currentlyStreaming}
          selectedModelData={selectedModelData}
          mcpEnabled={mcpEnabled}
          onMcpEnabledChange={setMcpEnabled}
          selectedMcpServer={selectedMcpServer}
          onMcpServerChange={setSelectedMcpServer}
          mcpServers={mcpServers}
          mcpAutoApprove={mcpAutoApprove}
          onMcpAutoApproveChange={setMcpAutoApprove}
          mcpTools={mcpTools}
        />

        <ChatMessages messages={chatMessages} />

        <ToolApprovalModal
          show={showToolApproval}
          toolCalls={pendingToolCalls}
          onApprove={() => handleToolCallApproval(true)}
          onDecline={() => handleToolCallApproval(false)}
        />

        <ChatInput
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSend={handleSendMessage}
          uploadedImage={uploadedImage}
          uploadedAudio={uploadedAudio}
          uploadedPdf={uploadedPdf}
          onImageUpload={setUploadedImage}
          onAudioUpload={setUploadedAudio}
          onPdfUpload={setUploadedPdf}
          onImageRemove={() => setUploadedImage(null)}
          onAudioRemove={() => setUploadedAudio(null)}
          onPdfRemove={() => setUploadedPdf(null)}
          currentlyStreaming={currentlyStreaming}
          currentlySending={currentlySending}
          selectedModel={selectedModelData}
          mcpEnabled={mcpEnabled}
          mcpToolsCount={mcpTools.length}
          mcpAutoApprove={mcpAutoApprove}
        />
      </div>
      <ReactQueryDevtools initialIsOpen={false} />
    </div>
  )
}
