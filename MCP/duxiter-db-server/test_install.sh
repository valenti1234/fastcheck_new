#!/bin/bash

# Create a temporary virtual environment
echo "Creating temporary virtual environment..."
python3 -m venv temp_venv

# Activate the virtual environment
source temp_venv/bin/activate

# Install the dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Check if fastmcp is installed
echo "Checking if fastmcp is installed..."
pip show fastmcp

# Deactivate and clean up
deactivate
echo "Cleaning up..."
rm -rf temp_venv

echo "Installation test completed."