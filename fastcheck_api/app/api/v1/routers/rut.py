from __future__ import annotations

import logging
import datetime as dt
import time
import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pydantic import BaseModel, Field

from fastcheck_api.app.api.dependencies import CurrentUser, require_permission
from fastcheck_api.app.core.mongodb import get_db
from fastcheck_api.app.services.dequienes_native_service import dequienes_native_service
from fastcheck_api.app.services.audit_service import AuditService
from fastcheck_api.app.services.risk_calculation_service import RiskCalculationService
from fastcheck_api.app.services.sheriff_v2_native_service import sheriff_v2_native_service
from fastcheck_api.app.utils.mongo import jsonable, sanitize_rut, to_object_id


router = APIRouter(prefix="/rut", tags=["rut"])
logger = logging.getLogger("fastcheck.rut")


class RutLookupRequest(BaseModel):
    rut: str = Field(examples=["12345678-9"])
    isMonitoring: bool = Field(default=False)
    isRefreshing: bool = Field(default=False)
    isPep: bool = Field(default=False)
    type: str = Field(default="individual")


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _safe_get(dct: Any, *path: str, default: Any = None) -> Any:
    cur = dct
    for key in path:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(key)
    return default if cur is None else cur


def _extract_socios_from_diario_oficial(rut: str, diario_oficial: Any, limit: int = 200) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in _as_list(diario_oficial):
        for socio in _as_list(_safe_get(item, "socios", default=[])):
            socio_rut = sanitize_rut(str(_safe_get(socio, "rut", default="") or ""))
            if not socio_rut or socio_rut == rut:
                continue
            if socio_rut in seen:
                continue
            seen.add(socio_rut)
            name = str(_safe_get(socio, "nombre", default="") or _safe_get(socio, "name", default="") or "").strip()
            out.append({"name": name or "N/A", "rut": socio_rut, "personType": None, "isNaturalPerson": None})
            if len(out) >= limit:
                return out
    return out


def _compute_is_pep_from_compliance(compliance: Any) -> bool:
    pep = _as_list(_safe_get(compliance, "pepChile", "coincidencias", default=[]))
    fam = _as_list(_safe_get(compliance, "familiaresPep", "coincidencias", default=[]))
    pub = _as_list(_safe_get(compliance, "funcionariosPublicos", "coincidencias", default=[]))
    return bool(pep or fam or pub)


def _filter_vigente_true(payload: Any) -> Any:
    """
    Filtro VIGENTE = TRUE (stesso comportamento dell'helper TypeScript
    filterVigenteCasesOnly in sheriffService.ts).

    Mantiene solo le entries dove `caso.vigente is True`.
    Formati supportati:
      - list (array piatto): [ caso, caso, ... ]
      - dict WRAPPER Sheriff V2:  { "cantidad": N, "casos": [...], "totalPages": N, ... }

    Nel caso wrapper aggiorna anche `cantidad` = len(casos filtrati) e ricalcola
    totalPages in modo coerente.
    """
    if payload is None:
        return payload

    # A) Formato lista piatta
    if isinstance(payload, list):
        return [
            c for c in payload
            if isinstance(c, dict) and c.get("vigente") is True
        ]

    # B) Formato wrapper dict con "casos"
    if isinstance(payload, dict) and isinstance(payload.get("casos"), list):
        casos = payload["casos"]
        filtered = [c for c in casos if isinstance(c, dict) and c.get("vigente") is True]

        new_payload: dict[str, Any] = {**payload, "casos": filtered}
        if "cantidad" in payload:
            new_payload["cantidad"] = len(filtered)
        if isinstance(payload.get("totalPages"), int) and payload["totalPages"] > 0 and len(casos) > 0:
            per_page = max(1, -(-len(casos) // payload["totalPages"]))  # ceil div
            new_payload["totalPages"] = max(1, -(-len(filtered) // per_page))
        return new_payload

    return payload


def _has_non_empty_labor_collection(obj: Any) -> bool:
    """
    has_labor_collection coerente dopo il filtro vigente=True:
    considera un payload non vuoto solo se dopo il filtro ha almeno 1 caso.
    """
    if obj is None:
        return False
    if isinstance(obj, list):
        return len(obj) > 0
    if isinstance(obj, dict):
        casos = obj.get("casos")
        if isinstance(casos, list):
            return len(casos) > 0
        # Oggetto senza chiave `casos`: considera True solo se ha altre chiavi significative
        return any(k not in {"page", "totalPages", "cantidad", "ultimaActualizacion"} for k in obj.keys())
    return False


def _simple_risk_assessment(filtered_details: dict[str, Any]) -> dict[str, Any]:
    compliance = filtered_details.get("compliance") or {}
    is_pep = _compute_is_pep_from_compliance(compliance)
    has_judicial = bool(filtered_details.get("civilCasesData") or filtered_details.get("laboralCasesData") or filtered_details.get("cobranzaCasesData"))
    has_labor_collection = _has_non_empty_labor_collection(filtered_details.get("moraPrevisionalCasesData")) or _has_non_empty_labor_collection(filtered_details.get("multaLaboralCasesData"))
    semaphore = "bajo"
    if is_pep:
        semaphore = "critico"
    elif has_judicial or has_labor_collection:
        semaphore = "alto"
    return {
        "riskSummary": {"semaphore": semaphore},
        "allRules": {
            "complianceRules": [],
            "legalRules": [],
            "capitalHumanoRules": [],
            "financieroTributarioRules": [],
        },
        "summaryDocumentMD": "",
    }


def _compute_is_pep_from_risk(risk_assessment: dict[str, Any] | None) -> bool:
    if not isinstance(risk_assessment, dict):
        return False
    rules = _safe_get(risk_assessment, "allRules", "complianceRules", default=[])
    for r in _as_list(rules):
        label = str(_safe_get(r, "label", default="") or "")
        if label in {"PEP Chile", "Familiares PEP"} and bool(_safe_get(r, "detected", default=False)):
            return True
    return False


_PROV_REPLACEMENTS: dict[str, str] = {
    "sheriff": "sProv",
    "dequienes": "dProv",
}
_PROV_PATTERN = re.compile("|".join(re.escape(k) for k in _PROV_REPLACEMENTS), re.IGNORECASE)


def _mask_providers_text(value: str) -> str:
    return _PROV_PATTERN.sub(lambda m: _PROV_REPLACEMENTS[m.group(0).lower()], value)


def _mask_providers_json(value: Any) -> Any:
    if isinstance(value, str):
        return _mask_providers_text(value)
    if isinstance(value, list):
        return [_mask_providers_json(v) for v in value]
    if isinstance(value, dict):
        out: dict[Any, Any] = {}
        for k, v in value.items():
            masked_key = _mask_providers_text(k) if isinstance(k, str) else k
            out[masked_key] = _mask_providers_json(v)
        return out
    return value


def _normalize_date(value: str | None) -> str | None:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    m = re.match(r"^(\d{2})-(\d{2})-(\d{4})$", raw)
    if m:
        dd, mm, yyyy = m.group(1), m.group(2), m.group(3)
        return f"{yyyy}-{mm}-{dd}"
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", raw)
    if m:
        dd, mm, yyyy = m.group(1), m.group(2), m.group(3)
        return f"{yyyy}-{mm}-{dd}"
    return None


def _strip_cache_info_json(value: Any) -> Any:
    if isinstance(value, list):
        return [_strip_cache_info_json(v) for v in value]
    if isinstance(value, dict):
        out: dict[Any, Any] = {}
        for k, v in value.items():
            if k == "_cache_info":
                continue
            out[k] = _strip_cache_info_json(v)
        return out
    return value


def _sanitize_result_payload(payload: Any) -> Any:
    return _mask_providers_json(_strip_cache_info_json(payload))


@router.post(
    "/lookup",
    summary="Lookup RUT",
    description=(
        "Runs a native RUT lookup using Sheriff V2 APIs and persists the result in MongoDB (same persistence model as the legacy Node implementation)."
    ),
)
async def lookup_rut(
    request: Request,
    payload: RutLookupRequest,
    user: Annotated[CurrentUser, Depends(require_permission("rut:lookup"))],
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
):
    start = time.perf_counter()
    rut = sanitize_rut(payload.rut)

    refresh = bool(payload.isMonitoring or payload.isRefreshing)
    now = dt.datetime.now(dt.timezone.utc)

    if refresh:
        await db["results"].update_many(
            {"rut": rut, "tenantId": user.tenant, "archived": {"$ne": True}},
            {"$set": {"archived": True, "archivedAt": now, "updatedAt": now}},
        )

    existing = await db["results"].find_one(
        {"rut": rut, "tenantId": user.tenant, "archived": {"$ne": True}},
        sort=[("createdAt", -1)],
    )
    if existing and not refresh:
        await AuditService.log_consulta(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            consulta_type="individual",
            rut=rut,
            endpoint="/client-api-v1/rut/lookup",
            response_status=status.HTTP_200_OK,
            request_data=jsonable(payload.model_dump()),
            response_data={"source": "cache"},
            processing_time_ms=int((time.perf_counter() - start) * 1000),
            credits_used=0,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"source": "cache"},
        )
        return _sanitize_result_payload(jsonable(existing))

    should_deduct = (not payload.isPep) and (payload.isRefreshing or not refresh)
    if should_deduct:
        tenant_oid = to_object_id(user.tenant)
        tenant_after = await db["tenants"].find_one_and_update(
            {"_id": tenant_oid, "creditBalance.availableCredits": {"$gte": 1}},
            {
                "$inc": {
                    "creditBalance.availableCredits": -1,
                    "creditBalance.totalCreditsUsed": 1,
                },
                "$set": {
                    "creditBalance.lastCreditOperation": now,
                    "updatedAt": now,
                },
            },
            return_document=ReturnDocument.AFTER,
        )
        if not tenant_after:
            await AuditService.log_consulta(
                db=db,
                tenant_id=user.tenant,
                user_id=user.id,
                consulta_type="individual",
                rut=rut,
                endpoint="/client-api-v1/rut/lookup",
                response_status=status.HTTP_402_PAYMENT_REQUIRED,
                request_data=jsonable(payload.model_dump()),
                processing_time_ms=int((time.perf_counter() - start) * 1000),
                credits_used=0,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                metadata={"reason": "insufficient_credits"},
            )
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={"message": "Insufficient credits", "availableCredits": int((tenant_after or {}).get("creditBalance", {}).get("availableCredits", 0))},
            )

        new_balance = int((tenant_after.get("creditBalance") or {}).get("availableCredits") or 0)
        await db["creditoperations"].insert_one(
            {
                "tenantId": tenant_oid,
                "userId": to_object_id(user.id),
                "operationType": "evaluation",
                "creditsChanged": -1,
                "balanceAfter": new_balance,
                "description": f"Valutazione singola per {rut}",
                "metadata": {"evaluationType": "single", "supplierRut": rut, "source": "fastcheck_api"},
                "createdAt": now,
            }
        )

    response_status = status.HTTP_200_OK
    error_message: str | None = None
    try:
        sheriff_payload = await sheriff_v2_native_service.query_rut(rut=rut, is_monitoring=payload.isMonitoring)
        masked_sheriff_payload = _mask_providers_json(sheriff_payload)

        resumen_data = _safe_get(masked_sheriff_payload, "resumen", "data", default={})
        data_sii = _safe_get(resumen_data, "identificacion", default={})
        credit_scoring = _safe_get(masked_sheriff_payload, "creditScore", "data", default={})
        compliance = _safe_get(masked_sheriff_payload, "compliance", "data", default={})

        filtered_details: dict[str, Any] = {
            "rut": _safe_get(resumen_data, "rut", default=rut),
            "razonSocial": _safe_get(data_sii, "razonSocial", default=None),
            "presentaActividades": _safe_get(data_sii, "presentaActividades", default=None),
            "inicioActividades": _safe_get(data_sii, "inicioActividades", default=None),
            "autorizadoMonedaExtranjera": _safe_get(data_sii, "autorizadoMonedaExtranjera", default=None),
            "empresaMenor": _safe_get(data_sii, "empresaMenor", default=None),
            "observaciones": _safe_get(data_sii, "observaciones", default=None),
            "notas": _safe_get(data_sii, "notas", default=None),
            "situacionActual": _safe_get(data_sii, "situacionActual", default=None),
            "fetchedAt": now.date().isoformat(),
            "creditScoringData": credit_scoring,
            "compliance": compliance,
            "boletinComercialSummary": _safe_get(masked_sheriff_payload, "resumen", "boletinComercial", default={}),
            "boletinLaboralSummary": _safe_get(resumen_data, "boletinLaboral", default={}),
            "boletinLaboralLastUpdate": _safe_get(resumen_data, "boletinLaboral", "ultimaActualizacion", default=None),
            "vehiclesSummary": _safe_get(resumen_data, "bienes", "vehiculos", default={}),
            "propertiesSummary": _safe_get(resumen_data, "bienes", "propiedades", default={}),
            "deudaBancariaSummary": _safe_get(masked_sheriff_payload, "resumen", "deudaBancaria", default={}),
            "mallaSocietariaData": _safe_get(masked_sheriff_payload, "legal", "mallaSocietaria", "data", default={}),
            "officialDiaryData": _safe_get(masked_sheriff_payload, "legal", "mallaSocietaria", "data", "diarioOficial", default=[]),
            "civilCasesData": _safe_get(masked_sheriff_payload, "judicial", "civil", "data", default={}),
            "laboralCasesData": _safe_get(masked_sheriff_payload, "judicial", "laboral", "data", default={}),
            "cobranzaCasesData": _safe_get(masked_sheriff_payload, "judicial", "cobranza", "data", default={}),
            "moraPrevisionalCasesData": _filter_vigente_true(_safe_get(masked_sheriff_payload, "cobranzaLaboral", "moraPrevisional", "data", default={})),
            "multaLaboralCasesData": _filter_vigente_true(_safe_get(masked_sheriff_payload, "cobranzaLaboral", "multaLaboral", "data", default={})),
        }

        compliance_person_type = "juridical" if bool(_safe_get(resumen_data, "esPersonaJuridica", default=False)) else "natural"
        filtered_details["compliancePersonType"] = compliance_person_type
        filtered_details["complianceSelectedRowsPepChile"] = _as_list(_safe_get(compliance, "pepChile", "coincidencias", default=[]))
        filtered_details["complianceSelectedRowsPublicOfficial"] = _as_list(
            _safe_get(compliance, "funcionariosPublicos", "coincidencias", default=[])
        )
        filtered_details["complianceSelectedRowsPepChileFamily"] = _as_list(_safe_get(compliance, "familiaresPep", "coincidencias", default=[]))
        filtered_details["complianceSelectedRowsPenal"] = _as_list(_safe_get(compliance, "penal", "coincidencias", default=[]))
        filtered_details["complianceSelectedlistasInternacionales"] = _as_list(
            _safe_get(compliance, "listasInternacionales", "coincidencias", default=[])
        )

        company_general_info: dict[str, Any] = {
            "rapresentanteLegal": "N/D",
            "rapresentanteLegalRut": "N/D",
            "inicioActividades": filtered_details.get("inicioActividades") or "",
            "fechaDeConstitucion": "",
            "empresaMenor": filtered_details.get("empresaMenor") or "",
            "razonSocial": filtered_details.get("razonSocial") or "",
            "socios": [],
            "administradores": [],
            "rangoVentas": None,
            "tamanoEmpresa": None,
            "iconImpresa": None,
            "cantidadTrabajadores": None,
        }

        diario = filtered_details.get("officialDiaryData")
        company_general_info["socios"] = _extract_socios_from_diario_oficial(rut, diario)

        if not payload.isPep:
            try:
                deq_relationships = await dequienes_native_service.relationships(
                    rut=rut,
                    distance=2,
                    relationship_direction="BOTH",
                    one_path_per_node=False,
                )
                filtered_details["dequienesRelationships"] = _mask_providers_json(_strip_cache_info_json(deq_relationships))
            except Exception:
                logger.exception("Dequienes relationships failed")
            try:
                deq_legal = await dequienes_native_service.legal_events(rut=rut)
                filtered_details["dequienesLegalEvents"] = _mask_providers_json(_strip_cache_info_json(deq_legal))
                raw_date = deq_legal.get("constitution_date") if isinstance(deq_legal, dict) else None
                normalized = _normalize_date(raw_date if isinstance(raw_date, str) else None)
                if normalized and not company_general_info.get("fechaDeConstitucion"):
                    company_general_info["fechaDeConstitucion"] = normalized
            except Exception:
                logger.exception("Dequienes legal events failed")

        if not company_general_info.get("fechaDeConstitucion"):
            company_general_info["fechaDeConstitucion"] = "No hay informacion"

        risk_assessment = await RiskCalculationService.calculate_risk(
            db,
            tenant_id=user.tenant,
            rut=rut,
            sheriff_v2_data=masked_sheriff_payload,
            filtered_details=filtered_details,
            company_general_info=company_general_info,
            is_pep_only=payload.isPep,
        )
        is_pep = _compute_is_pep_from_risk(risk_assessment) or _compute_is_pep_from_compliance(compliance)

        processing_ms = int((time.perf_counter() - start) * 1000)
        result_doc: dict[str, Any] = {
            "rut": rut,
            "tenantId": user.tenant,
            "queryType": "derived_socio_pep" if payload.isPep else "primary",
            "sheriffLogData": {
                "rut": rut,
                "tenantId": user.tenant,
                "fetchedAt": now,
                "companyGeneralInfo": company_general_info if not payload.isPep else None,
                "filteredDetails": filtered_details,
                "rawSheriffV2": masked_sheriff_payload,
            },
            "details": filtered_details,
            "companyGeneralInfo": None if payload.isPep else company_general_info,
            "riskAssessment": risk_assessment,
            "isPep": bool(is_pep),
            "userEmail": user.email,
            "status": 200,
            "type": payload.type,
            "processingTime": f"{processing_ms}ms",
            "creditsConsumed": 1 if should_deduct else 0,
            "archived": False,
            "createdAt": now,
            "updatedAt": now,
        }

        insert = await db["results"].insert_one(result_doc)
        stored = await db["results"].find_one({"_id": insert.inserted_id})
        response_payload = jsonable(stored) if stored else jsonable({**result_doc, "_id": str(insert.inserted_id)})
        response_payload = _sanitize_result_payload(response_payload)

        await AuditService.log_consulta(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            consulta_type="individual",
            rut=rut,
            endpoint="/client-api-v1/rut/lookup",
            response_status=response_status,
            request_data=jsonable(payload.model_dump()),
            response_data={"resultId": response_payload.get("_id")},
            processing_time_ms=processing_ms,
            credits_used=1 if should_deduct else 0,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"evaluationType": "single", "source": "fastcheck_api"},
        )
        return response_payload
    except Exception as e:
        response_status = status.HTTP_502_BAD_GATEWAY
        error_message = str(e)
        logger.exception(f"Native lookup failed error={error_message[:500]}")
        await AuditService.log_consulta(
            db=db,
            tenant_id=user.tenant,
            user_id=user.id,
            consulta_type="individual",
            rut=rut,
            endpoint="/client-api-v1/rut/lookup",
            response_status=response_status,
            request_data=jsonable(payload.model_dump()),
            error_message=error_message[:2000],
            processing_time_ms=int((time.perf_counter() - start) * 1000),
            credits_used=1 if should_deduct else 0,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"evaluationType": "single", "source": "fastcheck_api"},
        )
        raise HTTPException(status_code=response_status, detail={"message": "Native lookup failed", "error": error_message[:2000]})
