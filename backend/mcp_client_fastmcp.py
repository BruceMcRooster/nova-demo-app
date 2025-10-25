import asyncio
import json
from typing import Optional, Dict, List, Any

try:
    from fastmcp import Client
except ImportError:
    print("FastMCP not installed. Please install with: pip install fastmcp")
    Client = None

class MCPClient:
    def __init__(self):
        self.client: Optional[Client] = None
        self.available_tools = []
        self.connected = False

    def convert_tool_format(self, tool):
        """Convert MCP tool definition to OpenAI-compatible tool definition"""
        # FastMCP tools already come in a compatible format
        converted_tool = {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description or "",
                "parameters": tool.inputSchema or {
                    "type": "object",
                    "properties": {},
                    "required": []
                }
            }
        }
        return converted_tool

    async def connect_to_server(self, server_config: Dict[str, Any]):
        """Connect to an MCP server with the given configuration"""
        if Client is None:
            print("FastMCP not available")
            return False
            
        try:
            print(f"Attempting to connect to MCP server with config: {server_config}")
            
            # Create FastMCP client based on config
            if server_config.get("command") and server_config.get("args"):
                # For stdio transport, use command + args
                command = server_config["command"]
                args = server_config.get("args", [])
                
                self.client = Client({
                    "mcpServers": {
                        "default": {
                            "transport": "stdio",
                            "command": command, 
                            "args": args,
                            "env": server_config.get("env")
                        }
                    }
                })
            elif server_config.get("url"):
                # HTTP transport
                self.client = Client({
                    "mcpServers": {
                        "default": {
                            "transport": "http",
                            "url": server_config["url"]
                        }
                    }
                })
            else:
                print("Invalid server config - no command or URL provided")
                return False

            # Test connection with timeout
            async with asyncio.timeout(10.0):
                async with self.client:
                    # Test basic connectivity
                    await self.client.ping()
                    
                    # List available tools
                    tools = await self.client.list_tools()
                    print(f"Retrieved {tools} tools from MCP server")
                    self.available_tools = [self.convert_tool_format(tool) for tool in tools]
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
        if not self.connected or not self.client:
            return []
        return self.available_tools

    async def call_tool(self, tool_name: str, tool_args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute a tool call through the MCP server"""
        print(f"Calling tool {tool_name} with args {tool_args}")
        if not self.connected or not self.client:
            print("MCP client not connected")
            return {
                "success": False,
                "error": "MCP client not connected",
                "tool_name": tool_name,
                "tool_args": tool_args
            }
        
        try:
            # Use the client in context
            async with asyncio.timeout(30.0):  # 30 second timeout
                async with self.client:
                    result = await self.client.call_tool(tool_name, tool_args)
                    print(f"Tool {tool_name} executed successfully")
                    
                    # Extract content from FastMCP result
                    content = []
                    if hasattr(result, 'content') and result.content:
                        for item in result.content:
                            if hasattr(item, 'text'):
                                content.append(item.text)
                            elif hasattr(item, 'data'):
                                content.append(str(item.data))
                            else:
                                content.append(str(item))
                    
                    return {
                        "success": True,
                        "content": content,
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
        # FastMCP clients clean up automatically when exiting context
        self.connected = False
        self.client = None

# Global MCP client manager
class MCPManager:
    def __init__(self):
        self.clients: Dict[str, MCPClient] = {}
        self.default_configs = {
            "cmu_api": {
                "url": "http://0.0.0.0:8000/mcp"
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
