/**
 * Custom hook for handling tool call approvals
 */

import { useState } from 'react'
import type { Message, ToolCall } from '@/types/chat'

export const useToolApproval = (
  chatMessages: Message[],
  selectedModel: string,
  selectedMcpServer: string,
  onMessageAdd: (message: Message) => void
) => {
  const [showToolApproval, setShowToolApproval] = useState(false)
  const [pendingToolCalls, setPendingToolCalls] = useState<ToolCall[]>([])

  const handleToolCallApproval = async (approved: boolean) => {
    try {
      setShowToolApproval(false)

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/mcp/approve_tool_calls_streaming`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool_calls: pendingToolCalls,
            approved,
            chat_history: chatMessages.map(({ role, content, image, audio, pdf }) => ({
              role,
              content,
              ...(image && { image }),
              ...(audio && { audio }),
              ...(pdf && { pdf }),
            })),
            model_id: selectedModel,
            mcp_server_type: selectedMcpServer,
          }),
        }
      )

      if (!response.body) {
        throw new Error('No response body for streaming')
      }

      const reader = response.body.getReader()
      let accumulatedContent = ''

      // Create a new assistant message for the tool execution result
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }

      onMessageAdd(assistantMessage)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = new TextDecoder().decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') {
              break
            }

            try {
              const parsed = JSON.parse(data)
              if (
                parsed.choices &&
                parsed.choices[0] &&
                parsed.choices[0].delta &&
                parsed.choices[0].delta.content
              ) {
                accumulatedContent += parsed.choices[0].delta.content

                // Update the assistant message with accumulated content
                assistantMessage.content = accumulatedContent
              }
            } catch (e) {
              console.error('Error parsing streaming chunk:', e)
            }
          }
        }
      }

      setPendingToolCalls([])
    } catch (error) {
      console.error('Error handling tool approval:', error)
      setShowToolApproval(false)
      setPendingToolCalls([])

      // Add error message to chat
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Error executing tools: ${error}`,
        timestamp: new Date(),
      }
      onMessageAdd(errorMessage)
    }
  }

  const requestToolApproval = (toolCalls: ToolCall[]) => {
    setPendingToolCalls(toolCalls)
    setShowToolApproval(true)

    // Add a system message to chat
    const approvalMessage: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `🔧 **Tool Usage Request**\n\nI would like to use the following tools:\n${toolCalls
        .map((tc) => `• **${tc.function?.name}**: ${tc.function?.description || 'No description'}`)
        .join('\n')}\n\nDo you approve this action?`,
      timestamp: new Date(),
    }

    onMessageAdd(approvalMessage)
  }

  return {
    showToolApproval,
    pendingToolCalls,
    handleToolCallApproval,
    requestToolApproval,
  }
}
