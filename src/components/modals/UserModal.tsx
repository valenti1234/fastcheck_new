import React, { useState, useEffect, useMemo } from 'react';
import { Dialog } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import logger from '../../utils/logger';
import { apiClient } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

type CanonicalRole = 'superuser' | 'tenant_admin' | 'evaluator' | 'read_only' | 'write_only' | 'user' | string;

interface User {
  id: string;
  name: string;
  email: string;
  role: CanonicalRole;
  isActive: boolean;
}

interface RoleOption {
  value: CanonicalRole;
  label: string;
  badge: string;
  description: string;
}

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user?: User;
  onSuccess: () => void;
}

const ROLE_BADGE: Record<CanonicalRole, string> = {
  superuser: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  tenant_admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  evaluator: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  read_only: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  write_only: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  user: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const ROLE_MAP_FROM_BACKEND: Record<string, CanonicalRole> = {
  superadmin: 'superuser',
  admin: 'tenant_admin',
  administrador: 'tenant_admin',
  evaluador: 'evaluator',
  auditor: 'read_only',
  'read-only': 'read_only',
  readonly: 'read_only',
  consulta: 'read_only',
  'write-only': 'write_only',
  writeonly: 'write_only',
  api: 'write_only',
  bot: 'write_only',
  usuario: 'user',
};

function normalizeRoleFromBackend(raw: any): CanonicalRole {
  const s = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!s) return 'user';
  if (['superuser', 'tenant_admin', 'evaluator', 'read_only', 'write_only', 'user'].includes(s)) {
    return s as CanonicalRole;
  }
  if (s in ROLE_MAP_FROM_BACKEND) return ROLE_MAP_FROM_BACKEND[s];
  if (s.includes('super')) return 'superuser';
  if (s.includes('admin')) return 'tenant_admin';
  if (s.includes('eval')) return 'evaluator';
  if (s.includes('audit') || s.includes('read') || s.includes('consulta')) return 'read_only';
  if (s.includes('write') || s.includes('api') || s.includes('bot')) return 'write_only';
  return 'user';
}

const UserModal: React.FC<UserModalProps> = ({ isOpen, onClose, user, onSuccess }) => {
  const { user: authUser } = useAuth();
  const { t } = useTranslation();

  const isCreatorSuper = useMemo(() => {
    try {
      const r = String((authUser as any)?.role || '').toLowerCase();
      const roles = Array.isArray((authUser as any)?.roles) ? (authUser as any).roles as string[] : [];
      return (
        r === 'superuser' ||
        r === 'superadmin' ||
        roles.includes('SUPER_WILDCARD') ||
        Boolean((authUser as any)?.isSuperuser)
      );
    } catch {
      return false;
    }
  }, [authUser]);

  /** Elenco ruoli consentiti con label/descrizione localizzate */
  const allowedRoleOptions: RoleOption[] = useMemo(() => {
    const make = (val: CanonicalRole, i18RoleKey: string): RoleOption => ({
      value: val,
      label: t(`userModal.forms.role.options.${i18RoleKey}.label`),
      badge: ROLE_BADGE[val] || ROLE_BADGE.user,
      description: t(`userModal.forms.role.options.${i18RoleKey}.description`),
    });
    const all: RoleOption[] = [
      make('superuser', 'superuser'),
      make('tenant_admin', 'tenantAdmin'),
      make('evaluator', 'evaluator'),
      make('read_only', 'auditor'),
      make('write_only', 'writeOnly'),
      make('user', 'user'),
    ];
    if (isCreatorSuper) return all;
    return all.filter((r) => r.value !== 'superuser');
  }, [isCreatorSuper, t]);

  const defaultRoleForNewUsers: CanonicalRole = 'evaluator';

  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    role: CanonicalRole;
    password: string;
    isActive: boolean;
  }>({
    name: '',
    email: '',
    role: defaultRoleForNewUsers,
    password: '',
    isActive: true,
  });

  useEffect(() => {
    if (!isOpen) return;
    if (user) {
      const normRole = normalizeRoleFromBackend(user.role);
      const available = allowedRoleOptions.some((r) => r.value === normRole) ? normRole : defaultRoleForNewUsers;
      setFormData({
        name: user.name || '',
        email: user.email || '',
        role: available,
        password: '',
        isActive: typeof user.isActive === 'boolean' ? user.isActive : true,
      });
    } else {
      setFormData({
        name: '',
        email: '',
        role: defaultRoleForNewUsers,
        password: '',
        isActive: true,
      });
    }
  }, [user, isOpen, allowedRoleOptions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: any = {
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        role: formData.role,
        isActive: formData.isActive,
      };
      if (!user) {
        if (formData.password.length < 6) {
          toast.error(t('userModal.errors.passwordTooShort'));
          return;
        }
        payload.password = formData.password;
      } else if (formData.password && formData.password.length >= 1 && formData.password.length < 6) {
        toast.error(t('userModal.errors.passwordTooShortEdit'));
        return;
      } else if (formData.password) {
        payload.password = formData.password;
      }

      let url = '/scoped-tenant/users';
      let method: 'post' | 'put' = 'post';
      if (user) {
        url = `/scoped-tenant/users/${user.id}`;
        method = 'put';
      }
      await (method === 'post'
        ? apiClient.post(url, payload)
        : apiClient.put(url, payload));

      toast.success(user ? t('userModal.toasts.successUpdate') : t('userModal.toasts.successCreate'));
      onSuccess();
      onClose();
    } catch (error: any) {
      logger.error(user ? 'Error updating user' : 'Error creating user', error);
      const detail = error?.response?.data?.detail;
      let msg = user ? t('userModal.toasts.errorUpdateGeneric') : t('userModal.toasts.errorCreateGeneric');
      if (typeof detail === 'string') {
        const mapping: Record<string, string> = {
          EMAIL_ALREADY_EXISTS: t('userModal.errors.emailAlreadyExists'),
          INVALID_EMAIL_FORMAT: t('userModal.errors.invalidEmailFormat'),
          NAME_MIN_2_CHARS: t('userModal.errors.nameMin2Chars'),
          PASSWORD_MIN_6_CHARS_REQUIRED: t('userModal.errors.passwordMin6Required'),
          PASSWORD_MIN_6_CHARS: t('userModal.errors.passwordTooShort'),
          ADMIN_OR_SUPERUSER_REQUIRED_TO_CREATE_USERS: t('userModal.errors.noPermissionManage'),
          ADMIN_OR_SUPERUSER_REQUIRED_TO_UPDATE_USERS: t('userModal.errors.noPermissionManage'),
          SUPERUSER_ROLE_ASSIGNMENT_REQUIRES_SUPERUSER_CREATOR: t('userModal.errors.superuserAssignForbidden'),
          CANNOT_DEMOTE_SUPERUSER_REQUIRES_SUPER_CREATOR: t('userModal.errors.superuserDemoteForbidden'),
          CROSS_ORG_EDIT_FORBIDDEN_NOT_SUPER: t('userModal.errors.crossOrgForbidden'),
          USER_NOT_FOUND: t('userModal.errors.userNotFound'),
        };
        if (detail in mapping) {
          msg = mapping[detail];
        } else if (/403|FORBIDDEN|PERMISSION/i.test(detail)) {
          msg = t('userModal.errors.permissionGeneric');
        }
      } else if (typeof (error as any)?.message === 'string' && (error as any).message) {
        msg = (error as any).message;
      }
      toast.error(msg);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="relative z-50"
    >
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-3.5">
            <div>
              <Dialog.Title className="text-lg font-semibold leading-6 text-gray-900 dark:text-white">
                {user ? t('userModal.titles.edit') : t('userModal.titles.add')}
              </Dialog.Title>
              {!isCreatorSuper && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('userModal.subtitles.superuserHiddenNote')}
                </p>
              )}
            </div>
            <button
              type="button"
              className="rounded-md bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-500 dark:text-gray-300 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            <div className="space-y-4">
              {/* NAME */}
              <div>
                <label htmlFor="um-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('userModal.forms.name.label')}
                </label>
                <input
                  type="text"
                  id="um-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  placeholder={t('userModal.forms.name.placeholder')}
                  required
                />
              </div>

              {/* EMAIL */}
              <div>
                <label htmlFor="um-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('userModal.forms.email.label')}
                </label>
                <input
                  type="email"
                  id="um-email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  placeholder={t('userModal.forms.email.placeholder')}
                  required
                />
              </div>

              {/* ROLE */}
              <div>
                <label htmlFor="um-role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('userModal.forms.role.label')}
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 font-normal">
                    {t('userModal.forms.role.rolesCountLabel', { count: allowedRoleOptions.length })}
                  </span>
                </label>
                <select
                  id="um-role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as CanonicalRole })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                >
                  {allowedRoleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* STATUS */}
              <div>
                <label htmlFor="um-active" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('userModal.forms.status.label')}
                </label>
                <div className="mt-1 flex items-center gap-3">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      id="um-active"
                      type="checkbox"
                      className="sr-only peer"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
                    <span className={`ms-3 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 ${
                      formData.isActive
                        ? 'bg-green-900 text-green-200'
                        : 'bg-red-900 text-red-200'
                    }`}>
                      {formData.isActive ? t('userModal.forms.status.active') : t('userModal.forms.status.inactive')}
                    </span>
                  </label>
                </div>
              </div>

              {/* PASSWORD */}
              <div>
                <label htmlFor="um-pwd" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('userModal.forms.password.label')}
                  {user && (
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 font-normal">
                      {t('userModal.forms.password.labelEditHelp')}
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  id="um-pwd"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 sm:text-sm"
                  minLength={6}
                  required={!user}
                  placeholder={user
                    ? t('userModal.forms.password.placeholderEdit')
                    : t('userModal.forms.password.placeholderCreate')}
                />
              </div>
            </div>

            <div className="mt-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                {t('userModal.buttons.cancel')}
              </button>
              <button
                type="submit"
                className="rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                {user ? t('userModal.buttons.update') : t('userModal.buttons.create')}
              </button>
            </div>
          </form>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
};

export default UserModal;
