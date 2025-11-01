# Quick Start Guide

Get the Nova Demo App running in 5 minutes!

## Prerequisites

- Python 3.11+
- Node.js 18+ or Bun
- OpenRouter API key

## Step 1: Clone and Setup

```bash
# Clone the repository (if you haven't already)
cd nova-demo-app
```

## Step 2: Backend Setup

```bash
# Navigate to backend
cd backend

# Create .env file
cat > .env << 'EOF'
API_KEY=your_openrouter_api_key_here
EOF

# Install dependencies (choose one)
# Option A: Using uv (recommended)
uv sync

# Option B: Using pip
pip install -r requirements.txt

# Start the backend server
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Backend will be running at: http://localhost:8000

## Step 3: Frontend Setup

```bash
# Open a new terminal
cd nova-demo-frontend

# Create .env file
echo "VITE_API_URL=http://localhost:8000" > .env

# Install dependencies (choose one)
# Option A: Using bun (faster)
bun install

# Option B: Using npm
npm install

# Start the dev server
bun dev  # or: npm run dev
```

Frontend will be running at: http://localhost:3000

## Step 4: Try It Out!

1. Open http://localhost:3000 in your browser
2. Select a model from the dropdown (try "qwen/qwen3-vl-30b-a3b-instruct")
3. Type a message and hit Enter
4. Try uploading an image with the 📷 button
5. Enable MCP tools in the settings for advanced features

## Troubleshooting

### Backend Issues

**"Module not found" errors**
```bash
cd backend
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
uvicorn app:app --reload
```

**"API_KEY not found"**
- Make sure `.env` file exists in `backend/` directory
- Check that your OpenRouter API key is valid

### Frontend Issues

**"Cannot find module '@/...'"**
```bash
# Make sure tsconfig.json has the correct paths
cd nova-demo-frontend
bun install  # or npm install
```

**API connection errors**
- Ensure backend is running on port 8000
- Check VITE_API_URL in `.env` file
- Verify CORS is enabled in backend

## What's Next?

- Check out the [README.md](./README.md) for detailed architecture
- Read [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) to understand the codebase
- Visit http://localhost:8000/docs for API documentation

## Common Commands

### Backend
```bash
# Run server
uvicorn app:app --reload

# Run with custom port
uvicorn app:app --reload --port 8080

# Run tests (if available)
pytest
```

### Frontend
```bash
# Dev server
bun dev

# Build for production
bun run build

# Preview production build
bun run preview

# Type check
bun run typecheck
```

## Docker (Alternative)

Want to use Docker instead?

```bash
# From project root
docker-compose up --build
```

Both services will start automatically:
- Backend: http://localhost:8000
- Frontend: http://localhost:3000

## Need Help?

- Check the API docs: http://localhost:8000/docs
- Review the README for architecture details
- Look at the REFACTORING_SUMMARY for code organization

Happy coding! 🚀
