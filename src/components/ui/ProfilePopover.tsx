import React, { useEffect, useRef, useState } from 'react';
import { X, Shield, Building2, CreditCard, KeyRound, History, User as UserIcon, AlertTriangle, CheckCircle2, Lock, Crown, Users, Activity } from 'lucide-react';
import {
  UserProfileEnriched,
  userProfileApi,
  ProfilePermisoItem,
  ProfilePlanPool,
} from '../../services/api';
import logger from '../../utils/logger';

interface ProfilePopoverProps {
  open: boolean;
  onClose: () => void;
}

const fmtCLP = (n: number): string => {
  try {
    return new Intl.NumberFormat('es-CL').format(Number.isFinite(n) ? n : 0);
  } catch {
    return String(n ?? 0);
  }
};

const PLAN_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  BASIC:      { bg: 'bg-gray-50 dark:bg-gray-800', border: 'border-gray-300 dark:border-gray-600', text: 'text-gray-700 dark:text-gray-200', dot: 'bg-gray-500' },
  STARTUP:    { bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  PRO:        { bg: 'bg-blue-50 dark:bg-blue-900/30', border: 'border-blue-300 dark:border-blue-700', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  BUSINESS:   { bg: 'bg-violet-50 dark:bg-violet-900/30', border: 'border-violet-300 dark:border-violet-700', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  ENTERPRISE: { bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-400 dark:border-amber-600', text: 'text-amber-800 dark:text-amber-300', dot: 'bg-amber-500' },
};

const getPlanStyle = (codigo?: string | null) => {
  const key = String(codigo || 'BASIC').toUpperCase();
  return PLAN_STYLES[key] || PLAN_STYLES.BASIC;
};

const roleLabel = (r: string) => {
  switch (String(r || '').toLowerCase()) {
    case 'superuser': return { text: 'Superadmin', cls: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700' };
    case 'tenant_admin': return { text: 'Admin Tenant', cls: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700' };
    case 'admin': return { text: 'Administrador', cls: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700' };
    case 'user': return { text: 'Usuario', cls: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600' };
    case 'auditor': return { text: 'Auditor', cls: 'bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700' };
    default: return { text: r || '—', cls: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600' };
  }
};

const SectionCard: React.FC<{ title: string; icon: React.ReactNode; accent: string; children: React.ReactNode }> = ({ title, icon, accent, children }) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/60 shadow-sm">
    <div className={`flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-700/60 rounded-t-xl ${accent}`}>
      {icon}
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
    </div>
    <div className="p-4 space-y-3 text-sm">{children}</div>
  </div>
);

const KV: React.FC<{ k: string; v: React.ReactNode; mono?: boolean }> = ({ k, v, mono }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap">{k}</span>
    <span className={`text-right text-gray-800 dark:text-gray-100 ${mono ? 'font-mono text-xs' : ''}`}>{v}</span>
  </div>
);

const PlanPoolView: React.FC<{ pool: ProfilePlanPool | null | undefined }> = ({ pool }) => {
  if (!pool) return <p className="text-xs text-gray-500 dark:text-gray-400 italic">Sin pool de créditos asignado.</p>;
  const st = getPlanStyle(pool.plan_codigo);
  const mensual = pool.creditos_mensuales_org || 0;
  const usados = pool.creditos_usados || 0;
  const saldo = pool.saldo_actual || 0;
  const overshoot = pool.overshoot_actual || 0;
  const overMax = pool.overshoot_pct_max || 150;
  const pct = mensual > 0 ? Math.min(100, Math.round((usados / mensual) * 100)) : 0;
  const overPct = mensual > 0 ? Math.round(((usados - mensual) / mensual) * 100) : 0;
  const inOvershoot = usados > mensual;
  const danger = overshoot > 0 && overPct >= overMax - 1;

  return (
    <div className={`rounded-lg border px-3 py-3 ${st.bg} ${st.border}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${st.dot}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${st.text}`}>{pool.nombre_plan || pool.plan_codigo}</span>
        </div>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">Nivel {pool.nivel_pool_plan}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div><span className="text-gray-500 dark:text-gray-400">Mensuales:</span> <b className="text-gray-800 dark:text-gray-100">{fmtCLP(mensual)}</b></div>
        <div><span className="text-gray-500 dark:text-gray-400">Saldo:</span> <b className="text-gray-800 dark:text-gray-100">{fmtCLP(saldo)}</b></div>
        <div><span className="text-gray-500 dark:text-gray-400">Usados:</span> <b className="text-gray-800 dark:text-gray-100">{fmtCLP(usados)}</b></div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">Overshoot:</span>{' '}
          <b className={danger ? 'text-red-600 dark:text-red-400' : inOvershoot ? 'text-orange-600 dark:text-orange-400' : 'text-gray-800 dark:text-gray-100'}>
            {fmtCLP(overshoot)}
          </b>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400 mb-1">
          <span>Consumo</span>
          <span>{inOvershoot ? `Overshoot ${overPct}% / ${overMax}%` : `${pct}%`}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className={`h-full ${danger ? 'bg-red-500' : inOvershoot ? 'bg-orange-500' : 'bg-primary-500 dark:bg-primary-400'}`}
            style={{ width: `${inOvershoot ? 100 : pct}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const PermisosView: React.FC<{ data: UserProfileEnriched['permisos'] | null | undefined }> = ({ data }) => {
  if (!data) return null;
  const lista: ProfilePermisoItem[] = data.lista || [];
  const grants = data.overridesGranted || [];
  const denies = data.overridesDenied || [];
  const roles = data.vienePorRoles || [];
  const byCat = lista.reduce<Record<string, ProfilePermisoItem[]>>((acc, p) => {
    const c = p.categoria || 'SIN_CATEGORIA';
    (acc[c] = acc[c] || []).push(p);
    return acc;
  }, {});

  const origenOf = (p: ProfilePermisoItem): 'ROLE' | 'GRANT' | 'DENY' | 'WILDCARD' => {
    if (denies.includes(p.codigo)) return 'DENY';
    if (grants.includes(p.codigo)) return 'GRANT';
    if (roles.includes(p.codigo)) return 'ROLE';
    return 'WILDCARD';
  };

  const origenBadge = (o: string) => {
    switch (o) {
      case 'DENY': return <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800">DENY</span>;
      case 'GRANT': return <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800">+GRANT</span>;
      case 'ROLE': return <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800">ROLE</span>;
      default: return <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800">WILDCARD</span>;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-700 text-primary-700 dark:text-primary-300 text-xs font-semibold">
          <KeyRound className="h-3.5 w-3.5" />
          {data.totalPermisos} permisos
        </span>
        <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-semibold">
          <Lock className="h-3.5 w-3.5" />
          {data.totalSensibles} sensibles
        </span>
        {roles.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-xs">
            Por rol: <b>{roles.length}</b>
          </span>
        )}
        {grants.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" /> Grants: <b>{grants.length}</b>
          </span>
        )}
        {denies.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs">
            <AlertTriangle className="h-3.5 w-3.5" /> Denies: <b>{denies.length}</b>
          </span>
        )}
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
        {Object.entries(byCat).map(([cat, items]) => (
          <div key={cat} className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40">
            <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700/60">
              {cat} <span className="ml-1 text-gray-400">({items.length})</span>
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {items.map((p) => {
                const o = origenOf(p);
                return (
                  <li key={p.codigo} className="flex items-start justify-between gap-2 px-2.5 py-1.5 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {p.es_sensible ? (
                          <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold bg-red-500 text-white">S</span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">N</span>
                        )}
                        <span className="font-mono font-semibold text-gray-800 dark:text-gray-100 truncate">{p.codigo}</span>
                        {origenBadge(o)}
                      </div>
                      {p.descripcion && (
                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 leading-snug line-clamp-2">{p.descripcion}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

const AuditoriaView: React.FC<{ items: UserProfileEnriched['auditoriasUltimas10'] | null | undefined }> = ({ items }) => {
  const arr = items || [];
  if (arr.length === 0) return <p className="text-xs text-gray-500 dark:text-gray-400 italic">Sin auditorías registradas.</p>;
  const fmt = (s?: string) => {
    if (!s) return '—';
    try { const d = new Date(s); if (Number.isNaN(d.getTime())) return s; return d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }); } catch { return s; }
  };
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-56 overflow-y-auto pr-1 custom-scrollbar text-xs">
      {arr.map((a, i) => {
        const fecha = a.fecha || a.createdAt || a.ts;
        const accion = a.accion || a.action || a.event_type || a.tipo || '—';
        const entidad = a.entidad || a.entity || a.collection || '—';
        return (
          <li key={a._id || `${accion}-${i}`} className="flex items-start justify-between gap-2 py-1.5">
            <div className="min-w-0">
              <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">{accion}</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                {entidad}{a.entidad_id ? ` · ${String(a.entidad_id).slice(0, 12)}` : ''}
              </div>
            </div>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap tabular-nums">{fmt(fecha as any)}</span>
          </li>
        );
      })}
    </ul>
  );
};

const ProfilePopover: React.FC<ProfilePopoverProps> = ({ open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<UserProfileEnriched | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await userProfileApi.getMyProfileEnriched();
        if (alive) setData(res);
      } catch (e: any) {
        logger.error('Profile load error', e);
        if (alive) setError(e?.response?.data?.detail?.message || e?.message || 'No se pudo cargar el perfil');
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open, onClose]);

  if (!open) return null;

  const user = data?.user;
  const org = data?.organizacion;
  const role = roleLabel(user?.role || '');
  const hist = data?.historialConsultas;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 pointer-events-none">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] pointer-events-auto" onClick={onClose} />

      <div
        ref={panelRef}
        className="pointer-events-auto relative w-full
                   sm:w-[94%] sm:max-w-2xl
                   md:w-[90%] md:max-w-4xl
                   lg:max-w-5xl
                   xl:max-w-6xl
                   2xl:max-w-7xl
                   h-auto max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700
                   animate-in slide-in-from-bottom-4 sm:zoom-in-95 fade-in duration-200"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-primary-50 to-transparent dark:from-primary-900/30">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-white font-bold text-base shadow-inner flex-shrink-0">
              {loading ? <UserIcon className="h-5 w-5 animate-pulse" /> : (user?.avatarInicial || user?.name?.charAt(0) || 'U')}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 dark:text-white truncate">
                {loading ? 'Cargando perfil…' : (user?.name || 'Perfil')}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {loading ? '…' : (user?.email || '')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800 transition"
            aria-label="Cerrar perfil"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5 space-y-4 custom-scrollbar max-h-[calc(92vh-80px)]">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/30 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Error al cargar perfil</div>
              <div className="mt-1 text-xs opacity-90">{error}</div>
            </div>
          )}

          <SectionCard title="Información personal" icon={<UserIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />} accent="bg-primary-50/60 dark:bg-primary-900/20">
            {loading || !user ? (
              <div className="space-y-2">
                {[0,1,2,3].map(i => <div key={i} className="h-3 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />)}
              </div>
            ) : (
              <>
                <KV k="Nombre" v={user.name || '—'} />
                <KV k="Email" v={user.email} />
                <KV k="Rol" v={<span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${role.cls}`}>{role.text}{user.isSuperuser && <span className="ml-1 inline-flex items-center gap-0.5"><Crown className="h-3 w-3" /></span>}</span>} />
                <KV k="Activo" v={user.isActive ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Activo</span> : <span className="text-red-600 dark:text-red-400">Inactivo</span>} />
                <KV k="Cache Version" v={<span className="font-mono">v{user.cacheVersion}</span>} mono />
                {user.createdAt && <KV k="Creado" v={new Date(user.createdAt).toLocaleDateString('es-CL')} />}
                <KV k="ID" v={user._id} mono />
              </>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Organización" icon={<Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />} accent="bg-indigo-50/60 dark:bg-indigo-900/20">
              {loading ? (
                <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-3 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />)}</div>
              ) : !org ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">Sin organización.</p>
              ) : (
                <>
                  <KV k="Nombre" v={org.name} />
                  <KV k="Estado" v={org.isActive ? <span className="text-emerald-600 dark:text-emerald-400">Activa</span> : <span className="text-red-600 dark:text-red-400">Inactiva</span>} />
                  <KV k="Usuarios" v={<span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-gray-500" />{org.usuariosCount}</span>} />
                  <KV k="Evaluaciones" v={<span className="inline-flex items-center gap-1"><Activity className="h-3.5 w-3.5 text-gray-500" />{fmtCLP(org.evaluacionesUsadas)}</span>} />
                  <KV k="ID" v={org._id} mono />
                </>
              )}
            </SectionCard>

            <SectionCard title="Plan y créditos" icon={<CreditCard className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />} accent="bg-emerald-50/60 dark:bg-emerald-900/20">
              {loading ? (
                <div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-3 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />)}</div>
              ) : (
                <PlanPoolView pool={data?.planPool} />
              )}
            </SectionCard>
          </div>

          <SectionCard title="Permisos RBAC" icon={<Shield className="h-4 w-4 text-violet-600 dark:text-violet-400" />} accent="bg-violet-50/60 dark:bg-violet-900/20">
            {loading ? (
              <div className="space-y-2">{[0,1,2,3,4].map(i => <div key={i} className="h-3 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />)}</div>
            ) : (
              <PermisosView data={data?.permisos} />
            )}
          </SectionCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionCard title="Historial consultas" icon={<History className="h-4 w-4 text-orange-600 dark:text-orange-400" />} accent="bg-orange-50/60 dark:bg-orange-900/20">
              {loading ? (
                <div className="space-y-2">{[0,1,2].map(i => <div key={i} className="h-3 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />)}</div>
              ) : !hist ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 italic">Sin datos.</p>
              ) : (
                <>
                  <KV k="Consultas (usuario)" v={<b>{fmtCLP(hist.totalConsultasUsuario)}</b>} />
                  <KV k="Créditos usados" v={<b>{fmtCLP(hist.totalCreditsUsedHistorial)}</b>} />
                  <KV k="Consultas (org)" v={<b>{fmtCLP(hist.totalConsultasOrganizacion)}</b>} />
                </>
              )}
            </SectionCard>

            <SectionCard title="Últimas auditorías" icon={<Activity className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />} accent="bg-cyan-50/60 dark:bg-cyan-900/20">
              {loading ? (
                <div className="space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-3 rounded bg-gray-100 dark:bg-gray-700 animate-pulse" />)}</div>
              ) : (
                <AuditoriaView items={data?.auditoriasUltimas10} />
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePopover;
