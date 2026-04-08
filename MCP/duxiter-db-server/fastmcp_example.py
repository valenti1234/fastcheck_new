from fastmcp import FastMCP
from fastapi import FastAPI
import inspect

# Create a FastAPI app
app = FastAPI()

# Try different ways to create a FastMCP instance
print("Trying different ways to create a FastMCP instance:")

# Method 1: Create FastMCP first, then get the HTTP app
try:
    print("\nMethod 1: Create FastMCP first, then get the HTTP app")
    mcp = FastMCP(name="example", version="1.0.0")
    http_app = mcp.http_app()
    print("Success!")
    print(f"Type of http_app: {type(http_app)}")
except Exception as e:
    print(f"Error: {e}")

# Method 2: Create FastMCP with app parameter
try:
    print("\nMethod 2: Create FastMCP with app parameter")
    mcp = FastMCP(name="example", version="1.0.0", app=app)
    print("Success!")
except Exception as e:
    print(f"Error: {e}")

# Method 3: Create FastMCP and mount to existing app
try:
    print("\nMethod 3: Create FastMCP and mount to existing app")
    mcp = FastMCP(name="example", version="1.0.0")
    mcp.mount(app)
    print("Success!")
except Exception as e:
    print(f"Error: {e}")

# Print all methods of FastMCP
print("\nAll methods of FastMCP:")
for name, method in inspect.getmembers(FastMCP, predicate=inspect.isfunction):
    if not name.startswith("_"):
        print(f"- {name}{inspect.signature(method)}")