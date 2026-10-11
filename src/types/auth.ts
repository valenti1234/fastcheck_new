export interface User {
  id: string;
  email: string;
  name: string;
  role: 'superuser' | 'tenant_admin' | 'evaluator' | 'read_only' | 'write_only';
  defaultTenantId: string;
  tenants: string[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  companyName: string; // Used to create the initial tenant
}

// ===========================================================================
// AUTHZ V2 TIPOS (Bloque 0.7)
// ===========================================================================
export type NivelInfo =
  | 'RESULTADO_GENERAL'
  | 'RESUMEN_NO_SENSIBLE'
  | 'INFO_NO_SENSIBLE'
  | 'DETALLE_RIESGO'
  | 'INFO_COMPLETA';

export type TipoAlcance =
  | 'PROPIO'
  | 'UNIDAD'
  | 'CONJUNTO_UNIDADES'
  | 'AREA'
  | 'PAIS'
  | 'ORGANIZACION';

export type PropositoAlcance = 'VER' | 'ACTUAR';

export interface AuthzScope {
  tipo_alcance: TipoAlcance;
  proposito: PropositoAlcance;
  unidad_ids?: string[];
  area_id?: string | null;
  pais_id?: string | null;
  organizacion_id?: string | null;
  incluye_descendientes: boolean;
}

export interface PermisoEfectivoV2 {
  codigo: string;
  permitido: boolean;
  origen: string; // 'ROL:ADMIN_GENERAL' | 'OVERRIDE_GRANT' | 'OVERRIDE_DENY' | 'DENY_DEFAULT'
  es_sensible: boolean;
}

export interface AuthzUser {
  // campos legacy (compatibilidad)
  id: string;
  email: string;
  name: string;
  role: 'superuser' | 'tenant_admin' | 'evaluator' | 'read_only' | 'write_only';

  // campos V2 (Bloque 0.6 T5 extendidos desde /auth/me)
  legacy_role?: string;
  authz_v2_migrated: boolean;
  roles: string[];
  nivel_info: NivelInfo;
  pn_authorized: boolean;
  cache_version: number;
  sensibles_confirmados: string[];

  // alcances Q2/Q3
  organizacion_id?: string | null;
  pais_ids: string[];
  unidad_ids: string[];
  area_id?: string | null;
}

export interface AuthzPermissionsResponse {
  perms: PermisoEfectivoV2[];
  total: number;
}

export interface AuthzScopesResponse {
  ver: AuthzScope[];
  actuar: AuthzScope[];
}

export interface UserRoleUpdateRequest {
  roles: string[];
  motivo?: string;
}

export interface UserGrantSensibleRequest {
  permiso_codigo: string; // por defecto: 'party.query.pn'
  nivel?: 1 | 2 | 3;       // Q4 default: 1 F0/F1
  password_otorgante: string;
  confirm_awareness: boolean;
  observacion?: string;
}

export interface UserAlcanceUpdateRequest {
  proposito: PropositoAlcance;
  alcances: AuthzScope[];
}
