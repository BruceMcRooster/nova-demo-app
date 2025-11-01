"""
MCP (Model Context Protocol) related API routes
"""

from fastapi import APIRouter
from services.mcp_service import mcp_manager

router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.get("/servers")
async def get_mcp_servers():
    """
    Get available MCP server types and their configurations
    
    Returns:
        Dictionary with available servers and default configs
    """
    try:
        return {
            "servers": list(mcp_manager.default_configs.keys()),
            "default_configs": mcp_manager.default_configs
        }
    except ImportError:
        return {"error": "MCP client not available"}


@router.get("/tools/{server_type}")
async def get_mcp_tools(server_type: str):
    """
    Get available tools for a specific MCP server type
    
    Args:
        server_type: Type of MCP server (e.g., "cmu_api")
    
    Returns:
        Dictionary with server_type, tools list, and connection status
    """
    try:
        client = await mcp_manager.get_or_create_client(server_type)
        tools = await client.get_available_tools()
        return {
            "server_type": server_type,
            "tools": tools,
            "connected": client.connected
        }
    except Exception as e:
        return {"error": str(e), "server_type": server_type}


@router.post("/cleanup")
async def cleanup_mcp():
    """
    Clean up all MCP connections
    
    Returns:
        Success message or error
    """
    try:
        await mcp_manager.cleanup_all()
        return {"message": "All MCP connections cleaned up"}
    except Exception as e:
        return {"error": str(e)}
