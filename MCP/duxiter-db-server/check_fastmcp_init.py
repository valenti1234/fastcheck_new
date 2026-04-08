import inspect
from fastmcp import FastMCP

# Get the signature of the FastMCP constructor
signature = inspect.signature(FastMCP.__init__)

# Print the parameters
print("FastMCP constructor parameters:")
for param_name, param in signature.parameters.items():
    if param_name != 'self':
        print(f"- {param_name}: {param.default if param.default != inspect.Parameter.empty else 'required'}")