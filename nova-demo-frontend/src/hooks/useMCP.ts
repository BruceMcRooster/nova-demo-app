/**
 * Custom hook for managing MCP (Model Context Protocol) integration
 */

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface MCPServersResponse {
  servers: string[]
  default_configs?: Record<string, any>
}

interface MCPToolsResponse {
  tools: any[]
  server_type?: string
  connected?: boolean
}

export const useMCP = (mcpEnabled: boolean, selectedMcpServer: string) => {
  const [mcpServers, setMcpServers] = useState<string[]>(['cmu_api'])
  const [mcpTools, setMcpTools] = useState<any[]>([])

  // Fetch available MCP servers
  const { data: mcpServersData } = useQuery<MCPServersResponse>({
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
  const { data: mcpToolsData } = useQuery<MCPToolsResponse>({
    queryKey: ['mcp-tools', selectedMcpServer],
    queryFn: async () => {
      if (!mcpEnabled) return { tools: [] }
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/mcp/tools/${selectedMcpServer}`
        )
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

  return {
    mcpServers,
    mcpTools,
  }
}
