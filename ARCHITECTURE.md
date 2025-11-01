# Architecture Diagram

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Nova Demo App                            │
│                   Multimodal AI Chat Platform                    │
└─────────────────────────────────────────────────────────────────┘

┌───────────────────────────┐         ┌──────────────────────────┐
│                           │         │                          │
│    React Frontend         │◄────────►    FastAPI Backend       │
│   (TanStack Router)       │  HTTP   │   (Python 3.11+)         │
│                           │         │                          │
└───────────────────────────┘         └──────────────────────────┘
            │                                     │
            │                                     │
            ▼                                     ▼
    ┌──────────────┐                    ┌────────────────┐
    │   Browser    │                    │   OpenRouter   │
    │   Storage    │                    │      API       │
    └──────────────┘                    └────────────────┘
                                                 │
                                                 ▼
                                        ┌────────────────┐
                                        │  AI Models     │
                                        │  (GPT, Claude, │
                                        │   Qwen, etc.)  │
                                        └────────────────┘
```

## Frontend Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      React Application                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────┐    ┌─────────────────┐   ┌────────────────┐ │
│  │     Routes     │    │   Components    │   │     Hooks      │ │
│  │                │    │                 │   │                │ │
│  │  index.tsx     │───►│  ChatHeader     │◄──│ useChatStream  │ │
│  │                │    │  ChatMessages   │   │ useAvailModels │ │
│  │                │    │  ChatInput      │   │ useMCP         │ │
│  │                │    │  ModelSelector  │   │ useToolApproval│ │
│  └────────────────┘    │  ...            │   └────────────────┘ │
│                        └─────────────────┘            │          │
│                                 │                     │          │
│                                 ▼                     ▼          │
│                        ┌─────────────────┐   ┌────────────────┐ │
│                        │    Utilities    │   │     Types      │ │
│                        │                 │   │                │ │
│                        │  modelCaps.ts   │   │  chat.ts       │ │
│                        │  fileHandlers   │   │                │ │
│                        │  streamParser   │   │                │ │
│                        └─────────────────┘   └────────────────┘ │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## Backend Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     FastAPI Application                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────┐                                              │
│  │    app.py      │  ◄── Main application entry                  │
│  └────────┬───────┘                                              │
│           │                                                       │
│           ├─────────► ┌───────────────────────────────┐          │
│           │           │        Routers                │          │
│           │           │                               │          │
│           │           │  ┌──────────┐  ┌──────────┐  │          │
│           │           │  │ chat.py  │  │  mcp.py  │  │          │
│           │           │  └─────┬────┘  └─────┬────┘  │          │
│           │           └────────┼─────────────┼───────┘          │
│           │                    │             │                   │
│           │                    ▼             ▼                   │
│           │           ┌───────────────────────────────┐          │
│           │           │        Services               │          │
│           │           │                               │          │
│           │           │  ┌────────────────────────┐   │          │
│           │           │  │   ChatService          │   │          │
│           │           │  │   - prepare_messages() │   │          │
│           │           │  │   - stream_response()  │   │          │
│           │           │  │   - execute_tools()    │   │          │
│           │           │  └────────────────────────┘   │          │
│           │           │                               │          │
│           │           │  ┌────────────────────────┐   │          │
│           │           │  │   MCP Service          │   │          │
│           │           │  │   - mcp_manager        │   │          │
│           │           │  └────────────────────────┘   │          │
│           │           └───────────────────────────────┘          │
│           │                                                       │
│           └─────────► ┌───────────────────────────────┐          │
│                       │         Models                │          │
│                       │                               │          │
│                       │  ┌─────────────────────────┐  │          │
│                       │  │   Pydantic Schemas      │  │          │
│                       │  │   - Message             │  │          │
│                       │  │   - ChatRequest         │  │          │
│                       │  │   - ToolCallApproval    │  │          │
│                       │  └─────────────────────────┘  │          │
│                       └───────────────────────────────┘          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. User Sends Message

```
User Input
    │
    ├─► [Text] ──┐
    ├─► [Image] ─┤
    ├─► [Audio] ─┼─► ChatInput Component
    └─► [PDF] ───┘
                │
                ▼
         handleSendMessage()
                │
                ├─► Create Message object
                │
                ├─► Add to chatMessages state
                │
                └─► Trigger streaming query
                        │
                        ▼
                  useChatStreaming hook
                        │
                        ▼
                  POST /chat_streaming
                        │
                        ▼
                  Backend Router (chat.py)
                        │
                        ▼
                  ChatService.stream_response()
                        │
                        ├─► Prepare messages
                        ├─► Add MCP tools (if enabled)
                        └─► Call OpenRouter API
                                │
                                ▼
                          Stream chunks back
```

### 2. Streaming Response

```
OpenRouter API
    │
    │ (Server-Sent Events)
    ▼
Backend ChatService
    │
    ├─► Parse SSE data
    ├─► Detect tool calls
    ├─► Accumulate content
    └─► Yield chunks
        │
        ▼
Frontend useChatStreaming
    │
    ├─► parseStreamingMessage()
    ├─► extractContent()
    ├─► extractImage()
    └─► onMessageUpdate()
            │
            ▼
    Update chatMessages state
            │
            ▼
    ChatMessages re-renders
            │
            ▼
    User sees streaming response
```

### 3. MCP Tool Workflow

```
Model requests tools
    │
    ├─► If auto-approve OFF:
    │       │
    │       ├─► Backend detects tool_calls
    │       ├─► Returns pending status
    │       ├─► Frontend shows modal
    │       ├─► User approves/declines
    │       └─► POST /mcp/approve_tool_calls_streaming
    │
    └─► If auto-approve ON:
            │
            ├─► Backend executes tools immediately
            ├─► Calls MCP server
            ├─► Gets tool results
            ├─► Sends to OpenRouter
            └─► Streams final response
```

## Component Interaction

```
┌─────────────────────────────────────────────────────────────┐
│                         ChatDemo                             │
│                       (Main Route)                           │
└───────┬────────────────────────────────────────────────┬────┘
        │                                                 │
        ├─► State Management                             │
        │   - chatMessages                               │
        │   - selectedModel                              │
        │   - mcpEnabled                                 │
        │   - uploadedFiles                              │
        │                                                 │
        ├─► Hooks                                        │
        │   │                                             │
        │   ├─► useAvailableModels ──┐                  │
        │   ├─► useMCP ───────────────┼─► API Calls     │
        │   ├─► useChatStreaming ─────┤                  │
        │   └─► useToolApproval ──────┘                  │
        │                                                 │
        └─► Child Components                             │
            │                                             │
            ├─► ChatHeader ──────┐                       │
            │   ├─► ModelSelector │                      │
            │   ├─► ModelCapabilities                    │
            │   └─► MCPControls                          │
            │                                             │
            ├─► ChatMessages ────┐                       │
            │   └─► MessageContent (for each message)    │
            │                                             │
            ├─► ChatInput ───────┐                       │
            │   └─► FilePreview components               │
            │                                             │
            └─► ToolApprovalModal                        │
                                                          │
                    All components receive props          │
                    and call handlers from parent         │
```

## File Upload Flow

```
User selects file
    │
    ▼
File Input onChange
    │
    ├─► Image
    │   └─► handleImageUpload()
    │       ├─► Validate type
    │       ├─► Check size
    │       ├─► Read as Data URL
    │       └─► Convert to base64
    │           └─► setUploadedImage()
    │
    ├─► Audio
    │   └─► handleAudioUpload()
    │       └─► (same process)
    │
    └─► PDF
        └─► handlePdfUpload()
            └─► (same process)

Preview shown in ChatInput
    │
    ▼
User sends message
    │
    ▼
File attached to message
    │
    ▼
Sent to backend with base64 data
    │
    ▼
Backend converts to proper format
    │
    ▼
Sent to OpenRouter API
```

## Technology Stack

### Frontend
- **Framework**: React 18
- **Router**: TanStack Router
- **State**: TanStack Query + React useState
- **Language**: TypeScript
- **Build**: Vite
- **Package Manager**: Bun/npm
- **Styling**: Tailwind CSS
- **Markdown**: react-markdown
- **Syntax Highlighting**: highlight.js

### Backend
- **Framework**: FastAPI
- **Language**: Python 3.11+
- **Validation**: Pydantic v2
- **HTTP Client**: requests
- **Async**: asyncio
- **MCP**: FastMCP
- **Package Manager**: uv/pip

### External Services
- **AI Models**: OpenRouter API
- **MCP Servers**: Custom implementations

## Security Considerations

```
┌─────────────────────────────────────────────┐
│           Security Measures                 │
├─────────────────────────────────────────────┤
│                                             │
│  1. API Key Management                      │
│     - Stored in .env (never committed)      │
│     - Backend-only access                   │
│     - Not exposed to frontend               │
│                                             │
│  2. CORS Configuration                      │
│     - Configured in backend                 │
│     - Allows specified origins              │
│                                             │
│  3. Input Validation                        │
│     - Pydantic models in backend            │
│     - TypeScript types in frontend          │
│     - File size/type validation             │
│                                             │
│  4. MCP Tool Approval                       │
│     - Optional manual approval              │
│     - Tool call inspection                  │
│     - User control over execution           │
│                                             │
└─────────────────────────────────────────────┘
```

## Deployment Architecture

```
Production Environment
    │
    ├─► Frontend (Static Files)
    │   └─► Served via:
    │       - Vercel
    │       - Netlify
    │       - nginx
    │       - S3 + CloudFront
    │
    └─► Backend (API Server)
        └─► Hosted on:
            - Docker container
            - AWS ECS/Fargate
            - Google Cloud Run
            - Heroku
            - Railway
            │
            ├─► Environment Variables
            │   - API_KEY
            │   - ALLOWED_ORIGINS
            │   - MCP_SERVER_URL
            │
            └─► External Services
                ├─► OpenRouter API
                └─► MCP Servers
```

This architecture provides:
- ✅ Clean separation of concerns
- ✅ Scalable structure
- ✅ Easy to test and maintain
- ✅ Type-safe throughout
- ✅ Modular and extensible
