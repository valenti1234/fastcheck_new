import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import toast from 'react-hot-toast';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import UserModal from '../../components/modals/UserModal';
import logger from '../../utils/logger';
import { apiClient } from '../../services/api';


interface ScopedUser {
  id: string;
  _id?: string;
  name: string;
  email: string;
  role: 'superuser' | 'tenant_admin' | 'admin' | 'auditor' | 'evaluator' | 'user' | string;
  isActive: boolean;
  createdAt?: string;
}

const TenantUsers = () => {
  const { tenant } = useTenant();
  const { user: authUser } = useAuth();
  const { t } = useTranslation();
  const [users, setUsers] = useState<ScopedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ScopedUser | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  // Reset password modal state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetUser, setResetUser] = useState<ScopedUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const isSuper = useMemo(() => {
    try {
      const r = String((authUser as any)?.role || '').toLowerCase();
      const roles = Array.isArray((authUser as any)?.roles) ? (authUser as any).roles as string[] : [];
      return r === 'superuser' || r === 'superadmin' || roles.includes('SUPER_WILDCARD') || Boolean((authUser as any)?.isSuperuser);
    } catch {
      return false;
    }
  }, [authUser]);

  /**
   * Mapping ruolo (backend canonicale) → {text, cls} badge + label i18n.
   * Stesso ordine e colori di UserModal per coerenza visiva.
   */
  const roleMeta = (rawRole: string) => {
    const normalize = (r: string): string => {
      const s = String(r || '').trim().toLowerCase();
      const aliasMap: Record<string, string> = {
        superadmin: 'superuser', admin: 'tenant_admin', administrador: 'tenant_admin',
        evaluador: 'evaluator', auditor: 'read_only', 'read-only': 'read_only',
        readonly: 'read_only', consulta: 'read_only', 'write-only': 'write_only',
        writeonly: 'write_only', api: 'write_only', bot: 'write_only', usuario: 'user',
      };
      if (['superuser', 'tenant_admin', 'evaluator', 'read_only', 'write_only', 'user'].includes(s)) return s;
      if (s in aliasMap) return aliasMap[s];
      if (s.includes('super')) return 'superuser';
      if (s.includes('admin')) return 'tenant_admin';
      if (s.includes('eval')) return 'evaluator';
      if (s.includes('audit') || s.includes('read') || s.includes('consulta')) return 'read_only';
      if (s.includes('write') || s.includes('api') || s.includes('bot')) return 'write_only';
      return 'user';
    };
    const n = normalize(rawRole);
    const keyMap: Record<string, { i18Key: string; cls: string }> = {
      superuser:  { i18Key: 'superuser', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
      tenant_admin:{ i18Key: 'tenantAdmin',cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
      evaluator:  { i18Key: 'evaluator',  cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
      read_only:  { i18Key: 'auditor',    cls: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300' },
      write_only: { i18Key: 'writeOnly',  cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
      user:       { i18Key: 'user',       cls: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
    };
    const info = keyMap[n] || keyMap.user;
    return {
      text: t(`tenantUsers.filters.roleOptions.${info.i18Key}`),
      cls: info.cls,
    };
  };
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (search) queryParams.append('search', search);
      if (roleFilter) queryParams.append('role', roleFilter);
      if (statusFilter) queryParams.append('status', statusFilter);

      const { data } = await apiClient.get<any>(
        `/scoped-tenant/users?${queryParams.toString()}`
      );

      let list: ScopedUser[] = [];
      if (Array.isArray(data)) {
        list = data.map((d: any) => ({
          id: String(d.id || d._id || ''),
          _id: String(d._id || d.id || ''),
          name: String(d.name || d.email || '—'),
          email: String(d.email || ''),
          role: (d.role as any) || 'user',
          isActive: Boolean(d.isActive ?? d.active ?? true),
          createdAt: d.createdAt,
        }));
      } else if (data && typeof data === 'object' && 'users' in data && Array.isArray((data as any).users)) {
        list = (data as any).users.map((d: any) => ({
          id: String(d.id || d._id || ''),
          _id: String(d._id || d.id || ''),
          name: String(d.name || d.email || '—'),
          email: String(d.email || ''),
          role: (d.role as any) || 'user',
          isActive: Boolean(d.isActive ?? d.active ?? true),
          createdAt: d.createdAt,
        }));
      }

      setUsers(list);
    } catch (error) {
      logger.error('Error fetching users:', error);
      const msg = error instanceof Error ? error.message : t('tenantUsers.errors.loadUsers');
      toast.error(msg || t('tenantUsers.errors.loadUsers'));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [search, roleFilter, statusFilter]);

  // Reset password handler
  const handleResetPassword = async () => {
    if (!resetUser) return;
    if (resetPassword.length < 6) {
      toast.error(t('tenantUsers.errors.passwordMin6'));
      return;
    }
    if (resetPassword !== resetConfirm) {
      toast.error(t('tenantUsers.errors.passwordsDoNotMatch'));
      return;
    }
    setResetLoading(true);
    try {
      await apiClient.patch(`/scoped-tenant/users/${resetUser.id}/reset-password`, {
        newPassword: resetPassword,
      });
      toast.success(t('tenantUsers.toasts.passwordResetSuccess'));
      setShowResetModal(false);
      setResetUser(null);
      setResetPassword('');
      setResetConfirm('');
    } catch (error: any) {
      logger.error('Error resetting password:', error);
      const det = error?.response?.data?.detail;
      if (typeof det === 'string' && /SUPERUSER_REQUIRED|FORBIDDEN|403|CROSS_ORG|CANNOT_RESET/.test(det)) {
        toast.error(t('tenantUsers.errors.superuserRequired'));
      } else {
        toast.error(t('tenantUsers.errors.resetPasswordFailed'));
      }
    } finally {
      setResetLoading(false);
    }
  };

  // Toggle user status
  const toggleUserStatus = async (userId: string) => {
    try {
      const endpoint = isSuper
        ? `/users/${userId}/superadmin-toggle-status`
        : `/users/${userId}/toggle-status`;
      const response = await apiClient.patch<{ isActive?: boolean }>(endpoint);
      const newStatus = typeof response?.data?.isActive === 'boolean'
        ? response.data.isActive
        : !users.find(u => u.id === userId)?.isActive;
      setUsers(users.map(user =>
        user.id === userId ? { ...user, isActive: newStatus } : user
      ));
      toast.success(t('tenantUsers.toasts.statusUpdated'));
    } catch (error) {
      logger.error('Error updating user status:', error);
      const det = (error as any)?.response?.data?.detail;
      if (typeof det === 'string' && /SUPERUSER_REQUIRED|FORBIDDEN|403/.test(det)) {
        toast.error(t('tenantUsers.errors.superuserRequired'));
      } else {
        toast.error(t('tenantUsers.errors.toggleStatus'));
      }
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 text-gray-600 dark:text-gray-400">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('tenantUsers.title')}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {t('tenantUsers.subtitleWithCount', { count: users.length })}
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 sm:w-auto"
          >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            {t('tenantUsers.addUserButton')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-8 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative rounded-md shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('tenantUsers.search.placeholder')}
              className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 focus:border-primary-500 focus:ring-primary-500 sm:text-sm text-gray-900 dark:text-white"
            />
          </div>
        </div>
        <div className="sm:w-48">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-primary-500 focus:ring-primary-500 sm:text-sm text-gray-900 dark:text-white"
          >
            <option value="">{t('tenantUsers.filters.allRoles')}</option>
            <option value="tenant_admin">{t('tenantUsers.filters.roleOptions.tenantAdmin')}</option>
            <option value="auditor">{t('tenantUsers.filters.roleOptions.auditor')}</option>
            <option value="evaluator">{t('tenantUsers.filters.roleOptions.evaluator')}</option>
            <option value="write_only">{t('tenantUsers.filters.roleOptions.writeOnly')}</option>
            <option value="user">{t('tenantUsers.filters.roleOptions.user')}</option>
            <option value="superuser">{t('tenantUsers.filters.roleOptions.superuser')}</option>
          </select>
        </div>
        <div className="sm:w-48">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-primary-500 focus:ring-primary-500 sm:text-sm text-gray-900 dark:text-white"
          >
            <option value="">{t('tenantUsers.filters.allStatus')}</option>
            <option value="active">{t('tenantUsers.filters.statusOptions.active')}</option>
            <option value="inactive">{t('tenantUsers.filters.statusOptions.inactive')}</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="mt-8 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 dark:ring-white dark:ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                <thead className="bg-gray-100 dark:bg-gray-800">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">
                      {t('tenantUsers.table.headers.name')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                      {t('tenantUsers.table.headers.email')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                      {t('tenantUsers.table.headers.role')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                      {t('tenantUsers.table.headers.status')}
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">{t('tenantUsers.table.headers.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                        {t('tenantUsers.table.loading')}
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-sm text-gray-500 dark:text-gray-400 italic">
                        {t('tenantUsers.table.empty')}
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => {
                      const role = roleMeta(user.role);
                      return (
                        <tr key={user.id}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-white sm:pl-6">
                            {user.name}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-400">{user.email}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 ${role.cls}`}>
                              {role.text}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              user.isActive
                                ? 'bg-green-900 text-green-200'
                                : 'bg-red-900 text-red-200'
                            }`}>
                              {user.isActive
                                ? t('tenantUsers.filters.statusOptions.active')
                                : t('tenantUsers.filters.statusOptions.inactive')}
                            </span>
                          </td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setShowEditModal(true);
                              }}
                              className="text-primary-500 hover:text-primary-400 mr-4"
                            >
                              {t('tenantUsers.actions.edit')}
                            </button>
                            <button
                              onClick={() => {
                                setResetUser(user);
                                setResetPassword('');
                                setResetConfirm('');
                                setShowResetModal(true);
                              }}
                              className="text-amber-600 hover:text-amber-500 mr-4"
                            >
                              {t('tenantUsers.actions.resetPassword')}
                            </button>
                            <button
                              onClick={() => toggleUserStatus(user.id)}
                              className={`${
                                user.isActive
                                  ? 'text-red-500 hover:text-red-400'
                                  : 'text-green-500 hover:text-green-400'
                              }`}
                            >
                              {user.isActive
                                ? t('tenantUsers.actions.deactivate')
                                : t('tenantUsers.actions.activate')}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      <UserModal
        isOpen={showAddModal || showEditModal}
        onClose={() => {
          setShowAddModal(false);
          setShowEditModal(false);
          setSelectedUser(null);
        }}
        user={(selectedUser as any) || undefined}
        onSuccess={fetchUsers}
      />

      {/* Reset Password Modal */}
      {showResetModal && resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowResetModal(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('tenantUsers.resetModal.title', { name: resetUser.name })}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('tenantUsers.resetModal.newPassword')}
                </label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder={t('tenantUsers.resetModal.passwordPlaceholder')}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-primary-500 focus:ring-primary-500"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('tenantUsers.resetModal.passwordHelp')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('tenantUsers.resetModal.confirmPassword')}
                </label>
                <input
                  type="password"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                  placeholder={t('tenantUsers.resetModal.confirmPlaceholder')}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-primary-500 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                {t('tenantUsers.resetModal.cancel')}
              </button>
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resetLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50"
              >
                {resetLoading ? t('tenantUsers.resetModal.saving') : t('tenantUsers.resetModal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TenantUsers;

