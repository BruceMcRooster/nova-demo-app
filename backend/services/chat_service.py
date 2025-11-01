"""
Chat service for handling AI model interactions
"""

import requests
import json
import asyncio
from typing import Generator, Dict, Any, List
from models.schemas import Message
from services.mcp_service import mcp_manager
from utils import OPENROUTER_API_KEY


class ChatService:
    """Service for managing chat interactions with AI models"""
    
    def __init__(self, model_id: str, model_data: Dict[str, Any]):
        self.model_id = model_id
        self.model_data = model_data
    
    def prepare_messages(self, chat_history: List[Message]) -> List[Dict[str, Any]]:
        """Convert chat history to OpenRouter message format"""
        messages = []
        
        for msg in chat_history:
            content = []
            
            # Add text content
            if msg.content:
                content.append({'type': 'text', 'text': msg.content})
            
            # Add image content
            if msg.image:
                img_data = msg.image
                url = f"data:image/{img_data['format']};base64,{img_data['data']}"
                content.append({'type': 'image_url', 'image_url': {'url': url}})
            
            # Add audio content
            if msg.audio:
                audio_data = msg.audio
                content.append({
                    'type': 'input_audio',
                    'input_audio': {
                        'data': audio_data['data'],
                        'format': audio_data['format']
                    }
                })
            
            # Add PDF content
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
        
        return messages
    
    def create_payload(
        self,
        messages: List[Dict[str, Any]],
        use_mcp: bool = False,
        mcp_server_type: str = "cmu_api",
        has_pdf: bool = False
    ) -> Dict[str, Any]:
        """Create request payload for OpenRouter API"""
        output_modalities = self.model_data['architecture']['output_modalities']
        
        payload = {
            'model': self.model_id,
            'messages': messages,
            'modalities': output_modalities
        }
        
        # Add MCP tools if enabled
        if use_mcp:
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    client = loop.run_until_complete(
                        mcp_manager.get_or_create_client(mcp_server_type)
                    )
                    tools = loop.run_until_complete(client.get_available_tools())
                    if tools:
                        payload['tools'] = tools
                finally:
                    loop.close()
            except Exception as e:
                print(f"Failed to load MCP tools: {e}")
        
        # Add file parser plugin if PDFs are present
        if has_pdf:
            payload['plugins'] = [{
                'id': 'file-parser',
                'pdf': {'engine': 'pdf-text'}
            }]
        
        return payload
    
    def stream_response(
        self,
        payload: Dict[str, Any],
        use_mcp: bool = False,
        mcp_auto_approve: bool = False,
        mcp_server_type: str = "cmu_api"
    ) -> Generator[str, None, None]:
        """Stream chat response from OpenRouter API"""
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        }
        
        payload['stream'] = True
        buffer = ''
        
        with requests.post(url, headers=headers, json=payload, stream=True) as r:
            accumulated_tool_calls = []
            accumulated_message = ""
            tool_calls_complete = False
            
            for chunk in r.iter_content(chunk_size=1024, decode_unicode=False):
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
                                tool_calls_complete = True
                                break
                            
                            try:
                                parsed_data = json.loads(data)
                                
                                # Handle tool calls in streaming response
                                if use_mcp and 'choices' in parsed_data and len(parsed_data['choices']) > 0:
                                    choice = parsed_data['choices'][0]
                                    
                                    if 'delta' in choice and 'content' in choice['delta']:
                                        accumulated_message += choice['delta']['content'] or ""
                                    
                                    if 'delta' in choice and 'tool_calls' in choice['delta']:
                                        self._accumulate_tool_calls(
                                            choice['delta']['tool_calls'],
                                            accumulated_tool_calls
                                        )
                                        
                                        if not mcp_auto_approve:
                                            continue
                                
                                if not use_mcp or not accumulated_tool_calls or mcp_auto_approve:
                                    yield data
                                    
                            except json.JSONDecodeError:
                                pass
                    except Exception:
                        break
            
            # Handle tool calls after streaming
            if use_mcp and accumulated_tool_calls and tool_calls_complete:
                if not mcp_auto_approve:
                    yield json.dumps({
                        "type": "tool_calls_pending",
                        "tool_calls": accumulated_tool_calls,
                        "message": "The AI wants to use tools. Do you approve?",
                        "assistant_message": accumulated_message
                    })
                else:
                    # Auto-approve: execute tools and continue
                    yield from self._execute_tools_and_continue(
                        accumulated_tool_calls,
                        payload,
                        headers,
                        url,
                        mcp_server_type
                    )
    
    def _accumulate_tool_calls(self, tool_calls: List[Dict], accumulated: List[Dict]):
        """Accumulate streaming tool call data"""
        for tool_call in tool_calls:
            if tool_call.get('index') is not None:
                index = tool_call['index']
                while len(accumulated) <= index:
                    accumulated.append({
                        'id': '',
                        'type': 'function',
                        'function': {'name': '', 'arguments': ''}
                    })
                
                if 'id' in tool_call:
                    accumulated[index]['id'] = tool_call['id']
                if 'function' in tool_call:
                    if 'name' in tool_call['function']:
                        accumulated[index]['function']['name'] = tool_call['function']['name']
                    if 'arguments' in tool_call['function']:
                        accumulated[index]['function']['arguments'] += tool_call['function']['arguments']
    
    def _execute_tools_and_continue(
        self,
        tool_calls: List[Dict],
        payload: Dict[str, Any],
        headers: Dict[str, str],
        url: str,
        server_name: str
    ) -> Generator[str, None, None]:
        """Execute approved tool calls and stream final response"""
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                client = loop.run_until_complete(
                    mcp_manager.get_or_create_client(server_name)
                )
                
                messages = payload['messages'].copy()
                messages.append({
                    "role": "assistant",
                    "content": "",
                    "tool_calls": tool_calls
                })
                
                for tool_call in tool_calls:
                    tool_name = tool_call['function']['name']
                    tool_args = json.loads(tool_call['function']['arguments'] or "{}")
                    tool_result = loop.run_until_complete(client.call_tool(tool_name, tool_args))
                    
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call['id'],
                        "name": tool_name,
                        "content": json.dumps(tool_result) if tool_result['success'] else f"Error: {tool_result['error']}"
                    })
                
                final_payload = payload.copy()
                final_payload['messages'] = messages
                if 'tools' in final_payload:
                    del final_payload['tools']
                
                final_payload['stream'] = True
                with requests.post(url, headers=headers, json=final_payload, stream=True) as final_r:
                    final_buffer = ''
                    for final_chunk in final_r.iter_content(chunk_size=1024, decode_unicode=False):
                        final_chunk = final_chunk.decode('utf-8') if isinstance(final_chunk, bytes) else final_chunk
                        final_buffer += final_chunk
                        while True:
                            try:
                                line_end = final_buffer.find("\n")
                                if line_end == -1:
                                    break
                                line = final_buffer[:line_end].strip()
                                final_buffer = final_buffer[line_end + 1:]
                                if line.startswith("data: "):
                                    data = line[6:]
                                    if data == "[DONE]":
                                        break
                                    yield data
                            except Exception:
                                break
            finally:
                loop.close()
        except Exception as e:
            print(f"Error handling auto-approved tool calls: {e}")
            yield json.dumps({
                "choices": [{
                    "delta": {
                        "content": f"Error executing tools: {e}"
                    }
                }]
            })
