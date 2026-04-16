from __future__ import annotations

import datetime as dt
import re
from typing import Any

import bcrypt
import jwt

from fastcheck_api.app.core.config import settings


class AuthError(Exception):
    pass


_DURATION_RE = re.compile(r"^(?P<count>\d+)(?P<unit>[smhd])$")


def _parse_expires_in(value: str) -> dt.timedelta:
    match = _DURATION_RE.match(value.strip())
    if not match:
        return dt.timedelta(days=7)
    count = int(match.group("count"))
    unit = match.group("unit")
    if unit == "s":
        return dt.timedelta(seconds=count)
    if unit == "m":
        return dt.timedelta(minutes=count)
    if unit == "h":
        return dt.timedelta(hours=count)
    return dt.timedelta(days=count)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(*, user_id: str, email: str, role: str, tenant_id: str) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    exp = now + _parse_expires_in(settings.jwt_expires_in)
    payload = {
        "id": user_id,
        "email": email,
        "role": role,
        "tenant": tenant_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict[str, Any]:
    try:
        decoded = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        if not isinstance(decoded, dict):
            raise AuthError("Invalid token payload")
        return decoded
    except jwt.ExpiredSignatureError as e:
        raise AuthError("Token expired") from e
    except jwt.InvalidTokenError as e:
        raise AuthError("Invalid token") from e
