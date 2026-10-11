import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import logger from '../utils/logger';

// -------- Tipos --------
type TimelineEvent = {
  id: string;
  tipo_evento: string;
  titulo: string;
  ts: number;
  ts_humano?: string;
  fuente: string;
  usuario?: string | null;
  usuario_email?: string | null;
  organizacion_id?: string | null;
  tercero_id_ref?: string | null;
  rut?: string | null;
  nivel_info_requerido?: string | null;
  accion?: string | null;
  permitir?: boolean | null;
  motivo?: string | null;
  tags?: string[] | null;
  estado?: string | null;
  permiso_origen?: string | null;
  paso_fallido?: string | null;
  cuerpo?: any;
  campos_adicionales?: any;
  valor_anterior?: any;
  valor_nuevo?: any;
  campos_sensibles?: any;
  pn_gate_aplicado?: boolean;
};
type TimelineResponse = {
  items: TimelineEvent[];
  count: number;
  total_raw: number;
  fuentes: Record<string, number>;
  nivel_info_aplicado: string;
  pn_gate_aplicado: boolean;
  sensible_autorizado: boolean;
  cursor_next?: { last_ts: number; last_id: string } | null;
  permiso_origen?: string | null;
  scope_match?: any;
};

// -------- Paleta de colores --------
const BADGE_TIPO: Record<string, string> = {
  CONSULTA_CREADA: 'bg-sky-100 text-sky-800 border-sky-200',
  EVAL_HISTORY:     'bg-blue-100 text-blue-800 border-blue-200',
  EXPORT_CERTIFICATE:'bg-emerald-100 text-emerald-800 border-emerald-200',
  EXPORT_INFORME:   'bg-green-100 text-green-800 border-green-200',
  COMMENT_LEGACY:   'bg-amber-100 text-amber-800 border-amber-200',
  COMMENT_V2:       'bg-yellow-100 text-yellow-800 border-yellow-200',
  TAG_USE:          'bg-teal-100 text-teal-800 border-teal-200',
  ESCALAMIENTO:     'bg-violet-100 text-violet-800 border-violet-200',
  ADMIN_STRUCTURE:  'bg-indigo-100 text-indigo-800 border-indigo-200',
  ADMIN_USERS:      'bg-purple-100 text-purple-800 border-purple-200',
  PARTY_QUERY_PN:   'bg-rose-100 text-rose-800 border-rose-200',
  GOBIERNO_RIESGO:  'bg-red-100 text-red-800 border-red-200',
  FASTCHECK_QUERY:  'bg-cyan-100 text-cyan-800 border-cyan-200',
  CAPACIDAD_POOL:   'bg-orange-100 text-orange-800 border-orange-200',
  DECISION:         'bg-lime-100 text-lime-800 border-lime-200',
  OTRO:             'bg-gray-100 text-gray-800 border-gray-200',
};
const BADGE_FUENTE: Record<string, string> = {
  evaluationresults:  'bg-slate-200 text-slate-700',
  auditoria_log:      'bg-slate-100 text-slate-600',
  evaluationsHistory: 'bg-blue-50 text-blue-700',
  usernotes_legacy:   'bg-amber-50 text-amber-700',
  comentarios_v2:     'bg-yellow-50 text-yellow-700',
};
const getTipoBadge = (t: string) => BADGE_TIPO[t] || BADGE_TIPO.OTRO;
const getFuenteBadge = (f: string) => BADGE_FUENTE[f] || 'bg-gray-50 text-gray-600';

// -------- Componente --------
const TimelineTerceroPage: React.FC = () => {
  const { docId } = useParams<{ docId?: string }>();
  const navigate = useNavigate();

  const [inputDocId, setInputDocId] = useState<string>(docId || '');
  const [docIdActual, setDocIdActual] = useState<string>(docId || '');
  const [cargando, setCargando] = useState(false);
  const [cargandoNext, setCargandoNext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventos, setEventos] = useState<TimelineEvent[]>([]);
  const [meta, setMeta] = useState<TimelineResponse | null>(null);
  const [expandIds, setExpandIds] = useState<Set<string>>(new Set());

  const cargarTimeline = useCallback(async (
    id: string,
    cursor?: { last_ts: number; last_id: string } | null,
    append = false,
  ) => {
    if (!id || id.length < 10) {
      setError('docId invalido (ObjectId corto).');
      return;
    }
    try {
      setError(null);
      if (append) setCargandoNext(true);
      else setCargando(true);

      const params = new URLSearchParams({ limit: '50' });
      if (cursor?.last_ts) params.set('cursor_last_ts', String(cursor.last_ts));
      if (cursor?.last_id) params.set('cursor_last_id', cursor.last_id);

      const { data } = await apiClient.get<TimelineResponse>(
        `/v2/third-parties/${id}/history?${params.toString()}`
      );
      setMeta(data);
      setEventos(prev => append ? [...prev, ...(data.items || [])] : (data.items || []));
    } catch (err: any) {
      logger.error('Timeline error:', err);
      const msg = err?.response?.data?.detail?.motivo
        || err?.response?.data?.detail
        || err?.message
        || 'Errore caricamento timeline';
      setError(String(msg));
    } finally {
      setCargando(false);
      setCargandoNext(false);
    }
  }, []);

  // Load iniziale da URL param
  useEffect(() => {
    if (docId) {
      setInputDocId(docId);
      setDocIdActual(docId);
      cargarTimeline(docId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const handleSubmitInput = (e: React.FormEvent) => {
    e.preventDefault();
    const id = inputDocId.trim();
    if (!id) return;
    setDocIdActual(id);
    navigate(`/timeline/${id}`, { replace: false });
    cargarTimeline(id);
  };

  const handleCaricaAltri = () => {
    if (!docIdActual || !meta?.cursor_next) return;
    cargarTimeline(docIdActual, meta.cursor_next, true);
  };

  const toggleExpand = (id: string) => {
    setExpandIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const fmtTs = (ts?: string | null) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleString('it-IT');
    } catch { return ts.slice(0, 19); }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate(-1)}
          className="px-3 py-1.5 rounded bg-white hover:bg-gray-100 border border-gray-300 text-gray-700 text-sm font-medium"
        >
          ← Indietro
        </button>
        <h1 className="text-3xl font-bold text-gray-900">
          📜 Timeline Tercero · 4 Fuentes Merged (Bloq2.6 HU17)
        </h1>
      </div>

      {/* ====== Input docId ====== */}
      <form
        onSubmit={handleSubmitInput}
        className="bg-white border border-gray-200 rounded-lg p-4 mb-6 shadow-sm flex items-end gap-3"
      >
        <div className="flex-1">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            ObjectId evaluationresults (doc_id):
          </label>
          <input
            autoFocus={!docId}
            value={inputDocId}
            onChange={(e) => setInputDocId(e.target.value)}
            placeholder="Es. 6ac1741f4d045945242dce11"
            className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none font-mono text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={cargando || inputDocId.trim().length < 10}
          className="px-5 py-2 rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium shadow-sm transition"
        >
          🔍 Carica Timeline
        </button>
      </form>

      {/* ====== Info Meta ====== */}
      {meta && !cargando && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard label="Eventi (pagina)" val={String(eventos.length)} color="bg-sky-50 text-sky-800" />
          <StatCard label="Totale Raw (4 fuentes)" val={String(meta.total_raw ?? '—')} color="bg-violet-50 text-violet-800" />
          <StatCard label="Nivel Info" val={meta.nivel_info_aplicado || '—'} color="bg-emerald-50 text-emerald-800" />
          <StatCard label="Permiso Origen" val={(meta.permiso_origen || '—').slice(0, 28)} color="bg-amber-50 text-amber-800" />
        </div>
      )}
      {meta && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-5 flex flex-wrap gap-2 items-center text-sm">
          <span className="font-semibold text-gray-700 mr-1">Conteggio per fonte 4 merged:</span>
          {Object.entries(meta.fuentes || {}).filter(([k]) => k !== 'total').map(([k, v]) => (
            <span key={k} className={`inline-flex px-2 py-0.5 rounded text-xs font-medium border ${getFuenteBadge(k)}`}>
              {k}: <b className="ml-1">{v as number}</b>
            </span>
          ))}
          {meta.pn_gate_aplicado && (
            <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">PN gate ✓</span>
          )}
          {meta.sensible_autorizado && (
            <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">SENSIBLES N5 ✓</span>
          )}
        </div>
      )}

      {/* ====== Loading / Error ====== */}
      {cargando && (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
        </div>
      )}
      {error && !cargando && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-5">
          <b>Errore:</b> {error}
        </div>
      )}

      {/* ====== Timeline Eventi ====== */}
      {!cargando && eventos.length > 0 && (
        <>
          <ol className="relative border-l-2 border-purple-200 ml-3 space-y-4">
            {eventos.map((ev) => {
              const exp = expandIds.has(ev.id);
              const hasCuerpo = !!(ev.cuerpo || ev.campos_adicionales || ev.valor_anterior !== undefined || ev.valor_nuevo !== undefined || ev.motivo);
              return (
                <li key={ev.id} className="pl-6 relative">
                  {/* dot */}
                  <span className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-purple-100 border-2 border-purple-400"></span>

                  <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden hover:shadow-md transition">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 p-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold border ${getTipoBadge(ev.tipo_evento)}`}>
                          {ev.tipo_evento}
                        </span>
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getFuenteBadge(ev.fuente)}`}>
                          {ev.fuente}
                        </span>
                        <span className="text-sm text-gray-500">
                          <b>{fmtTs(ev.ts_humano)}</b>
                          {typeof ev.ts === 'number' && <span className="ml-1 opacity-60">(ts {ev.ts.toFixed(1)})</span>}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {ev.usuario_email && <span>👤 {ev.usuario_email}</span>}
                        {!ev.usuario_email && ev.usuario && <span className="font-mono opacity-70">uid {String(ev.usuario).slice(0, 14)}…</span>}
                        {hasCuerpo && (
                          <button
                            onClick={() => toggleExpand(ev.id)}
                            className="ml-1 px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200 font-medium"
                          >
                            {exp ? '▲ Nascondi dettagli' : '▼ Dettagli'}
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Title */}
                    <div className="px-3 pb-3">
                      <div className="text-base font-semibold text-gray-800">
                        {ev.titulo || ev.accion || ev.tipo_evento}
                      </div>
                      {(ev.estado || ev.permitir !== null && ev.permitir !== undefined) && (
                        <div className="mt-1 flex gap-2 text-xs">
                          {ev.estado && (
                            <span className={`px-2 py-0.5 rounded border ${ev.estado === 'APROBADO' || ev.estado === 'PASS' ? 'bg-green-100 text-green-700 border-green-200' : ev.estado === 'RECHAZADO' || ev.estado === 'FAIL' ? 'bg-red-100 text-red-700 border-red-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                              stato: {ev.estado}
                            </span>
                          )}
                          {ev.permitir !== undefined && ev.permitir !== null && (
                            <span className={`px-2 py-0.5 rounded border ${ev.permitir ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-100 text-rose-800 border-rose-200'}`}>
                              {ev.permitir ? '✓ permitir' : '✗ denegar'}
                            </span>
                          )}
                          {ev.paso_fallido && (
                            <span className="px-2 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-200">
                              passo fallido: {ev.paso_fallido}
                            </span>
                          )}
                        </div>
                      )}
                      {ev.motivo && (
                        <div className="mt-2 bg-yellow-50 border-l-4 border-yellow-300 px-3 py-1.5 text-sm text-yellow-900 rounded-r whitespace-pre-wrap">
                          💡 {ev.motivo}
                        </div>
                      )}
                    </div>
                    {/* Expanded detail */}
                    {exp && hasCuerpo && (
                      <div className="border-t border-gray-100 bg-gray-50 p-3 text-xs space-y-2">
                        {ev.cuerpo !== undefined && ev.cuerpo !== null && (
                          <DetailBlock label="Cuerpo / Detalle" val={ev.cuerpo} />
                        )}
                        {ev.motivo && exp && ev.cuerpo === undefined && (
                          <DetailBlock label="Motivo" val={ev.motivo} />
                        )}
                        {ev.campos_adicionales && (
                          <DetailBlock label="Campos Adicionales" val={ev.campos_adicionales} />
                        )}
                        {(ev.valor_anterior !== undefined || ev.valor_nuevo !== undefined) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <DetailBlock label="Valor Anterior" val={ev.valor_anterior} tone="warn" />
                            <DetailBlock label="Valor Nuovo" val={ev.valor_nuevo} tone="ok" />
                          </div>
                        )}
                        {ev.tags && Array.isArray(ev.tags) && ev.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {ev.tags.map((t, i) => (
                              <span key={i} className="inline-flex px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 text-xs">#{t}</span>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1 text-[11px] text-gray-500 border-t border-gray-200 mt-2">
                          <Meta label="id" val={ev.id} mono />
                          {ev.tercero_id_ref && <Meta label="tercero_id" val={ev.tercero_id_ref} mono />}
                          {ev.organizacion_id && <Meta label="org_id" val={ev.organizacion_id} mono />}
                          {ev.rut && <Meta label="rut" val={ev.rut} mono />}
                          {ev.accion && <Meta label="acción" val={ev.accion} />}
                          {ev.permiso_origen && <Meta label="permiso origen" val={ev.permiso_origen} />}
                          {ev.nivel_info_requerido && <Meta label="nivel req" val={ev.nivel_info_requerido} />}
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {/* ====== Cursor Next Page ====== */}
          <div className="mt-8 mb-10 flex justify-center">
            {meta?.cursor_next ? (
              <button
                onClick={handleCaricaAltri}
                disabled={cargandoNext}
                className="px-6 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium shadow-md transition"
              >
                {cargandoNext ? '… caricando' : `↓ Carica altri eventi (prossima pagina ${eventos.length}+, cursor_last_ts=${meta.cursor_next.last_ts.toFixed(0)})`}
              </button>
            ) : (
              <div className="px-5 py-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
                ✓ Fine timeline: {eventos.length} eventi mostrati su {meta?.total_raw ?? '?'} totali (nessuna prossima pagina).
              </div>
            )}
          </div>
        </>
      )}

      {/* ====== Empty ====== */}
      {!cargando && !error && eventos.length === 0 && docIdActual && !meta && (
        <div className="text-center text-gray-500 p-12 bg-white border border-dashed border-gray-300 rounded">
          Nessun dato. Premi "Carica Timeline" o fornisci un ObjectId evaluationresults valido.
        </div>
      )}
      {!cargando && !error && eventos.length === 0 && !docIdActual && (
        <div className="text-center text-gray-500 p-12 bg-white border border-dashed border-gray-300 rounded">
          👆 Inserisci un ObjectId <code className="px-1.5 py-0.5 bg-gray-100 rounded">evaluationresults._id</code> sopra
          o raggiungi la pagina da <b>Workspace Results → Pulsante Historial</b> (se abilitato).
        </div>
      )}
    </div>
  );
};

// -------- Subcomponents --------
function StatCard({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <div className={`rounded-lg p-3 border border-gray-200 shadow-sm ${color}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-80 font-semibold">{label}</div>
      <div className="text-lg font-bold mt-0.5 truncate">{val}</div>
    </div>
  );
}
function DetailBlock({ label, val, tone }: { label: string; val: any; tone?: 'ok' | 'warn' }) {
  const toneCls = tone === 'ok' ? 'border-emerald-200 bg-emerald-50' : tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white';
  const rendered = (typeof val === 'string')
    ? <div className="whitespace-pre-wrap break-words text-[12px] font-mono px-2 py-1">{val}</div>
    : (
      <pre className={`border ${toneCls} text-[11px] font-mono p-2 rounded overflow-x-auto max-h-[400px]`}>
{JSON.stringify(val, null, 2)}
      </pre>
    );
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5 font-semibold">{label}</div>
      {typeof val === 'string' ? (
        <div className={`border rounded ${toneCls}`}>{rendered}</div>
      ) : rendered}
    </div>
  );
}
function Meta({ label, val, mono }: { label: string; val: string; mono?: boolean }) {
  return (
    <div>
      <div className="uppercase tracking-wide text-gray-400 font-semibold">{label}</div>
      <div className={`truncate ${mono ? 'font-mono' : ''}`} title={String(val)}>{val}</div>
    </div>
  );
}

export default TimelineTerceroPage;
