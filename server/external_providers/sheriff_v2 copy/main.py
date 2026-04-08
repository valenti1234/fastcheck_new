#!/usr/bin/env python3
"""
FastAPI Sheriff v2 Provider
"""

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
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
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

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/duxiter")
print(MONGODB_URI)
CACHE_TTL_SECONDS = int(os.getenv("SHERIFF_V2_CACHE_TTL_SECONDS", "604800"))

try:
    mongo_client = MongoClient(MONGODB_URI)
    # Test connection
    mongo_client.admin.command('ping')
    db = mongo_client.get_database()
    cache_collection = db.sheriff_v2_cache
    
    # Create TTL index for automatic document expiration (ignore auth errors)
    try:
        cache_collection.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        logger.warning(f"Could not create TTL index (possibly requires auth): {e}")
    logger.info(f"MongoDB connected successfully. Cache TTL: {CACHE_TTL_SECONDS} seconds")
except ConnectionFailure as e:
    logger.error(f"MongoDB connection failed: {e}")
    mongo_client = None
    db = None
    cache_collection = None

TOKEN_CACHE_FILE = Path(".token_cache.json")
SHERIFF_TOKEN_TTL_SECONDS = int(os.getenv("SHERIFF_V2_TOKEN_TTL_SECONDS", "1800"))
SHERIFF_RESPONSES_DIR = Path(__file__).resolve().parents[2] / "sheriff_v2_response"

# Pydantic Models
class TokenResponse(BaseModel):
    token: str
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
    title="Sheriff v2 Provider API",
    description="REST API for Sheriff v2 client endpoints",
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

class QueryRutRequest(BaseModel):
    rut: str
    isMonitoring: bool = False
    includeEquifax: bool = False

def generate_cache_key(env_key: str, payload: Dict[str, Any]) -> str:
    payload_str = json.dumps(payload, sort_keys=True, separators=(',', ':'))
    payload_hash = hashlib.sha256(payload_str.encode()).hexdigest()
    return f"sheriff_v2_cache:{env_key}:{payload_hash}"

def get_cached_transaction(cache_key: str) -> Optional[Dict[str, Any]]:
    if cache_collection is None:
        return None
    
    try:
        cached_doc = cache_collection.find_one({"_id": cache_key})
        if cached_doc:
            logger.info(f"Cache hit for key: {cache_key}")
            return cached_doc.get("result")
        else:
#            logger.info(f"Cache miss for key: {cache_key}")
            return None
    except Exception as e:
        logger.error(f"Error retrieving from cache: {e}")
        return None

def save_transaction_to_cache(cache_key: str, result: Dict[str, Any]) -> None:
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

def clear_cache() -> int:
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

def read_cache() -> Optional[dict]:
    if TOKEN_CACHE_FILE.exists():
        try:
            with TOKEN_CACHE_FILE.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None

def write_cache(data: dict) -> None:
    try:
        with TOKEN_CACHE_FILE.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass

def sheriff_base_url() -> str:
    base_url = os.getenv("SHERIFF_V2_BASE_URL", "").strip()
    if not base_url:
        raise HTTPException(status_code=500, detail="Missing SHERIFF_V2_BASE_URL")
    return base_url

def get_client_identifier() -> str:
    return os.getenv("SHERIFF_V2_CLIENT_IDENTIFIER", "SheriffSecureClient-v1").strip()

def get_api_credentials() -> Dict[str, str]:
    access_key = os.getenv("SHERIFF_V2_ACCESS_KEY", "").strip()
    access_secret = os.getenv("SHERIFF_V2_ACCESS_SECRET", "").strip()
    if not access_key or not access_secret:
        raise HTTPException(status_code=500, detail="Missing Sheriff API credentials")
    return {"accessKey": access_key, "accessSecret": access_secret}

def get_cached_token(env_key: str) -> Optional[str]:
    cache = read_cache()
    if not cache:
        return None
    item = cache.get(env_key)
    if not item:
        return None
    token = item.get("token")
    expires_at = item.get("expires_at", 0)
    if not token:
        return None
    current_time = now()
    if current_time < (expires_at - 60):
        return token
    return None

def save_cached_token(env_key: str, token: str, ttl_secs: int) -> None:
    cache = read_cache() or {}
    current_time = now()
    cache[env_key] = {
        "token": token, 
        "expires_at": current_time + int(ttl_secs),
        "saved_at": current_time,
    }
    write_cache(cache)

def fetch_token(base_url: str, access_key: str, access_secret: str) -> str:
    url = base_url + "/api/clients/v2/apiCredentials/getToken"
    client_id = get_client_identifier()
    headers = {"Content-Type": "application/json","x-client-identifier": client_id }
    body_data = {"accessKey": access_key, "accessSecret": access_secret}
    body_json = json.dumps(body_data)
    
    # Print headers as JSON to show double quotes in logs
    print(f"headers {headers}")
    print(f"body {body_json}")
    logger.info(f"Fetching token from {url}")
    
    resp = requests.post(url, headers=headers, data=body_json, timeout=30)
    if resp.status_code == 200:
        payload = resp.json()
        token = payload.get("data") or payload.get("token") or ""
        if not token:
            raise HTTPException(status_code=502, detail="Token response invalid")
        save_cached_token(base_url, token, SHERIFF_TOKEN_TTL_SECONDS)
        return token
    raise HTTPException(status_code=resp.status_code, detail=resp.text)

def get_token() -> str:
    base_url = sheriff_base_url()
    cached = get_cached_token(base_url)
    if cached:
        return cached
    creds = get_api_credentials()
    return fetch_token(base_url, creds["accessKey"], creds["accessSecret"])

def execute_sheriff_get(path: str, query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    base_url = sheriff_base_url()
    token = get_token()
    client_id = get_client_identifier()
    if base_url.startswith("http"):
        url = f"{base_url}{path}"
    else:
        url = f"https://{base_url}{path}"
    params = query or {}
    cache_key = generate_cache_key("sheriff_v2_get", {"url": url, "params": params})
    cached = get_cached_transaction(cache_key)
    if cached:
        cached["_cache_info"] = {"cached": True, "cache_key": cache_key, "retrieved_at": datetime.utcnow().isoformat()}
        return cached
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}",
        "x-client-identifier": client_id,
    }
    print(f"Executing GET {url} with headers {headers} and params {params}")
    resp = requests.get(url, headers=headers, params=params, timeout=60)
    if resp.status_code == 200:
        try:
            data = resp.json()
        except Exception:
            data = {"raw": resp.text}
        save_transaction_to_cache(cache_key, data)
        data["_cache_info"] = {"cached": False, "cache_key": cache_key, "cached_at": datetime.utcnow().isoformat()}
        return data
    if resp.status_code == 401:
        token = fetch_token(base_url, get_api_credentials()["accessKey"], get_api_credentials()["accessSecret"])
        headers["Authorization"] = f"Bearer {token}"
        resp = requests.get(url, headers=headers, params=params, timeout=60)
        if resp.status_code == 200:
            try:
                data = resp.json()
            except Exception:
                data = {"raw": resp.text}
            save_transaction_to_cache(cache_key, data)
            data["_cache_info"] = {"cached": False, "cache_key": cache_key, "cached_at": datetime.utcnow().isoformat()}
            return data
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    if resp.status_code == 403:
        raise HTTPException(status_code=403, detail="Forbidden")
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Not Found")
    if resp.status_code >= 500:
        raise HTTPException(status_code=502, detail=f"Upstream error {resp.status_code}")
    raise HTTPException(status_code=resp.status_code, detail=resp.text)

def execute_sheriff_post(path: str, body: Dict[str, Any]) -> Dict[str, Any]:
    base_url = sheriff_base_url()
    token = get_token()
    client_id = get_client_identifier()
    if base_url.startswith("http"):
        url = f"{base_url}{path}"
    else:
        url = f"https://{base_url}{path}"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {token}",
        "x-client-identifier": client_id,
        "Content-Type": "application/json",
    }
    resp = requests.post(url, headers=headers, json=body, timeout=60)
    if resp.status_code == 200:
        try:
            return resp.json()
        except Exception:
            return {"raw": resp.text}
    if resp.status_code == 401:
        token = fetch_token(base_url, get_api_credentials()["accessKey"], get_api_credentials()["accessSecret"])
        headers["Authorization"] = f"Bearer {token}"
        resp = requests.post(url, headers=headers, json=body, timeout=60)
        if resp.status_code == 200:
            try:
                return resp.json()
            except Exception:
                return {"raw": resp.text}
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    if resp.status_code == 403:
        raise HTTPException(status_code=403, detail="Forbidden")
    if resp.status_code == 404:
        raise HTTPException(status_code=404, detail="Not Found")
    if resp.status_code >= 500:
        raise HTTPException(status_code=502, detail=f"Upstream error {resp.status_code}")
    raise HTTPException(status_code=resp.status_code, detail=resp.text)

def persist_response(rut: str, result: Dict[str, Any]) -> str:
    server_dir = Path(__file__).resolve().parents[2]
    dest_dir = server_dir / "sheriff_v2_response"
    dest_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    fp = dest_dir / f"{rut}_{ts}.json"
    with fp.open("w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    return str(fp)


# Rimuoviamo completamente flusso POST/Equifax


def _clear_cached_token(env_key: str) -> None:
    try:
        cache_data = read_cache()
        if cache_data and env_key in cache_data:
            del cache_data[env_key]
            write_cache(cache_data)
    except Exception:
        pass

# API Endpoints
@app.get("/", response_model=HealthResponse)
async def root():
    return HealthResponse(status="healthy", timestamp=datetime.now().isoformat(), version="1.0.0")

@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(status="healthy", timestamp=datetime.now().isoformat(), version="1.0.0")

@app.get("/token", response_model=TokenResponse)
async def get_token_endpoint():
    base_url = sheriff_base_url()
    token = get_token()
    cached = bool(get_cached_token(base_url))
    return TokenResponse(token=token, cached=cached)

@app.get("/judicial/{rut}/civil")
async def get_civil_cases(rut: str):
    rut_sanitized = str(rut).strip()
    path = f"/api/clients/v2/helper/judicial/{rut_sanitized}/civil"
    return execute_sheriff_get(path)

@app.get("/judicial/{rut}/cobranza")
async def get_cobranza_cases(rut: str):
    rut_sanitized = str(rut).strip()
    path = f"/api/clients/v2/helper/judicial/{rut_sanitized}/cobranza"
    return execute_sheriff_get(path)

@app.get("/judicial/{rut}/laboral")
async def get_laboral_cases(rut: str):
    rut_sanitized = str(rut).strip()
    path = f"/api/clients/v2/helper/judicial/{rut_sanitized}/laboral"
    return execute_sheriff_get(path)

@app.get("/cobranzaLaboral/{rut}/multaLaboral")
async def get_multa_laboral(rut: str):
    rut_sanitized = str(rut).strip()
    path = f"/api/clients/v2/helper/cobranzaLaboral/{rut_sanitized}/multaLaboral"
    return execute_sheriff_get(path)

@app.get("/cobranzaLaboral/{rut}/moraPrevisional")
async def get_mora_previsional(rut: str):
    rut_sanitized = str(rut).strip()
    path = f"/api/clients/v2/helper/cobranzaLaboral/{rut_sanitized}/moraPrevisional"
    return execute_sheriff_get(path)

@app.get("/compliance/{rut}")
async def get_compliance(rut: str):
    rut_sanitized = str(rut).strip()
    path = f"/api/clients/v2/helper/compliance/{rut_sanitized}"
    return execute_sheriff_get(path)

@app.get("/legal/{rut}/mallaSocietaria")
async def get_malla_societaria(rut: str):
    rut_sanitized = str(rut).strip()
    path = f"/api/clients/v2/helper/legal/{rut_sanitized}/mallaSocietaria"
    return execute_sheriff_get(path)

@app.get("/creditScore/{rut}")
async def get_credit_score(rut: str):
    rut_sanitized = str(rut).strip()
    path = f"/api/clients/v2/creditScore/{rut_sanitized}"
    return execute_sheriff_get(path)

@app.post("/queryRut")
async def query_rut(payload: QueryRutRequest):
    cargar_body = {
        "rut": payload.rut.strip(),
        "isMonitoring": False,
        "includeEquifax": False,
    }
    cargar = execute_sheriff_post("/api/clients/v2/helper/cargarRut", cargar_body)
    time.sleep(2)
    rut_sanitized = payload.rut.strip()
    logger.info(f"Querying resumen for RUT {rut_sanitized}")
    url = f"/api/clients/v2/helper/resumen?rut={rut_sanitized}&complete=True"
    resumen = execute_sheriff_get(url)

    result: Dict[str, Any] = {"success": True, "cargarRut": cargar, "resumen": resumen}
    ok = True
    if isinstance(cargar, dict) and ("success" in cargar) and (not bool(cargar.get("success"))):
        ok = False
    if isinstance(resumen, dict) and ("success" in resumen) and (not bool(resumen.get("success"))):
        ok = False
    if ok:
        judicial_civil = execute_sheriff_get(f"/api/clients/v2/helper/judicial/{rut_sanitized}/civil")
        judicial_cobranza = execute_sheriff_get(f"/api/clients/v2/helper/judicial/{rut_sanitized}/cobranza")
        judicial_laboral = execute_sheriff_get(f"/api/clients/v2/helper/judicial/{rut_sanitized}/laboral")
        multa_laboral = execute_sheriff_get(f"/api/clients/v2/helper/cobranzaLaboral/{rut_sanitized}/multaLaboral")
        mora_previsional = execute_sheriff_get(f"/api/clients/v2/helper/cobranzaLaboral/{rut_sanitized}/moraPrevisional")
        compliance = execute_sheriff_get(f"/api/clients/v2/helper/compliance/{rut_sanitized}")
        malla_societaria = execute_sheriff_get(f"/api/clients/v2/helper/legal/{rut_sanitized}/mallaSocietaria")
        credit_score = execute_sheriff_get(f"/api/clients/v2/creditScore/{rut_sanitized}")
        result.update({
            "judicial": {
                "civil": judicial_civil,
                "cobranza": judicial_cobranza,
                "laboral": judicial_laboral,
            },
            "cobranzaLaboral": {
                "multaLaboral": multa_laboral,
                "moraPrevisional": mora_previsional,
            },
            "compliance": compliance,
            "legal": {
                "mallaSocietaria": malla_societaria,
            },
            "creditScore": credit_score,
        })
    saved_path = persist_response(rut_sanitized, result)
    result["_saved_file"] = saved_path
    return result

@app.delete("/cache")
async def clear_sheriff_cache():
    try:
        deleted_count = clear_cache()
        return {"message": "Cache cleared successfully", "deleted_count": deleted_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")

@app.get("/cache/stats")
async def get_sheriff_cache_stats():
    try:
        stats = get_cache_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get cache stats: {str(e)}")

# Rimuoviamo endpoints legacy transaction-cache

@app.get("/config")
async def get_environment_config():
    try:
        base_url = os.getenv("SHERIFF_V2_BASE_URL", "")
        access_key = os.getenv("SHERIFF_V2_ACCESS_KEY", "")
        access_secret = os.getenv("SHERIFF_V2_ACCESS_SECRET", "")
        client_identifier = get_client_identifier()
        return {
            "base_url_set": bool(base_url),
            "access_key_set": bool(access_key),
            "access_secret_set": bool(access_secret),
            "client_identifier": client_identifier,
            "cache_ttl_seconds": CACHE_TTL_SECONDS,
            "token_ttl_seconds": SHERIFF_TOKEN_TTL_SECONDS,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get config: {str(e)}")

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(
            error=str(exc.detail),
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
    2. For remaining files, keeps only the most recent one for each RUT.
    Runs every 10 minutes.
    """
    while True:
        try:
            logger.info("Starting cleanup of old Sheriff V2 responses...")
            if not SHERIFF_RESPONSES_DIR.exists():
                logger.info(f"Directory {SHERIFF_RESPONSES_DIR} does not exist. Skipping cleanup.")
            else:
                files_by_group: Dict[str, list] = {}
                one_week_ago = datetime.utcnow() - timedelta(weeks=1)
                deleted_count = 0
                
                for file_path in SHERIFF_RESPONSES_DIR.glob("*.json"):
                    try:
                        filename = file_path.stem
                        # Format: {rut}_{timestamp}
                        parts = filename.rsplit('_', 1)
                        if len(parts) != 2:
                            continue
                            
                        rut, timestamp_str = parts
                        
                        try:
                            # Parse timestamp: YYYYMMDDTHHMMSSZ
                            file_dt = datetime.strptime(timestamp_str, "%Y%m%dT%H%M%SZ")
                        except ValueError:
                            continue
                        
                        # Check if older than 1 week
                        if file_dt < one_week_ago:
                            try:
                                file_path.unlink()
                                deleted_count += 1
                                logger.info(f"Deleted old response file (older than 1 week): {file_path.name}")
                            except Exception as e:
                                logger.error(f"Failed to delete {file_path}: {e}")
                            continue

                        if rut not in files_by_group:
                            files_by_group[rut] = []
                        
                        files_by_group[rut].append((file_dt, file_path))
                    except Exception as e:
                        logger.warning(f"Error processing file {file_path}: {e}")

                # Process groups
                for rut, file_list in files_by_group.items():
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
    uvicorn.run(app, host="0.0.0.0", port=8024)
class QueryRutRequest(BaseModel):
    rut: str
    isMonitoring: bool = False
    includeEquifax: bool = False
