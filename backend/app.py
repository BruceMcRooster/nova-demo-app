from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import requests
import json
from utils import Model, model_dict

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

class Message(BaseModel):
    role: str
    content: str
    image: dict = None  # Optional image data with data, format fields
    audio: dict = None  # Optional audio data with data, format fields
    pdf: dict = None    # Optional PDF data with data, filename fields

class ChatRequest(BaseModel):
    model_id: str
    chat_history: list[Message]
    use_mcp: bool = False
    mcp_server_type: str = "cmu_api"
    mcp_auto_approve: bool = False  # Whether to auto-approve MCP tool calls

# enable cors on all sites
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Hello World"}

# chat
@app.post("/chat")
async def chat(model_id: str, prompt: str):
    '''
    model_id: string, id of model to run on
    prompt: string, json string of prompt object
    '''
    model = Model(model=model_id)
    output = model.reply({"text": prompt, "img": None, "pdf": None, "modalities": ["text"]}, stream=False)
    return output

# chat with streaming
@app.post("/chat_streaming")
async def chat_streaming(request: ChatRequest):
    '''
    model_id: string, id of model to run on
    chat_history: list of messages
    use_mcp: bool, whether to enable MCP tools
    mcp_server_type: str, type of MCP server to use
    mcp_auto_approve: bool, whether to auto-approve MCP tool calls
    '''
    model = Model(model=request.model_id)
    def event_generator():
        for chunk in model.reply_with_history(
            request.chat_history, 
            stream=True, 
            use_mcp=request.use_mcp,
            mcp_server_type=request.mcp_server_type,
            mcp_auto_approve=request.mcp_auto_approve
        ):
            yield chunk

    output = StreamingResponse(event_generator(), media_type="application/stream+json")
    return output

# MCP endpoints
@app.get("/mcp/servers")
async def get_mcp_servers():
    '''
    Get available MCP server types
    '''
    try:
        from mcp_client_fastmcp import mcp_manager
        return {
            "servers": list(mcp_manager.default_configs.keys()),
            "default_configs": mcp_manager.default_configs
        }
    except ImportError:
        return {"error": "MCP client not available"}

@app.get("/mcp/tools/{server_type}")
async def get_mcp_tools(server_type: str):
    '''
    Get available tools for a specific MCP server type
    '''
    try:
        from mcp_client_fastmcp import mcp_manager
        client = await mcp_manager.get_or_create_client(server_type)
        tools = await client.get_available_tools()
        return {
            "server_type": server_type,
            "tools": tools,
            "connected": client.connected
        }
    except Exception as e:
        return {"error": str(e), "server_type": server_type}

@app.post("/mcp/cleanup")
async def cleanup_mcp():
    '''
    Clean up all MCP connections
    '''
    try:
        from mcp_client_fastmcp import mcp_manager
        await mcp_manager.cleanup_all()
        return {"message": "All MCP connections cleaned up"}
    except Exception as e:
        return {"error": str(e)}

# Tool call approval endpoints
class ToolCallApprovalRequest(BaseModel):
    tool_calls: list[dict]
    approved: bool
    chat_history: list[Message]
    model_id: str
    mcp_server_type: str = "cmu_api"

@app.post("/mcp/approve_tool_calls")
async def approve_tool_calls(request: ToolCallApprovalRequest):
    '''
    Execute approved tool calls and return the final response
    '''
    try:
        if not request.approved:
            # Return a message indicating the user declined
            return {
                "choices": [{
                    "message": {
                        "content": "Tool calls were declined by the user."
                    }
                }]
            }
        
        from mcp_client_fastmcp import mcp_manager
        import asyncio
        
        # Process each tool call
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            client = await mcp_manager.get_or_create_client(request.mcp_server_type)
            
            # Add the assistant's message with tool calls to conversation
            messages = []
            for msg in request.chat_history:
                content = []
                
                # Add text content
                if msg.content:
                    content.append({
                        'type': 'text',
                        'text': msg.content
                    })
                
                # Add image content if present
                if hasattr(msg, 'image') and msg.image:
                    img_data = msg.image
                    url = f"data:image/{img_data['format']};base64,{img_data['data']}"
                    content.append({
                        'type': 'image_url',
                        'image_url': {
                            'url': url
                        }
                    })
                
                # Add audio content if present
                if hasattr(msg, 'audio') and msg.audio:
                    audio_data = msg.audio
                    content.append({
                        'type': 'input_audio',
                        'input_audio': {
                            'data': audio_data['data'],
                            'format': audio_data['format']
                        }
                    })
                
                # Add PDF content if present
                if hasattr(msg, 'pdf') and msg.pdf:
                    pdf_data = msg.pdf
                    pdf_url = f"data:application/pdf;base64,{pdf_data['data']}"
                    content.append({
                        'type': 'file',
                        'file': {
                            'filename': pdf_data['filename'],
                            'file_data': pdf_url
                        }
                    })
                
                messages.append({
                    'role': msg.role,
                    'content': content
                })
            
            # Add assistant message with tool calls
            assistant_message = {
                "role": "assistant",
                "content": "",
                "tool_calls": request.tool_calls
            }
            messages.append(assistant_message)
            
            # Execute tool calls
            for tool_call in request.tool_calls:
                tool_name = tool_call['function']['name']
                tool_args = json.loads(tool_call['function']['arguments'])
                
                # Execute the tool
                tool_result = await client.call_tool(tool_name, tool_args)
                
                # Add tool result to messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call['id'],
                    "name": tool_name,
                    "content": json.dumps(tool_result) if tool_result['success'] else f"Error: {tool_result['error']}"
                })
            
            # Make final request to get the assistant's response
            from utils import OPENROUTER_API_KEY
            
            url = "https://openrouter.ai/api/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            }
            
            payload = {
                'model': request.model_id,
                'messages': messages
            }
            
            response = requests.post(url=url, headers=headers, json=payload)
            return response.json()
            
        finally:
            loop.close()
            
    except Exception as e:
        return {"error": str(e)}

@app.post("/mcp/approve_tool_calls_streaming")
async def approve_tool_calls_streaming(request: ToolCallApprovalRequest):
    '''
    Execute approved tool calls and return streaming response
    '''
    try:
        if not request.approved:
            # Return a message indicating the user declined
            def decline_generator():
                yield json.dumps({
                    "choices": [{
                        "delta": {
                            "content": "Tool calls were declined by the user."
                        }
                    }]
                })
                yield "data: [DONE]\n\n"
            
            return StreamingResponse(decline_generator(), media_type="application/stream+json")
        
        from mcp_client_fastmcp import mcp_manager
        import asyncio
        
        def event_generator():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                client = loop.run_until_complete(mcp_manager.get_or_create_client(request.mcp_server_type))
                
                # Add the assistant's message with tool calls to conversation
                messages = []
                for msg in request.chat_history:
                    content = []
                    
                    # Add text content
                    if msg.content:
                        content.append({
                            'type': 'text',
                            'text': msg.content
                        })
                    
                    # Add image content if present
                    if hasattr(msg, 'image') and msg.image:
                        img_data = msg.image
                        url = f"data:image/{img_data['format']};base64,{img_data['data']}"
                        content.append({
                            'type': 'image_url',
                            'image_url': {
                                'url': url
                            }
                        })
                    
                    # Add audio content if present
                    if hasattr(msg, 'audio') and msg.audio:
                        audio_data = msg.audio
                        content.append({
                            'type': 'input_audio',
                            'input_audio': {
                                'data': audio_data['data'],
                                'format': audio_data['format']
                            }
                        })
                    
                    # Add PDF content if present
                    if hasattr(msg, 'pdf') and msg.pdf:
                        pdf_data = msg.pdf
                        pdf_url = f"data:application/pdf;base64,{pdf_data['data']}"
                        content.append({
                            'type': 'file',
                            'file': {
                                'filename': pdf_data['filename'],
                                'file_data': pdf_url
                            }
                        })
                    
                    messages.append({
                        'role': msg.role,
                        'content': content
                    })
                
                # Add assistant message with tool calls
                assistant_message = {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": request.tool_calls
                }
                messages.append(assistant_message)
                
                # Execute tool calls
                for tool_call in request.tool_calls:
                    tool_name = tool_call['function']['name']
                    tool_args = json.loads(tool_call['function']['arguments'])
                    
                    # Execute the tool
                    tool_result = loop.run_until_complete(client.call_tool(tool_name, tool_args))
                    
                    # Add tool result to messages
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call['id'],
                        "name": tool_name,
                        "content": json.dumps(tool_result) if tool_result['success'] else f"Error: {tool_result['error']}"
                    })
                
                # Make final streaming request to get the assistant's response
                from utils import OPENROUTER_API_KEY
                
                url = "https://openrouter.ai/api/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                }
                
                payload = {
                    'model': request.model_id,
                    'messages': messages,
                    'stream': True
                }
                
                # Stream the response
                buffer = ''
                with requests.post(url, headers=headers, json=payload, stream=True) as response:
                    for chunk in response.iter_content(chunk_size=1024, decode_unicode=True):
                        buffer += chunk
                        while True:
                            try:
                                line_end = buffer.find("\n")
                                if line_end == -1:
                                    break
                                line = buffer[:line_end].strip()
                                buffer = buffer[line_end + 1:]
                                if line.startswith("data: "):
                                    data = line[6:]
                                    if data == "[DONE]":
                                        yield "data: [DONE]\n\n"
                                        return
                                    yield f"data: {data}\n\n"
                            except Exception:
                                break
                
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            finally:
                loop.close()
        
        return StreamingResponse(event_generator(), media_type="application/stream+json")
        
    except Exception as e:
        def error_generator():
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        return StreamingResponse(error_generator(), media_type="application/stream+json")