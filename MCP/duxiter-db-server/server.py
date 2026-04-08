import os
import sys
import asyncio
from typing import Dict, Any, List, Optional, Annotated
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn
from fastmcp import FastMCP
from database import (
    get_companies_collection,
    get_risks_collection,
    get_results_collection,
    close_connection
)
import logging
from datetime import datetime
import traceback

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Custom Exception Classes
class MCPException(Exception):
    """Base exception for MCP operations"""
    def __init__(self, message: str, error_code: str = "MCP_ERROR", status_code: int = 500):
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.timestamp = datetime.utcnow().isoformat()
        super().__init__(self.message)

class AuthenticationError(MCPException):
    """Authentication related errors"""
    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, "AUTH_ERROR", 401)

class AuthorizationError(MCPException):
    """Authorization related errors"""
    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(message, "AUTHZ_ERROR", 403)

class DatabaseError(MCPException):
    """Database operation errors"""
    def __init__(self, message: str = "Database operation failed"):
        super().__init__(message, "DB_ERROR", 500)

class ValidationError(MCPException):
    """Input validation errors"""
    def __init__(self, message: str = "Invalid input data"):
        super().__init__(message, "VALIDATION_ERROR", 400)

class NotFoundError(MCPException):
    """Resource not found errors"""
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, "NOT_FOUND", 404)

# Temporary: Authentication functions disabled for testing
# TODO: Re-enable authentication after resolving JWT import issues

async def get_tenant_id() -> str:
    """
    Temporary function to return a default tenant ID for testing
    """
    return "default_tenant"

# Define the input schemas for our tools
class SearchCompaniesInput(BaseModel):
    query: str = Field(..., description="Search query (company name or RUT)")
    limit: int = Field(10, description="Maximum number of results to return")

class CompanyRUTInput(BaseModel):
    rut: str = Field(..., description="RUT of the company")

class LatestResultsInput(BaseModel):
    limit: int = Field(10, description="Maximum number of results to return")

# Define standardized response schemas
class StandardResponse(BaseModel):
    success: bool = Field(..., description="Operation success status")
    message: str = Field(..., description="Response message")
    data: Optional[Any] = Field(None, description="Response data")
    
class CompanySearchResponse(StandardResponse):
    data: Optional[List[Dict[str, Any]]] = Field(None, description="List of companies found")
    
class CompanyDetailsResponse(StandardResponse):
    data: Optional[Dict[str, Any]] = Field(None, description="Company details")
    
class CompanyRisksResponse(StandardResponse):
    data: Optional[Dict[str, Any]] = Field(None, description="Company risk assessment")
    
class ResultsResponse(StandardResponse):
    data: Optional[List[Dict[str, Any]]] = Field(None, description="Latest results")

# Create the MCP server
mcp_server = FastMCP(
    name="dux2-db",
    version="1.0.0",
    instructions="MCP server for Duxiter MongoDB database"
)

# Note: FastMCP doesn't support custom exception handlers
# Error handling is managed within individual functions

# Create the FastAPI app
app = FastAPI(title="Duxiter DB MCP Server")

# Define the search_companies tool
@mcp_server.tool(
    name="search_companies",
    description="Search for companies by name or RUT",
    annotations={"input": SearchCompaniesInput}
)
async def search_companies(input_data: SearchCompaniesInput) -> CompanySearchResponse:
    try:
        # Get tenant ID (temporary implementation)
        tenant_id = await get_tenant_id()
        
        # Validate input
        if not input_data.query or len(input_data.query.strip()) < 2:
            raise ValidationError("Search query must be at least 2 characters long")
        
        collection = get_companies_collection()
        if collection is None:
            raise DatabaseError("Unable to connect to companies collection")
            
        logger.info(f"Searching companies for tenant {tenant_id} with query: {input_data.query}")
        
        # Search by company name or RUT
        query = {
            "$and": [
                {"tenantId": tenant_id},
                {
                    "$or": [
                        {"razonSocial": {"$regex": input_data.query, "$options": "i"}},
                        {"rut": {"$regex": input_data.query, "$options": "i"}}
                    ]
                }
            ]
        }
        
        companies = list(collection.find(query).limit(input_data.limit))
        
        # Convert ObjectId to string for JSON serialization
        for company in companies:
            if "_id" in company:
                company["_id"] = str(company["_id"])
        
        logger.info(f"Found {len(companies)} companies for query: {input_data.query}")
        return CompanySearchResponse(
            success=True,
            message=f"Found {len(companies)} companies matching '{input_data.query}'",
            data=companies
        )
    except (ValidationError, DatabaseError):
        raise
    except Exception as e:
        logger.error(f"Unexpected error in search_companies: {str(e)}")
        raise DatabaseError(f"Error searching companies: {str(e)}")

# Define the get_company_details tool
@mcp_server.tool(
    name="get_company_details",
    description="Get detailed information about a company by RUT",
    annotations={"input": CompanyRUTInput}
)
async def get_company_details(input_data: CompanyRUTInput) -> CompanyDetailsResponse:
    try:
        # Get tenant ID (temporary implementation)
        tenant_id = await get_tenant_id()
        
        # Validate RUT format
        if not input_data.rut or len(input_data.rut.strip()) < 7:
            raise ValidationError("Invalid RUT format")
        
        collection = get_companies_collection()
        if collection is None:
            raise DatabaseError("Unable to connect to companies collection")
            
        logger.info(f"Retrieving company details for RUT {input_data.rut} in tenant {tenant_id}")
        
        company = collection.find_one({
            "rut": input_data.rut,
            "tenantId": tenant_id
        })
        
        if not company:
            raise NotFoundError(f"Company with RUT {input_data.rut} not found for tenant {tenant_id}")
        
        # Convert ObjectId to string for JSON serialization
        if "_id" in company:
            company["_id"] = str(company["_id"])
        
        logger.info(f"Company details retrieved successfully for RUT {input_data.rut}")
        return CompanyDetailsResponse(
            success=True,
            message=f"Company details retrieved for RUT {input_data.rut}",
            data=company
        )
    except (ValidationError, DatabaseError, NotFoundError):
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_company_details: {str(e)}")
        raise DatabaseError(f"Error retrieving company details: {str(e)}")

# Define the get_company_risks tool
@mcp_server.tool(
    name="get_company_risks",
    description="Get risk assessment information for a company by RUT",
    annotations={"input": CompanyRUTInput}
)
async def get_company_risks(input_data: CompanyRUTInput) -> CompanyRisksResponse:
    try:
        # Get tenant ID (temporary implementation)
        tenant_id = await get_tenant_id()
        
        # Validate RUT format
        if not input_data.rut or len(input_data.rut.strip()) < 7:
            raise ValidationError("Invalid RUT format")
        
        collection = get_risks_collection()
        if collection is None:
            raise DatabaseError("Unable to connect to risks collection")
            
        logger.info(f"Retrieving company risks for RUT {input_data.rut} in tenant {tenant_id}")
        
        risks = collection.find_one({
            "rut": input_data.rut,
            "tenantId": tenant_id
        })
        
        if not risks:
            raise NotFoundError(f"Risks for company with RUT {input_data.rut} not found for tenant {tenant_id}")
        
        # Convert ObjectId to string for JSON serialization
        if "_id" in risks:
            risks["_id"] = str(risks["_id"])
        
        logger.info(f"Company risks retrieved successfully for RUT {input_data.rut}")
        return CompanyRisksResponse(
            success=True,
            message=f"Risk assessment retrieved for RUT {input_data.rut}",
            data=risks
        )
    except (ValidationError, DatabaseError, NotFoundError):
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_company_risks: {str(e)}")
        raise DatabaseError(f"Error retrieving company risks: {str(e)}")

# Define the get_latest_results tool
@mcp_server.tool(
    name="get_latest_results",
    description="Get the latest results from the database",
    annotations={"input": LatestResultsInput}
)
async def get_latest_results(input_data: LatestResultsInput) -> ResultsResponse:
    try:
        # Get tenant ID (temporary implementation)
        tenant_id = await get_tenant_id()
        
        # Validate limit
        if input_data.limit <= 0 or input_data.limit > 1000:
            raise ValidationError("Limit must be between 1 and 1000")
        
        collection = get_results_collection()
        if collection is None:
            raise DatabaseError("Unable to connect to results collection")
            
        logger.info(f"Retrieving {input_data.limit} latest results for tenant {tenant_id}")
        
        results = list(collection.find({
            "tenantId": tenant_id
        }).sort("createdAt", -1).limit(input_data.limit))
        
        # Convert ObjectId to string for JSON serialization
        for result in results:
            if "_id" in result:
                result["_id"] = str(result["_id"])
        
        logger.info(f"Retrieved {len(results)} results successfully")
        return ResultsResponse(
            success=True,
            message=f"Retrieved {len(results)} latest results",
            data=results
        )
    except (ValidationError, DatabaseError):
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_latest_results: {str(e)}")
        raise DatabaseError(f"Error retrieving latest results: {str(e)}")

# Add a root endpoint
@app.get("/")
async def root():
    return {"message": "Duxiter DB MCP Server is running"}

# Add API endpoints to FastAPI app (separate from MCP tools)
@app.post("/search_companies")
async def api_search_companies(query: SearchCompaniesInput) -> CompanySearchResponse:
    try:
        logger.info(f"API endpoint api_search_companies called with query: {query.query}")
        
        # Get tenant ID (temporary implementation)
        tenant_id = await get_tenant_id()
        
        # Input validation
        if not query.query or len(query.query.strip()) < 2:
            logger.warning(f"Invalid search query: {query.query}")
            raise ValidationError("Search query must be at least 2 characters long")
        
        logger.info(f"API: Searching companies for tenant {tenant_id} with query: {query.query}")
        
        # Get collection
        collection = get_companies_collection()
        if collection is None:
            raise DatabaseError("Unable to connect to companies collection")
        
        # Perform search with tenant filtering
        search_filter = {
            "tenantId": tenant_id,
            "$or": [
                {"name": {"$regex": query.query, "$options": "i"}},
                {"rut": {"$regex": query.query, "$options": "i"}}
            ]
        }
        
        logger.info(f"API: Executing query with filter: {search_filter}")
        companies = list(collection.find(search_filter).limit(query.limit))
        
        # Convert ObjectId to string for JSON serialization
        for company in companies:
            if "_id" in company:
                company["_id"] = str(company["_id"])
        
        logger.info(f"API: Found {len(companies)} companies for query: {query.query}")
        return CompanySearchResponse(
            success=True,
            message=f"Found {len(companies)} companies",
            data=companies
        )
    except ValidationError as e:
        logger.error(f"API: Validation error in search_companies: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except DatabaseError as e:
        logger.error(f"API: Database error in search_companies: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"API: Unexpected error in search_companies: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to search companies: {str(e)}")

@app.post("/get_company_details")
async def api_get_company_details(query: CompanyRUTInput) -> CompanyDetailsResponse:
    try:
        # Get tenant ID (temporary implementation)
        tenant_id = await get_tenant_id()
        
        # Validate RUT format
        if not query.rut or len(query.rut.strip()) < 8:
            logger.warning(f"Invalid RUT format: {query.rut}")
            raise ValidationError("RUT must be at least 8 characters long")
        
        logger.info(f"Retrieving company details for RUT {query.rut} in tenant {tenant_id}")
        
        # Get collection
        collection = get_companies_collection()
        if collection is None:
            raise DatabaseError("Unable to connect to companies collection")
        
        # Find company by RUT and tenant
        company = collection.find_one({"rut": query.rut, "tenantId": tenant_id})
        
        if not company:
            logger.warning(f"Company not found for RUT {query.rut} in tenant {tenant_id}")
            raise NotFoundError(f"Company with RUT {query.rut} not found")
        
        # Convert ObjectId to string for JSON serialization
        if "_id" in company:
            company["_id"] = str(company["_id"])
        
        logger.info(f"Retrieved company details for RUT {query.rut}")
        return CompanyDetailsResponse(
            success=True,
            message=f"Company details retrieved for RUT {query.rut}",
            data=company
        )
    except ValidationError as e:
        logger.error(f"Validation error in get_company_details: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        logger.error(f"Not found error in get_company_details: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except DatabaseError as e:
        logger.error(f"Database error in get_company_details: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in get_company_details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get company details: {str(e)}")

@app.post("/get_company_risks")
async def api_get_company_risks(query: CompanyRUTInput) -> CompanyRisksResponse:
    try:
        # Get tenant ID (temporary implementation)
        tenant_id = await get_tenant_id()
        
        # Validate RUT format
        if not query.rut or len(query.rut.strip()) < 8:
            logger.warning(f"Invalid RUT format: {query.rut}")
            raise ValidationError("RUT must be at least 8 characters long")
        
        logger.info(f"Retrieving company risks for RUT {query.rut} in tenant {tenant_id}")
        
        # Get collection
        collection = get_risks_collection()
        if collection is None:
            raise DatabaseError("Unable to connect to risks collection")
        
        # Find risks by RUT and tenant
        risks = collection.find_one({"rut": query.rut, "tenantId": tenant_id})
        
        if not risks:
            logger.warning(f"Risks not found for RUT {query.rut} in tenant {tenant_id}")
            raise NotFoundError(f"Risk assessment for RUT {query.rut} not found")
        
        # Convert ObjectId to string for JSON serialization
        if "_id" in risks:
            risks["_id"] = str(risks["_id"])
        
        logger.info(f"Retrieved company risks for RUT {query.rut}")
        return CompanyRisksResponse(
            success=True,
            message=f"Risk assessment retrieved for RUT {query.rut}",
            data=risks
        )
    except ValidationError as e:
        logger.error(f"Validation error in get_company_risks: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except NotFoundError as e:
        logger.error(f"Not found error in get_company_risks: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except DatabaseError as e:
        logger.error(f"Database error in get_company_risks: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in get_company_risks: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get company risks: {str(e)}")

@app.post("/get_latest_results")
async def api_get_latest_results(query: LatestResultsInput) -> ResultsResponse:
    try:
        # Get tenant ID (temporary implementation)
        tenant_id = await get_tenant_id()
        
        # Validate limit
        if query.limit <= 0 or query.limit > 100:
            logger.warning(f"Invalid limit: {query.limit}")
            raise ValidationError("Limit must be between 1 and 100")
        
        logger.info(f"Retrieving {query.limit} latest results for tenant {tenant_id}")
        
        # Get collection
        collection = get_results_collection()
        if collection is None:
            raise DatabaseError("Unable to connect to results collection")
        
        # Get latest results with tenant filtering
        results = list(collection.find({"tenantId": tenant_id}).sort("createdAt", -1).limit(query.limit))
        
        # Convert ObjectId to string for JSON serialization
        for result in results:
            if "_id" in result:
                result["_id"] = str(result["_id"])
        
        logger.info(f"Retrieved {len(results)} latest results for tenant {tenant_id}")
        return ResultsResponse(
            success=True,
            message=f"Retrieved {len(results)} latest results",
            data=results
        )
    except ValidationError as e:
        logger.error(f"Validation error in get_latest_results: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except DatabaseError as e:
        logger.error(f"Database error in get_latest_results: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error in get_latest_results: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get latest results: {str(e)}")

# Run the server in stdio mode
async def run_stdio():
    try:
        await mcp_server.run_stdio_async()
    finally:
        close_connection()

# Run the server in HTTP mode
def run_http():
    try:
        # Run the FastAPI app directly
        uvicorn.run(app, host="0.0.0.0", port=8001)
    finally:
        close_connection()

if __name__ == "__main__":
    # Check if we should run in stdio mode
    if len(sys.argv) > 1 and sys.argv[1] == "--stdio":
        # Run in stdio mode
        asyncio.run(run_stdio())
    else:
        # Run in HTTP mode
        run_http()