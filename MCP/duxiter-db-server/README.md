# Duxiter DB MCP Server

This is a Model Context Protocol (MCP) server that provides access to the Duxiter MongoDB database. It uses fastMCP 2.9.0 to implement the MCP protocol, allowing AI assistants to search for companies, retrieve company details, and access risk assessment information.

## Features

- Search for companies by name or RUT
- Get detailed information about a company by RUT
- Get risk assessment information for a company by RUT
- Get the latest results from the database

## Installation

1. Create a virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install the dependencies:

```bash
pip install -r requirements.txt
```

3. Configure the MongoDB connection:

Edit the `.env` file to set your MongoDB connection details:

```
MONGO_URI=mongodb://localhost:27017/
DB_NAME=dux2
```

## Usage

### Running as an HTTP server

```bash
python server.py
```

This will start the server on http://localhost:8000.

### Running as an MCP stdio server

```bash
python server.py --stdio
```

This mode is used when connecting the server to an MCP client through standard input/output.

## MCP Tools

The server provides the following MCP tools:

### search_companies

Search for companies by name or RUT.

Input schema:
```json
{
  "query": "string",  // Search query (company name or RUT)
  "limit": 10         // Maximum number of results to return (optional)
}
```

### get_company_details

Get detailed information about a company by RUT.

Input schema:
```json
{
  "rut": "string"     // RUT of the company
}
```

### get_company_risks

Get risk assessment information for a company by RUT.

Input schema:
```json
{
  "rut": "string"     // RUT of the company
}
```

### get_latest_results

Get the latest results from the database.

Input schema:
```json
{
  "limit": 10         // Maximum number of results to return (optional)
}
```

## Integration with Kilo Code

To use this MCP server with Kilo Code, run it in stdio mode and configure it in your Kilo Code settings:

```
python /path/to/MCP/duxiter-db-server/server.py --stdio
```

## About fastMCP

This server uses [fastMCP](https://github.com/fastmcp/fastmcp) 2.9.0, a Python library that simplifies the implementation of MCP servers. fastMCP handles the MCP protocol details, allowing you to focus on implementing the tools and resources that your server provides.

The FastMCP class provides a simple and intuitive API for creating MCP servers, with decorators for defining tools and resources.