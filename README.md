# Nova Demo App

A full-stack multimodal AI chat application with Model Context Protocol (MCP) support. Built with React (TanStack Router/Query) on the frontend and FastAPI on the backend.

## 🎯 Features

- **Multimodal Chat**: Support for text, images, audio, and PDF inputs
- **Multiple AI Models**: Choose from various models via OpenRouter API
- **Streaming Responses**: Real-time streaming of AI responses
- **MCP Integration**: Tool usage with approval workflows
- **Model Capabilities**: Automatic detection and display of model capabilities
- **Clean Architecture**: Well-organized codebase with separation of concerns

## 📁 Project Structure

```
nova-demo-app/
├── backend/                    # FastAPI backend
│   ├── app.py                 # Main FastAPI application
│   ├── models/                # Pydantic models
│   │   └── schemas.py         # Request/response schemas
│   ├── routers/               # API route handlers
│   │   ├── chat.py           # Chat endpoints
│   │   └── mcp.py            # MCP endpoints
│   ├── services/              # Business logic
│   │   ├── chat_service.py   # Chat service
│   │   └── mcp_service.py    # MCP service
│   ├── mcp_client_fastmcp.py # MCP client implementation
│   └── utils.py               # Utility functions
│
├── nova-demo-frontend/        # React frontend
│   ├── src/
│   │   ├── components/       # React components
│   │   │   ├── ChatHeader.tsx        # Model selection & MCP controls
│   │   │   ├── ChatMessages.tsx      # Message display
│   │   │   ├── ChatInput.tsx         # Input area with file uploads
│   │   │   ├── MessageContent.tsx    # Markdown message renderer
│   │   │   ├── ModelSelector.tsx     # Model dropdown with search
│   │   │   ├── ModelCapabilities.tsx # Capability badges
│   │   │   ├── MCPControls.tsx       # MCP configuration
│   │   │   ├── ToolApprovalModal.tsx # Tool approval dialog
│   │   │   ├── FilePreview.tsx       # File upload previews
│   │   │   ├── Header.tsx            # App header
│   │   │   └── Spinner.tsx           # Loading spinner
│   │   │
│   │   ├── hooks/            # Custom React hooks
│   │   │   ├── useAvailableModels.ts # Fetch models
│   │   │   ├── useChatStreaming.ts   # Streaming chat
│   │   │   ├── useMCP.ts             # MCP integration
│   │   │   └── useToolApproval.ts    # Tool approval logic
│   │   │
│   │   ├── types/            # TypeScript type definitions
│   │   │   └── chat.ts      # Chat-related types
│   │   │
│   │   ├── utils/            # Utility functions
│   │   │   ├── modelCapabilities.ts  # Model capability checks
│   │   │   ├── fileHandlers.ts       # File upload handlers
│   │   │   └── streamParser.ts       # Streaming response parser
│   │   │
│   │   └── routes/           # TanStack Router routes
│   │       └── index.tsx    # Main chat route
│   │
│   └── package.json          # Frontend dependencies
│
├── infra/                     # Infrastructure code
│   ├── flux.py               # Flux model integration
│   └── wan2.py               # Wan2 model integration
│
└── docker-compose.yml        # Docker composition
```

## 🏗️ Architecture

### Backend Architecture

The backend follows a clean, modular architecture:

#### **1. Entry Point (`app.py`)**
- FastAPI application initialization
- CORS middleware configuration
- Router registration
- Health check endpoint

#### **2. Routers (`routers/`)**
- **`chat.py`**: Handles all chat-related endpoints
  - `/chat`: Simple non-streaming chat
  - `/chat_streaming`: Streaming chat with MCP support
  - `/mcp/approve_tool_calls_streaming`: Tool approval workflow
  
- **`mcp.py`**: MCP management endpoints
  - `/mcp/servers`: List available MCP servers
  - `/mcp/tools/{server_type}`: Get tools for a server
  - `/mcp/cleanup`: Cleanup MCP connections

#### **3. Services (`services/`)**
- **`chat_service.py`**: Core chat logic
  - Message formatting for OpenRouter API
  - Streaming response handling
  - Tool call accumulation and execution
  
- **`mcp_service.py`**: MCP client management
  - Re-exports the global `mcp_manager`
  - Provides clean import path

#### **4. Models (`models/`)**
- **`schemas.py`**: Pydantic models for validation
  - `Message`: Chat message with multimodal support
  - `ChatRequest`: Chat endpoint request
  - `ToolCallApprovalRequest`: Tool approval request
  - `ImageData`, `AudioData`, `PdfData`: File data models

#### **5. Core Utilities**
- **`utils.py`**: Model management and OpenRouter integration
- **`mcp_client_fastmcp.py`**: FastMCP client implementation

### Frontend Architecture

The frontend uses modern React patterns with TanStack:

#### **1. Components (`components/`)**
Modular, reusable UI components:
- **ChatHeader**: Model selection, capabilities display, MCP controls
- **ChatMessages**: Message list with auto-scroll
- **ChatInput**: Input field with file upload buttons
- **ModelSelector**: Searchable model dropdown
- **ToolApprovalModal**: Modal for approving tool usage
- **FilePreview**: Image/audio/PDF preview components

#### **2. Custom Hooks (`hooks/`)**
Encapsulate business logic and state management:
- **useAvailableModels**: Fetches and caches model list
- **useChatStreaming**: Manages streaming chat with message parsing
- **useMCP**: Handles MCP server and tool fetching
- **useToolApproval**: Manages tool approval workflow

#### **3. Type Definitions (`types/`)**
TypeScript interfaces for type safety:
- Message, Model, ToolCall types
- File data types (Image, Audio, PDF)
- API request/response types

#### **4. Utilities (`utils/`)**
Pure functions for common operations:
- **modelCapabilities.ts**: Check model support for features
- **fileHandlers.ts**: Validate and process file uploads
- **streamParser.ts**: Parse streaming JSON responses

#### **5. Routes (`routes/`)**
TanStack Router pages:
- **index.tsx**: Main chat interface (now clean and organized!)

## 🚀 Getting Started

### Prerequisites

- **Backend**: Python 3.11+, uv or pip
- **Frontend**: Node.js 18+, Bun or npm
- **API Key**: OpenRouter API key

### Environment Setup

Create a `.env` file in the `backend/` directory:

```env
API_KEY=your_openrouter_api_key_here
CMU_API_MCP_URL=http://localhost:8000/mcp  # Optional: MCP server URL
```

### Backend Setup

```bash
cd backend

# Install dependencies (using uv)
uv sync

# Or using pip
pip install -r requirements.txt

# Run the server
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd nova-demo-frontend

# Install dependencies
bun install  # or npm install

# Set environment variable
echo "VITE_API_URL=http://localhost:8000" > .env

# Run development server
bun dev  # or npm run dev
```

### Docker Setup

```bash
# Build and run with Docker Compose
docker-compose up --build
```

## 🎨 Key Features Explained

### Multimodal Support

The app supports multiple input types:
- **Text**: Standard chat messages
- **Images**: For vision models (automatic detection)
- **Audio**: For speech-to-text models
- **PDFs**: Document analysis via OpenRouter's file parser

### Model Capabilities

Models are automatically tagged with capability badges:
- 👁️ **Can view images**: Supports image input
- 🎵 **Can process audio**: Supports audio input
- 📄 **Can process PDFs**: PDF support (all models via plugin)
- 🎨 **Can generate images**: Image generation capability

### MCP (Model Context Protocol)

MCP enables AI models to use external tools:
- **Server Management**: Connect to different MCP servers
- **Tool Discovery**: Automatically list available tools
- **Approval Workflow**: Optional manual approval for tool calls
- **Auto-Approval**: Streamline workflow with automatic approval

### Streaming Responses

Real-time streaming for better UX:
- Character-by-character streaming
- Proper JSON parsing for incomplete chunks
- Image detection in streaming responses
- Tool call detection and handling

## 🛠️ Development

### Code Quality

The codebase follows best practices:
- **TypeScript**: Full type safety on frontend
- **Type Hints**: Python type hints throughout backend
- **Separation of Concerns**: Clear module boundaries
- **Documentation**: Comprehensive docstrings and comments
- **Error Handling**: Graceful error handling and user feedback

### Adding New Features

#### Backend
1. Define Pydantic models in `models/schemas.py`
2. Create service logic in `services/`
3. Add routes in `routers/`
4. Register router in `app.py`

#### Frontend
1. Define types in `types/`
2. Create utilities in `utils/`
3. Build custom hooks in `hooks/`
4. Create components in `components/`
5. Use in routes

## 📝 API Documentation

Once running, visit:
- **API Docs**: http://localhost:8000/docs
- **Alternative Docs**: http://localhost:8000/redoc

## 🤝 Contributing

Contributions are welcome! Please follow the existing code structure and style.

## 📄 License

[Your License Here]

## 🙏 Acknowledgments

- **OpenRouter**: AI model routing
- **FastAPI**: Modern Python web framework
- **TanStack**: React Query and Router
- **FastMCP**: Model Context Protocol implementation
