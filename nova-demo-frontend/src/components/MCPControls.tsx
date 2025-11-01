/**
 * MCP (Model Context Protocol) configuration panel
 */

interface MCPControlsProps {
  mcpEnabled: boolean
  onMcpEnabledChange: (enabled: boolean) => void
  selectedMcpServer: string
  onMcpServerChange: (server: string) => void
  mcpServers: string[]
  mcpAutoApprove: boolean
  onMcpAutoApproveChange: (autoApprove: boolean) => void
  mcpTools: any[]
}

export const MCPControls = ({
  mcpEnabled,
  onMcpEnabledChange,
  selectedMcpServer,
  onMcpServerChange,
  mcpServers,
  mcpAutoApprove,
  onMcpAutoApproveChange,
  mcpTools,
}: MCPControlsProps) => {
  return (
    <div className="mt-4 p-3 bg-white/5 border border-white/20 rounded-lg">
      <div className="flex items-center gap-4 mb-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={mcpEnabled}
            onChange={(e) => onMcpEnabledChange(e.target.checked)}
            className="rounded"
          />
          Enable MCP Tools
        </label>
        {mcpEnabled && (
          <>
            <select
              value={selectedMcpServer}
              onChange={(e) => onMcpServerChange(e.target.value)}
              className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm"
            >
              {mcpServers.map((server) => (
                <option key={server} value={server} className="bg-gray-800">
                  {server}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mcpAutoApprove}
                onChange={(e) => onMcpAutoApproveChange(e.target.checked)}
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
            <span
              key={index}
              className="bg-orange-500/20 text-orange-300 px-1 py-0.5 rounded mr-1"
            >
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
  )
}
