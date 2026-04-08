#!/usr/bin/env python3
"""
FastAPI Equifax Provider
Provides REST API endpoints for Equifax transaction services
Based on the working example in main.py
"""

from multiprocessing import process
import os
import json
import time
import asyncio
import logging
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

import requests
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

print("MONGODB_URI:", os.getenv("MONGODB_URI"))

# MongoDB connection setup
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/duxiter")
CACHE_TTL_SECONDS = int(os.getenv("EQUIFAX_CACHE_TTL_SECONDS", "604800"))  # Default 1 week

try:
    mongo_client = MongoClient(MONGODB_URI)
    # Test connection
    mongo_client.admin.command('ping')
    db = mongo_client.get_database()
    cache_collection = db.equifax_cache
    
    # Create TTL index for automatic document expiration
    cache_collection.create_index("expires_at", expireAfterSeconds=0)
    logger.info(f"MongoDB connected successfully. Cache TTL: {CACHE_TTL_SECONDS} seconds")
except ConnectionFailure as e:
    logger.error(f"MongoDB connection failed: {e}")
    mongo_client = None
    db = None
    cache_collection = None

# Constants
TOKEN_CACHE_FILE = Path(".token_cache.json")
EQUIFAX_RESPONSES_DIR = Path(__file__).resolve().parents[2] / "equifax_responses"

ENDPOINTS = {
    "uat": {
        "token": "https://api.uat.latam.equifax.com/v2/oauth/token",
        "execute": "https://api.uat.latam.equifax.com/datos-comerciales/transaction/execute",
    },
    "prod": {
        "token": "https://api.latam.equifax.com/v2/oauth/token",
        "execute": "https://api.latam.equifax.com/datos-comerciales/transaction/execute",
    },
}

# Pydantic Models
class PersonalInformation(BaseModel):
    chileanRut: str = Field(..., description="Chilean RUT number")
 #   chileanSerialNumber: Optional[str] = Field(None, description="Chilean serial number (not required for empresarial)")

    @validator('chileanRut')
    def validate_rut(cls, v):
        if not v or not v.strip():
            raise ValueError('Chilean RUT is required')
        return v.strip()

class PrimaryConsumer(BaseModel):
    personalInformation: PersonalInformation

class Applicants(BaseModel):
    primaryConsumer: PrimaryConsumer

class ProductData(BaseModel):
    billTo: str = Field(..., description="Bill to information")
    shipTo: str = Field(..., description="Ship to information")
    productName: str = Field(..., description="Product name")
    productOrch: str = Field(..., description="Product orchestration")
    configuration: str = Field(default="Config", description="Configuration")
    customer: str = Field(..., description="Customer information")
    model: str = Field(..., description="Model information")

    @validator('*', pre=True)
    def strip_strings(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v

class EquifaxRequest(BaseModel):
    applicants: Applicants
    productData: ProductData
    requestType: Optional[str] = Field(default="personal", description="Request type: personal or empresarial")





class RutOnlyTransactionRequest(BaseModel):
    """Simplified request for RUT-only transactions - only requires RUT and request type"""
    chileanRut: str = Field(..., description="Chilean RUT number", example="77827780-8")
    requestType: Optional[str] = Field(default="personal", description="Request type: personal or empresarial", example="personal")
    
    class Config:
        schema_extra = {
            "example": {
                "chileanRut": "77827780-8", 
                "requestType": "personal"
            }
        }

class TokenResponse(BaseModel):
    access_token: str
    expires_in: int
    cached: bool

class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str

class ErrorResponse(BaseModel):
    error: str
    detail: str
    timestamp: str

# FastAPI App
app = FastAPI(
    title="Equifax Provider API",
    description="REST API for Equifax transaction services",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache helper functions
def generate_cache_key(env_key: str, payload: Dict[str, Any]) -> str:
    """Generate a unique cache key based on environment and payload"""
    # Create a normalized string representation of the payload
    payload_str = json.dumps(payload, sort_keys=True, separators=(',', ':'))
    # Create hash of the payload for consistent key generation
    payload_hash = hashlib.sha256(payload_str.encode()).hexdigest()
    return f"equifax_cache:{env_key}:{payload_hash}"

def get_cached_transaction(cache_key: str) -> Optional[Dict[str, Any]]:
    """Retrieve cached transaction result if available and not expired"""
    if cache_collection is None:
        return None
    
    try:
        cached_doc = cache_collection.find_one({"_id": cache_key})
        if cached_doc:
            logger.info(f"Cache hit for key: {cache_key}")
            return cached_doc.get("result")
        else:
            logger.info(f"Cache miss for key: {cache_key}")
            return None
    except Exception as e:
        logger.error(f"Error retrieving from cache: {e}")
        return None

def save_transaction_to_cache(cache_key: str, result: Dict[str, Any]) -> None:
    """Save transaction result to cache with TTL"""
    if cache_collection is None:
        return
    
    try:
        expires_at = datetime.utcnow() + timedelta(seconds=CACHE_TTL_SECONDS)
        cache_doc = {
            "_id": cache_key,
            "result": result,
            "cached_at": datetime.utcnow(),
            "expires_at": expires_at
        }
        
        # Use upsert to replace existing cache entry
        cache_collection.replace_one(
            {"_id": cache_key}, 
            cache_doc, 
            upsert=True
        )
        logger.info(f"Transaction result cached with key: {cache_key}, expires at: {expires_at}")
    except Exception as e:
        logger.error(f"Error saving to cache: {e}")

def clear_transaction_cache() -> int:
    """Clear all cached transactions and return count of deleted documents"""
    if cache_collection is None:
        return 0
    
    try:
        result = cache_collection.delete_many({})
        logger.info(f"Cleared {result.deleted_count} cached transactions")
        return result.deleted_count
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        return 0

def get_cache_stats() -> Dict[str, Any]:
    """Get cache statistics"""
    if cache_collection is None:
        return {"error": "Cache not available"}
    
    try:
        total_docs = cache_collection.count_documents({})
        expired_docs = cache_collection.count_documents({
            "expires_at": {"$lt": datetime.utcnow()}
        })
        
        return {
            "total_cached_transactions": total_docs,
            "expired_transactions": expired_docs,
            "active_transactions": total_docs - expired_docs,
            "cache_ttl_seconds": CACHE_TTL_SECONDS,
            "mongodb_connected": True
        }
    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        return {"error": str(e), "mongodb_connected": False}

# Utility Functions (from main.py)
def now() -> float:
    return time.time()

def read_cache() -> Optional[dict]:
    """Read token cache from file"""
    if TOKEN_CACHE_FILE.exists():
        try:
            logger.debug(f"Reading token cache from {TOKEN_CACHE_FILE.absolute()}")
            with TOKEN_CACHE_FILE.open("r", encoding="utf-8") as f:
                cache_data = json.load(f)
                logger.debug(f"Cache contains {len(cache_data)} entries")
                return cache_data
        except Exception as e:
            logger.warning(f"Failed to read token cache: {e}")
            return None
    else:
        logger.debug("No token cache file found")
    return None

def write_cache(data: dict) -> None:
    """Write token cache to file"""
    try:
        logger.debug(f"Writing token cache to {TOKEN_CACHE_FILE.absolute()}")
        with TOKEN_CACHE_FILE.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        logger.debug("Token cache written successfully")
    except Exception as e:
        logger.error(f"Failed to write token cache: {e}")

def get_cached_token(env_key: str) -> Optional[str]:
    """Get cached token if valid"""
    logger.debug(f"Checking cached token for environment: {env_key}")
    cache = read_cache()
    if not cache:
        logger.debug("No cache available")
        return None
    
    item = cache.get(env_key)
    if not item:
        logger.debug(f"No cached token found for environment: {env_key}")
        return None
    
    access_token = item.get("access_token")
    expires_at = item.get("expires_at", 0)
    
    if not access_token:
        logger.debug("Cached entry has no access_token")
        return None
    
    current_time = now()
    time_until_expiry = expires_at - current_time
    
    logger.debug(f"Token expires in {time_until_expiry:.1f} seconds")
    
    # Add a small safety buffer of 60s
    if current_time < (expires_at - 60):
        logger.info(f"Using cached token for {env_key} (expires in {time_until_expiry:.1f}s)")
        return access_token
    else:
        logger.debug(f"Cached token expired or expires soon (in {time_until_expiry:.1f}s)")
        return None

def save_cached_token(env_key: str, access_token: str, expires_in_secs: int) -> None:
    """Save token to cache"""
    logger.debug(f"Saving token for {env_key} (expires in {expires_in_secs}s)")
    cache = read_cache() or {}
    current_time = now()
    
    cache[env_key] = {
        "access_token": access_token,
        "expires_at": current_time + int(expires_in_secs),
        "saved_at": current_time,
    }
    
    write_cache(cache)
    logger.info(f"Token cached for {env_key}, expires at {time.ctime(cache[env_key]['expires_at'])}")

def fetch_token(env_key: str, client_id: str, client_secret: str, scope: str) -> str:
    """Fetch OAuth token with detailed logging"""
    logger.info(f"Fetching token for environment: {env_key}")
    
    url = ENDPOINTS[env_key]["token"]
    logger.info(f"Token endpoint: {url}")
    
    scope = "https://api.latam.equifax.com/datos-comerciales/transaction"
    
    # Default OAuth2 client_credentials
    data = {
        "grant_type": "client_credentials",
        "scope": scope,
    }
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    # Try different authentication methods
    try_methods = [
        ("basic", {"auth": (client_id, client_secret), "data": data}),
        ("body", {"auth": None, "data": {**data, "client_id": client_id, "client_secret": client_secret}}),
    ]

    last_err = None
    for method_name, params in try_methods:
        try:
            logger.info(f"Trying authentication method: {method_name}")
            resp = requests.post(url, headers=headers, **params, timeout=30)
            logger.info(f"Token response status: {resp.status_code}")
            
            if resp.status_code == 200:
                payload = resp.json()
                access_token = payload.get("access_token")
                expires_in = payload.get("expires_in_secs") or payload.get("expires_in") or 300
                if not access_token:
                    raise ValueError(f"Token response missing access_token. Payload: {payload}")
                
                logger.info(f"Successfully fetched new token (expires in {expires_in}s)")
                save_cached_token(env_key, access_token, int(expires_in))
                return access_token
            else:
                last_err = f"{resp.status_code} {resp.text}"
                logger.debug(f"Method {method_name} failed: {last_err}")
        except Exception as e:
            last_err = str(e)
            logger.debug(f"Method {method_name} failed with exception: {last_err}")

    logger.error(f"Failed to obtain token from {url}. Last error: {last_err}")
    raise RuntimeError(f"Failed to obtain token from {url}. Last error: {last_err}")

def get_token(env_key: str, client_id: str, client_secret: str, scope: str) -> str:
    """Get token with cache check"""
    logger.debug(f"Getting token for environment: {env_key}")
    
    # Check cache first
    token = get_cached_token(env_key)
    if token:
        return token
    
    # Fetch new token
    logger.debug("No valid cached token found, fetching new token")
    return fetch_token(env_key, client_id, client_secret, scope)

def execute_transaction(env_key: str, token: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Execute transaction with detailed logging, MongoDB caching, and automatic token refresh on 401"""
    # Generate cache key based on environment and payload
    cache_key = generate_cache_key(env_key, payload)
    
    # Check cache first
    cached_result = get_cached_transaction(cache_key)
    if cached_result:
        logger.info("Returning cached transaction result")
        # Add cache metadata to response
        cached_result["_cache_info"] = {
            "cached": True,
            "cache_key": cache_key,
            "retrieved_at": datetime.utcnow().isoformat()
        }
        return cached_result

    # Cache miss - proceed with API call
    return _execute_transaction_with_retry(env_key, token, payload, cache_key)


def _execute_transaction_with_retry(env_key: str, token: str, payload: Dict[str, Any], cache_key: str, is_retry: bool = False) -> Dict[str, Any]:
    """Internal function to execute transaction with retry logic for 401 errors"""
    url = ENDPOINTS[env_key]["execute"]
    
    logger.info(f"Executing transaction on {env_key} environment{'(retry with refreshed token)' if is_retry else ''}")
    logger.info(f"Transaction URL: {url}")
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    logger.info(f"Request headers: {headers}")
    if not is_retry:  # Only log payload on first attempt to avoid spam
        logger.info(f"Request payload: {json.dumps(payload, indent=2)}")
    
    
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    logger.info(f"Transaction response status: {resp.status_code}")
    
    # Handle 401 error with token refresh
    if resp.status_code == 401:
        if is_retry:
            # If this is already a retry, don't retry again
            logger.error("401 Unauthorized: Token refresh failed, both original and refreshed tokens are invalid")
            raise HTTPException(status_code=401, detail="Token refresh failed - authentication error persists")
        
        logger.warning("401 Unauthorized: Token invalid or expired, attempting to refresh token")
        
        # Clear the cached token to force refresh
        _clear_cached_token(env_key)
        
        # Get credentials and fetch a new token
        client_id, client_secret = get_credentials()
        scope = "https://api.latam.equifax.com/datos-comerciales/transaction"
        
        try:
            new_token = fetch_token(env_key, client_id, client_secret, scope)
            logger.info("Successfully refreshed token, retrying transaction")
            
            # Retry with the new token
            return _execute_transaction_with_retry(env_key, new_token, payload, cache_key, is_retry=True)
        except Exception as e:
            logger.error(f"Failed to refresh token: {e}")
            raise HTTPException(status_code=401, detail=f"Token refresh failed: {str(e)}")
    
    # Handle other error patterns
    if resp.status_code == 404:
        logger.error("404 Not Found: Requested orchestration not found")
        raise HTTPException(status_code=404, detail="Requested orchestration not found")
    if resp.status_code == 400:
        logger.error(f"400 Bad Request: {resp.text}")
        raise HTTPException(status_code=400, detail=f"Bad Request: {resp.text}")
    if resp.status_code >= 500:
        logger.error(f"{resp.status_code} Server error: {resp.text}")
        raise HTTPException(status_code=502, detail=f"Equifax server error: {resp.status_code}")
    
    try:
        result = resp.json()
        logger.info("Transaction completed successfully")
        
        # Save successful result to cache
        save_transaction_to_cache(cache_key, result)
        
        # Add cache metadata to response
        result["_cache_info"] = {
            "cached": False,
            "cache_key": cache_key,
            "cached_at": datetime.utcnow().isoformat(),
            "token_refreshed": is_retry
        }
        
        return result
    except Exception as e:
        logger.warning(f"Failed to parse JSON response: {e}")
        raw_result = {"raw": resp.text}
        
        # Save raw response to cache as well (in case it's a valid response format)
        save_transaction_to_cache(cache_key, raw_result)
        
        # Add cache metadata to response
        raw_result["_cache_info"] = {
            "cached": False,
            "cache_key": cache_key,
            "cached_at": datetime.utcnow().isoformat(),
            "token_refreshed": is_retry
        }
        
        return raw_result


def _clear_cached_token(env_key: str) -> None:
    """Clear cached token for the given environment to force refresh"""
    try:
        cache_data = read_cache()
        if cache_data and env_key in cache_data:
            del cache_data[env_key]
            write_cache(cache_data)
            logger.info(f"Cleared cached token for environment: {env_key}")
    except Exception as e:
        logger.warning(f"Failed to clear cached token: {e}")

# Dependency functions
def get_credentials():
    """Get OAuth credentials from environment"""
    client_id = os.getenv("CLIENT_ID", "").strip()
    client_secret = os.getenv("CLIENT_SECRET", "").strip()
    
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=500,
            detail="Missing CLIENT_ID or CLIENT_SECRET in environment configuration"
        )
    
    return client_id, client_secret



def build_request_from_env(chilean_rut: str, request_type: str = "personal") -> EquifaxRequest:
    """Build full Equifax request from environment variables, only overriding the RUT"""
    logger.debug("Building request from environment variables")
    
    # Get all required values from environment
    bill_to = os.getenv("BILL_TO", "").strip()
    ship_to = os.getenv("SHIP_TO", "").strip()
    product_name_empresarial = os.getenv("PRODUCT_NAME_EMPRESARIAL", "").strip()
    product_orch_empresarial = os.getenv("PRODUCT_ORCH_EMPRESARIAL", "").strip()
    product_name_persona = os.getenv("PRODUCT_NAME_PERSONA", "").strip()
    product_orch_persona = os.getenv("PRODUCT_ORCH_PERSONA", "").strip()

    configuration = os.getenv("CONFIGURATION", "Config").strip()
    customer = os.getenv("CUSTOMER", "").strip()
    model = os.getenv("MODEL", "").strip()
    chilean_serial = os.getenv("CHILEAN_SERIAL", "").strip()

    # Select product based on request type
    if request_type and request_type.lower() == "empresarial":
        product_name = product_name_empresarial
        product_orch = product_orch_empresarial
    else:
        # Default to personal
        product_name = product_name_persona
        product_orch = product_orch_persona
    
    # Validate required environment variables
    missing = []
    if not bill_to:
        missing.append("BILL_TO")
    if not ship_to:
        missing.append("SHIP_TO")
    if not product_name:
        missing.append("PRODUCT_NAME")
    if not product_orch:
        missing.append("PRODUCT_ORCH")
    if not customer:
        missing.append("CUSTOMER")
    if not model:
        missing.append("MODEL")
    
    # Only validate CHILEAN_SERIAL if request type is not empresarial
    if request_type != "empresarial" and not chilean_serial:
        missing.append("CHILEAN_SERIAL")
    
    if missing:
        error_msg = f"Missing required environment variables: {', '.join(missing)}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=error_msg)
    
    # Build personal information
    personal_info = PersonalInformation(chileanRut=chilean_rut)
    
    # Build full request
    request = EquifaxRequest(
        applicants=Applicants(
            primaryConsumer=PrimaryConsumer(
                personalInformation=personal_info
            )
        ),
        productData=ProductData(
            billTo=bill_to,
            shipTo=ship_to,
            productName=product_name,
            productOrch=product_orch,
            configuration=configuration,
            customer=customer,
            model=model
        ),
        requestType=request_type
    )
    
    logger.info("Built request from environment for RUT: %s, type: %s. Request: %s", chilean_rut, request_type, request.model_dump())
    return request

# API Endpoints
@app.get("/", response_model=HealthResponse)
async def root():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now().isoformat(),
        version="1.0.0"
    )

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Detailed health check"""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now().isoformat(),
        version="1.0.0"
    )

@app.post("/token/{environment}", response_model=TokenResponse)
async def get_oauth_token(environment: str):
    """Get OAuth token for specified environment"""
    if environment not in ["uat", "prod"]:
        raise HTTPException(status_code=400, detail="Environment must be 'uat' or 'prod'")
    
    try:
        client_id, client_secret = get_credentials()
        scope = "https://api.latam.equifax.com/datos-comerciales/transaction"
        
        # Check if we have a cached token
        cached_token = get_cached_token(environment)
        if cached_token:
            return TokenResponse(
                access_token=cached_token,
                expires_in=3600,  # Approximate
                cached=True
            )
        
        # Fetch new token
        token = fetch_token(environment, client_id, client_secret, scope)
        return TokenResponse(
            access_token=token,
            expires_in=3600,  # Approximate
            cached=False
        )
        
    except Exception as e:
        logger.error(f"Failed to get token: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get token: {str(e)}")





@app.post("/transaction/{environment}/rut-only", 
          summary="Execute Equifax Transaction (RUT Only)",
          description="Execute Equifax transaction with only chileanRut required. All productData and personalData fields are automatically populated from environment variables (.env file).",
          response_description="Equifax transaction result")
async def execute_rut_only_transaction(environment: str, request: RutOnlyTransactionRequest):
    """
    Execute Equifax transaction with only RUT - all other data from .env
    
    This endpoint simplifies the request by only requiring:
    - chileanRut: The Chilean RUT number
    - requestType: Optional, defaults to 'personal'
    
    All other fields (productData, personalData) are automatically populated from environment variables.
    """
    #print the json body of the request
    logger.info(f"Received RUT-only request: {request.model_dump()}")

    if environment not in ["uat", "prod"]:
        raise HTTPException(status_code=400, detail="Environment must be 'uat' or 'prod'")
    
    try:
        # Build full request from environment variables
        full_request = build_request_from_env(request.chileanRut, request.requestType)
        
        client_id, client_secret = get_credentials()
        scope = "https://api.latam.equifax.com/datos-comerciales/transaction"
        
        # Get token
        token = get_token(environment, client_id, client_secret, scope)
        
        # Convert to dict for API call
        payload = full_request.model_dump()
        
        # Execute transaction
        result = execute_transaction(environment, token, payload)
        # logger.info("Transaction result: %s", json.dumps(result, indent=2))
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"RUT-only transaction failed: {e}")
        raise HTTPException(status_code=500, detail=f"Transaction failed: {str(e)}")

@app.delete("/cache")
async def clear_token_cache():
    """Clear the token cache"""
    try:
        if TOKEN_CACHE_FILE.exists():
            TOKEN_CACHE_FILE.unlink()
            logger.info("Token cache cleared")
            return {"message": "Token cache cleared successfully"}
        else:
            return {"message": "No token cache found"}
    except Exception as e:
        logger.error(f"Failed to clear cache: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")

@app.get("/cache")
async def get_cache_status():
    """Get current cache status"""
    try:
        cache = read_cache()
        if not cache:
            return {"status": "empty", "entries": 0}
        
        status_info = {"status": "active", "entries": len(cache), "environments": {}}
        
        current_time = now()
        for env_key, token_data in cache.items():
            expires_at = token_data.get("expires_at", 0)
            time_until_expiry = expires_at - current_time
            
            status_info["environments"][env_key] = {
                "expires_in_seconds": max(0, time_until_expiry),
                "expires_at": datetime.fromtimestamp(expires_at).isoformat() if expires_at > 0 else None,
                "valid": time_until_expiry > 60  # 60s buffer
            }
        
        return status_info
        
    except Exception as e:
        logger.error(f"Failed to get cache status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get cache status: {str(e)}")

@app.delete("/transaction-cache")
async def clear_transaction_cache_endpoint():
    """Clear all cached transaction results"""
    try:
        if cache_collection is None:
            raise HTTPException(status_code=503, detail="MongoDB cache not available")
        
        deleted_count = clear_transaction_cache()
        return {
            "message": "Transaction cache cleared successfully",
            "deleted_count": deleted_count,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to clear transaction cache: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clear transaction cache: {str(e)}")

@app.get("/transaction-cache/stats")
async def get_transaction_cache_stats():
    """Get transaction cache statistics"""
    try:
        if cache_collection is None:
            raise HTTPException(status_code=503, detail="MongoDB cache not available")
        
        stats = get_cache_stats()
        return stats
    except Exception as e:
        logger.error(f"Failed to get transaction cache stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get transaction cache stats: {str(e)}")

@app.get("/config")
async def get_environment_config():
    """Get current environment configuration for Equifax requests"""
    try:
        config = {
            "productData": {
                "billTo": os.getenv("BILL_TO", ""),
                "shipTo": os.getenv("SHIP_TO", ""),
                "productName": os.getenv("PRODUCT_NAME", ""),
                "productOrch": os.getenv("PRODUCT_ORCH", ""),
                "configuration": os.getenv("CONFIGURATION", "Config"),
                "customer": os.getenv("CUSTOMER", ""),
                "model": os.getenv("MODEL", "")
            },
            "personalData": {
                "chileanSerialNumber": os.getenv("CHILEAN_SERIAL", "")
            },
            "oauth": {
                "clientId": os.getenv("CLIENT_ID", "")[:8] + "..." if os.getenv("CLIENT_ID") else "",
                "scope": "https://api.latam.equifax.com/datos-comerciales/transaction"
            },
            "missing_variables": []
        }
        
        # Check for missing required variables
        required_vars = ["BILL_TO", "SHIP_TO", "PRODUCT_NAME", "PRODUCT_ORCH", "CUSTOMER", "MODEL", "CLIENT_ID", "CLIENT_SECRET"]
        for var in required_vars:
            if not os.getenv(var, "").strip():
                config["missing_variables"].append(var)
        
        # Check CHILEAN_SERIAL only for personal requests
        if not os.getenv("CHILEAN_SERIAL", "").strip():
            config["missing_variables"].append("CHILEAN_SERIAL (required for personal requests)")
        
        return config
        
    except Exception as e:
        logger.error(f"Failed to get environment config: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get config: {str(e)}")

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error=exc.detail,
            detail=str(exc.detail),
            timestamp=datetime.now().isoformat()
        ).model_dump()
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(
            error="Internal server error",
            detail=str(exc),
            timestamp=datetime.now().isoformat()
        ).model_dump()
    )

async def cleanup_old_responses():
    """
    Periodically cleans up old response files:
    1. Deletes files older than 1 week.
    2. For remaining files, keeps only the most recent one for each (prefix, rut) pair.
    Runs every 10 minutes.
    """
    while True:
        try:
            logger.info("Starting cleanup of old responses...")
            if not EQUIFAX_RESPONSES_DIR.exists():
                logger.info(f"Directory {EQUIFAX_RESPONSES_DIR} does not exist. Skipping cleanup.")
            else:
                files_by_group: Dict[str, list] = {}
                one_week_ago = time.time() - (7 * 24 * 60 * 60)
                deleted_count = 0
                
                # Group files and filter old ones
                for file_path in EQUIFAX_RESPONSES_DIR.glob("*.json"):
                    try:
                        filename = file_path.stem
                        # Expecting format: {prefix}_{rut}_{timestamp}
                        # Example: equifax_76042014-K_2026-01-10T15-08-11-426Z
                        parts = filename.rsplit('_', 1)
                        if len(parts) != 2:
                            continue
                            
                        base_name, timestamp_str = parts
                        
                        # Parse timestamp
                        # Format: YYYY-MM-DDTHH-MM-SS-mmmZ
                        try:
                            date_part, time_part = timestamp_str.split('T')
                            time_part = time_part.rstrip('Z')
                            time_parts = time_part.split('-')
                            
                            hour = int(time_parts[0])
                            minute = int(time_parts[1])
                            second = int(time_parts[2])
                            microsecond = int(time_parts[3]) * 1000
                            
                            date_parts = date_part.split('-')
                            year = int(date_parts[0])
                            month = int(date_parts[1])
                            day = int(date_parts[2])
                            
                            dt = datetime(year, month, day, hour, minute, second, microsecond)
                            timestamp = dt.timestamp()
                        except Exception:
                            # If parsing fails, skip or try alternative
                            logger.debug(f"Failed to parse timestamp from {filename}")
                            continue
                        
                        # Check if older than 1 week
                        if timestamp < one_week_ago:
                            try:
                                file_path.unlink()
                                deleted_count += 1
                                logger.info(f"Deleted old response file (older than 1 week): {file_path.name}")
                            except Exception as e:
                                logger.error(f"Failed to delete {file_path}: {e}")
                            continue

                        if base_name not in files_by_group:
                            files_by_group[base_name] = []
                        
                        files_by_group[base_name].append((timestamp, file_path))
                    except Exception as e:
                        logger.warning(f"Error processing file {file_path}: {e}")

                # Process groups
                for base_name, file_list in files_by_group.items():
                    # Sort by timestamp descending (newest first)
                    file_list.sort(key=lambda x: x[0], reverse=True)
                    
                    # Keep the first one, delete the rest
                    for _, file_to_delete in file_list[1:]:
                        try:
                            file_to_delete.unlink()
                            deleted_count += 1
                            logger.info(f"Deleted old response file (duplicate): {file_to_delete.name}")
                        except Exception as e:
                            logger.error(f"Failed to delete {file_to_delete}: {e}")
                
                if deleted_count > 0:
                    logger.info(f"Cleanup finished. Deleted {deleted_count} old files.")
                else:
                    logger.info("Cleanup finished. No files to delete.")
                
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
        
        # Wait for 10 minutes (600 seconds)
        await asyncio.sleep(600)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(cleanup_old_responses())

if __name__ == "__main__":
    import uvicorn
    #print(os.environ)
    uvicorn.run(app, host="localhost", port=8022)
