import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { AuthService } from '../services/authService';
import { AuthzService } from '../services/authzService';
import { logger } from '../utils/logger';
import type {
  AuthzScope,
  AuthzUser,
  NivelInfo,
  PermisoEfectivoV2,
  PropositoAlcance,
} from '../types/auth';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'superuser' | 'tenant_admin' | 'evaluator' | 'read_only' | 'write_only';
}

interface AuthContextType {
  // legacy SOT backward compat
  user: User | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string, email: string, password: string }) => Promise<void>;
  logout: () => Promise<void>;
  handleOAuthCallback: (token: string, provider: string) => Promise<void>;

  // ===== AUTHZ V2 EXTENSION (Bloque 0.7 S0) =====
  authzUser?: AuthzUser | null;
  permissions?: PermisoEfectivoV2[];
  scopes?: { ver: AuthzScope[]; actuar: AuthzScope[] };
  authzLoading?: boolean;

  // hooks de conveniencia
  hasPermission?: (accion: string) => boolean;
  getScopes?: (proposito: PropositoAlcance) => AuthzScope[];
  useProyeccionNivel?: (opts?: { nivelRequerido?: NivelInfo; accion?: string }) => {
    nivelAutorizado: NivelInfo;
    pnGate: boolean;
    sensibleAutorizado: boolean;
    filterColumns: <T extends { accessor: string; [k: string]: any }>(cols: T[]) => T[];
  };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const NIVEL_INFO_ORDEN: Record<NivelInfo, number> = {
  RESULTADO_GENERAL: 1,
  RESUMEN_NO_SENSIBLE: 2,
  INFO_NO_SENSIBLE: 3,
  DETALLE_RIESGO: 4,
  INFO_COMPLETA: 5,
};
const ACCION_REQUIERE_NIVEL: Record<string, NivelInfo> = {
  'fastcheck.query': 'DETALLE_RIESGO',
  'audit.view': 'INFO_NO_SENSIBLE',
  'export.certificate': 'RESUMEN_NO_SENSIBLE',
  'export.detail': 'DETALLE_RIESGO',
  'third_party.approve': 'DETALLE_RIESGO',
  'third_party.reject': 'DETALLE_RIESGO',
  'exception.authorize': 'INFO_COMPLETA',
  'risk.lists.manage': 'INFO_COMPLETA',
  'risk.params.define': 'INFO_COMPLETA',
  'risk.thresholds.edit': 'INFO_COMPLETA',
  'risk.formula.edit': 'INFO_COMPLETA',
  'admin.users': 'INFO_NO_SENSIBLE',
  'admin.structure': 'INFO_NO_SENSIBLE',
  'admin.grant_sensitive': 'INFO_COMPLETA',
};
const SENSIBLES_RAW_GATE = [
  'risk.params.define', 'risk.thresholds.edit', 'risk.formula.edit',
  'risk.lists.manage', 'admin.grant_sensitive', 'exception.authorize',
];

/** Columnas permitidas por nivel info en tablas resultados FastCheck (S3) */
const COLS_WL_NIVEL: Record<NivelInfo, Set<string>> = {
  RESULTADO_GENERAL: new Set([
    'rut', 'razonSocial', 'nombre', 'semaphore', 'nivelRiesgo',
    'fecha', 'createdAt', 'actions', 'select',
  ]),
  RESUMEN_NO_SENSIBLE: new Set([
    'rut', 'razonSocial', 'nombre', 'semaphore', 'nivelRiesgo',
    'fecha', 'createdAt', 'totalSevero', 'totalMedio', 'totalBajo',
    'causasCount', 'tenantId', 'actions', 'select',
  ]),
  INFO_NO_SENSIBLE: new Set([
    'rut', 'razonSocial', 'nombre', 'semaphore', 'nivelRiesgo',
    'fecha', 'createdAt', 'totalSevero', 'totalMedio', 'totalBajo',
    'causasCount', 'tenantId', 'companyGeneralInfo', 'financialRisk',
    'sheriffLogSummary', 'sourcesUsed', 'aiSummary', 'noteTags', 'actions', 'select',
  ]),
  DETALLE_RIESGO: new Set([
    'rut', 'razonSocial', 'nombre', 'semaphore', 'nivelRiesgo',
    'fecha', 'createdAt', 'totalSevero', 'totalMedio', 'totalBajo',
    'causasCount', 'tenantId', 'companyGeneralInfo', 'financialRisk',
    'sheriffLogSummary', 'sheriffLogDetails', 'sourcesUsed', 'aiSummary',
    'evaluationsHistory', 'allRules', 'riskDetails', 'noteTags', 'actions', 'select',
  ]),
  INFO_COMPLETA: new Set([
    '*', // WILDCARD: todo permitido
  ]),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // AUTHZ V2 states
  const [authzUser, setAuthzUser] = useState<AuthzUser | null>(null);
  const [permissions, setPermissions] = useState<PermisoEfectivoV2[]>([]);
  const [scopes, setScopes] = useState<{ ver: AuthzScope[]; actuar: AuthzScope[] }>({ ver: [], actuar: [] });
  const [authzLoading, setAuthzLoading] = useState(false);

  const loadAuthzV2 = useCallback(async (userId?: string) => {
    if (!userId) return;
    try {
      setAuthzLoading(true);
      const [perms, scopesRes, meV2] = await Promise.allSettled([
        AuthzService.getPermissions(),
        AuthzService.getScopes(),
        AuthzService.getMeAuthz(),
      ]);
      if (perms.status === 'fulfilled') setPermissions(perms.value.perms);
      if (scopesRes.status === 'fulfilled') setScopes(scopesRes.value);
      if (meV2.status === 'fulfilled') setAuthzUser(meV2.value);
    } catch (e: any) {
      logger.warn('AuthContext.loadAuthzV2 failed (ignored for backward compat):', e.message);
    } finally {
      setAuthzLoading(false);
    }
  }, []);

  // Function to fetch user data using shared AuthService and axios client
  const fetchUserData = async () => {
    try {
      const { user } = await AuthService.getCurrentUser();
      // Safety: se /me non torna id ma abbiamo token, proviamo a recuperarlo da localStorage user cached
      const cachedStr = localStorage.getItem('user');
      const cached = cachedStr ? (() => { try { return JSON.parse(cachedStr); } catch { return null; } })() : null;
      const mergedUser: User | null = user
        ? { ...(cached || {}), ...user, id: (user as any).id || (user as any)._id || cached?.id || cached?._id }
        : cached;
      if (mergedUser) {
        setUser(mergedUser as User);
        setIsAuthenticated(true);
        localStorage.setItem('user', JSON.stringify(mergedUser));
        const uid = (mergedUser as any).id || (mergedUser as any)._id;
        if (uid) await loadAuthzV2(uid);
      } else {
        throw new Error('no_user_returned');
      }
    } catch (error) {
      logger.error('Error fetching user data:', error);
      // --- SOFT FALLBACK (NO logout istantaneo!): se abbiamo token E user cached → usiamo quello
      const cachedStr = localStorage.getItem('user');
      const cached = cachedStr ? (() => { try { return JSON.parse(cachedStr); } catch { return null; } })() : null;
      const tok = localStorage.getItem('token');
      if (tok && cached && cached.id) {
        setUser(cached);
        setIsAuthenticated(true);
        loadAuthzV2(cached.id).catch(() => {});
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
        setIsAuthenticated(false);
        setAuthzUser(null); setPermissions([]); setScopes({ ver: [], actuar: [] });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUserStr = localStorage.getItem('user');
    let storedUser: User | null = null;
    if (storedUserStr) {
      try { storedUser = JSON.parse(storedUserStr); } catch { storedUser = null; }
    }
    // 1) IDRATAZIONE ISTANTANEA DA LOCALSTORAGE PRIMA DI /me → menu MAI VUOTO dopo refresh
    if (storedToken && storedUser && storedUser.id) {
      setToken(storedToken);
      setUser(storedUser);
      setIsAuthenticated(true);
    } else if (storedToken) {
      setToken(storedToken);
    }
    // 2) Fetch /me in background per aggiornare dati (se fallisce, resta cached user)
    if (storedToken) {
      fetchUserData();
    } else {
      setIsAuthenticated(false);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = async (data: { name: string, email: string, password: string }) => {
    try {
      const response = await AuthService.register(data as any);
      localStorage.setItem('token', response.token);
      const userObj = { ...(response.user || {}) };
      localStorage.setItem('user', JSON.stringify(userObj));
      setToken(response.token);
      setUser(userObj);
      setIsAuthenticated(true);
      toast.success('Registro exitoso');
      const uid = (userObj as any).id || (userObj as any)._id;
      if (uid) await loadAuthzV2(uid);
    } catch (error: any) {
      toast.error(error.message || 'Error de registro');
      throw error;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await AuthService.login({ email, password });
      localStorage.setItem('token', response.token);
      const userObj: User = response.user && (response.user as any).id
        ? response.user
        : { ...(response.user || {}), id: (response.user as any)?._id || (response.user as any)?.id || '' };
      localStorage.setItem('user', JSON.stringify(userObj));
      setToken(response.token);
      setUser(userObj);
      setIsAuthenticated(true);
      toast.success('Inicio de sesión exitoso');
      const uid = (userObj as any).id || (userObj as any)._id;
      if (uid) await loadAuthzV2(uid);
    } catch (error: any) {
      toast.error(error.message || 'Error de inicio de sesión');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await AuthService.logout();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null); setUser(null); setIsAuthenticated(false);
      setAuthzUser(null); setPermissions([]); setScopes({ ver: [], actuar: [] });
      toast.success('Logged out successfully');
    } catch (error) {
      logger.error('Logout error:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null); setUser(null); setIsAuthenticated(false);
      setAuthzUser(null); setPermissions([]); setScopes({ ver: [], actuar: [] });
      toast.success('Logged out successfully');
    }
  };

  const handleOAuthCallback = async (token: string, provider: string) => {
    try {
      localStorage.setItem('token', token);
      setToken(token);
      await fetchUserData();
      toast.success(`Sesión iniciada con ${provider}`);
    } catch (error: any) {
      logger.error('OAuth callback error:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null); setUser(null); setIsAuthenticated(false);
      setAuthzUser(null); setPermissions([]); setScopes({ ver: [], actuar: [] });
      throw error;
    }
  };

  // ============ AUTHZ V2 HOOKS ============
  const hasPermission = useCallback((accion: string): boolean => {
    // 1) Wildcard legacy superuser bypass para permisos no sensibles
    if (user?.role === 'superuser' && !accion.endsWith('.pn') && !SENSIBLES_RAW_GATE.includes(accion)) {
      return true;
    }
    // 2) Consulta por permisos_efectivos cacheados (SOT)
    if (permissions && permissions.length > 0) {
      const match = permissions.find((p) => p.codigo === accion);
      if (match) return match.permitido;
    }
    // 3) Fallback legacy ROLE_PERMISSIONS (para acciones no migradas aún)
    const LEGACY_ROLE_PERMS: Record<string, string[]> = {
      superuser: ['user:create','user:read','user:update','user:delete','evaluation:create','evaluation:read','evaluation:update','evaluation:delete','evaluation:bulk','company:read','company:update','rut:lookup','rut:read','sheriff:logs:read','tenant:read','tenant:update','tenant:users:manage','admin:dashboard','admin:settings','admin:logs','notification:read','notification:create'],
      tenant_admin: ['user:create','user:read','user:update','user:delete','evaluation:create','evaluation:read','evaluation:update','evaluation:delete','evaluation:bulk','company:read','company:update','rut:lookup','rut:read','sheriff:logs:read','tenant:read','tenant:update','tenant:users:manage','admin:dashboard','notification:read','notification:create'],
      evaluator: ['user:read','evaluation:create','evaluation:read','evaluation:update','evaluation:delete','evaluation:bulk','company:read','rut:lookup','rut:read','sheriff:logs:read','tenant:read','notification:read'],
      read_only: ['user:read','evaluation:read','company:read','rut:read','sheriff:logs:read','tenant:read','notification:read'],
      write_only: ['evaluation:create','evaluation:read','company:read','rut:lookup','tenant:read','notification:create'],
    };
    return LEGACY_ROLE_PERMS[user?.role || '']?.includes(accion) || false;
  }, [user, permissions]);

  const getScopes = useCallback((proposito: PropositoAlcance): AuthzScope[] => {
    return proposito === 'VER' ? scopes.ver : scopes.actuar;
  }, [scopes]);

  const useProyeccionNivel = useCallback((opts?: { nivelRequerido?: NivelInfo; accion?: string }) => {
    const nivelUsuario: NivelInfo = (authzUser?.nivel_info as NivelInfo) || 'RESULTADO_GENERAL';
    const porAccion = opts?.accion ? ACCION_REQUIERE_NIVEL[opts.accion] : undefined;
    const req: NivelInfo = opts?.nivelRequerido || porAccion || 'RESULTADO_GENERAL';
    const ordenUser = NIVEL_INFO_ORDEN[nivelUsuario] || 1;
    const ordenReq = NIVEL_INFO_ORDEN[req] || 1;
    const ordenAut = Math.min(ordenUser, ordenReq);
    const nivelAutorizado = (Object.keys(NIVEL_INFO_ORDEN) as NivelInfo[]).find(
      (k) => NIVEL_INFO_ORDEN[k] === ordenAut,
    ) || 'RESULTADO_GENERAL';

    const pnGate = !!authzUser?.pn_authorized || (
      authzUser?.sensibles_confirmados || []
    ).includes('party.query.pn');

    const sensibleAutorizado =
      SENSIBLES_RAW_GATE.every((cod) => (authzUser?.sensibles_confirmados || []).includes(cod))
      || user?.role === 'superuser';

    const filterColumns = <T extends { accessor: string; [k: string]: any }>(cols: T[]): T[] => {
      const wl = COLS_WL_NIVEL[nivelAutorizado];
      if (wl.has('*')) return cols;
      return cols.filter((c) => wl.has(c.accessor));
    };

    return { nivelAutorizado, pnGate, sensibleAutorizado, filterColumns };
  }, [authzUser, user]) as NonNullable<AuthContextType['useProyeccionNivel']>;

  const value: AuthContextType = {
    user, token, loading, isAuthenticated, login, register, logout, handleOAuthCallback,
    authzUser, permissions, scopes, authzLoading,
    hasPermission, getScopes, useProyeccionNivel,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return {
    ...context,
    // Fallbacks seguros para hooks AUTHZ V2 (en tests o contexts sin inicializar)
    authzUser: context.authzUser ?? null,
    permissions: context.permissions ?? [],
    scopes: context.scopes ?? { ver: [], actuar: [] },
    authzLoading: context.authzLoading ?? false,
    hasPermission: context.hasPermission ?? (() => false),
    getScopes: context.getScopes ?? (() => []),
    useProyeccionNivel: context.useProyeccionNivel ?? (() => ({
      nivelAutorizado: 'RESULTADO_GENERAL' as NivelInfo,
      pnGate: false,
      sensibleAutorizado: false,
      filterColumns: (cols) => cols,
    })),
  };
};
