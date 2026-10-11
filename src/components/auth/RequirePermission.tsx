import React, { createContext, useContext, useMemo } from 'react';
import { AuthzScope, NivelInfo, PermisoEfectivoV2 } from '../../types/auth';

interface Props {
  accion: string;
  // si fallback se renderiza cuando NO tiene permiso. Por defecto null
  fallback?: React.ReactNode;
  // Si se proporciona onDeny reemplaza cualquier fallback
  onDeny?: () => React.ReactNode;
  children: React.ReactNode;
}

/**
 * <RequirePermission> — simple guard componente (Bloque0.7 S1).
 *
 * Hace 2 cosas respetando orden pila de seguridad:
 *  a) si tiene authz v2: usa el hook de useHasPermission (dentro del contexto)
 *  b) si no hay contexto: fallback al rol legacy (superuser bypass total).
 */
import { useAuth } from '../../contexts/AuthContext';

const RequirePermission: React.FC<Props> = ({ accion, fallback = null, onDeny, children }) => {
  const { hasPermission, user } = useAuth() as any;

  // Fallback legacy (si el contexto no ha cargado authz v2 aun)
  const permitidoLegacy = useMemo(() => {
    if (!user) return false;
    // lista de acciones que necesita superuser si o si (admin.*). El resto bypass por ahora en legacy.
    if (accion.startsWith('admin.') && user.role !== 'superuser') return false;
    if (accion === 'party.query.pn') return user.role === 'superuser';
    return true;
  }, [user, accion]);

  const tiene = typeof hasPermission === 'function' ? hasPermission(accion) : permitidoLegacy;
  if (!tiene) {
    if (typeof onDeny === 'function') return <>{onDeny()}</>;
    return <>{fallback}</>;
  }
  return <>{children}</>;
};

export default RequirePermission;
