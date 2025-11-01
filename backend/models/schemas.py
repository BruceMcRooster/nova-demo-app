"""
Pydantic models for request/response validation
"""

from pydantic import BaseModel
from typing import Optional, List


class ImageData(BaseModel):
    """Image data with base64 encoding"""
    data: str
    format: str


class AudioData(BaseModel):
    """Audio data with base64 encoding"""
    data: str
    format: str


class PdfData(BaseModel):
    """PDF data with base64 encoding"""
    data: str
    filename: str


class Message(BaseModel):
    """Chat message with optional multimodal attachments"""
    role: str
    content: str
    image: Optional[dict] = None
    audio: Optional[dict] = None
    pdf: Optional[dict] = None


class ChatRequest(BaseModel):
    """Request model for chat endpoint"""
    model_id: str
    chat_history: List[Message]
    use_mcp: bool = False
    mcp_server_type: str = "cmu_api"
    mcp_auto_approve: bool = False


class ToolCallApprovalRequest(BaseModel):
    """Request model for tool call approval"""
    tool_calls: List[dict]
    approved: bool
    chat_history: List[Message]
    model_id: str
    mcp_server_type: str = "cmu_api"
