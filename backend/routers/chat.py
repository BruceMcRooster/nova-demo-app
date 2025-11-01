"""
Chat-related API routes
"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import requests

from models.schemas import ChatRequest, ToolCallApprovalRequest
from services.chat_service import ChatService
from services.mcp_service import mcp_manager
from utils import OPENROUTER_API_KEY
import json
import asyncio

router = APIRouter()


@router.post("/chat")
async def chat(model_id: str, prompt: str):
    """
    Simple chat endpoint (non-streaming)
    
    Args:
        model_id: ID of the model to use
        prompt: Text prompt
    
    Returns:
        Model response
    """
    # Get model data from OpenRouter
    all_models = requests.get('https://openrouter.ai/api/v1/models').json()['data']
    model_data = next((m for m in all_models if m['id'] == model_id), None)
    
    if not model_data:
        return {"error": "Model not found"}
    
    chat_service = ChatService(model_id, model_data)
    messages = [{'role': 'user', 'content': [{'type': 'text', 'text': prompt}]}]
    
    payload = chat_service.create_payload(messages)
    
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    
    response = requests.post(url=url, headers=headers, json=payload)
    return response.json()


@router.post("/chat_streaming")
async def chat_streaming(request: ChatRequest):
    """
    Chat endpoint with streaming support and optional MCP tools
    
    Args:
        request: ChatRequest with model_id, chat_history, and MCP settings
    
    Returns:
        Streaming response
    """
    # Get model data
    all_models = requests.get('https://openrouter.ai/api/v1/models').json()['data']
    model_data = next((m for m in all_models if m['id'] == request.model_id), None)
    
    if not model_data:
        return {"error": "Model not found"}
    
    chat_service = ChatService(request.model_id, model_data)
    messages = chat_service.prepare_messages(request.chat_history)
    
    # Check if any messages have PDFs
    has_pdf = any(msg.pdf for msg in request.chat_history)
    
    payload = chat_service.create_payload(
        messages,
        use_mcp=request.use_mcp,
        mcp_server_type=request.mcp_server_type,
        has_pdf=has_pdf
    )
    
    def event_generator():
        yield from chat_service.stream_response(
            payload,
            use_mcp=request.use_mcp,
            mcp_auto_approve=request.mcp_auto_approve,
            mcp_server_type=request.mcp_server_type
        )
    
    return StreamingResponse(event_generator(), media_type="application/stream+json")


@router.post("/mcp/approve_tool_calls_streaming")
async def approve_tool_calls_streaming(request: ToolCallApprovalRequest):
    """
    Execute approved tool calls and return streaming response
    
    Args:
        request: ToolCallApprovalRequest with tool_calls and approval status
    
    Returns:
        Streaming response with tool execution results
    """
    try:
        if not request.approved:
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
        
        def event_generator():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                client = loop.run_until_complete(
                    mcp_manager.get_or_create_client(request.mcp_server_type)
                )
                
                # Build messages array
                messages = []
                for msg in request.chat_history:
                    content = []
                    
                    if msg.content:
                        content.append({'type': 'text', 'text': msg.content})
                    
                    if msg.image:
                        img_data = msg.image
                        url = f"data:image/{img_data['format']};base64,{img_data['data']}"
                        content.append({'type': 'image_url', 'image_url': {'url': url}})
                    
                    if msg.audio:
                        audio_data = msg.audio
                        content.append({
                            'type': 'input_audio',
                            'input_audio': {
                                'data': audio_data['data'],
                                'format': audio_data['format']
                            }
                        })
                    
                    if msg.pdf:
                        pdf_data = msg.pdf
                        pdf_url = f"data:application/pdf;base64,{pdf_data['data']}"
                        content.append({
                            'type': 'file',
                            'file': {
                                'filename': pdf_data['filename'],
                                'file_data': pdf_url
                            }
                        })
                    
                    messages.append({'role': msg.role, 'content': content})
                
                # Add assistant message with tool calls
                messages.append({
                    "role": "assistant",
                    "content": "",
                    "tool_calls": request.tool_calls
                })
                
                # Execute tool calls
                for tool_call in request.tool_calls:
                    tool_name = tool_call['function']['name']
                    tool_args = json.loads(tool_call['function']['arguments'])
                    tool_result = loop.run_until_complete(client.call_tool(tool_name, tool_args))
                    
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call['id'],
                        "name": tool_name,
                        "content": json.dumps(tool_result) if tool_result['success'] else f"Error: {tool_result['error']}"
                    })
                
                # Make final streaming request
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
                
                buffer = ''
                with requests.post(url, headers=headers, json=payload, stream=True) as response:
                    for chunk in response.iter_content(chunk_size=1024, decode_unicode=False):
                        chunk = chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk
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
