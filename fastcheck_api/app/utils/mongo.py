from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from bson import ObjectId


def to_object_id(value: str) -> ObjectId:
    return ObjectId(value)


def jsonable(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value
    if isinstance(value, Mapping):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [jsonable(v) for v in value]
    return value


def sanitize_rut(value: str) -> str:
    raw = (value or "").strip().replace(".", "").replace(" ", "").upper()
    if not raw:
        return ""

    if "-" in raw:
        base, dv = raw.split("-", 1)
        base_digits = "".join(re.findall(r"\d", base))
        dv_clean = "".join(re.findall(r"[0-9K]", dv))[:1]
        if not base_digits:
            return raw
        base_digits = base_digits.lstrip("0") or "0"
        return f"{base_digits}-{dv_clean}" if dv_clean else base_digits

    cleaned = "".join(re.findall(r"[0-9K]", raw))
    if len(cleaned) <= 1:
        return cleaned
    base_digits = "".join(re.findall(r"\d", cleaned[:-1]))
    dv = cleaned[-1]
    base_digits = base_digits.lstrip("0") or "0"
    return f"{base_digits}-{dv}"
