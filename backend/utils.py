from dotenv import load_dotenv
import os
from pydantic import BaseModel
import requests
import json
import uuid
import asyncio
from typing import Union, Generator, Optional, Dict, List, Any

load_dotenv()
OPENROUTER_API_KEY = os.getenv('API_KEY')

# map model ids -> models
model_dict = {}

# pydantic model for prompt
class Prompt(BaseModel):
    text: Union[str, None] = None
    img: Union[str, None] = None
    pdf: Union[str, None] = None
    modalities: list[str] = ['text']

class Message(BaseModel):
    role: str
    content: str

class Model():
    def __init__(
        self,
        model: str = 'x-ai/grok-4-fast:free'
    ):
        self.model = model 

        # find model data
        all_models = requests.get('https://openrouter.ai/api/v1/models').json()['data']
        self.model_data = None
        for obj in all_models:
            if obj['id'] == model:
                self.model_data = obj
                break
        if not self.model_data:
            raise NameError('Model not found')

        self.id = uuid.uuid4()
        model_dict[self.id] = self
        print("model_dict:",model_dict)

        # TODO: implement backup models, prompt caching

    def reply(self, prompt: Prompt, stream=False):
        '''
        prompt_obj: json object with following attributes:
        - text: string, contains text prompt
        - img: json object, contains data (base64 encoding of image) and format (format of image)
        - pdf: string, base64 encoding of pdf
        - modalities: string array of modalities
        returns a json object
        if field is not used set as None

        stream: bool, True if stream and False otherwise. Can only stream if output is text only
        '''

        content = []
        
        # check output modalities are supported
        output_modalities = self.model_data['architecture']['output_modalities']
        if not set(prompt['modalities']).issubset(set(output_modalities)):
            raise ValueError('Model does not support requested modalities')

        # add data to content to feed to model
        input_modalities = self.model_data['architecture']['input_modalities']

        if 'text' in input_modalities and prompt['text']:
            content.append({
                'type': 'text',
                'text': prompt['text']
            })

        if 'image' in input_modalities and prompt['img']:
            img = json.loads(prompt['img'])
            url = img['url']
            content.append({
                'type': 'image_url',
                'image_url': {
                    'url': url
                }
            })

        if 'file' in input_modalities and prompt['pdf']:
            url = f"data:application/pdf;base64,{prompt['pdf']}"
            content.append({
                'type': 'file',
                'file': {
                    'filename': 'temp_doc.pdf',
                    'file_data': url
                }
            })

        # submit prompt
        url = "https://openrouter.ai/api/v1/chat/completions"

        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        }

        payload = {
            'model': self.model,
            'messages': [
                {
                    'role': 'user',
                    'content': content
                }
            ],
            'plugins': [
                {
                    'id': 'file-parser',
                    'pdf': {
                        'engine': 'pdf-text'
                    }
                }
            ],
            'modalities': output_modalities
        }

        return self._stream(url, headers, payload) if stream else self._output(url, headers, payload)

    def reply_with_history(self, chat_history: list[Message], stream=False, use_mcp=False, mcp_server_type="cmu_api", mcp_auto_approve=False):
        '''
        chat_history: list of Message objects with role, content, and optional image/audio/pdf attributes
        stream: bool, True if stream and False otherwise. Can only stream if output is text only
        use_mcp: bool, whether to enable MCP tools
        mcp_server_type: str, type of MCP server to use
        mcp_auto_approve: bool, whether to auto-approve MCP tool calls (or return them for approval)
        '''
        
        # Convert chat history to proper OpenRouter format
        messages = []
        for msg in chat_history:
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
                # Create data URL for PDF
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

        # Check output modalities are supported
        output_modalities = self.model_data['architecture']['output_modalities']
        
        # Check if model supports required input modalities
        input_modalities = self.model_data['architecture']['input_modalities']
        has_images = any(hasattr(msg, 'image') and msg.image for msg in chat_history)
        has_audio = any(hasattr(msg, 'audio') and msg.audio for msg in chat_history)
        has_pdf = any(hasattr(msg, 'pdf') and msg.pdf for msg in chat_history)
        
        if has_images and 'image' not in input_modalities:
            raise ValueError('Model does not support image input')
        
        if has_audio and 'audio' not in input_modalities:
            raise ValueError('Model does not support audio input')
        
        # Note: PDFs work on all models through OpenRouter's file-parser plugin

        # Submit prompt
        url = "https://openrouter.ai/api/v1/chat/completions"

        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        }

        payload = {
            'model': self.model,
            'messages': messages,
            'modalities': output_modalities
        }
        print("use_mcp:",use_mcp)
        # Add MCP tools if enabled
        if use_mcp:
            try:
                from mcp_client_fastmcp import mcp_manager
                # Get MCP tools in a synchronous context
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    client = loop.run_until_complete(mcp_manager.get_or_create_client(mcp_server_type))
                    tools = loop.run_until_complete(client.get_available_tools())
                    print(f"Retrieved {tools} tools from MCP server")
                    if tools:
                        payload['tools'] = tools
                        print(f"Added {len(tools)} MCP tools to request")
                finally:
                    loop.close()
            except Exception as e:
                print(f"Failed to load MCP tools: {e}")
        
        # Add file parser plugin if PDFs are present
        if has_pdf:
            payload['plugins'] = [
                {
                    'id': 'file-parser',
                    'pdf': {
                        'engine': 'pdf-text'  # Default to free text extraction
                    }
                }
            ]
        print("payload:",payload)
        
        if stream:
            return self._stream(url, headers, payload, use_mcp, mcp_auto_approve)
        else:
            return self._output(url, headers, payload, use_mcp, mcp_auto_approve)


    def _stream(self, url, headers, payload, use_mcp=False, server_name='cmu_api', mcp_auto_approve=False):
        payload['stream'] = True
        buffer = ''
        
        # First, make the streaming request to get the initial response
        with requests.post(url, headers=headers, json=payload, stream=True) as r:
            accumulated_tool_calls = []
            accumulated_message = ""
            tool_calls_complete = False
            
            for chunk in r.iter_content(chunk_size=1024, decode_unicode=False):
                chunk = chunk.decode('utf-8') if isinstance(chunk, bytes) else chunk
                buffer += chunk
                while True:
                    try:
                        # Find the next complete SSE line
                        line_end = buffer.find("\n")
                        if line_end == -1:
                            break
                        line = buffer[:line_end].strip()
                        buffer = buffer[line_end + 1:]
                        if line.startswith("data: "):
                            print("SSE line:", line)
                            data = line[6:]
                            if data == "[DONE]":
                                tool_calls_complete = True
                                break
                            try:
                                parsed_data = json.loads(data)
                                
                                # Check for tool calls in the streaming response
                                if use_mcp and 'choices' in parsed_data and len(parsed_data['choices']) > 0:
                                    choice = parsed_data['choices'][0]
                                    
                                    # Accumulate message content
                                    if 'delta' in choice and 'content' in choice['delta']:
                                        accumulated_message += choice['delta']['content'] or ""
                                    
                                    # Check for tool calls
                                    if 'delta' in choice and 'tool_calls' in choice['delta']:
                                        for tool_call in choice['delta']['tool_calls']:
                                            # Find existing tool call or create new one
                                            if tool_call.get('index') is not None:
                                                index = tool_call['index']
                                                while len(accumulated_tool_calls) <= index:
                                                    accumulated_tool_calls.append({
                                                        'id': '',
                                                        'type': 'function',
                                                        'function': {'name': '', 'arguments': ''}
                                                    })
                                                
                                                # Update the tool call at this index
                                                if 'id' in tool_call:
                                                    accumulated_tool_calls[index]['id'] = tool_call['id']
                                                if 'function' in tool_call:
                                                    if 'name' in tool_call['function']:
                                                        accumulated_tool_calls[index]['function']['name'] = tool_call['function']['name']
                                                    if 'arguments' in tool_call['function']:
                                                        accumulated_tool_calls[index]['function']['arguments'] += tool_call['function']['arguments']
                                        
                                        if not mcp_auto_approve:
                                            # Don't yield tool calls, wait for completion and approval
                                            continue
                                
                                # If no tool calls or auto-approve, yield the data
                                if not use_mcp or not accumulated_tool_calls or mcp_auto_approve:
                                    yield data
                                    
                            except json.JSONDecodeError:
                                pass
                    except Exception:
                        break
            
            # Handle tool calls after streaming is complete
            if use_mcp and accumulated_tool_calls and tool_calls_complete:
                if not mcp_auto_approve:
                    # Return tool calls for user approval
                    yield json.dumps({
                        "type": "tool_calls_pending",
                        "tool_calls": accumulated_tool_calls,
                        "message": "The AI wants to use tools. Do you approve?",
                        "assistant_message": accumulated_message
                    })
                else:
                    # Auto-approve: execute tools and continue conversation
                    try:
                        from mcp_client_fastmcp import mcp_manager
                        import asyncio
                        
                        loop = asyncio.new_event_loop()
                        asyncio.set_event_loop(loop)
                        
                        try:
                            client = loop.run_until_complete(mcp_manager.get_or_create_client(server_name))
                            
                            # Add the assistant's message with tool calls to conversation
                            messages = payload['messages'].copy()
                            messages.append({
                                "role": "assistant",
                                "content": accumulated_message,
                                "tool_calls": accumulated_tool_calls
                            })
                            
                            # Execute tool calls
                            for tool_call in accumulated_tool_calls:
                                tool_name = tool_call['function']['name']
                                print("tool_call:",tool_call)
                                tool_args = json.loads(tool_call['function']['arguments'] or "{}")
                                
                                # Execute the tool
                                tool_result = loop.run_until_complete(client.call_tool(tool_name, tool_args))
                                
                                # Add tool result to messages
                                messages.append({
                                    "role": "tool",
                                    "tool_call_id": tool_call['id'],
                                    "name": tool_name,
                                    "content": json.dumps(tool_result) if tool_result['success'] else f"Error: {tool_result['error']}"
                                })
                            
                            # Make final request to get the assistant's response
                            final_payload = payload.copy()
                            final_payload['messages'] = messages
                            # Remove tools from final request to avoid infinite loop
                            if 'tools' in final_payload:
                                del final_payload['tools']
                            
                            # Stream the final response
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
                        print(f"Error handling auto-approved tool calls: {e.with_traceback()}")
                        yield json.dumps({
                            "choices": [{
                                "delta": {
                                    "content": f"Error executing tools: {e}"
                                }
                            }]
                        })

    def _output(self, url, headers, payload, use_mcp=False, server_name='cmu_api', mcp_auto_approve=False):
        response = requests.post(
            url=url,
            headers=headers,
            json=payload
        )
        result = response.json()
        
        # Handle tool calls if present
        if use_mcp and 'choices' in result and len(result['choices']) > 0:
            message = result['choices'][0]['message']
            if 'tool_calls' in message and message['tool_calls']:
                if mcp_auto_approve:
                    # Process tool calls automatically
                    result = self._handle_tool_calls(result, payload, server_name)
                else:
                    # Return tool calls for user approval
                    result['type'] = 'tool_calls_pending'
                    result['requires_approval'] = True
        
        return result

    def _handle_tool_calls(self, response, original_payload, server_name):
        """Handle MCP tool calls and return final response"""
        try:
            from mcp_client_fastmcp import mcp_manager
            
            message = response['choices'][0]['message']
            tool_calls = message['tool_calls']
            
            # Process each tool call
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                client = loop.run_until_complete(mcp_manager.get_or_create_client(server_name))
                
                # Add the assistant's message with tool calls to conversation
                messages = original_payload['messages'].copy()
                messages.append(message)
                
                for tool_call in tool_calls:
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
                
                # Make final request to get the assistant's response
                final_payload = original_payload.copy()
                final_payload['messages'] = messages
                # Remove tools from final request to avoid infinite loop
                if 'tools' in final_payload:
                    del final_payload['tools']
                
                url = "https://openrouter.ai/api/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                }
                
                final_response = requests.post(url=url, headers=headers, json=final_payload)
                return final_response.json()
                
            finally:
                loop.close()
                
        except Exception as e:
            print(f"Error handling tool calls: {e}")
            return response