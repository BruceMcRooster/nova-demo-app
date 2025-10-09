
# Nova Demo App - Backend

This is the FastAPI backend for the Nova Demo App. It provides endpoints for chat functionality with various AI models.

## Prerequisites

This project uses `uv` to manage dependencies and Python environments.  Note, if you have another env active (like conda base), be sure to deactivate it before using this.

## Setup

1. Install dependencies using uv:
   ```bash
   uv sync
   ```

2. Activate the virtual environment:
   ```bash
   source .venv/bin/activate
   ```

## Adding New Dependencies

To add new packages to the project:

```bash
# Add a package
uv add package-name

# Add a development dependency
uv add --dev package-name

# Add a specific version
uv add package-name==1.2.3

# Add from PyPI with extras
uv add "package-name[extra]"
```

After adding packages, they will be automatically added to `pyproject.toml` and the lock file will be updated.

## Running the Application

Start the FastAPI server with auto-reload:

```bash
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

The application will be available at:
- **API**: http://localhost:8000
- **Interactive API docs**: http://localhost:8000/docs
- **Alternative docs**: http://localhost:8000/redoc

## API Endpoints

### GET /
Health check endpoint that returns a "Hello World" message.

### POST /chat
Non-streaming chat endpoint.

**Parameters:**
- `model_id` (string): ID of the model to use
- `prompt` (string): The chat prompt

**Example request:**
```bash
curl -X POST "http://localhost:8000/chat" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "model_id=your-model-id&prompt=Hello, how are you?"
```

### POST /chat_streaming
Streaming chat endpoint for real-time responses.

**Parameters:**
- `model_id` (string): ID of the model to use
- `prompt` (string): The chat prompt

**Example request:**
```bash
curl -X POST "http://localhost:8000/chat_streaming" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "model_id=your-model-id&prompt=Tell me a story"
```

## Testing

You can test the API endpoints using:
- **Postman**: Import the endpoints and test with the interactive UI
- **curl**: Use the example commands above
- **FastAPI docs**: Visit http://localhost:8000/docs for interactive testing

## Development

The application includes CORS middleware configured to allow all origins for development purposes. In production, you should configure specific allowed origins for security.  