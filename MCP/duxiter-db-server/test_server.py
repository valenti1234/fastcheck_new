import requests
import json
import sys
import subprocess
import time

def test_http_server():
    """
    Test the HTTP server
    """
    base_url = "http://localhost:8000"
    
    # Test root endpoint
    print("Testing root endpoint...")
    response = requests.get(f"{base_url}/")
    print(f"Response: {response.status_code} - {response.json()}")
    
    # Test search_companies endpoint
    print("\nTesting search_companies endpoint...")
    response = requests.post(
        f"{base_url}/mcp/tools/search_companies",
        json={"query": "test", "limit": 5}
    )
    print(f"Response: {response.status_code}")
    if response.status_code == 200:
        print(f"Found {len(response.json())} companies")
    else:
        print(f"Error: {response.text}")
    
    # Test get_company_details endpoint
    print("\nTesting get_company_details endpoint...")
    response = requests.post(
        f"{base_url}/mcp/tools/get_company_details",
        json={"rut": "12345678-9"}
    )
    print(f"Response: {response.status_code}")
    if response.status_code == 200:
        print(f"Company details: {json.dumps(response.json(), indent=2)}")
    else:
        print(f"Error: {response.text}")
    
    # Test get_company_risks endpoint
    print("\nTesting get_company_risks endpoint...")
    response = requests.post(
        f"{base_url}/mcp/tools/get_company_risks",
        json={"rut": "12345678-9"}
    )
    print(f"Response: {response.status_code}")
    if response.status_code == 200:
        print(f"Company risks: {json.dumps(response.json(), indent=2)}")
    else:
        print(f"Error: {response.text}")
    
    # Test get_latest_results endpoint
    print("\nTesting get_latest_results endpoint...")
    response = requests.post(
        f"{base_url}/mcp/tools/get_latest_results",
        json={"limit": 3}
    )
    print(f"Response: {response.status_code}")
    if response.status_code == 200:
        print(f"Found {len(response.json())} results")
    else:
        print(f"Error: {response.text}")

def test_mcp_protocol():
    """
    Test the MCP protocol by sending requests to a subprocess running the server in stdio mode
    """
    # Start the server in stdio mode
    process = subprocess.Popen(
        ["python", "server.py", "--stdio"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    # Initialize request
    initialize_request = {
        "type": "initialize"
    }
    print(f"Sending initialize request: {json.dumps(initialize_request)}")
    process.stdin.write(json.dumps(initialize_request) + "\n")
    process.stdin.flush()
    
    # Read response
    response_line = process.stdout.readline()
    response = json.loads(response_line)
    print(f"Received response: {json.dumps(response, indent=2)}")
    
    # Tool call request
    tool_call_request = {
        "type": "tool_call",
        "name": "search_companies",
        "arguments": {
            "query": "test",
            "limit": 5
        }
    }
    print(f"Sending tool_call request: {json.dumps(tool_call_request)}")
    process.stdin.write(json.dumps(tool_call_request) + "\n")
    process.stdin.flush()
    
    # Read response
    response_line = process.stdout.readline()
    response = json.loads(response_line)
    print(f"Received response: {json.dumps(response, indent=2)}")
    
    # Clean up
    process.terminate()
    process.wait()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--mcp":
        test_mcp_protocol()
    else:
        test_http_server()