# Use Python 3.13 slim image
FROM python:3.13-slim

# Set working directory
WORKDIR /app

# Install uv for faster dependency management
RUN pip install --no-cache-dir uv

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install dependencies using uv
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy application code
COPY . .

# Expose the port the app runs on
EXPOSE 8001

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Run the application with uvicorn
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
