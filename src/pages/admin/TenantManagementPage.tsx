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

const TenantManagementPage: React.FC = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [openCreateDialog, setOpenCreateDialog] = useState<boolean>(false);
  const [openEditDialog, setOpenEditDialog] = useState<boolean>(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState<boolean>(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
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
                <th className="py-2 px-4 border-b text-left">Status</th>
                <th className="py-2 px-4 border-b text-left">Available Credits</th>
                <th className="py-2 px-4 border-b text-left">Used Credits</th>
                <th className="py-2 px-4 border-b text-left">Last Evaluation</th>
                <th className="py-2 px-4 border-b text-left">Created At</th>
                <th className="py-2 px-4 border-b text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant._id} className="hover:bg-gray-50">
                  <td className="py-2 px-4 border-b">{tenant.name}</td>
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
                    </div>
                  </td>
                </tr>
              ))}
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