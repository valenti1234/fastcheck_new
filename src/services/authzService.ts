import { apiClient } from './api';
import {
  AuthzPermissionsResponse,
  AuthzScopesResponse,
  AuthzUser,
  UserAlcanceUpdateRequest,
  UserGrantSensibleRequest,
  UserRoleUpdateRequest,
} from '../types/auth';
import logger from '../utils/logger';

/**
 * authzService.ts
 * Servicio API de Autorización V2 (Bloque 0.7 S0).
 * Todos los métodos hablan contra /v2/authz/*, /v2/users/*
 */
export class AuthzService {
  /** GET /v2/authz/permissions -> lista de permisos efectivos del current user */
  static async getPermissions(): Promise<AuthzPermissionsResponse> {
    try {
      const res = await apiClient.get('/v2/authz/permissions');
      return res.data as AuthzPermissionsResponse;
    } catch (e: any) {
      logger.warn('AuthzService.getPermissions failed:', e.message);
      return { perms: [], total: 0 };
    }
  }

  /** GET /v2/authz/scopes -> alcances VER/ACTUAR del current user */
  static async getScopes(): Promise<AuthzScopesResponse> {
    try {
      const res = await apiClient.get('/v2/authz/scopes');
      return res.data as AuthzScopesResponse;
    } catch (e: any) {
      logger.warn('AuthzService.getScopes failed:', e.message);
      return { ver: [], actuar: [] };
    }
  }

  /**
   * GET /v2/authz/me — versión ENRIQUECIDA AuthzUser con campos V2
   * (NOTA: /auth/me (legacy) ya devuelve estos campos en Bloque 0.6 T5.
   *  Este método es un wrapper tipado que extrae AuthzUser.)
   */
  static async getMeAuthz(): Promise<AuthzUser> {
    const res = await apiClient.get('/auth/me');
    return res.data as AuthzUser;
  }

  /** PUT /v2/users/{id}/roles — reemplazo roles */
  static async updateUserRoles(userId: string, payload: UserRoleUpdateRequest): Promise<{ ok: true; new_roles: string[] }> {
    const res = await apiClient.put(`/v2/users/${userId}/roles`, payload);
    return res.data;
  }

  /**
   * POST /v2/users/{id}/grant-sensible
   * Doble intención: envía password otorgante + confirm.awareness.
   * Q4 FASE 0/F1: nivel hardcoded a 1 por defecto.
   */
  static async grantSensible(userId: string, payload: UserGrantSensibleRequest): Promise<{ ok: true }> {
    const res = await apiClient.post(`/v2/users/${userId}/grant-sensible`, {
      ...payload,
      nivel: payload.nivel ?? 1,
      permiso_codigo: payload.permiso_codigo || 'party.query.pn',
    });
    return res.data;
  }

  /** DELETE /v2/users/{id}/permiso-override/{permiso_codigo} — revocar sensible */
  static async revokeOverride(userId: string, permiso_codigo: string): Promise<{ ok: true }> {
    const res = await apiClient.delete(`/v2/users/${userId}/permiso-override/${permiso_codigo}`);
    return res.data;
  }

  /** GET /v2/users/{id}/alcance */
  static async getUserAlcance(userId: string): Promise<AuthzScopesResponse> {
    const res = await apiClient.get(`/v2/users/${userId}/alcance`);
    return res.data as AuthzScopesResponse;
  }

  /** PUT /v2/users/{id}/alcance */
  static async setUserAlcance(userId: string, payload: UserAlcanceUpdateRequest): Promise<{ ok: true }> {
    const res = await apiClient.put(`/v2/users/${userId}/alcance`, payload);
    return res.data;
  }
}

export default AuthzService;
