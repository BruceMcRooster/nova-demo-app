import { createFileRoute } from '@tanstack/react-router'
import { QueryClient, queryOptions, useMutation, useQuery } from '@tanstack/react-query'
import { experimental_streamedQuery as streamedQuery } from '@tanstack/react-query'
import { useState, useRef, useEffect, use } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

export const Route = createFileRoute('/demo/tanstack-query')({
  component: ChatDemo,
})

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

interface ModelResponsePart {
  choices: Array<{
    delta: {
      content?: string
    }
  }>
}

interface MessageContentProps {
  content: string
  role: 'user' | 'assistant'
}

function MessageContent({ content, role }: MessageContentProps) {
  if (role === 'user') {
    return <div className="whitespace-pre-wrap">{content}</div>
  }

  return (
    <div className="prose prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Customize code blocks
          code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !match
            return isInline ? (
              <code className="bg-gray-700 px-1 py-0.5 rounded text-sm">
                {children}
              </code>
            ) : (
              <code className={className}>
                {children}
              </code>
            )
          },
          pre: ({ children }) => (
            <pre className="bg-gray-800 rounded p-3 overflow-x-auto my-2">
              {children}
            </pre>
          ),
          // Customize links
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-300 hover:text-blue-200 underline"
            >
              {children}
            </a>
          ),
          // Customize lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
          ),
          // Customize paragraphs
          p: ({ children }) => (
            <p className="mb-2 last:mb-0">{children}</p>
          ),
          // Customize headings
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-bold mb-2 mt-2 first:mt-0">{children}</h3>
          ),
          // Customize blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-500 pl-4 italic my-2">
              {children}
            </blockquote>
          ),
          // Customize tables
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border border-gray-600">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-gray-600 px-2 py-1 bg-gray-700 font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-gray-600 px-2 py-1">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function ChatDemo() {
  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const queryClient = new QueryClient()
  const [chatMessages, setChatMessages] = useState<Message[]>([])
  const [lastMessage, setLastMessage] = useState<string>("")

  // Chat query with streaming
  const streamingQuery = queryOptions({
    queryKey: ['chat', lastMessage],
    queryFn: streamedQuery({
      streamFn: async function () {
        const chat_history = chatMessages.map(({ role, content }) => ({ role, content }))
        const response = await fetch('http://localhost:8000/chat_streaming', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            model_id: selectedModel,
            chat_history
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
    refetchInterval: Infinity
  })

  const { data: streamingMessage, refetch: refetchStreamingQuery, isFetching: currentlyStreaming } = useQuery(streamingQuery)
  useEffect(() => {
    try {
      console.log("Raw streaming message:", streamingMessage)
      const isolatedMessages = streamingMessage?.map(chunk => chunk.replaceAll("}{", "},,,,{").split(",,,,"))?.flat()
      console.log("Isolated messages:", isolatedMessages)
      // parse messages
      const messages = isolatedMessages?.map(chunk => {
        try {
          return JSON.parse(chunk)
        } catch (e) {
          console.error("Error parsing chunk:", chunk, e)
          return null
        }
      }).filter(Boolean) as ModelResponsePart[]
      // accumulate content

      const accLastMessage = messages?.reduce((acc, cur: ModelResponsePart) => acc.concat(cur?.choices?.[0]?.delta?.content || ""), '') || ''
      if (accLastMessage) {
        const assistantMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: accLastMessage,
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

  // Filter models based on search query
  const filteredModels = availableModels?.filter((model: any) =>
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

  const handleSendMessage = () => {
    if (!inputValue.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    }
    setChatMessages((prev) => [...prev, userMessage])
    setLastMessage(inputValue.trim())

    setInputValue('')
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
                <span className="truncate">
                  {availableModels?.find((m: any) => m.id === selectedModel)?.name || selectedModel}
                </span>
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
                          <div className="font-medium text-white">{model.name || model.id}</div>
                          <div className="text-xs text-white/70 truncate">{model.id}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
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
                <MessageContent content={message.content} role={message.role} />
                <div className="text-xs opacity-70 mt-2">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-6 border-t border-white/20">
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

            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || currentlyStreaming}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {currentlyStreaming ? 'Sending...' : 'Send'}
            </button>
          </div>

          <div className="text-xs text-white/50 mt-2">
            Press Enter to send
          </div>
        </div>
      </div>
    </div>
  )
}
