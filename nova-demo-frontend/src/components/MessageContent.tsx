import ReactMarkdown from "react-markdown"
import rehypeHighlight from "rehype-highlight"
import remarkGfm from "remark-gfm"

interface MessageContentProps {
  content: string
  role: 'user' | 'assistant'
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
}

function MessageContent({ content, role, image, audio, pdf }: MessageContentProps) {
  if (role === 'user') {
    return (
      <div>
        {image && (
          <div className="mb-3">
            <img 
              src={image.url} 
              alt="Uploaded image" 
              className="max-w-full max-h-64 rounded-lg border border-white/20"
            />
          </div>
        )}
        {audio && (
          <div className="mb-3">
            <div className="bg-white/10 border border-white/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-white/70">🎵 Audio file ({audio.format})</span>
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
        )}
        {pdf && (
          <div className="mb-3">
            <div className="bg-white/10 border border-white/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-white/70">📄 PDF file: {pdf.filename}</span>
              </div>
              <div className="flex gap-2">
                <a 
                  href={pdf.url}
                  download={pdf.filename}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                >
                  Download PDF
                </a>
                <a 
                  href={pdf.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
                >
                  Open in New Tab
                </a>
              </div>
            </div>
          </div>
        )}
        <div className="whitespace-pre-wrap">{content}</div>
      </div>
    )
  }

  return (
    <div className="prose prose-invert max-w-none">
      {image && (
        <div className="mb-3">
          <img 
            src={image.url} 
            alt="Generated image" 
            className="max-w-full max-h-64 rounded-lg border border-white/20"
            onError={(e) => {
              console.error('Image failed to load:', image.url)
              e.currentTarget.style.display = 'none'
              // Show fallback message
              const fallback = document.createElement('div')
              fallback.className = 'text-red-400 text-sm p-2 border border-red-400/20 rounded bg-red-500/10'
              fallback.textContent = 'Failed to load image'
              e.currentTarget.parentNode?.appendChild(fallback)
            }}
            onLoad={() => {
              console.log('Image loaded successfully:', image.url)
            }}
          />
        </div>
      )}
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

export default MessageContent;