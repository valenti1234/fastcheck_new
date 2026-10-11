import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../services/api';
import logger from '../../utils/logger';

interface User {
  _id: string;
  name: string;
  email: string;
  role: 'superuser' | 'tenant_admin' | 'evaluator';
  isActive: boolean;
  createdAt: string;
}

interface Tenant {
  _id: string;
  name: string;
}

const TenantUsersPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  
  const [users, setUsers] = useState<User[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  // ---------- Reset password state (modal) ----------
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPwd, setResetPwd] = useState('');
  const [resetPwd2, setResetPwd2] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch tenant details
        const tenantResponse = await apiClient.get(`/tenant/${tenantId}`);
        setTenant(tenantResponse.data);
        
        // Fetch tenant users
        const usersResponse = await apiClient.get(`/tenant/${tenantId}/users`);
        setUsers(usersResponse.data);
        
        setError(null);
      } catch (err) {
        logger.error('Error fetching data:', err);
        setError('Failed to fetch data. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (tenantId) {
      fetchData();
    }
  }, [tenantId]);

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'superuser':
        return 'bg-purple-100 text-purple-800';
      case 'tenant_admin':
        return 'bg-blue-100 text-blue-800';
      case 'evaluator':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeClass = (isActive: boolean) => {
    return isActive 
      ? 'bg-green-100 text-green-800' 
      : 'bg-red-100 text-red-800';
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const response = await apiClient.patch(`/users/${userId}/superadmin-toggle-status`);
      
      // Update the user in the local state
      setUsers(users.map(user => 
        user._id === userId 
          ? { ...user, isActive: !currentStatus }
          : user
      ));
      
      setSnackbar({
        open: true,
        message: `User ${!currentStatus ? 'activated' : 'deactivated'} successfully`,
        severity: 'success'
      });
    } catch (err) {
      logger.error('Error toggling user status:', err);
      setSnackbar({
        open: true,
        message: 'Failed to toggle user status',
        severity: 'error'
      });
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  // ---------- Open / Execute reset password (NO MUI, NO i18n 100% crash-safe) ----------
  const openResetPwd = (u: User) => {
    setResetTarget(u);
    setResetPwd('');
    setResetPwd2('');
    setShowResetPwd(true);
  };

  const doResetPwd = async () => {
    if (!resetTarget) return;
    if (resetPwd !== resetPwd2) {
      setSnackbar({ open: true, severity: 'error', message: 'Le password non corrispondono.' });
      return;
    }
    if (resetPwd.length < 6) {
      setSnackbar({ open: true, severity: 'error', message: 'Password troppo corta (minimo 6 caratteri).' });
      return;
    }
    try {
      setResetLoading(true);
      await apiClient.patch(`/users/${resetTarget._id}/superadmin-reset-password`, { newPassword: resetPwd });
      setSnackbar({
        open: true,
        severity: 'success',
        message: `Password di ${resetTarget.email} RESETTATA con successo! Nuovo login obbligatorio.`,
      });
      setShowResetPwd(false);
      setResetTarget(null);
      setResetPwd('');
      setResetPwd2('');
    } catch (err: any) {
      logger.error('Error resetting password:', err);
      const msg = err?.response?.data?.detail || err?.message || 'Reset password fallito.';
      setSnackbar({ open: true, severity: 'error', message: `Errore: ${String(msg)}` });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center mb-6">
        <button 
          className="mr-4 text-blue-500 hover:text-blue-700"
          onClick={() => navigate('/admin/tenants')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
          </svg>
        </button>
        <h1 className="text-3xl font-bold">
          {tenant ? `${tenant.name} - Users` : 'Tenant Users'}
        </h1>
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
        <>
          {users.length === 0 ? (
            <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative" role="alert">
              <span className="block sm:inline">No users found for this tenant.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-200">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="py-2 px-4 border-b text-left">Name</th>
                    <th className="py-2 px-4 border-b text-left">Email</th>
                    <th className="py-2 px-4 border-b text-left">Role</th>
                    <th className="py-2 px-4 border-b text-left">Status</th>
                    <th className="py-2 px-4 border-b text-left">Created At</th>
                    <th className="py-2 px-4 border-b text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id} className="hover:bg-gray-50">
                      <td className="py-2 px-4 border-b">{user.name}</td>
                      <td className="py-2 px-4 border-b">{user.email}</td>
                      <td className="py-2 px-4 border-b">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeClass(user.role)}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="py-2 px-4 border-b">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(user.isActive)}`}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="py-2 px-4 border-b">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-2 px-4 border-b">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleToggleUserStatus(user._id, user.isActive)}
                            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                              user.isActive
                                ? 'bg-red-500 hover:bg-red-600 text-white'
                                : 'bg-green-500 hover:bg-green-600 text-white'
                            }`}
                            title={user.isActive ? 'Deactivate User' : 'Activate User'}
                          >
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => openResetPwd(user)}
                            className="px-3 py-1 rounded text-sm font-medium transition-colors bg-amber-500 hover:bg-amber-600 text-white"
                            title="Reset Password (Superadmin)"
                          >
                            🔑 Reset Password
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>  
      )}

      {/* Notification */}
      {snackbar.open && (
        <div className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-md z-50 ${
          snackbar.severity === 'success' ? 'bg-green-500' : 
          snackbar.severity === 'error' ? 'bg-red-500' : 
          snackbar.severity === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
        } text-white`}>
          {snackbar.message}
          <button 
            className="ml-4 text-white"
            onClick={handleCloseSnackbar}
          >
            ✕
          </button>
        </div>
      )}

      {/* ===================== MODAL RESET PASSWORD (TAILWIND PURISSIMO, ZERO CRASH) ===================== */}
      {showResetPwd && resetTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
              <span className="text-2xl">🔑</span>
              <h2 className="text-xl font-bold text-amber-900">
                Reset Password · {resetTarget.name}
              </h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Email utente
                </label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded text-gray-600 text-sm select-all">
                  {resetTarget.email}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Nuova Password <span className="text-gray-400">(min 6)</span>
                </label>
                <input
                  autoFocus
                  type="password"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none transition"
                  value={resetPwd}
                  onChange={(e) => setResetPwd(e.target.value)}
                  placeholder="Es. NuovaCMPC2026!"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Conferma Password
                </label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none transition"
                  value={resetPwd2}
                  onChange={(e) => setResetPwd2(e.target.value)}
                  placeholder="Ripeti la password"
                />
              </div>
              {resetPwd.length > 0 && resetPwd2.length > 0 && resetPwd !== resetPwd2 && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-100">
                  ⚠️ Le due password non corrispondono.
                </div>
              )}
              {resetPwd.length > 0 && resetPwd.length < 6 && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded border border-red-100">
                  ⚠️ Password troppo corta (min 6 caratteri).
                </div>
              )}
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowResetPwd(false); setResetTarget(null); setResetPwd(''); setResetPwd2(''); }}
                className="px-4 py-2 rounded bg-white hover:bg-gray-100 text-gray-700 font-medium border border-gray-300 transition disabled:opacity-50"
                disabled={resetLoading}
              >
                Annulla
              </button>
              <button
                onClick={doResetPwd}
                className="px-5 py-2 rounded bg-amber-500 hover:bg-amber-600 text-white font-medium shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={resetLoading || resetPwd !== resetPwd2 || resetPwd.length < 6}
              >
                {resetLoading ? 'Invio...' : '🔒 Conferma Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantUsersPage;