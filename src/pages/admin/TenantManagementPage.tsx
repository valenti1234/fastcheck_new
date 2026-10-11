import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/api';
import logger from '../../utils/logger';

interface Tenant {
  _id: string;
  name: string;
  isActive: boolean;
  usageStats: {
    evaluationsRemaining: number;
    evaluationsUsed: number;
    lastEvaluationDate: string | null;
  };
  creditBalance?: {
    availableCredits: number;
    totalCreditsUsed: number;
    lastCreditOperation: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

interface TenantFormData {
  name: string;
  availableCredits: number;
}

type PoolPlanNivel = 1 | 2 | 3 | 4 | 5;
const POOL_PLANS_5: Array<{ nivel: PoolPlanNivel; nombre: string; creditos_mensuales_org: number; label: string }> = [
  { nivel: 1, nombre: 'BASIC',      creditos_mensuales_org:   500, label: 'BASIC · 500 créditos / mes' },
  { nivel: 2, nombre: 'STARTUP',    creditos_mensuales_org:  2000, label: 'STARTUP · 2.000 créditos / mes' },
  { nivel: 3, nombre: 'PRO',        creditos_mensuales_org: 10000, label: 'PRO · 10.000 créditos / mes' },
  { nivel: 4, nombre: 'BUSINESS',   creditos_mensuales_org: 50000, label: 'BUSINESS · 50.000 créditos / mes' },
  { nivel: 5, nombre: 'ENTERPRISE', creditos_mensuales_org: 250000, label: 'ENTERPRISE · 250.000 créditos / mes' },
];
interface CambiarPlanForm {
  nuevo_nivel: PoolPlanNivel;
  motivo_cambio: string;
  confirmacion_cambio_riesgo: boolean;
}

const TenantManagementPage: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [openCreateDialog, setOpenCreateDialog] = useState<boolean>(false);
  const [openEditDialog, setOpenEditDialog] = useState<boolean>(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false);
  const [openCambiarPlanDialog, setOpenCambiarPlanDialog] = useState<boolean>(false);
  const [cambiarPlanLoading, setCambiarPlanLoading] = useState<boolean>(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [cambiarPlanForm, setCambiarPlanForm] = useState<CambiarPlanForm>({
    nuevo_nivel: 3,
    motivo_cambio: '',
    confirmacion_cambio_riesgo: false,
  });
  const [formData, setFormData] = useState<TenantFormData>({
    name: '',
    availableCredits: 100,
  });
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const navigate = useNavigate();

  // ---------- Plan badge (Bloq2.5 5 planes) ----------
  type PlanMeta = { nombre: string; color: string; creditos: number };
  const PLANES_META_5: PlanMeta[] = [
    { nombre: 'BASIC',     color: 'bg-gray-100 text-gray-800 border border-gray-200', creditos: 500 },
    { nombre: 'STARTUP',   color: 'bg-emerald-100 text-emerald-800 border border-emerald-200', creditos: 2000 },
    { nombre: 'PRO',       color: 'bg-blue-100 text-blue-800 border border-blue-200', creditos: 10000 },
    { nombre: 'BUSINESS',  color: 'bg-violet-100 text-violet-800 border border-violet-200', creditos: 50000 },
    { nombre: 'ENTERPRISE',color: 'bg-amber-100 text-amber-900 border border-amber-300 font-semibold', creditos: 250000 },
  ];
  const getTenantPlanLabel = (t: Tenant): PlanMeta => {
    const cod = String((t as any).planCodigo || '').trim().toUpperCase();
    const m1 = PLANES_META_5.find(p => p.nombre === cod);
    if (m1) return m1;
    const avail = Number(t.creditBalance?.availableCredits ?? 0);
    const used  = Number(t.creditBalance?.totalCreditsUsed ?? 0);
    const total = avail + used;
    const m2 = PLANES_META_5.find(p =>
      total > 0 && Math.abs(total - p.creditos) / p.creditos <= 0.01
    ) || PLANES_META_5.find(p => avail > 0 && Math.abs(avail - p.creditos) / p.creditos <= 0.01);
    if (m2) return m2;
    if (total >= 200000 || avail >= 200000) return PLANES_META_5[4];
    if (total >= 40000  || avail >= 40000)  return PLANES_META_5[3];
    if (total >= 8000   || avail >= 8000)   return PLANES_META_5[2];
    if (total >= 1500   || avail >= 1500)   return PLANES_META_5[1];
    return PLANES_META_5[0];
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/tenant/all');
      setTenants(response.data);
      setError(null);
    } catch (err) {
      logger.error('Error fetching tenants:', err);
      setError('Failed to fetch tenants. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async () => {
    try {
      const response = await apiClient.post('/tenant', {
        name: formData.name,
        creditBalance: {
          availableCredits: formData.availableCredits,
          totalCreditsUsed: 0,
          lastCreditOperation: null
        }
      });
      
      setTenants([...tenants, response.data]);
      setOpenCreateDialog(false);
      setFormData({ name: '', availableCredits: 100 });
      setSnackbar({
        open: true,
        message: 'Tenant created successfully',
        severity: 'success'
      });
    } catch (err) {
      logger.error('Error creating tenant:', err);
      setSnackbar({
        open: true,
        message: 'Failed to create tenant',
        severity: 'error'
      });
    }
  };

  const handleUpdateTenant = async () => {
    if (!selectedTenant) return;
    
    try {
      const response = await apiClient.patch(`/tenant/${selectedTenant._id}`, {
        name: formData.name,
        creditBalance: {
          availableCredits: formData.availableCredits,
          totalCreditsUsed: selectedTenant.creditBalance?.totalCreditsUsed ?? 0,
          lastCreditOperation: selectedTenant.creditBalance?.lastCreditOperation ?? null
        }
      });
      
      setTenants(tenants.map(tenant => 
        tenant._id === selectedTenant._id ? response.data : tenant
      ));
      setOpenEditDialog(false);
      setSnackbar({
        open: true,
        message: 'Tenant updated successfully',
        severity: 'success'
      });
    } catch (err) {
      logger.error('Error updating tenant:', err);
      setSnackbar({
        open: true,
        message: 'Failed to update tenant',
        severity: 'error'
      });
    }
  };

  const handleDeleteTenant = async () => {
    if (!selectedTenant) return;
    
    try {
      await apiClient.delete(`/tenant/${selectedTenant._id}`);
      
      setTenants(tenants.filter(tenant => tenant._id !== selectedTenant._id));
      setOpenDeleteDialog(false);
      setSnackbar({
        open: true,
        message: 'Tenant deleted successfully',
        severity: 'success'
      });
    } catch (err: any) {
      logger.error('Error deleting tenant:', err);
      const errorMessage = err.response?.data?.message || 'Failed to delete tenant';
      setSnackbar({
        open: true,
        message: errorMessage,
        severity: 'error'
      });
    }
  };

  const handleOpenEditDialog = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setFormData({
      name: tenant.name,
      availableCredits: tenant.creditBalance?.availableCredits ?? 0
    });
    setOpenEditDialog(true);
  };

  const handleOpenDeleteDialog = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setOpenDeleteDialog(true);
  };

  const handleViewUsers = (tenantId: string) => {
    navigate(`/admin/tenants/${tenantId}/users`);
  };

  const handleOpenCambiarPlanDialog = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    // Proponi di default PRO (3) o il prossimo piano se già BASIC
    setCambiarPlanForm({
      nuevo_nivel: 3,
      motivo_cambio: '',
      confirmacion_cambio_riesgo: false,
    });
    setOpenCambiarPlanDialog(true);
  };

  const handleCambiarPlan = async () => {
    if (!selectedTenant) return;
    if (!cambiarPlanForm.confirmacion_cambio_riesgo) {
      setSnackbar({
        open: true,
        message: 'Debes confirmar el cambio de riesgo antes de proceder (doble intención).',
        severity: 'warning',
      });
      return;
    }
    if (cambiarPlanForm.motivo_cambio.trim().length < 8) {
      setSnackbar({
        open: true,
        message: 'Motivo del cambio demasiado corto (mínimo 8 caracteres).',
        severity: 'warning',
      });
      return;
    }
    try {
      setCambiarPlanLoading(true);
      await apiClient.put(`/tenant/${selectedTenant._id}/pool/plan`, {
        confirmacion_cambio_riesgo: cambiarPlanForm.confirmacion_cambio_riesgo,
        nuevo_nivel: cambiarPlanForm.nuevo_nivel,
        motivo_cambio: cambiarPlanForm.motivo_cambio.trim(),
      });
      await fetchTenants();
      setOpenCambiarPlanDialog(false);
      const planSel = POOL_PLANS_5.find(p => p.nivel === cambiarPlanForm.nuevo_nivel);
      setSnackbar({
        open: true,
        message: `Plan actualizado correctamente → ${planSel?.label || cambiarPlanForm.nuevo_nivel}.`,
        severity: 'success',
      });
    } catch (err: any) {
      logger.error('Error cambiando plan tenant:', err);
      const det = err?.response?.data?.detail || {};
      let msg = 'Error al cambiar el plan';
      if (typeof det === 'string') msg = det;
      else if (det && typeof det === 'object' && 'codigo' in det) msg = `[${det.codigo}] ${(det as any).mensaje || det.descripcion || 'Operación no autorizada'}`;
      if (err?.response?.status === 428) msg = 'Confirmación de cambio de riesgo requerida (doble intención 428).';
      if (err?.response?.status === 403) msg = 'Solo el superadmin puede cambiar planes de otros tenants.';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setCambiarPlanLoading(false);
    }
  };

  const handleToggleTenantStatus = async (tenant: Tenant) => {
    try {
      const response = await apiClient.patch(`/tenant/${tenant._id}/superadmin-toggle-status`);
      
      setTenants(tenants.map(t => 
        t._id === tenant._id ? { ...t, isActive: response.data.isActive } : t
      ));
      
      setSnackbar({
        open: true,
        message: response.data.message,
        severity: 'success'
      });
    } catch (err) {
      logger.error('Error toggling tenant status:', err);
      setSnackbar({
        open: true,
        message: 'Failed to toggle tenant status',
        severity: 'error'
      });
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Tenant Management</h1>
        <button 
          className="rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 inline-flex items-center"
          onClick={() => setOpenCreateDialog(true)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add Tenant
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <span className="block sm:inline">{error}</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="py-2 px-4 border-b text-left">Name</th>
                <th className="py-2 px-4 border-b text-left">Plan</th>
                <th className="py-2 px-4 border-b text-left">Status</th>
                <th className="py-2 px-4 border-b text-left">Available Credits</th>
                <th className="py-2 px-4 border-b text-left">Used Credits</th>
                <th className="py-2 px-4 border-b text-left">Last Evaluation</th>
                <th className="py-2 px-4 border-b text-left">Created At</th>
                <th className="py-2 px-4 border-b text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => {
                const plan = getTenantPlanLabel(tenant);
                return (
                <tr key={tenant._id} className="hover:bg-gray-50">
                  <td className="py-2 px-4 border-b">{tenant.name}</td>
                  <td className="py-2 px-4 border-b">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${plan.color}`}>
                      {plan.nombre}
                      <span className="ml-1.5 opacity-70">· {plan.creditos.toLocaleString('es-CL')}</span>
                    </span>
                  </td>
                  <td className="py-2 px-4 border-b">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      tenant.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {tenant.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2 px-4 border-b">{tenant.creditBalance?.availableCredits ?? 0}</td>
                  <td className="py-2 px-4 border-b">{tenant.creditBalance?.totalCreditsUsed ?? 0}</td>
                  <td className="py-2 px-4 border-b">
                    {tenant.usageStats.lastEvaluationDate 
                      ? new Date(tenant.usageStats.lastEvaluationDate).toLocaleDateString() 
                      : 'Never'}
                  </td>
                  <td className="py-2 px-4 border-b">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-4 border-b">
                    <div className="flex space-x-2">
                      <button 
                        className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                        onClick={() => handleOpenEditDialog(tenant)}
                      >
                        Edit
                      </button>
                      <button 
                        className="rounded-md bg-error-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-error-700 focus:outline-none focus:ring-2 focus:ring-error-500 focus:ring-offset-2"
                        onClick={() => handleOpenDeleteDialog(tenant)}
                      >
                        Delete
                      </button>
                      <button 
                        className="rounded-md bg-secondary-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-secondary-700 focus:outline-none focus:ring-2 focus:ring-secondary-500 focus:ring-offset-2"
                        onClick={() => handleViewUsers(tenant._id)}
                      >
                        Users
                      </button>
                      <button 
                        className="rounded-md bg-warning-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-warning-600 focus:outline-none focus:ring-2 focus:ring-warning-500 focus:ring-offset-2"
                        onClick={() => handleToggleTenantStatus(tenant)}
                      >
                        {tenant.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button 
                        className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                        onClick={() => handleOpenCambiarPlanDialog(tenant)}
                      >
                        Cambiar Plan
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Dialog */}
      {openCreateDialog && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create Tenant</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input 
                  type="text" 
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Available Credits</label>
                <input 
                  type="number" 
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  value={formData.availableCredits}
                  onChange={(e) => setFormData({ ...formData, availableCredits: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <button 
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                onClick={() => setOpenCreateDialog(false)}
              >
                Cancel
              </button>
              <button 
                className="rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                onClick={handleCreateTenant}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {openEditDialog && selectedTenant && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Edit Tenant</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input 
                  type="text" 
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Available Credits</label>
                <input 
                  type="number" 
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  value={formData.availableCredits}
                  onChange={(e) => setFormData({ ...formData, availableCredits: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <button 
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                onClick={() => setOpenEditDialog(false)}
              >
                Cancel
              </button>
              <button 
                className="rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                onClick={handleUpdateTenant}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      {openDeleteDialog && selectedTenant && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Delete Tenant</h2>
            <p>Are you sure you want to delete tenant "{selectedTenant.name}"?</p>
            <div className="mt-6 flex justify-end space-x-2">
              <button 
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                onClick={() => setOpenDeleteDialog(false)}
              >
                Cancel
              </button>
              <button 
                className="rounded-md border border-transparent bg-error-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-error-700 focus:outline-none focus:ring-2 focus:ring-error-500 focus:ring-offset-2"
                onClick={handleDeleteTenant}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cambiar Plan Dialog */}
      {openCambiarPlanDialog && selectedTenant && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <h2 className="text-xl font-bold mb-1">Cambiar Plan · Pool Créditos</h2>
            <p className="text-sm text-gray-500 mb-5 break-all">
              Tenant: <strong>{selectedTenant.name}</strong> <span className="text-gray-400">(_id: {selectedTenant._id.slice(0,10)}…)</span>
              <br />
              Disponible actual: <strong className="text-purple-700">{(selectedTenant.creditBalance?.availableCredits ?? 0).toLocaleString()}</strong> créditos
              · Histórico usado: <strong>{(selectedTenant.creditBalance?.totalCreditsUsed ?? 0).toLocaleString()}</strong>
            </p>

            <div className="space-y-5">
              {/* Plan selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Nuevo Plan (Nivel Bloq2.5)</label>
                <select
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                  value={cambiarPlanForm.nuevo_nivel}
                  onChange={(e) => setCambiarPlanForm({ ...cambiarPlanForm, nuevo_nivel: Number(e.target.value) as PoolPlanNivel })}
                  disabled={cambiarPlanLoading}
                >
                  {POOL_PLANS_5.map(p => (
                    <option key={p.nivel} value={p.nivel}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Motivo */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Motivo del cambio <span className="text-gray-400 font-normal">(min 8 caracteres · auditoria)</span>
                </label>
                <textarea
                  rows={2}
                  maxLength={300}
                  placeholder="Ej. Upgrade tenant por volumen creciente, o downgrade plan por bajo consumo."
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 text-sm"
                  value={cambiarPlanForm.motivo_cambio}
                  onChange={(e) => setCambiarPlanForm({ ...cambiarPlanForm, motivo_cambio: e.target.value })}
                  disabled={cambiarPlanLoading}
                />
              </div>

              {/* Doble intención confirm check */}
              <label className="flex items-start space-x-3 p-3 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  checked={cambiarPlanForm.confirmacion_cambio_riesgo}
                  onChange={(e) => setCambiarPlanForm({ ...cambiarPlanForm, confirmacion_cambio_riesgo: e.target.checked })}
                  disabled={cambiarPlanLoading}
                />
                <span className="text-sm text-amber-900">
                  <strong className="font-semibold">Confirmar cambio sensible NIV3.</strong><br />
                  Autorizo re-calcular el saldo y ratio de consumo mensual prorrateado según el nuevo plan.
                  Esta operación se registra en <em>auditoria_log</em>.
                </span>
              </label>
            </div>

            <div className="mt-7 flex justify-end space-x-2">
              <button 
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-60"
                onClick={() => setOpenCambiarPlanDialog(false)}
                disabled={cambiarPlanLoading}
              >
                Cancel
              </button>
              <button 
                className="rounded-md border border-transparent bg-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={handleCambiarPlan}
                disabled={cambiarPlanLoading}
              >
                {cambiarPlanLoading ? 'Actualizando…' : 'Confirmar cambio plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snackbar */}
      {snackbar.open && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg ${
          snackbar.severity === 'success' ? 'bg-green-500' : snackbar.severity === 'error' ? 'bg-red-500' : 'bg-blue-500'
        } text-white`}>
          <div className="flex items-center justify-between">
            <span>{snackbar.message}</span>
            <button className="ml-4" onClick={handleCloseSnackbar}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantManagementPage;