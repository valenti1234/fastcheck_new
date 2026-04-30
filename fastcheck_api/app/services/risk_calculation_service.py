from __future__ import annotations

import datetime as dt
import re
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from fastcheck_api.app.utils.mongo import sanitize_rut


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _safe_get(value: Any, *path: str, default: Any = None) -> Any:
    cur = value
    for key in path:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(key)
    return default if cur is None else cur


def _risk_from_impact(detected: bool, impacto: str) -> str:
    if not detected:
        return "bajo"
    if impacto == "severo":
        return "critico"
    if impacto == "significativo":
        return "alto"
    return "bajo"


def _normalize_text(value: str) -> str:
    value = (value or "").strip()
    value = value.replace("Á", "A").replace("É", "E").replace("Í", "I").replace("Ó", "O").replace("Ú", "U")
    value = value.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
    value = re.sub(r"[^\w\s]", " ", value, flags=re.UNICODE)
    value = re.sub(r"\s+", " ", value, flags=re.UNICODE).strip()
    return value


def _rut_variants(rut: str) -> list[str]:
    rut = sanitize_rut(rut)
    clean = rut.replace(".", "").replace("-", "").upper()
    if len(clean) < 2:
        return [rut]
    dotted = f"{clean[:-1]:0>9}"
    dotted = re.sub(r"^(\d{2})(\d{3})(\d{3})$", r"\1.\2.\3", dotted[:-1]) + "-" + clean[-1]
    with_dash = f"{clean[:-1]}-{clean[-1]}"
    return list(dict.fromkeys([rut, with_dash, clean, dotted]))


class RiskCalculationService:
    @staticmethod
    async def _load_equifax_normalized(
        db: AsyncIOMotorDatabase, *, tenant_id: str, rut: str
    ) -> dict[str, Any] | None:
        rut = sanitize_rut(rut)
        base = rut.replace(".", "").replace("-", "").upper()
        rut_with_dash = f"{base[:-1]}-{base[-1]}" if len(base) > 1 else rut
        rut_without_dash = base
        query: dict[str, Any] = {"tenantId": tenant_id, "$or": [{"rut": rut}, {"rut": rut_with_dash}, {"rut": rut_without_dash}]}
        doc = await db["equifax-responses"].find_one(query, sort=[("createdAt", -1)])
        if not doc or not isinstance(doc, dict):
            return None
        normalized = doc.get("normalizedData")
        return normalized if isinstance(normalized, dict) else None

    @staticmethod
    async def _load_antiunion_cases(db: AsyncIOMotorDatabase, *, rut: str) -> list[dict[str, Any]]:
        variants = _rut_variants(rut)
        ors: list[dict[str, Any]] = []
        for v in variants:
            ors.append({"rut": {"$regex": f"^{re.escape(v)}$", "$options": "i"}})
        cursor = db["antiunioncases"].find({"$or": ors}).sort([("createdAt", -1)]).limit(200)
        out: list[dict[str, Any]] = []
        async for doc in cursor:
            if isinstance(doc, dict):
                out.append(doc)
        return out

    @staticmethod
    async def _load_ley_records(db: AsyncIOMotorDatabase, *, collection: str, rut: str) -> list[dict[str, Any]]:
        clean = rut.replace(".", "").upper()
        cursor = db[collection].find({"rut": clean}).sort([("createdAt", -1)]).limit(200)
        out: list[dict[str, Any]] = []
        async for doc in cursor:
            if isinstance(doc, dict):
                out.append(doc)
        return out

    @staticmethod
    async def _load_listas_propias(db: AsyncIOMotorDatabase, *, collection: str, tenant_id: str, rut: str) -> list[dict[str, Any]]:
        clean = rut.replace(".", "").upper()
        cursor = db[collection].find({"rut": clean, "tenant": tenant_id}).sort([("createdAt", -1)]).limit(200)
        out: list[dict[str, Any]] = []
        async for doc in cursor:
            if isinstance(doc, dict):
                out.append(doc)
        return out

    @staticmethod
    async def _find_snifa_by_company_name(
        db: AsyncIOMotorDatabase,
        *,
        razon_social: str,
        field_flag: str,
    ) -> list[dict[str, Any]]:
        name = _normalize_text(razon_social)
        if not name:
            return []
        tokens = [t for t in name.split(" ") if len(t) >= 3]
        tokens = tokens[:6]
        if not tokens:
            return []
        regex = ".*".join(re.escape(t) for t in tokens)
        query = {
            field_flag: {"$regex": r"^SI$", "$options": "i"},
            "razonSocial": {"$regex": regex, "$options": "i"},
        }
        cursor = db["snifasancionatorios"].find(query).sort([("createdAt", -1)]).limit(200)
        out: list[dict[str, Any]] = []
        async for doc in cursor:
            if isinstance(doc, dict):
                out.append(doc)
        return out

    @staticmethod
    def _evaluate_compliance_rules(log_entry: dict[str, Any]) -> list[dict[str, Any]]:
        compliance_rules: list[dict[str, Any]] = []
        summary = _as_dict(_safe_get(log_entry, "summaryData", "data", default={}))
        v2 = _as_dict(_safe_get(log_entry, "filteredDetails", "sheriffV2Data", default={}))
        compliance_data = _as_dict(_safe_get(v2, "compliance", "data", default={}))
        compliance_local = _as_dict(_safe_get(log_entry, "filteredDetails", "compliance", default={}))

        ley21121_records = _as_list(summary.get("ley21121Records") or [])
        ley21121_detected = bool(summary.get("ley21121Detected"))
        compliance_rules.append(
            {
                "label": "Condenas Ley 21.121",
                "impacto": "severo",
                "detected": ley21121_detected,
                "risk": _risk_from_impact(ley21121_detected, "severo"),
                "score": len(ley21121_records),
                "details": ley21121_records,
            }
        )

        ley20393_records = _as_list(summary.get("ley20393Records") or [])
        ley20393_detected = bool(summary.get("ley20393Detected"))
        compliance_rules.append(
            {
                "label": "Condenas Ley 20.393",
                "impacto": "severo",
                "detected": ley20393_detected,
                "risk": _risk_from_impact(ley20393_detected, "severo"),
                "score": len(ley20393_records),
                "details": ley20393_records,
            }
        )

        listas_int = _as_list(_safe_get(compliance_data, "listasInternacionales", "coincidencias", default=[]))
        detected = len(listas_int) > 0
        compliance_rules.append(
            {
                "label": "Listas Internacionales",
                "impacto": "severo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "severo"),
                "score": len(listas_int),
                "details": listas_int,
            }
        )

        sanciones = _as_list(_safe_get(summary, "snifaSancionesRecords", default=[]))
        detected = len(sanciones) > 0
        compliance_rules.append(
            {
                "label": "Sanciones Medioambientales",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": len(sanciones),
                "details": sanciones,
            }
        )

        procesos = _as_list(_safe_get(summary, "snifaProcesoRecords", default=[]))
        detected = len(procesos) > 0
        compliance_rules.append(
            {
                "label": "Proceso Sanciones Medioambientales",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": len(procesos),
                "details": procesos,
            }
        )

        lpaltos = _as_list(summary.get("lpaltosRecords") or [])
        lpaltos_detected = bool(summary.get("lpaltosDetected"))
        compliance_rules.append(
            {
                "label": "Listas Propias Alto Impacto",
                "impacto": "severo",
                "detected": lpaltos_detected,
                "risk": _risk_from_impact(lpaltos_detected, "severo"),
                "score": len(lpaltos),
                "details": lpaltos,
            }
        )

        lpmedios = _as_list(summary.get("lpmediosRecords") or [])
        lpmedios_detected = bool(summary.get("lpmediosDetected"))
        compliance_rules.append(
            {
                "label": "Listas Propias Mediano Impacto",
                "impacto": "significativo",
                "detected": lpmedios_detected,
                "risk": _risk_from_impact(lpmedios_detected, "significativo"),
                "score": len(lpmedios),
                "details": lpmedios,
            }
        )

        noticias = _as_list(_safe_get(compliance_local, "noticias", "coincidencias", default=[]))
        detected = len(noticias) > 0
        compliance_rules.append(
            {
                "label": "Reputación Pública y Mediática",
                "impacto": "severo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "severo"),
                "score": len(noticias),
                "details": noticias,
            }
        )

        pep = _as_list(_safe_get(compliance_data, "pepChile", "coincidencias", default=[]))
        detected = len(pep) > 0
        compliance_rules.append(
            {
                "label": "PEP Chile",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": len(pep),
                "details": pep,
            }
        )

        penales = _as_list(_safe_get(compliance_data, "penal", "coincidencias", default=[]))
        filtered_penales: list[Any] = []
        for d in penales:
            posture = str(_safe_get(d, "postura", default="") or "").lower()
            if posture and posture not in {"denunciante", "querellante"}:
                filtered_penales.append(d)
        detected = len(filtered_penales) > 0
        compliance_rules.append(
            {
                "label": "Causas Penales",
                "impacto": "severo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "severo"),
                "score": len(filtered_penales),
                "details": filtered_penales,
            }
        )

        familiares = _as_list(_safe_get(compliance_data, "familiaresPep", "coincidencias", default=[]))
        detected = len(familiares) > 0
        compliance_rules.append(
            {
                "label": "Familiares PEP",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": len(familiares),
                "details": familiares,
            }
        )

        return compliance_rules

    @staticmethod
    def _evaluate_capital_humano_rules(log_entry: dict[str, Any]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        antiunion = _as_list(_safe_get(log_entry, "antiunionCases", default=[]))
        detected = len(antiunion) > 0
        out.append(
            {
                "label": "Condenas por Prácticas Antisindicales",
                "impacto": "severo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "severo"),
                "score": len(antiunion),
                "details": antiunion,
            }
        )

        compliance_person_type = str(_safe_get(log_entry, "filteredDetails", "compliancePersonType", default="") or "").lower()
        equifax = _as_dict(_safe_get(log_entry, "equifaxData", default={}))
        bolab = _as_list(_safe_get(equifax, "allData", "commercialData", "credit", "debtsSummary", "bolab", "commercialBolab", default=[]))
        deuda_previsional = []
        if compliance_person_type == "juridical":
            for entry in bolab:
                it = str(_safe_get(entry, "injuryType", default="") or _safe_get(entry, "injurytype", default="") or "").upper()
                if it != "M":
                    deuda_previsional.append(entry)
        detected = len(deuda_previsional) > 0
        out.append(
            {
                "label": "Deuda Previsional Publicada",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": len(deuda_previsional),
                "details": deuda_previsional,
            }
        )

        bolab_j = _as_list(_safe_get(log_entry, "filteredDetails", "bolabTypePersonaJuridica", default=[]))
        bolab_n = _as_list(_safe_get(log_entry, "filteredDetails", "bolabTypePersonaNatural", default=[]))
        multas = []
        for entry in [*bolab_j, *bolab_n]:
            it = str(_safe_get(entry, "injuryType", default="") or _safe_get(entry, "injurytype", default="") or "").upper()
            if it == "M":
                multas.append(entry)
        detected = len(multas) > 0
        out.append(
            {
                "label": "Multas Laborales",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": len(multas),
                "details": multas,
            }
        )

        v2 = _as_dict(_safe_get(log_entry, "filteredDetails", "sheriffV2Data", default={}))
        mora_casos = _as_list(_safe_get(v2, "cobranzaLaboral", "moraPrevisional", "data", "casos", default=[]))
        detected = len(mora_casos) > 0
        out.append(
            {
                "label": "Deuda Previsional Presunta",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": len(mora_casos),
                "details": mora_casos,
            }
        )

        return out

    @staticmethod
    def _extract_cases(value: Any) -> list[Any]:
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            data = value.get("data")
            if isinstance(data, dict):
                cases = data.get("casos")
                if isinstance(cases, list):
                    return cases
            if isinstance(data, list):
                return data
        return []

    @staticmethod
    def _evaluate_legal_rules(log_entry: dict[str, Any]) -> list[dict[str, Any]]:
        v2 = _as_dict(_safe_get(log_entry, "filteredDetails", "sheriffV2Data", default={}))
        out: list[dict[str, Any]] = []

        casos_quiebra = int(_safe_get(v2, "resumen", "data", "judicial", "casosQuiebra", default=0) or 0)
        detected = casos_quiebra > 0
        out.append(
            {
                "label": "Quiebra Judicial",
                "impacto": "severo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "severo"),
                "score": casos_quiebra,
                "details": ["Existe quiebra judicial"] if detected else [],
            }
        )

        equifax = _as_dict(_safe_get(log_entry, "equifaxData", default={}))
        boletin_concursal = _as_list(
            _safe_get(
                equifax,
                "allData",
                "commercialData",
                "credit",
                "boletinConcursal",
                "detailBoletinConcursal",
                "commercialDetailBoletinConcursal",
                default=[],
            )
        )
        detected = len(boletin_concursal) > 0
        out.append(
            {
                "label": "Boletin Concursal",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": len(boletin_concursal),
                "details": boletin_concursal,
            }
        )

        civil_cases = RiskCalculationService._extract_cases(_safe_get(v2, "judicial", "civil", default={}))
        detected = len(civil_cases) > 0
        out.append(
            {
                "label": "Causas Civiles",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": len(civil_cases),
                "details": civil_cases,
            }
        )

        laboral_cases = RiskCalculationService._extract_cases(_safe_get(v2, "judicial", "laboral", default={}))
        detected = len(laboral_cases) > 0
        out.append(
            {
                "label": "Causas Laborales",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": len(laboral_cases),
                "details": laboral_cases,
            }
        )

        cobranza_cases = RiskCalculationService._extract_cases(_safe_get(v2, "judicial", "cobranza", default={}))
        detected = len(cobranza_cases) > 0
        out.append(
            {
                "label": "Causas de Cobranza Laboral",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": len(cobranza_cases),
                "details": cobranza_cases,
            }
        )

        return out

    @staticmethod
    def _evaluate_financiero_tributario_rules(log_entry: dict[str, Any]) -> list[dict[str, Any]]:
        v2 = _as_dict(_safe_get(log_entry, "filteredDetails", "sheriffV2Data", default={}))
        ident = _as_dict(_safe_get(v2, "resumen", "data", "identificacion", default={}))
        out: list[dict[str, Any]] = []

        observaciones = str(_safe_get(ident, "observaciones", default="") or "")
        termino = "término de giro" in observaciones.lower()
        out.append(
            {
                "label": "Término de Giro",
                "impacto": "severo",
                "detected": termino,
                "risk": _risk_from_impact(termino, "severo"),
                "score": 1 if termino else 0,
                "details": observaciones if termino else [],
            }
        )

        equifax = _as_dict(_safe_get(log_entry, "filteredDetails", "equifaxData", default={}))
        icom = _as_list(_safe_get(equifax, "allData", "commercialData", "credit", "debtsSummary", "icom", "commercialIcom", default=[]))
        if not icom:
            icom = _as_list(_safe_get(equifax, "protestosMorosidadesPersonaNaturalList", default=[]))
        detected = len(icom) > 0
        out.append(
            {
                "label": "Protestos y Morosidades",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": len(icom),
                "details": icom,
            }
        )

        inicio_actividades = _safe_get(ident, "inicioActividades", default=None)
        actividad = _as_list(_safe_get(ident, "actividadEconomicaVigente", default=[]))
        missing_inicio = inicio_actividades is None
        out.append(
            {
                "label": "Inicio de Actividades",
                "impacto": "significativo",
                "detected": missing_inicio,
                "risk": _risk_from_impact(missing_inicio, "significativo"),
                "score": 1 if missing_inicio else 0,
                "details": actividad if not missing_inicio else [],
            }
        )

        situacion = str(_safe_get(ident, "situacionActual", default="") or "")
        detected = bool(situacion) and not re.search(r"No se encuentra", situacion, flags=re.IGNORECASE)
        out.append(
            {
                "label": "Contribuyente de difícil fiscalización",
                "impacto": "significativo",
                "detected": detected,
                "risk": _risk_from_impact(detected, "significativo"),
                "score": 1 if detected else 0,
                "details": [{"situacionActual": situacion}] if detected else [],
            }
        )

        return out

    @staticmethod
    def _risk_summary(
        compliance_rules: list[dict[str, Any]],
        legal_rules: list[dict[str, Any]],
        capital_humano_rules: list[dict[str, Any]],
        financiero_tributario_rules: list[dict[str, Any]],
    ) -> dict[str, Any]:
        def _count_detected(rules: list[dict[str, Any]], impacto: str) -> int:
            return sum(1 for r in rules if r.get("impacto") == impacto and bool(r.get("detected")))

        total_severo = _count_detected(compliance_rules, "severo") + _count_detected(legal_rules, "severo") + _count_detected(capital_humano_rules, "severo") + _count_detected(financiero_tributario_rules, "severo")
        total_significativo = _count_detected(compliance_rules, "significativo") + _count_detected(legal_rules, "significativo") + _count_detected(capital_humano_rules, "significativo") + _count_detected(financiero_tributario_rules, "significativo")
        total_detected = (
            sum(1 for r in compliance_rules if r.get("detected"))
            + sum(1 for r in legal_rules if r.get("detected"))
            + sum(1 for r in capital_humano_rules if r.get("detected"))
            + sum(1 for r in financiero_tributario_rules if r.get("detected"))
        )
        total_parameters = len(compliance_rules) + len(legal_rules) + len(capital_humano_rules) + len(financiero_tributario_rules)

        semaphore = "green"
        if total_severo > 0:
            semaphore = "red"
        elif total_significativo > 0.7 * total_parameters:
            semaphore = "red"
        elif total_significativo > 0.5 * total_parameters:
            semaphore = "orange"
        elif total_significativo > 0:
            semaphore = "yellow"

        icon = "🟢"
        desc = "Riego Bajo"
        if semaphore == "red":
            icon = "🔴"
            desc = "Riesgo Crítico"
        elif semaphore == "orange":
            icon = "🟠"
            desc = "Riesgo Alto"
        elif semaphore == "yellow":
            icon = "🟡"
            desc = "Riesgo Medio"

        return {
            "totalSevero": total_severo,
            "totalSignificativo": total_significativo,
            "totalDetected": total_detected,
            "totalParameters": total_parameters,
            "semaphore": semaphore,
            "semaphoreIcon": icon,
            "riskLevelDescription": desc,
        }

    @staticmethod
    def _build_doc_markdown(rut: str, razon_social: str | None, risk_summary: dict[str, Any], all_rules: dict[str, Any]) -> str:
        company = razon_social or "N/A"
        lines = [
            f"# Evaluación de Riesgo\n",
            f"**RUT**: {rut}\n",
            f"**Razón Social**: {company}\n",
            f"**Semáforo**: {risk_summary.get('semaphoreIcon')} ({risk_summary.get('riskLevelDescription')})\n",
            "\n",
            "## Resumen\n",
            f"- Total parámetros: {risk_summary.get('totalParameters')}\n",
            f"- Detectados: {risk_summary.get('totalDetected')}\n",
            f"- Severos detectados: {risk_summary.get('totalSevero')}\n",
            f"- Significativos detectados: {risk_summary.get('totalSignificativo')}\n",
            "\n",
            "## Detalle de Reglas\n",
        ]
        for section_key, title in [
            ("complianceRules", "Compliance"),
            ("legalRules", "Legal"),
            ("capitalHumanoRules", "Capital Humano"),
            ("financieroTributarioRules", "Financiero / Tributario"),
        ]:
            rules = _as_list(_safe_get(all_rules, section_key, default=[]))
            lines.append(f"### {title}\n")
            lines.append("| Parámetro | Impacto | Riesgo | Detectado |\n")
            lines.append("|---|---|---|---|\n")
            for r in rules:
                label = str(_safe_get(r, "label", default="") or "")
                impacto = str(_safe_get(r, "impacto", default="") or "")
                risk = str(_safe_get(r, "risk", default="") or "")
                detected = "SI" if bool(_safe_get(r, "detected", default=False)) else "NO"
                lines.append(f"| {label} | {impacto} | {risk} | {detected} |\n")
            lines.append("\n")
        return "".join(lines)

    @staticmethod
    async def calculate_risk(
        db: AsyncIOMotorDatabase,
        *,
        tenant_id: str,
        rut: str,
        sheriff_v2_data: dict[str, Any],
        filtered_details: dict[str, Any],
        company_general_info: dict[str, Any] | None,
        is_pep_only: bool,
    ) -> dict[str, Any] | None:
        if is_pep_only:
            return None

        clean_rut = sanitize_rut(rut)

        ley21121 = await RiskCalculationService._load_ley_records(db, collection="ley21121s", rut=clean_rut)
        ley20393 = await RiskCalculationService._load_ley_records(db, collection="ley20393s", rut=clean_rut)
        lpaltos = await RiskCalculationService._load_listas_propias(db, collection="lpaltos", tenant_id=tenant_id, rut=clean_rut)
        lpmedios = await RiskCalculationService._load_listas_propias(db, collection="lpmedios", tenant_id=tenant_id, rut=clean_rut)
        antiunion = await RiskCalculationService._load_antiunion_cases(db, rut=clean_rut)
        equifax = await RiskCalculationService._load_equifax_normalized(db, tenant_id=tenant_id, rut=clean_rut)

        razon_social = str(filtered_details.get("razonSocial") or "")
        snifa_sanciones = await RiskCalculationService._find_snifa_by_company_name(
            db, razon_social=razon_social, field_flag="fastCheckSanciones"
        )
        snifa_procesos = await RiskCalculationService._find_snifa_by_company_name(
            db, razon_social=razon_social, field_flag="fastCheckProcesoSancionatorio"
        )

        summary_data = {
            "ley21121Detected": len(ley21121) > 0,
            "ley21121Records": ley21121,
            "ley20393Detected": len(ley20393) > 0,
            "ley20393Records": ley20393,
            "lpaltosDetected": len(lpaltos) > 0,
            "lpaltosRecords": lpaltos,
            "lpmediosDetected": len(lpmedios) > 0,
            "lpmediosRecords": lpmedios,
            "snifaSancionesRecords": snifa_sanciones,
            "snifaProcesoRecords": snifa_procesos,
        }

        log_entry: dict[str, Any] = {
            "rut": clean_rut,
            "tenantId": tenant_id,
            "summaryData": {"data": summary_data},
            "filteredDetails": {**filtered_details, "sheriffV2Data": sheriff_v2_data},
            "companyGeneralInfo": company_general_info or {},
            "antiunionCases": antiunion,
            "equifaxData": equifax or {},
        }

        if equifax:
            log_entry["filteredDetails"]["equifaxData"] = equifax
            if "bolabTypePersonaJuridica" in equifax:
                log_entry["filteredDetails"]["bolabTypePersonaJuridica"] = _as_list(equifax.get("bolabTypePersonaJuridica"))
            if "bolabTypePersonaNatural" in equifax:
                log_entry["filteredDetails"]["bolabTypePersonaNatural"] = _as_list(equifax.get("bolabTypePersonaNatural"))
            if "protestosMorosidadesPersonaNaturalList" in equifax:
                log_entry["filteredDetails"]["protestosMorosidadesPersonaNaturalList"] = _as_list(equifax.get("protestosMorosidadesPersonaNaturalList"))

        compliance_rules = RiskCalculationService._evaluate_compliance_rules(log_entry)
        legal_rules = RiskCalculationService._evaluate_legal_rules(log_entry)
        capital_rules = RiskCalculationService._evaluate_capital_humano_rules(log_entry)
        financiero_rules = RiskCalculationService._evaluate_financiero_tributario_rules(log_entry)

        all_rules = {
            "complianceRules": compliance_rules,
            "legalRules": legal_rules,
            "capitalHumanoRules": capital_rules,
            "financieroTributarioRules": financiero_rules,
        }
        risk_summary = RiskCalculationService._risk_summary(compliance_rules, legal_rules, capital_rules, financiero_rules)
        summary_md = RiskCalculationService._build_doc_markdown(clean_rut, razon_social or None, risk_summary, all_rules)

        return {
            "riskSummary": risk_summary,
            "allRules": all_rules,
            "summaryDocumentMD": summary_md,
            "financialRisk": None,
        }

