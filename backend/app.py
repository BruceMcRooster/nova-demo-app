"""
FastAPI application for Nova Demo
Multimodal AI chat with MCP (Model Context Protocol) support
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routers
from routers import chat, mcp

# Create FastAPI app
app = FastAPI(
    title="Nova Demo API",
    description="Multimodal AI chat with MCP support",
    version="1.0.0"
)

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat.router)
app.include_router(mcp.router)


@app.get("/")
async def root():
    """Root endpoint - API health check"""
    return {
        "message": "Nova Demo API",
        "status": "running",
        "version": "1.0.0"
    }
