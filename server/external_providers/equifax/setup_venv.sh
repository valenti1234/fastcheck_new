#!/bin/bash

# Check if the .venv directory exists
if [ ! -d ".venv" ]; then
    echo ".venv directory does not exist. Creating a virtual environment..."

    # Create a virtual environment
    python3 -m venv .venv

    echo "Virtual environment created."
else
    echo ".venv directory already exists."
fi

# Activate the virtual environment
source .venv/bin/activate

# Upgrade pip (optional)
pip install --upgrade pip

# Install requirements from requirements.txt
if [ -f "requirements.txt" ]; then
    echo "Installing requirements from requirements.txt..."
    pip install -r requirements.txt
else
    echo "No requirements.txt file found."
fi

echo "Setup complete."
