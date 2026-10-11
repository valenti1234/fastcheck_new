import React, { useEffect, useState } from 'react';
import { Database, AlertTriangle, Shield, ShieldAlert, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { apiClient } from '../../services/api';

interface SystemInfoPayload {
  db_name: string;
  is_production_db: boolean;
  safety_lock_active: boolean;
  authz_legacy_layer: boolean;
  deployment_env: string;
  warning_prod_forbidden: boolean;
  app?: string;
  version?: string;
}

/**
 * DatabaseBadge
 * Componente PICCOLO colorato da posizionare in FONDO alla sidebar.
 * Mostra in modo IMMEDIATAMENTE VISIVO su quale DB si è connessi:
 *   - VERDE ✅  = STAGING (duxiter-2 / staging/test/dev) — NESSUN RISCHIO
 *   - ROSSO ⛔️ = PRODUCCION (duxiter / prod) — BLOCCO VISIVO FORTE
 *   - GIALLO ⚠️  = UNKNOWN / DB NON RILEVATO
 *
 * Fetcha /api/system/info (endpoint pubblico). Fallback gracefully a "?"
 * in caso di rete offline / backend spento.
 */
const DatabaseBadge: React.FC = () => {
  const [info, setInfo] = useState<SystemInfoPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchInfo = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get<SystemInfoPayload>('/system/info', { timeout: 5000 });
        if (!cancelled) {
          setInfo(res.data);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          const msg = e?.response?.status
            ? `HTTP ${e.response.status}`
            : e?.message || 'Sin conexión backend';
          setError(msg);
          setInfo(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchInfo();
    const id = setInterval(fetchInfo, 60_000); // refresh ogni minuto

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // ---- Determina variante colore e icona in base a payload/error ----
  type Variant = 'staging' | 'production' | 'warning' | 'unknown' | 'offline';
  let variant: Variant = 'unknown';
  if (error || loading && !info) {
    variant = loading ? 'unknown' : 'offline';
  } else if (info) {
    if (info.is_production_db) {
      variant = 'production';
    } else if (info.deployment_env === 'staging' || /-2$|staging|test|dev/i.test(info.db_name)) {
      variant = 'staging';
    } else if (info.deployment_env === 'unknown' && !info.db_name.startsWith('(')) {
      variant = 'warning';
    } else {
      variant = 'unknown';
    }
  }

  // ---- Tailwind styles per variante ----
  const STYLES: Record<Variant, { wrapper: string; badgeDot: string; label: string; sub: string; Title: string; Icon: any; IconStatus: any; statusIcon: string }> = {
    staging: {
      wrapper:
        'border border-emerald-200 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-900/20 rounded-md p-2.5 text-left shadow-[0_0_0_1px_rgba(16,185,129,0.08)]',
      badgeDot: 'bg-emerald-500',
      label: 'text-emerald-800 dark:text-emerald-200 font-semibold',
      sub: 'text-emerald-700 dark:text-emerald-300/80',
      Title: 'ENTORNO SEGURO · STAGING',
      Icon: Database,
      IconStatus: CheckCircle2,
      statusIcon: 'text-emerald-500 dark:text-emerald-400',
    },
    production: {
      wrapper:
        'border border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950/40 rounded-md p-2.5 text-left shadow-[0_0_0_1px_rgba(239,68,68,0.15)] animate-pulse-slow',
      badgeDot: 'bg-red-600 animate-pulse',
      label: 'text-red-800 dark:text-red-200 font-extrabold',
      sub: 'text-red-700 dark:text-red-300',
      Title: '⚠️  ATENCIÓN · ENTORNO PRODUCCIÓN',
      Icon: AlertTriangle,
      IconStatus: ShieldAlert,
      statusIcon: 'text-red-600 dark:text-red-400',
    },
    warning: {
      wrapper:
        'border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 rounded-md p-2.5 text-left',
      badgeDot: 'bg-amber-500',
      label: 'text-amber-800 dark:text-amber-200 font-semibold',
      sub: 'text-amber-700 dark:text-amber-300',
      Title: 'Base de datos desconocida',
      Icon: Database,
      IconStatus: AlertTriangle,
      statusIcon: 'text-amber-500 dark:text-amber-400',
    },
    unknown: {
      wrapper:
        'border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/40 rounded-md p-2.5 text-left',
      badgeDot: 'bg-gray-400',
      label: 'text-gray-700 dark:text-gray-200 font-medium',
      sub: 'text-gray-500 dark:text-gray-400',
      Title: 'Cargando info DB…',
      Icon: Database,
      IconStatus: Loader2,
      statusIcon: 'text-gray-400 dark:text-gray-300',
    },
    offline: {
      wrapper:
        'border border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-800/60 rounded-md p-2.5 text-left',
      badgeDot: 'bg-gray-500',
      label: 'text-gray-800 dark:text-gray-100 font-semibold',
      sub: 'text-gray-600 dark:text-gray-400',
      Title: 'Sin conexión al backend',
      Icon: XCircle,
      IconStatus: XCircle,
      statusIcon: 'text-gray-500 dark:text-gray-400',
    },
  };

  const s = STYLES[variant];

  // ---- Testo badge ----
  let dbLabel = '?';
  let subline = '';
  if (info) {
    dbLabel = info.db_name;
    const pieces: string[] = [];
    if (info.safety_lock_active) pieces.push('safety lock ON');
    else pieces.push('SIN safety lock');
    pieces.push(info.authz_legacy_layer ? 'legacy layer ON' : 'authz v2 FASE2');
    subline = pieces.join(' · ');
  } else if (error) {
    dbLabel = '— offline —';
    subline = error;
  }

  const Title = s.Title;
  const Icon = s.Icon;
  const StatusIcon = s.IconStatus;

  return (
    <div className={s.wrapper} title={`${Title} · DB: ${dbLabel} · ${subline || ''}`} data-testid="db-badge" data-variant={variant}>
      {/* Riga 1: icona + titolo + status */}
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${s.statusIcon} flex-shrink-0`} aria-hidden />
        <span className={`text-[10px] uppercase tracking-[0.08em] ${s.label} flex-1 leading-tight`}>
          {Title}
        </span>
        {variant === 'production' && (
          <ShieldAlert className={`w-4 h-4 ${s.statusIcon} flex-shrink-0`} aria-label="Production detected" />
        )}
        {variant === 'staging' && (
          <Shield className={`w-4 h-4 ${s.statusIcon} flex-shrink-0`} aria-label="Safe staging environment" />
        )}
        {variant === 'offline' && <XCircle className={`w-4 h-4 ${s.statusIcon}`} />}
      </div>

      {/* Riga 2: pallino + nome DB */}
      <div className="flex items-center gap-2.5 mb-0.5">
        <span className={`inline-block h-2 w-2 rounded-full ${s.badgeDot} flex-shrink-0`} aria-hidden />
        <span className={`font-mono text-[12.5px] leading-tight break-all ${s.label}`}>
          {loading && !info ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading…
            </span>
          ) : (
            <>
              <span className="opacity-60">DB</span>{' '}
              <span className="font-bold tracking-tight">{dbLabel}</span>
            </>
          )}
        </span>
        {info && !loading && (
          <StatusIcon className={`w-4 h-4 ml-auto flex-shrink-0 ${s.statusIcon} ${variant === 'unknown' ? 'animate-spin' : ''}`} />
        )}
      </div>

      {/* Riga 3: sottolinea safety lock + authz layer */}
      {subline && (
        <div className={`text-[10.5px] leading-tight pl-4.5 ml-0 ${s.sub}`} style={{ paddingLeft: '18px' }}>
          {subline}
        </div>
      )}
    </div>
  );
};

export default DatabaseBadge;
