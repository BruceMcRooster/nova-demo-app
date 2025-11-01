/**
 * Custom hook for fetching available models
 */

import { useQuery } from '@tanstack/react-query'
import type { Model } from '@/types/chat'

export const useAvailableModels = () => {
  return useQuery({
    queryKey: ['models'],
    queryFn: async (): Promise<Model[]> => {
      const response = await fetch('https://openrouter.ai/api/v1/models')
      const data = await response.json()
      return data.data || []
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
