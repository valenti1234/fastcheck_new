from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr = Field(description="User email address.", examples=["user@example.com"])
    password: str = Field(description="User password.", examples=["********"])


class UserOut(BaseModel):
    id: str = Field(description="User id (MongoDB ObjectId as string).", examples=["507f1f77bcf86cd799439011"])
    name: str = Field(description="User display name.", examples=["Jane Doe"])
    email: EmailStr = Field(description="User email address.", examples=["user@example.com"])
    role: str = Field(
        description="User role (source of truth for access control).",
        examples=["tenant_admin"],
    )
    # ==== Campos AUTHZ_V2 (Bloque0.6 T5) — compatibilidad forward ====
    legacy_role: Optional[str] = Field(
        default=None,
        description="(V2) Rol legacy almacenado en la nueva dimension usuarios.",
    )
    authz_v2_migrated: Optional[bool] = Field(
        default=False,
        description="(V2) True si este usuario se encuentra en la migracion authz v2 de MongoDB.",
    )
    roles: Optional[list[str]] = Field(
        default_factory=list,
        description="(V2) Lista de roles plantilla (multi-rol V2).",
    )
    nivel_info: Optional[str] = Field(
        default="RESULTADO_GENERAL",
        description="(V2) Nivel informacion DOCX Tabla 19 (RESULTADO_GENERAL a INFO_COMPLETA).",
    )
    pn_authorized: Optional[bool] = Field(
        default=False,
        description="(V2) True si usuario tiene override GRANT sensible confirmado para party.query.pn.",
    )
    cache_version: Optional[int] = Field(
        default=1,
        description="(V2) Version de cache para invalidacion JWT 7 dias / LRU authz_service.",
    )
    sensibles_confirmados: Optional[list[str]] = Field(
        default_factory=list,
        description="(V2) Lista codigos de permisos sensibles CONFIRMADOS (incluye party.query.pn si aplica).",
    )
    # Dimensiones de alcance V2 (Fase 0 MVP solo 1:1 Q3)
    organizacion_id: Optional[str] = Field(default=None)
    pais_ids: Optional[list[str]] = Field(default_factory=list)
    unidad_ids: Optional[list[str]] = Field(default_factory=list)
    area_id: Optional[str] = Field(default=None)


class LoginResponse(BaseModel):
    token: str = Field(description="Bearer JWT token.", examples=["<jwt>"])
    user: UserOut

