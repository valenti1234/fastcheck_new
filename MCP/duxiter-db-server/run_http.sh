#!/bin/bash

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
. venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Run the server in HTTP mode
echo "Starting Duxiter DB MCP server in HTTP mode..."
echo "Server will be available at http://localhost:8000"
python server.py