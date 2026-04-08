#!/bin/bash

# Test script for Elasticsearch connection
# This script tests the Elasticsearch endpoint with authentication

echo "Testing Elasticsearch connection..."
echo "Endpoint: http://172.203.210.8/elasticsearch/"
echo "Username: user"
echo "Password: s.+ff+Fmvcs3"
echo ""

# Test 1: Check Elasticsearch health status
echo "=== Testing Elasticsearch Health Status ==="
curl -u user:'s.+ff+Fmvcs3' -X GET "http://172.203.210.8/elasticsearch/_cluster/health" \
  -H "Content-Type: application/json"

echo ""
echo ""

# Test 2: Check if duxiter index exists
echo "=== Checking duxiter index ==="
curl -u user:'s.+ff+Fmvcs3' -X GET "http://172.203.210.8/elasticsearch/duxiter" \
  -H "Content-Type: application/json"

echo ""
echo ""

# Test 3: Create a test document
echo "=== Creating test document ==="
curl -u user:'s.+ff+Fmvcs3' -X POST "http://172.203.210.8/elasticsearch/duxiter/_doc" \
  -H "Content-Type: application/json" \
  -d '{
    "mittente": "Mario",
    "testo": "Ciao via proxy!",
    "data": "2025-08-25T13:20:00"
  }'

echo ""
echo ""
echo "All tests completed."