#!/bin/bash

# Activate virtual environment
. venv/bin/activate

# Run the test script
echo "Testing HTTP server..."
python test_server.py