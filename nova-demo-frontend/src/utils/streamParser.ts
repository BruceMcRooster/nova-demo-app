/**
 * Utility for parsing streaming chat messages
 */

import type { ModelResponsePart, ImageData } from '@/types/chat'

/**
 * Parse streaming message chunks into complete JSON objects
 * Handles incomplete JSON objects by tracking brace count
 */
export const parseStreamingMessage = (chunks: string[]): ModelResponsePart[] => {
  const combinedChunks = chunks.join('')

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

  // Parse valid JSON objects
  const messages = jsonObjects
    .map((chunk) => {
      try {
        return JSON.parse(chunk)
      } catch (e) {
        console.error('Error parsing chunk:', chunk, e)
        return null
      }
    })
    .filter(Boolean) as ModelResponsePart[]

  return messages
}

/**
 * Extract accumulated content from parsed messages
 */
export const extractContent = (messages: ModelResponsePart[]): string => {
  return messages.reduce(
    (acc, cur) => acc.concat(cur?.choices?.[0]?.delta?.content || ''),
    ''
  )
}

/**
 * Extract image data from parsed messages
 * Checks multiple possible locations for image data
 */
export const extractImage = (messages: ModelResponsePart[]): ImageData | null => {
  // Check for new format: delta.images array with image_url.url
  const imageInImages = messages.find(
    (msg) =>
      msg?.choices?.[0]?.delta?.images && msg.choices[0].delta.images.length > 0
  )

  if (imageInImages) {
    const imageData = imageInImages.choices[0].delta.images?.[0]?.image_url?.url
    if (imageData) {
      // Handle both data URLs and regular URLs
      if (imageData.startsWith('data:image/')) {
        const base64Match = imageData.match(/data:image\/([^;]+);base64,(.+)/)
        if (base64Match) {
          return {
            url: imageData,
            data: base64Match[2],
            format: base64Match[1],
          }
        }
      } else {
        return {
          url: imageData,
          data: '',
          format: imageData.split('.').pop()?.split('?')[0] || 'jpg',
        }
      }
    }
  }

  // Check for image in delta (legacy format)
  const imageInDelta = messages.find((msg) => msg?.choices?.[0]?.delta?.image)
    ?.choices?.[0]?.delta?.image

  if (imageInDelta) {
    return imageInDelta
  }

  // Check for image URL in content
  const imageUrlInContent = messages.find((msg) => {
    const content = msg?.choices?.[0]?.delta?.content
    return (
      content &&
      content.includes('http') &&
      (content.includes('.jpg') ||
        content.includes('.png') ||
        content.includes('.webp') ||
        content.includes('image'))
    )
  })

  if (imageUrlInContent) {
    const content = imageUrlInContent.choices[0].delta.content
    if (content) {
      const urlMatch = content.match(
        /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|webp|gif))/i
      )
      if (urlMatch) {
        return {
          url: urlMatch[0],
          data: '',
          format: urlMatch[0].split('.').pop() || 'jpg',
        }
      }
    }
  }

  // Check for base64 image data in response (legacy format)
  const base64ImageMatch = messages.find((msg) => {
    const content = msg?.choices?.[0]?.delta?.content
    return content && content.includes('data:image/')
  })

  if (base64ImageMatch) {
    const content = base64ImageMatch.choices[0].delta.content
    if (content) {
      const base64Match = content.match(/data:image\/([^;]+);base64,([^"'\s]+)/i)
      if (base64Match) {
        return {
          url: base64Match[0],
          data: base64Match[2],
          format: base64Match[1],
        }
      }
    }
  }

  return null
}
