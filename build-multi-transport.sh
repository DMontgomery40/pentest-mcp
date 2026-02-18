#!/bin/bash

# Build and Test Multi-Transport Pentest MCP

echo "=== Building Pentest MCP with Multi-Transport Support ==="

# Step 1: Install dependencies
echo -e "\n1. Installing dependencies (including express)..."
echo "Run: npm install"

# Step 2: Build TypeScript
echo -e "\n2. Building TypeScript..."
echo "Run: npm run build"

# Step 3: Make executable
echo -e "\n3. Making dist/index.js executable..."
echo "Run: chmod +x dist/index.js"

# Step 4: Test different transports
echo -e "\n4. Testing transports..."
echo ""
echo "Test STDIO (default):"
echo "  node dist/index.js"
echo ""
echo "Test HTTP transport:"
echo "  MCP_TRANSPORT=http node dist/index.js"
echo "  # In another terminal: curl http://localhost:8000/health"
echo ""
echo "Test SSE transport:"
echo "  MCP_TRANSPORT=sse node dist/index.js"
echo "  # In another terminal: curl http://localhost:8001/health"
echo ""
echo "Test bundled MCP Inspector:"
echo "  node dist/index.js inspector"
echo "Inspector CLI tools-list smoke test:"
echo "  node dist/index.js inspector --cli --method tools/list"

# Step 5: Docker build
echo -e "\n5. Docker build (optional):"
echo "  docker build -t pentest-mcp:latest ."

echo -e "\n=== Next Steps ==="
echo "1. Copy .env.example to .env and configure as needed"
echo "2. Choose your transport type"
echo "3. Run with your preferred method (see usage-examples.sh)"
