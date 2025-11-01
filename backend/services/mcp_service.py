"""
MCP (Model Context Protocol) service for managing MCP clients
Re-exports the mcp_manager from mcp_client_fastmcp for cleaner imports
"""

from mcp_client_fastmcp import mcp_manager

__all__ = ['mcp_manager']
