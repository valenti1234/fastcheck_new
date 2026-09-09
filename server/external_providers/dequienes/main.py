#!/usr/bin/env python3
"""
FastAPI DeQuienes Provider
"""

from multiprocessing import process
import os
import json
import time
import asyncio
import logging
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

import requests
from fastapi import FastAPI, HTTPException, Depends, status, Header, Query
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

# MongoDB connection setup
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/duxiter")
CACHE_TTL_SECONDS = int(os.getenv("DEQUIENES_CACHE_TTL_SECONDS", "604800"))  # Default 1 week

try:
    mongo_client = MongoClient(MONGODB_URI)
    # Test connection
    mongo_client.admin.command('ping')
    db = mongo_client.get_database()
    cache_collection = db.dequienes_cache
    
    # Create TTL index for automatic document expiration
    cache_collection.create_index("expires_at", expireAfterSeconds=0)
    logger.info(f"MongoDB connected successfully. Cache TTL: {CACHE_TTL_SECONDS} seconds")
except ConnectionFailure as e:
    logger.error(f"MongoDB connection failed: {e}")
    mongo_client = None
    db = None
    cache_collection = None

# Constants

DEQUIENES_BASE_URL = "https://dequienes.cl/api/graph/relationships"
DEQUIENES_RESPONSES_DIR = Path(__file__).resolve().parents[2] / "dequenes_responses"

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

pass





class RelationshipQueryParams(BaseModel):
    distance: int = Field(default=5, ge=1, le=5, description="Niveles de profundidad de relaciones DeQuienes (máx. 5 niveles)")
    relationship_direction: str = Field(default="BOTH")
    one_path_per_node: bool = Field(default=False)

class TokenResponse(BaseModel):
    pass

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
    title="DeQuienes Provider API",
    description="REST API per integrazione DeQuienes relationships",
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
    return f"dequienes_cache:{env_key}:{payload_hash}"

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

def now() -> float:
    return time.time()

def execute_get(url: str, headers: Dict[str, str], cache_key: str) -> Dict[str, Any]:
    cached_result = get_cached_transaction(cache_key)
    if cached_result:
        cached_result["_cache_info"] = {"cached": True, "cache_key": cache_key, "retrieved_at": datetime.utcnow().isoformat()}
        return cached_result
    resp = requests.get(url, headers=headers, timeout=60)
    if resp.status_code == 200:
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
        save_transaction_to_cache(cache_key, data)
        data["_cache_info"] = {"cached": False, "cache_key": cache_key, "cached_at": datetime.utcnow().isoformat()}
        return data
    if resp.status_code == 401:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if resp.status_code == 403:
        raise HTTPException(status_code=403, detail="Forbidden")
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Not Found")
    if resp.status_code >= 500:
        raise HTTPException(status_code=502, detail=f"Upstream error {resp.status_code}")
    raise HTTPException(status_code=resp.status_code, detail=resp.text)

def persist_response(rut_sanitized: str, payload: Dict[str, Any], prefix: str = "relationships") -> str:
    try:
        DEQUIENES_RESPONSES_DIR.mkdir(parents=True, exist_ok=True)
        file_path = DEQUIENES_RESPONSES_DIR / f"{prefix}_{rut_sanitized}_{int(time.time())}.json"
        with file_path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        return str(file_path)
    except Exception:
        return ""


# Rimuoviamo completamente flusso POST/Equifax


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

pass

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

@app.get("/relationships/{rut}")
async def get_relationships(rut: str, distance: int = Query(default=5, ge=1, le=5, description="Niveles de profundidad de relaciones DeQuienes (máx. 5 niveles)"), relationship_direction: str = "BOTH", one_path_per_node: bool = False, x_api_key: Optional[str] = Header(default=None, alias="x-api-key")):
    if relationship_direction not in ("BOTH", "OUTGOING", "INCOMING"):
        raise HTTPException(status_code=400, detail="Invalid relationship_direction")
    api_key = x_api_key or os.getenv("DEQUIENES_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing DeQuienes API key")
    rut_sanitized = str(rut).split('-')[0].strip()
    url = f"{DEQUIENES_BASE_URL}/{rut_sanitized}?distance={distance}&relationship_direction={relationship_direction}&one_path_per_node={'true' if one_path_per_node else 'false'}"
    cache_key = generate_cache_key("dequienes_relationships", {
        "rut": rut_sanitized,
        "distance": int(distance),
        "relationship_direction": relationship_direction,
        "one_path_per_node": bool(one_path_per_node)
    })
    cached = get_cached_transaction(cache_key)
    if cached:
        cached["_cache_info"] = {
            "cached": True,
            "cache_key": cache_key,
            "retrieved_at": datetime.utcnow().isoformat()
        }
        persist_response(rut_sanitized, cached)
        return cached
    headers = {"accept": "application/json", "x-api-key": api_key}
    try:
        resp = requests.get(url, headers=headers, timeout=60)
        if resp.status_code == 200:
            try:
                data = resp.json()
            except Exception:
                data = {"raw": resp.text}
            save_transaction_to_cache(cache_key, data)
            data["_cache_info"] = {
                "cached": False,
                "cache_key": cache_key,
                "cached_at": datetime.utcnow().isoformat()
            }
            persist_response(rut_sanitized, data)
            return data
        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail="Unauthorized")
        if resp.status_code == 403:
            raise HTTPException(status_code=403, detail="Forbidden")
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Not Found")
        if resp.status_code >= 500:
            raise HTTPException(status_code=502, detail=f"Upstream error {resp.status_code}")
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class LegalEvent(BaseModel):
    cve: Optional[str] = None
    published_at: Optional[str] = None
    actuation_type: str
    company_name: Optional[str] = None
    source: str
    url: Optional[str] = None

class LegalEventsResponse(BaseModel):
    rut: str
    count: int
    cached: bool
    timestamp: str
    events: list[LegalEvent]
    constitution_date: Optional[str] = None

def sanitize_rut_without_dv(rut: str) -> str:
    v = (rut or "").upper().replace(".", "").replace("-", "").strip()
    if len(v) > 8:
        return v[:-1]
    return v

def map_actuation_type(src: str, info: Dict[str, Any], label: Optional[str]) -> str:
    s = (src or "").upper()
    if s in ("DO", "DOH"):
        mt = str(info.get("match_type", "")).lower()
        if "tt" in mt:
            return "constitution"
        return "actuation"
    if s == "RES":
        return "actuation"
    return label or "actuation"

@app.get("/api/legal-events/{rut}", response_model=LegalEventsResponse)
async def get_legal_events(rut: str, x_api_key: Optional[str] = Header(default=None, alias="x-api-key")):
    logger.info(f"Requesting legal events for RUT: {rut}")
    api_key = x_api_key or os.getenv("DEQUIENES_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="Missing DeQuienes API key")

    rut_sanitized = sanitize_rut_without_dv(rut)
   # url = f"{DEQUIENES_BASE_URL}/{rut_sanitized}?distance=1&relationship_direction=BOTH&one_path_per_node=false"
    url = f"https://dequienes.cl/api/legal-events/{rut_sanitized}"
    logger.info(f"legal events Requesting URL: {url}")
    cache_key = generate_cache_key("dequienes_legal_events", {"rut": rut_sanitized})
    use_cache = True
    # Try to serve from cache first
    if use_cache:
        cached_doc = get_cached_transaction(cache_key)
        if cached_doc and isinstance(cached_doc, dict) and "events" in cached_doc:
            persisted_payload = {
                "rut": rut_sanitized,
                "events": cached_doc.get("events", []),
                "cached": True,
                "timestamp": datetime.utcnow().isoformat(),
                "constitution_date": cached_doc.get("constitution_date")
            }
            persist_response(rut_sanitized, persisted_payload, prefix="legal_events")
            return LegalEventsResponse(
                rut=rut_sanitized,
                count=len(cached_doc.get("events", [])),
                cached=True,
                timestamp=datetime.utcnow().isoformat(),
                events=[LegalEvent(**e) for e in cached_doc.get("events", [])],
                constitution_date=cached_doc.get("constitution_date")
            )

    headers = {"accept": "application/json", "x-api-key": api_key}
    logger.info(f"Requesting URL: {url}")
    try:
        resp = requests.get(url, headers=headers, timeout=60)
        logger.info(json.dumps(resp.json(), indent=2))

        if resp.status_code != 200:
            if resp.status_code == 401:
                raise HTTPException(status_code=401, detail="Unauthorized")
            if resp.status_code == 403:
                raise HTTPException(status_code=403, detail="Forbidden")
            if resp.status_code == 404:
                raise HTTPException(status_code=404, detail="Not Found")
            if resp.status_code >= 500:
                raise HTTPException(status_code=502, detail=f"Upstream error {resp.status_code}")
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        try:
            data = resp.json()
        except Exception:
            raise HTTPException(status_code=502, detail="Invalid JSON from upstream")

        legal_events = data.get("legal_events", [])
        events: list[Dict[str, Any]] = []
        for ev in legal_events:
            e = {
                "cve": ev.get("cve"),
                "published_at": ev.get("published_at"),
                "actuation_type": ev.get("actuation_type"),
                "company_name": ev.get("company_name"),
                "source": ev.get("source"),
                "url": ev.get("url")
            }
            events.append(e)

        constitution_candidates = [
            ev for ev in events
            if str(ev.get("actuation_type", "")).upper().startswith("CONSTITU")
        ]
        constitution_date_val = None
        if constitution_candidates:
            def _parse_date(s: Optional[str]) -> Optional[datetime]:
                try:
                    return datetime.fromisoformat(str(s))
                except Exception:
                    return None
            dates = [(_parse_date(ev.get("published_at")), ev.get("published_at")) for ev in constitution_candidates]
            dates = [d for d in dates if d[0] is not None]
            if dates:
                dates.sort(key=lambda x: x[0])
                constitution_date_val = dates[0][1]

        result_doc = {"events": events, "constitution_date": constitution_date_val}
        save_transaction_to_cache(cache_key, result_doc)
        persisted_payload = {
            "rut": rut_sanitized,
            "events": events,
            "cached": False,
            "timestamp": datetime.utcnow().isoformat(),
            "constitution_date": constitution_date_val
        }
        persist_response(rut_sanitized, persisted_payload, prefix="legal_events")

        return LegalEventsResponse(
            rut=rut_sanitized,
            count=len(events),
            cached=False,
            timestamp=datetime.utcnow().isoformat(),
            events=[LegalEvent(**e) for e in events],
            constitution_date=constitution_date_val
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/relationships-cache")
async def clear_relationships_cache():
    try:
        deleted_count = clear_transaction_cache()
        return {"message": "Cache cleared successfully", "deleted_count": deleted_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")

@app.get("/relationships-cache/stats")
async def get_relationships_cache_stats():
    try:
        stats = get_cache_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get cache stats: {str(e)}")

# Rimuoviamo endpoints legacy transaction-cache

@app.get("/config")
async def get_environment_config():
    try:
        api_key = os.getenv("DEQUIENES_API_KEY", "")
        return {"api_key_set": bool(api_key), "cache_ttl_seconds": CACHE_TTL_SECONDS}
    except Exception as e:
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
            if not DEQUIENES_RESPONSES_DIR.exists():
                logger.info(f"Directory {DEQUIENES_RESPONSES_DIR} does not exist. Skipping cleanup.")
            else:
                files_by_group: Dict[str, list] = {}
                one_week_ago = time.time() - (7 * 24 * 60 * 60)
                deleted_count = 0
                
                # Group files and filter old ones
                for file_path in DEQUIENES_RESPONSES_DIR.glob("*.json"):
                    try:
                        filename = file_path.stem
                        # Expecting format: {prefix}_{rut}_{timestamp}
                        # We split by '_' from the right once to get the timestamp
                        parts = filename.rsplit('_', 1)
                        if len(parts) != 2:
                            continue
                            
                        base_name, timestamp_str = parts
                        
                        # Verify timestamp is integer
                        if not timestamp_str.isdigit():
                            continue
                            
                        timestamp = int(timestamp_str)
                        
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
    #uvicorn.run(app, host="0.0.0.0", port=8023)
    logger.info("Starting server on port 8023")
    uvicorn.run(app,  port=8023)
