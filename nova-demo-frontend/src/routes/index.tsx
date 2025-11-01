import { createFileRoute } from '@tanstack/react-router'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { experimental_streamedQuery as streamedQuery } from '@tanstack/react-query'
import { useState, useRef, useEffect } from 'react'
import 'highlight.js/styles/github-dark.css'
import { Spinner } from '@/components/Spinner'
import MessageContent from '@/components/MessageContent'

export const Route = createFileRoute('/')({
  component: ChatDemo,
})

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  image?: {
    data: string
    format: string
    url: string
  }
  audio?: {
    data: string
    format: string
    url: string
  }
  pdf?: {
    data: string
    filename: string
    url: string
  }
  timestamp: Date
}

interface ModelResponsePart {
  choices: Array<{
    delta: {
      content?: string
      image?: {
        data: string
        format: string
        url: string
      }
      images?: Array<{
        type: string
        image_url: {
          url: string
        }
      }>
    }
  }>
}



function ChatDemo() {
  const [inputValue, setInputValue] = useState('')
  const [uploadedImage, setUploadedImage] = useState<{
    data: string
    format: string
    url: string
  } | null>(null)
  const [uploadedAudio, setUploadedAudio] = useState<{
    data: string
    format: string
    url: string
  } | null>(null)
  const [uploadedPdf, setUploadedPdf] = useState<{
    data: string
    filename: string
    url: string
  } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [lastMessage, setLastMessage] = useState<string>("")

  // Chat query with streaming
  const streamingQuery = queryOptions({
    queryKey: ['chat', lastMessage],
    queryFn: streamedQuery({
      streamFn: async function () {
        const chat_history = chatMessages.map(({ role, content, image, audio, pdf }) => ({
          role,
          content,
          ...(image && { image }),
          ...(audio && { audio }),
          ...(pdf && { pdf })
        }))
        const response = await fetch(`${import.meta.env.VITE_API_URL}/chat_streaming`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            model_id: selectedModel,
            chat_history,
            use_mcp: mcpEnabled,
            mcp_server_type: selectedMcpServer,
            mcp_auto_approve: mcpAutoApprove
          }),
        });

        if (!response.body) {
          throw new Error('No response body for streaming');
        }
        const reader = response.body.getReader();
        return (async function* () {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              return;
            }
            // Assuming the stream sends text chunks
            yield new TextDecoder().decode(value);
          }
        })();
      },
    }),
    enabled: chatMessages.length > 0,
    refetchInterval: Infinity, // effectively infinite
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })

  const { data: streamingMessage, isFetching: currentlyStreaming, isPending: currentlySending } = useQuery(streamingQuery)
  useEffect(() => {
    try {
      console.log("Raw streaming message:", streamingMessage)
      
      // Combine all chunks and handle incomplete JSON objects
      const combinedChunks = streamingMessage?.join('') || ''
      
      // Split on complete JSON object boundaries while preserving incomplete ones
      const jsonObjects: string[] = []
      let currentObject = ''
      let braceCount = 0
      let inString = false
      let escapeNext = false
      
      for (let i = 0; i < combinedChunks.length; i++) {
        const char = combinedChunks[i]
        currentObject += char
        
        if (escapeNext) {
          escapeNext = false
          continue
        }
        
        if (char === '\\') {
          escapeNext = true
          continue
        }
        
        if (char === '"') {
          inString = !inString
          continue
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++
          } else if (char === '}') {
            braceCount--
            
            // Complete JSON object found
            if (braceCount === 0 && currentObject.trim()) {
              jsonObjects.push(currentObject.trim())
              currentObject = ''
            }
          }
        }
      }
      
      // Add any remaining incomplete object (will be completed in next update)
      if (currentObject.trim() && braceCount > 0) {
        console.log("Incomplete JSON object detected, waiting for completion:", currentObject.trim())
      }
      
      console.log("Parsed JSON objects:", jsonObjects)
      
      // Parse valid JSON objects
      const messages = jsonObjects.map(chunk => {
        try {
          const parsed = JSON.parse(chunk)
          
          // Check for tool call approval requests
          if (parsed?.type === 'tool_calls_pending') {
            console.log("Tool calls pending approval:", parsed)
            setPendingToolCalls(parsed.tool_calls || [])
            setShowToolApproval(true)
            
            // Add a system message to chat
            const approvalMessage = {
              id: Date.now().toString(),
              role: 'assistant' as const,
              content: `🔧 **Tool Usage Request**\n\nI would like to use the following tools:\n${(parsed.tool_calls || []).map((tc: any) => `• **${tc.function?.name}**: ${tc.function?.description || 'No description'}`).join('\n')}\n\nDo you approve this action?`,
              timestamp: new Date(),
            }
            
            setChatMessages((prev) => [...prev, approvalMessage])
            return null // Don't process this as a regular message
          }
          
          // Log any message that might contain image data
          if (parsed?.choices?.[0]?.delta?.image || 
              parsed?.choices?.[0]?.message?.image ||
              (parsed?.choices?.[0]?.delta?.content && parsed.choices[0].delta.content.includes('image'))) {
            console.log("Found potential image data:", parsed)
          }
          return parsed
        } catch (e) {
          console.error("Error parsing chunk:", chunk, e)
          return null
        }
      }).filter(Boolean) as ModelResponsePart[]
      
      // accumulate content and images
      const accLastMessage = messages?.reduce((acc, cur: ModelResponsePart) => acc.concat(cur?.choices?.[0]?.delta?.content || ""), '') || ''
      
      // Check for image in the streaming response - OpenRouter may return images in different formats
      let assistantImage = null
      
      // Check for new format: delta.images array with image_url.url
      const imageInImages = messages?.find(msg => msg?.choices?.[0]?.delta?.images && msg.choices[0].delta.images.length > 0)
      if (imageInImages) {
        const imageData = imageInImages.choices[0].delta.images?.[0]?.image_url?.url
        if (imageData) {
          console.log("Found image in delta.images format:", imageData)
          
          // Handle both data URLs and regular URLs
          if (imageData.startsWith('data:image/')) {
            const base64Match = imageData.match(/data:image\/([^;]+);base64,(.+)/)
            if (base64Match) {
              assistantImage = {
                url: imageData,
                data: base64Match[2],
                format: base64Match[1]
              }
            }
          } else {
            assistantImage = {
              url: imageData,
              data: '',
              format: imageData.split('.').pop()?.split('?')[0] || 'jpg'
            }
          }
        }
      }
      
      // Check for image in delta (legacy format)
      if (!assistantImage) {
        const imageInDelta = messages?.find(msg => msg?.choices?.[0]?.delta?.image)?.choices?.[0]?.delta?.image
        if (imageInDelta) {
          assistantImage = imageInDelta
        }
      }
      
      // Check for image URL in content (some models return image URLs)
      if (!assistantImage) {
        const imageUrlInContent = messages?.find(msg => {
          const content = msg?.choices?.[0]?.delta?.content
          return content && (content.includes('http') && (content.includes('.jpg') || content.includes('.png') || content.includes('.webp') || content.includes('image')))
        })
        
        if (imageUrlInContent) {
          const content = imageUrlInContent.choices[0].delta.content
          if (content) {
            const urlMatch = content.match(/(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|webp|gif))/i)
            if (urlMatch) {
              assistantImage = {
                url: urlMatch[0],
                data: '', // No base64 data for URL images
                format: urlMatch[0].split('.').pop() || 'jpg'
              }
            }
          }
        }
      }
      
      // Check for base64 image data in response (legacy format)
      const base64ImageMatch = messages?.find(msg => {
        const content = msg?.choices?.[0]?.delta?.content
        return content && content.includes('data:image/')
      })
      
      if (base64ImageMatch && !assistantImage) {
        const content = base64ImageMatch.choices[0].delta.content
        if (content) {
          const base64Match = content.match(/data:image\/([^;]+);base64,([^"'\s]+)/i)
          if (base64Match) {
            assistantImage = {
              url: base64Match[0],
              data: base64Match[2],
              format: base64Match[1]
            }
          }
        }
      }
      
      if (accLastMessage || assistantImage) {
        console.log("Creating assistant message with:", { 
          content: accLastMessage, 
          hasImage: !!assistantImage, 
          imageData: assistantImage 
        })
        
        const assistantMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: accLastMessage,
          ...(assistantImage && { image: assistantImage }),
          timestamp: new Date(),
        }
        if (chatMessages.length === 0 || chatMessages[chatMessages.length - 1].role !== 'assistant') {
          // first assistant message
          setChatMessages((prev) => [...prev, assistantMessage])
        } else {
          // update last assistant message
          setChatMessages((prev) => {
            const newMessages = [...prev]
            newMessages[newMessages.length - 1] = assistantMessage
            return newMessages
          })
        }
      }
    } catch (error) {
      console.error("Error parsing streaming message:", error, streamingMessage)
    }

  }, [streamingMessage])
  // Available models query
  const { data: availableModels } = useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const response = await fetch('https://openrouter.ai/api/v1/models')
      const data = await response.json()
      return data.data || []
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const [selectedModel, setSelectedModel] = useState('qwen/qwen3-vl-30b-a3b-instruct')
  const [modelSearchOpen, setModelSearchOpen] = useState(false)
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const modelSearchRef = useRef<HTMLDivElement>(null)
  
  // MCP state
  const [mcpEnabled, setMcpEnabled] = useState(false)
  const [selectedMcpServer, setSelectedMcpServer] = useState('cmu_api')
  const [mcpServers, setMcpServers] = useState<string[]>(['cmu_api'])
  const [mcpTools, setMcpTools] = useState<any[]>([])
  const [mcpAutoApprove, setMcpAutoApprove] = useState(true)
  const [pendingToolCalls, setPendingToolCalls] = useState<any[]>([])
  const [showToolApproval, setShowToolApproval] = useState(false)

  // Fetch available MCP servers
  const { data: mcpServersData } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/mcp/servers`)
        const data = await response.json()
        return data
      } catch (error) {
        console.error('Failed to fetch MCP servers:', error)
        return { servers: [] }
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Fetch MCP tools when server changes
  const { data: mcpToolsData } = useQuery({
    queryKey: ['mcp-tools', selectedMcpServer],
    queryFn: async () => {
      if (!mcpEnabled) return { tools: [] }
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/mcp/tools/${selectedMcpServer}`)
        const data = await response.json()
        return data
      } catch (error) {
        console.error('Failed to fetch MCP tools:', error)
        return { tools: [] }
      }
    },
    enabled: mcpEnabled,
    staleTime: 60 * 1000, // 1 minute
  })

  // Update MCP state when data changes
  useEffect(() => {
    if (mcpServersData?.servers) {
      setMcpServers(mcpServersData.servers)
    }
  }, [mcpServersData])

  useEffect(() => {
    if (mcpToolsData?.tools) {
      setMcpTools(mcpToolsData.tools)
    }
  }, [mcpToolsData])

  // Filter models based on search query
  const filteredModels = availableModels?.filter((model: any) =>
    (model.name || model.id).toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
    model.id.toLowerCase().includes(modelSearchQuery.toLowerCase())
  ) || []

  // Helper function to check if model supports audio input
  const supportsAudioInput = (model: any) => {
    return model?.architecture?.input_modalities?.includes('audio') ||
           model?.id?.includes('whisper') ||
           model?.id?.includes('speech') ||
           model?.name?.toLowerCase().includes('audio')
  }

  // Helper function to check if model supports image generation
  const supportsImageGeneration = (model: any) => {
    return model?.architecture?.output_modalities?.includes('image') || 
           model?.id?.includes('flux') || 
           model?.id?.includes('dalle') || 
           model?.id?.includes('midjourney') ||
           model?.id?.includes('stable-diffusion')
  }

  // Helper function to check if model supports image input
  const supportsImageInput = (model: any) => {
    return model?.architecture?.input_modalities?.includes('image') ||
           model?.id?.includes('vision') ||
           model?.id?.includes('vl-') ||
           model?.name?.toLowerCase().includes('vision')
  }

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

  const handleAudioUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    console.log("Selected audio file:", file)
    if (!file) return

    // Check if it's an audio file
    if (!file.type.startsWith('audio/')) {
      alert('Please upload an audio file')
      return
    }

    // Check file size (limit to 25MB for audio)
    if (file.size > 25 * 1024 * 1024) {
      alert('Audio file size should be less than 25MB')
      return
    }

    // Check supported formats
    const supportedFormats = ['wav', 'mp3']
    const fileFormat = file.name.split('.').pop() || ''
    if (!supportedFormats.includes(fileFormat)) {
      alert('Supported audio formats: WAV, MP3')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      const base64Data = result.split(',')[1] // Remove data:audio/...;base64, prefix
      const format = fileFormat // Use extracted format
      console.log("Audio file uploaded:", { format, size: file.size })
      setUploadedAudio({
        data: base64Data,
        format: format,
        url: result // Full data URL for preview
      })
    }
    reader.readAsDataURL(file)
  }

  const handlePdfUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    console.log("Selected PDF file:", file)
    if (!file) return

    // Check if it's a PDF file
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file')
      return
    }

    // Check file size (limit to 50MB for PDFs)
    if (file.size > 50 * 1024 * 1024) {
      alert('PDF file size should be less than 50MB')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      console.log("pdf e", e)
      const result = e.target?.result as string
      const base64Data = result.split(',').splice(1).join(',') // Remove data:application/pdf;base64, prefix
      console.log("PDF file uploaded:", { filename: file.name, size: file.size })
      setUploadedPdf({
        data: base64Data,
        filename: file.name,
        url: result // Full data URL for preview/download
      })
    }
    reader.readAsDataURL(file)
  }

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file')
      return
    }

    // Check file size (limit to 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image size should be less than 10MB')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const result = e.target?.result as string
      const base64Data = result.split(',')[1] // Remove data:image/...;base64, prefix
      const format = file.type.split('/')[1] // Get format (jpg, png, etc.)
      
      setUploadedImage({
        data: base64Data,
        format: format,
        url: result // Full data URL for preview
      })
    }
    reader.readAsDataURL(file)
  }

  const removeImage = () => {
    setUploadedImage(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeAudio = () => {
    setUploadedAudio(null)
    if (audioInputRef.current) {
      audioInputRef.current.value = ''
    }
  }

  const removePdf = () => {
    setUploadedPdf(null)
    if (pdfInputRef.current) {
      pdfInputRef.current.value = ''
    }
  }

  const handleToolCallApproval = async (approved: boolean) => {
    try {
      setShowToolApproval(false)

      const response = await fetch(`${import.meta.env.VITE_API_URL}/mcp/approve_tool_calls_streaming`, {
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
            ...(pdf && { pdf })
          })),
          model_id: selectedModel,
          mcp_server_type: selectedMcpServer
        })
      })
      
      if (!response.body) {
        throw new Error('No response body for streaming');
      }
      
      const reader = response.body.getReader();
      let accumulatedContent = '';
      
      // Create a new assistant message for the tool execution result
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }
      
      setChatMessages((prev) => [...prev, assistantMessage])
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              break;
            }
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                accumulatedContent += parsed.choices[0].delta.content;
                
                // Update the assistant message with accumulated content
                setChatMessages((prev) => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = {
                    ...assistantMessage,
                    content: accumulatedContent
                  };
                  return newMessages;
                });
              }
            } catch (e) {
              console.error('Error parsing streaming chunk:', e);
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
      setChatMessages((prev) => [...prev, errorMessage])
    }
  }

  const handleSendMessage = () => {
    if (!inputValue.trim() && !uploadedImage && !uploadedAudio && !uploadedPdf) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim() || (uploadedImage ? 'Image uploaded' : uploadedAudio ? 'Audio uploaded' : 'PDF uploaded'),
      image: uploadedImage || undefined,
      audio: uploadedAudio || undefined,
      pdf: uploadedPdf || undefined,
      timestamp: new Date(),
    }
    setChatMessages((prev) => [...prev, userMessage])
    setLastMessage(inputValue.trim() || (uploadedImage ? 'Describe this image' : uploadedAudio ? 'Transcribe this audio' : 'Analyze this document'))

    setInputValue('')
    setUploadedImage(null)
    setUploadedAudio(null)
    setUploadedPdf(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (audioInputRef.current) {
      audioInputRef.current.value = ''
    }
    if (pdfInputRef.current) {
      pdfInputRef.current.value = ''
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages])


  return (
    <div
      className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-100 to-blue-100 p-4 text-white"
      style={{
        background: 'linear-gradient(180deg, #101C1C -89.89%, #101C1C -5.74%, #173C46 32.51%, #226981 56.18%, #33B2E2 71.72%, #F1EDE6 85.34%, #FF8945 101.72%), #CCC',
      }}
    >
      <div className="w-full max-w-4xl h-[80vh] flex flex-col rounded-[20px] bg-[#101C1C]">

        {/* Header */}
        <div className="p-6 border-b border-white/20">
          <h1 className="text-2xl mb-4">Nova Chat Demo</h1>
          <div className="flex items-center gap-4">
            <label className="text-sm">Model:</label>
            <div className="relative" ref={modelSearchRef}>
              <button
                onClick={() => setModelSearchOpen(!modelSearchOpen)}
                className="bg-white/10 border border-white/20 rounded px-3 py-1 text-white min-w-[200px] text-left flex items-center justify-between"
                disabled={currentlyStreaming}
              >
                <div className="flex items-center justify-between flex-1">
                  <span className="truncate">
                    {availableModels?.find((m: any) => m.id === selectedModel)?.name || selectedModel}
                  </span>
                  <div className="flex items-center gap-1 ml-2">
                    {availableModels?.find((m: any) => m.id === selectedModel) && supportsImageInput(availableModels.find((m: any) => m.id === selectedModel)) && (
                      <span className="text-xs text-green-300" title="Supports image input">👁️</span>
                    )}
                    {availableModels?.find((m: any) => m.id === selectedModel) && supportsAudioInput(availableModels.find((m: any) => m.id === selectedModel)) && (
                      <span className="text-xs text-blue-300" title="Supports audio input">🎵</span>
                    )}
                    {availableModels?.find((m: any) => m.id === selectedModel) && supportsImageGeneration(availableModels.find((m: any) => m.id === selectedModel)) && (
                      <span className="text-xs text-purple-300" title="Can generate images">🎨</span>
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
                      filteredModels.map((model: any) => (
                        <button
                          key={model.id}
                          onClick={() => {
                            setSelectedModel(model.id)
                            setModelSearchOpen(false)
                            setModelSearchQuery('')
                          }}
                          className={`w-full text-left p-2 text-sm hover:bg-white/10 border-b border-white/5 last:border-b-0 ${selectedModel === model.id ? 'bg-blue-600/30' : ''
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-white">{model.name || model.id}</div>
                              <div className="text-xs text-white/70 truncate">{model.id}</div>
                            </div>
                            <div className="flex gap-1">
                              {supportsImageInput(model) && (
                                <span className="text-xs bg-green-500/20 text-green-300 px-1 py-0.5 rounded" title="Supports image input">
                                  👁️
                                </span>
                              )}
                              {supportsAudioInput(model) && (
                                <span className="text-xs bg-blue-500/20 text-blue-300 px-1 py-0.5 rounded" title="Supports audio input">
                                  🎵
                                </span>
                              )}
                              {supportsImageGeneration(model) && (
                                <span className="text-xs bg-purple-500/20 text-purple-300 px-1 py-0.5 rounded" title="Can generate images">
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
          </div>
          
          {/* Model Capabilities Display */}
          {availableModels?.find((m: any) => m.id === selectedModel) && (
            <div className="mt-3 text-xs text-white/70">
              <span>Capabilities: </span>
              {supportsImageInput(availableModels.find((m: any) => m.id === selectedModel)) && (
                <span className="bg-green-500/20 text-green-300 px-2 py-1 rounded mr-2">
                  👁️ Can view images
                </span>
              )}
              {supportsAudioInput(availableModels.find((m: any) => m.id === selectedModel)) && (
                <span className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded mr-2">
                  🎵 Can process audio
                </span>
              )}
              <span className="bg-red-500/20 text-red-300 px-2 py-1 rounded mr-2">
                📄 Can process PDFs
              </span>
              {supportsImageGeneration(availableModels.find((m: any) => m.id === selectedModel)) && (
                <span className="bg-purple-500/20 text-purple-300 px-2 py-1 rounded mr-2">
                  🎨 Can generate images
                </span>
              )}
            </div>
          )}

          {/* MCP Controls */}
          <div className="mt-4 p-3 bg-white/5 border border-white/20 rounded-lg">
            <div className="flex items-center gap-4 mb-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mcpEnabled}
                  onChange={(e) => setMcpEnabled(e.target.checked)}
                  className="rounded"
                />
                Enable MCP Tools
              </label>
              {mcpEnabled && (
                <>
                  <select
                    value={selectedMcpServer}
                    onChange={(e) => setSelectedMcpServer(e.target.value)}
                    className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
                  >
                    {mcpServers.map(server => (
                      <option key={server} value={server} className="bg-gray-800">
                        {server}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={mcpAutoApprove}
                      onChange={(e) => setMcpAutoApprove(e.target.checked)}
                      className="rounded"
                    />
                    Auto-approve tool calls
                  </label>
                </>
              )}
            </div>
            
            {mcpEnabled && mcpTools.length > 0 && (
              <div className="text-xs text-white/60">
                <span>Available Tools: </span>
                {mcpTools.map((tool, index) => (
                  <span key={index} className="bg-orange-500/20 text-orange-300 px-1 py-0.5 rounded mr-1">
                    🔧 {tool.function?.name || 'Unknown'}
                  </span>
                ))}
              </div>
            )}
            
            {mcpEnabled && mcpTools.length === 0 && (
              <div className="text-xs text-white/60">
                <span className="text-yellow-400">⚠️ No MCP tools available</span>
              </div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {(chatMessages || []).length === 0 && (
            <div className="text-center text-white/70 py-8">
              Start a conversation with Nova AI!
            </div>
          )}

          {(chatMessages || []).map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] p-4 rounded-lg ${message.role === 'user'
                  ? 'bg-[#1B4957] text-white'
                  : 'bg-white/10 border border-white/20 text-white'
                  }`}
              >
                <MessageContent content={message.content} role={message.role} image={message.image} audio={message.audio} pdf={message.pdf} />
                <div className="text-xs opacity-70 mt-2">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Tool Call Approval Modal */}
        {showToolApproval && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-white/20 rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-4 text-white">🔧 Tool Usage Request</h3>
              <p className="text-white/80 mb-4">
                The AI wants to use the following tools:
              </p>
              <div className="space-y-2 mb-6">
                {pendingToolCalls.map((toolCall, index) => (
                  <div key={index} className="bg-white/10 rounded p-3">
                    <div className="font-medium text-white">
                      🔧 {toolCall.function?.name || 'Unknown Tool'}
                    </div>
                    {toolCall.function?.description && (
                      <div className="text-sm text-white/70 mt-1">
                        {toolCall.function.description}
                      </div>
                    )}
                    <div className="text-xs text-white/60 mt-2">
                      Arguments: {JSON.stringify(JSON.parse(toolCall.function?.arguments || '{}'), null, 2)}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-white/80 mb-4">
                Do you approve this action?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleToolCallApproval(true)}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium transition-colors"
                >
                  ✅ Approve
                </button>
                <button
                  onClick={() => handleToolCallApproval(false)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded font-medium transition-colors"
                >
                  ❌ Decline
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-6 border-t border-white/20">
          {/* Image Preview */}
          {uploadedImage && (
            <div className="mb-4 relative inline-block">
              <img 
                src={uploadedImage.url} 
                alt="Upload preview" 
                className="max-h-32 rounded-lg border border-white/20"
              />
              <button
                onClick={removeImage}
                className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm"
              >
                ×
              </button>
            </div>
          )}

          {/* Audio Preview */}
          {uploadedAudio && (
            <div className="mb-4 relative inline-block">
              <div className="bg-white/10 border border-white/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-white/70">🎵 Audio file ({uploadedAudio.format})</span>
                  <button
                    onClick={removeAudio}
                    className="bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                  >
                    ×
                  </button>
                </div>
                <audio 
                  controls 
                  src={uploadedAudio.url}
                  className="w-full max-w-sm"
                  style={{ filter: 'invert(1) hue-rotate(180deg)' }}
                >
                  Your browser does not support the audio element.
                </audio>
              </div>
            </div>
          )}

          {/* PDF Preview */}
          {uploadedPdf && (
            <div className="mb-4 relative inline-block">
              <div className="bg-white/10 border border-white/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-white/70">📄 PDF file: {uploadedPdf.filename}</span>
                  <button
                    onClick={removePdf}
                    className="bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                  >
                    ×
                  </button>
                </div>
                <div className="flex gap-2">
                  <a 
                    href={uploadedPdf.url}
                    download={uploadedPdf.filename}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                  >
                    Download
                  </a>
                  <a 
                    href={uploadedPdf.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
                  >
                    Open
                  </a>
                </div>
              </div>
            </div>
          )}
          
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendMessage()
                }
              }}
              placeholder="Type your message..."
              className="flex-1 p-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={currentlyStreaming}
            />

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            {/* Hidden audio input */}
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*"
              onChange={handleAudioUpload}
              className="hidden"
            />

            {/* Hidden PDF input */}
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf"
              onChange={handlePdfUpload}
              className="hidden"
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

            <button
              onClick={handleSendMessage}
              disabled={(!inputValue.trim() && !uploadedImage && !uploadedAudio && !uploadedPdf) || currentlyStreaming}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {currentlyStreaming ? (currentlySending ? 'Sending...' : <Spinner />) : 'Send'}
            </button>
          </div>

          <div className="text-xs text-white/50 mt-2">
            <span>Press Enter to send</span>
            {availableModels?.find((m: any) => m.id === selectedModel) && (
              <>
                {supportsImageInput(availableModels.find((m: any) => m.id === selectedModel)) && (
                  <span> • Upload images with 📷 button</span>
                )}
                {supportsAudioInput(availableModels.find((m: any) => m.id === selectedModel)) && (
                  <span> • Upload audio with 🎵 button</span>
                )}
                <span> • Upload PDFs with 📄 button</span>
                {supportsImageGeneration(availableModels.find((m: any) => m.id === selectedModel)) && (
                  <span> • Ask for image generation</span>
                )}
                {mcpEnabled && mcpTools.length > 0 && (
                  <span> • MCP tools enabled (🔧 {mcpTools.length} tools{mcpAutoApprove ? ', auto-approved' : ', requires approval'})</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <ReactQueryDevtools initialIsOpen={false} />
    </div>
  )
}
