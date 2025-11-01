/**
 * Chat messages display area
 */

import { useRef, useEffect } from 'react'
import type { Message } from '@/types/chat'
import MessageContent from './MessageContent'

interface ChatMessagesProps {
  messages: Message[]
}

export const ChatMessages = ({ messages }: ChatMessagesProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {messages.length === 0 && (
        <div className="text-center text-white/70 py-8">Start a conversation with Nova AI!</div>
      )}

      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[70%] p-4 rounded-lg ${
              message.role === 'user'
                ? 'bg-[#1B4957] text-white'
                : 'bg-white/10 border border-white/20 text-white'
            }`}
          >
            <MessageContent
              content={message.content}
              role={message.role}
              image={message.image}
              audio={message.audio}
              pdf={message.pdf}
            />
            <div className="text-xs opacity-70 mt-2">{message.timestamp.toLocaleTimeString()}</div>
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}
