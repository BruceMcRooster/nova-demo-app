import asyncio
import json
import os
from typing import Optional, Dict, List, Any
from contextlib import AsyncExitStack

from mcp.types import ContentBlock, Icon, TextContent
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client



class MCPClient:
    def __init__(self):
        self.session: Optional[ClientSession] = None
        self.exit_stack = AsyncExitStack()
        self.available_tools = []
        self.connected = False

    def convert_tool_format(self, tool):
        """Convert MCP tool definition to OpenAI-compatible tool definition"""
        converted_tool = {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": {
                    "type": "object",
                    "properties": tool.inputSchema.get("properties", {}),
                    "required": tool.inputSchema.get("required", [])
                }
            }
        }
        return converted_tool

    async def connect_to_server(self, server_config: Dict[str, Any]):
        """Connect to an MCP server with the given configuration"""
        try:
            print(f"Attempting to connect to MCP server with config: {server_config}")
            server_params = StdioServerParameters(**server_config)
            
            # Add timeout for connection
            stdio_transport = await asyncio.wait_for(
                self.exit_stack.enter_async_context(stdio_client(server_params)),
                timeout=10.0  # 10 second timeout for connection
            )
            self.stdio, self.write = stdio_transport
            
            self.session = await asyncio.wait_for(
                self.exit_stack.enter_async_context(ClientSession(self.stdio, self.write)),
                timeout=10.0  # 10 second timeout for session creation
            )

            await asyncio.wait_for(
                self.session.initialize(),
                timeout=10.0  # 10 second timeout for initialization
            )

            # List available tools from the MCP server
            response = await asyncio.wait_for(
                self.session.list_tools(),
                timeout=10.0  # 10 second timeout for listing tools
            )
            self.available_tools = [self.convert_tool_format(tool) for tool in response.tools]
            self.connected = True
            
            print(f"Connected to MCP server with tools: {[tool['function']['name'] for tool in self.available_tools]}")
            return True
        except asyncio.TimeoutError:
            print("Timeout connecting to MCP server")
            self.connected = False
            return False
        except Exception as e:
            print(f"Failed to connect to MCP server: {e}")
            self.connected = False
            return False

    async def get_available_tools(self) -> List[Dict[str, Any]]:
        """Get list of available tools in OpenAI format"""
        if not self.connected:
            return []
        return self.available_tools

    async def call_tool(self, tool_name: str, tool_args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool call through the MCP server"""
        print(f"Calling tool {tool_name} with args {tool_args}")
        if not self.connected or not self.session:
            print("MCP client not connected")
            raise Exception("MCP client not connected")
        
        try:
            # Add timeout to prevent hanging
            result = await asyncio.wait_for(
                self.session.call_tool(tool_name, tool_args),
                timeout=5.0  # 5 second timeout
            )
            print(f"Tool {tool_name} executed successfully with result: {result.content}")
            return {
                "success": True,
                "content": result.model_dump(),
                "tool_name": tool_name,
                "tool_args": tool_args
            }
        except asyncio.TimeoutError:
            error_msg = f"Tool {tool_name} timed out after 30 seconds"
            print(error_msg)
            return {
                "success": False,
                "error": error_msg,
                "tool_name": tool_name,
                "tool_args": tool_args
            }
        except Exception as e:
            error_msg = f"Error executing tool {tool_name}: {e}"
            print(error_msg)
            return {
                "success": False,
                "error": str(e),
                "tool_name": tool_name,
                "tool_args": tool_args
            }

    async def cleanup(self):
        """Clean up the MCP client connection"""
        if self.exit_stack:
            await self.exit_stack.aclose()
        self.connected = False

# Global MCP client manager
class MCPManager:
    def __init__(self):
        self.clients: Dict[str, MCPClient] = {}
        self.default_configs = {
            "filesystem": {
                "command": "npx",
                "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
                "env": None
            },
            # Add more default MCP server configurations here
        }

    async def get_or_create_client(self, server_type: str = "filesystem", custom_config: Optional[Dict] = None) -> MCPClient:
        """Get existing client or create new one"""
        client_key = f"{server_type}_{hash(str(custom_config) if custom_config else '')}"
        
        if client_key not in self.clients:
            client = MCPClient()
            config = custom_config or self.default_configs.get(server_type)
            
            if not config:
                raise ValueError(f"No configuration found for server type: {server_type}")
            
            success = await client.connect_to_server(config)
            if success:
                self.clients[client_key] = client
            else:
                raise Exception(f"Failed to connect to {server_type} MCP server")
        
        return self.clients[client_key]

    async def cleanup_all(self):
        """Clean up all MCP client connections"""
        for client in self.clients.values():
            await client.cleanup()
        self.clients.clear()

# Global MCP manager instance
mcp_manager = MCPManager()
