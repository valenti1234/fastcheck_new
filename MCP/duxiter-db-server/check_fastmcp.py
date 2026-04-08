import inspect
import fastmcp

# Print all available modules and classes in fastmcp
print("Available modules and classes in fastmcp:")
for name in dir(fastmcp):
    if not name.startswith("_"):  # Skip private attributes
        print(f"- {name}")
        obj = getattr(fastmcp, name)
        if inspect.ismodule(obj):
            print(f"  Module: {name}")
            for subname in dir(obj):
                if not subname.startswith("_"):
                    print(f"    - {subname}")
        elif inspect.isclass(obj):
            print(f"  Class: {name}")
            for method_name, method in inspect.getmembers(obj, inspect.isfunction):
                if not method_name.startswith("_"):
                    print(f"    - {method_name}")