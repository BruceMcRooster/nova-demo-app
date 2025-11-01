/**
 * Chat-related type definitions
 */

export interface ImageData {
  data: string
  format: string
  url: string
}

export interface AudioData {
  data: string
  format: string
  url: string
}

export interface PdfData {
  data: string
  filename: string
  url: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  image?: ImageData
  audio?: AudioData
  pdf?: PdfData
  timestamp: Date
}

export interface ModelResponsePart {
  choices: Array<{
    delta: {
      content?: string
      image?: ImageData
      images?: Array<{
        type: string
        image_url: {
          url: string
        }
      }>
    }
  }>
}

export interface Model {
  id: string
  name: string
  architecture: {
    input_modalities: string[]
    output_modalities: string[]
  }
}

export interface ToolCall {
  id: string
  type: string
  function: {
    name: string
    description?: string
    arguments: string
  }
}

export interface ChatRequest {
  model_id: string
  chat_history: Message[]
  use_mcp: boolean
  mcp_server_type: string
  mcp_auto_approve: boolean
}
