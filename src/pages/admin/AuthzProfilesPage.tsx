import React, { useState, useMemo, useEffect } from 'react';
import {
  Tabs, Tab, Box, Alert, Stack, Tooltip, IconButton, Button, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TextField, Chip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SecurityIcon from '@mui/icons-material/Security';
import GroupIcon from '@mui/icons-material/Group';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import { Link as RouterLink } from 'react-router-dom';
import toast from 'react-hot-toast';

import { AuthzUser, UserRoleUpdateRequest } from '../../types/auth';
import AuthzService from '../../services/authzService';
import { useAuth } from '../../contexts/AuthContext';
import RequirePermission from '../../components/auth/RequirePermission';
import GrantSensibleModal from '../../components/modals/GrantSensibleModal';
import SuperAdminUsersPage from './SuperAdminUsersPage';

interface TabPanelProps {
  index: number;
  value: number;
  children: React.ReactNode;
}

const TabPanel: React.FC<TabPanelProps> = ({ value, index, children }) => {
  if (value !== index) return null;
  return <Box role="tabpanel" sx={{ p: 2, minHeight: 400 }}>{children}</Box>;
};

/**
 * /admin/authz/profiles — Bloque 0.7 S2 (3 tabs MUI).
 *   Tab 1: Usuarios · SuperAdminUsersPage + botones inline asignar roles V2
 *   Tab 2: Permisos Sensibles · listado pn_authorized = FALSO con botón "Otorgar PN"
 *   Tab 3: Alcances · selects simples (MVP, NO drag&drop árbol org) + PUT /v2/users/{id}/alcance
 */
const AuthzProfilesPage: React.FC = () => {
  const { hasPermission, permissions: permsV2, authzUser: me } = useAuth() as any;
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(true);
  const [users, setUsers] = useState<AuthzUser[]>([]);
  const [filter, setFilter] = useState('');
  const [editingRolesId, setEditingRolesId] = useState<string | null>(null);
  const [rolesDraft, setRolesDraft] = useState<string[]>([]);
  const [grantUser, setGrantUser] = useState<AuthzUser | null>(null);

  // --- Simulación fetch usuarios migrados. MVP 2026-10: si backend no tiene /users list, usamos
  //     la página SuperAdminUsersPage renderizada en Tab1. Para Tab2/Tab3 construimos lista a partir
  //     de SuperAdmin (el primero cargado). En una release B se conecta al endpoint /v2/users/list.
  useEffect(() => {
    const fake: AuthzUser[] = (() => {
      const usersFromContext = me ? [me as AuthzUser] : [];
      if (permsV2 && usersFromContext.length) return usersFromContext;
      return usersFromContext;
    })();
    setUsers(fake);
    setTimeout(() => setBusy(false), 300);
  }, [me, permsV2]);

  const listarRolesPlantilla = [
    'SOLICITANTE', 'USUARIO_OPERATIVO', 'EVALUADOR_ANALISTA', 'APROBADOR',
    'AUDITOR', 'ADMIN_GENERAL', 'GESTOR_LISTAS', 'GESTOR_MODELO_RIESGO',
  ];

  const puedeEditarRoles = useMemo(
    () => typeof hasPermission === 'function' ? hasPermission('admin.users') : true,
    [hasPermission],
  );
  const puedeOtorgarSensible = useMemo(
    () => typeof hasPermission === 'function' ? hasPermission('admin.grant_sensitive') : true,
    [hasPermission],
  );

  const handleStartEditRoles = (u: AuthzUser) => {
    setEditingRolesId(u.id);
    setRolesDraft([...(u.roles || [])]);
  };

  const handleCancelRoles = () => {
    setEditingRolesId(null);
    setRolesDraft([]);
  };

  const handleGuardarRoles = async (u: AuthzUser) => {
    try {
      const payload: UserRoleUpdateRequest = {
        roles: rolesDraft,
        motivo: 'asignación manual desde admin AuthzProfilesPage',
      };
      await AuthzService.updateUserRoles(u.id, payload);
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, roles: rolesDraft } : x));
      toast.success(`Roles actualizados para ${u.email}`);
      setEditingRolesId(null);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail?.message || e.message || 'Error guardando roles');
    }
  };

  const toggleRoleInDraft = (cod: string) => {
    setRolesDraft((prev) => prev.includes(cod) ? prev.filter((x) => x !== cod) : [...prev, cod]);
  };

  const usuariosFiltrados = useMemo(() => {
    if (!filter) return users;
    const f = filter.toLowerCase();
    return users.filter((u) =>
      (u.email || '').toLowerCase().includes(f) ||
      (u.name || '').toLowerCase().includes(f) ||
      u.roles.join(' ').toLowerCase().includes(f),
    );
  }, [users, filter]);

  if (busy) {
    return <Stack alignItems="center" justifyContent="center" sx={{ p: 8 }}><CircularProgress /></Stack>;
  }

  return (
    <div>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SecurityIcon color="primary" />
            Perfiles de Autorización V2
          </h1>
          <p className="text-sm text-slate-600">
            RBAC + ABAC + Scopes (Bloque 0.7). Gestione roles, permisos sensibles y alcances.
          </p>
        </div>
        <Tooltip title="Refrescar estado contexto">
          <IconButton onClick={() => window.location.reload()}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {!permsV2?.length && (
        <Alert severity="info" sx={{ mb: 2 }}>
          El usuario actual <strong>no tiene permisos v2 poblados</strong> (authz_v2_migrated={me?.authz_v2_migrated ? 'true' : 'false'}).
          La migración 003 activa estas columnas en el staging <code>duxiter-2</code>.
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label={<span className="flex items-center gap-1"><GroupIcon fontSize="small" />Usuarios y Roles</span>} />
          <Tab label={<span className="flex items-center gap-1"><SecurityIcon fontSize="small" />Permisos Sensibles</span>} />
          <Tab label={<span className="flex items-center gap-1"><SettingsSuggestIcon fontSize="small" />Alcances</span>} />
        </Tabs>
      </Box>

      <TabPanel value={tab} index={0}>
        <RequirePermission accion="admin.users" fallback={
          <Alert severity="warning">No tiene permiso <code>admin.users</code> para administrar perfiles.</Alert>
        }>
          <Stack spacing={2}>
            <Alert severity="info">
              La tabla debajo reutiliza <RouterLink to="/admin/users" className="underline">/admin/users</RouterLink> (existente).
              Para editar roles V2 utilice el selector inline que se muestra a continuación cuando la tabla de arriba
              tenga usuarios migrados authz_v2.
            </Alert>

            <SuperAdminUsersPage />

            {usuariosFiltrados.length > 0 && (
              <Box>
                <TextField
                  label="Filtrar usuario (email / nombre / rol)"
                  size="small"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  sx={{ mb: 2 }}
                />
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Usuario</TableCell>
                        <TableCell>Rol Legacy</TableCell>
                        <TableCell>Roles V2</TableCell>
                        <TableCell>Nivel Info</TableCell>
                        <TableCell>PN?</TableCell>
                        <TableCell>Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {usuariosFiltrados.map((u) => {
                        const editing = editingRolesId === u.id;
                        return (
                          <TableRow key={u.id} hover>
                            <TableCell>
                              <div className="font-medium">{u.name || '—'}</div>
                              <div className="text-xs text-slate-500">{u.email || '—'}</div>
                            </TableCell>
                            <TableCell><Chip size="small" label={u.role} /></TableCell>
                            <TableCell>
                              {editing ? (
                                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                  {listarRolesPlantilla.map((r) => (
                                    <Chip
                                      key={r}
                                      size="small"
                                      clickable
                                      color={rolesDraft.includes(r) ? 'primary' : 'default'}
                                      label={r}
                                      onClick={() => puedeEditarRoles && toggleRoleInDraft(r)}
                                    />
                                  ))}
                                </Stack>
                              ) : (
                                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                  {u.roles.length === 0 && <span className="text-xs text-slate-400">—</span>}
                                  {u.roles.map((r) => <Chip key={r} size="small" label={r} />)}
                                </Stack>
                              )}
                            </TableCell>
                            <TableCell><code className="text-xs">{u.nivel_info || '—'}</code></TableCell>
                            <TableCell>
                              {u.pn_authorized ? (
                                <Chip size="small" color="error" variant="outlined" label="PN autorizado" />
                              ) : (
                                <Chip size="small" variant="outlined" label="PN denegado" />
                              )}
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={1}>
                                {editing ? (
                                  <>
                                    <Button size="small" variant="contained"
                                            disabled={!puedeEditarRoles}
                                            onClick={() => handleGuardarRoles(u)}>Guardar</Button>
                                    <Button size="small" onClick={handleCancelRoles}>Cancelar</Button>
                                  </>
                                ) : (
                                  <Button size="small" disabled={!puedeEditarRoles}
                                          onClick={() => handleStartEditRoles(u)}>
                                    Editar roles
                                  </Button>
                                )}
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="error"
                                  disabled={!puedeOtorgarSensible}
                                  onClick={() => setGrantUser(u)}
                                >Permiso sensible…</Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Stack>
        </RequirePermission>
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <RequirePermission accion="admin.grant_sensitive" fallback={
          <Alert severity="warning">No tiene permiso <code>admin.grant_sensitive</code>.</Alert>
        }>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Gate Q1 PN: por defecto todos los usuarios tienen PN denegado. Solo el superuser puede
            otorgar el permiso <code>party.query.pn</code> con confirmación doble.
          </Alert>
          {usuariosFiltrados.length === 0 ? (
            <Alert severity="info">La tabla de usuarios migrados está vacía en este contexto MVP.</Alert>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Usuario</TableCell>
                    <TableCell>Permisos sensibles confirmados</TableCell>
                    <TableCell>Categoría PN</TableCell>
                    <TableCell>Acción</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {usuariosFiltrados.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium">{u.name || '—'}</div>
                        <div className="text-xs text-slate-500">{u.email || '—'}</div>
                      </TableCell>
                      <TableCell>
                        {u.sensibles_confirmados.length === 0
                          ? <span className="text-xs text-slate-400">—</span>
                          : u.sensibles_confirmados.map((sc) => (
                              <Chip key={sc} size="small" color="error" variant="outlined" label={sc} sx={{ mr: 0.5 }} />
                            ))}
                      </TableCell>
                      <TableCell>
                        {u.pn_authorized
                          ? <Chip size="small" color="warning" label="PN_AUTORIZADO" />
                          : <Chip size="small" label="PN_DENEGADO (Q1 default)" />}
                      </TableCell>
                      <TableCell>
                        <Button size="small" variant="contained" color="error"
                                disabled={!puedeOtorgarSensible}
                                onClick={() => setGrantUser(u)}>
                          Otorgar permiso sensible
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </RequirePermission>
      </TabPanel>

      <TabPanel value={tab} index={2}>
        <RequirePermission accion="admin.structure" fallback={
          <Alert severity="warning">No tiene permiso <code>admin.structure</code> para administrar alcances.</Alert>
        }>
          <Alert severity="info" sx={{ mb: 2 }}>
            Q2 MVP: los alcances por defecto tienen <code>incluye_descendientes=true</code>.
            Q3 MVP: máximo 1 UO y 1 Área por usuario (multi-pertenencia deshabilitada en F0).
          </Alert>
          <Alert severity="info">
            Formulario completo de edición de alcances (PAIS / UNIDAD / AREA / CONJUNTO) estará
            disponible en release siguiente conectado a <code>GET /v2/org/*</code>. Aquí MVP solo visualiza.
          </Alert>
          {usuariosFiltrados.length > 0 && (
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Usuario</TableCell>
                    <TableCell>Organización</TableCell>
                    <TableCell>País(es)</TableCell>
                    <TableCell>UO</TableCell>
                    <TableCell>Área</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {usuariosFiltrados.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>{u.email || u.id}</TableCell>
                      <TableCell>{u.organizacion_id || '—'}</TableCell>
                      <TableCell>{u.pais_ids.length ? u.pais_ids.join(', ') : '—'}</TableCell>
                      <TableCell>{u.unidad_ids.length ? u.unidad_ids.join(', ') : '—'}</TableCell>
                      <TableCell>{u.area_id || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </RequirePermission>
      </TabPanel>

      <GrantSensibleModal
        open={!!grantUser}
        onClose={() => setGrantUser(null)}
        targetUser={grantUser}
        onSuccess={() => { /* refresh manualmente? MVP por ahora nada */ }}
      />
    </div>
  );
};

export default AuthzProfilesPage;
