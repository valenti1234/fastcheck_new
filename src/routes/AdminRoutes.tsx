import { Routes, Route } from 'react-router-dom';
import { lazy } from 'react';

const AdminDashboard = lazy(() => import('../pages/admin/AdminDashboard'));
const EvaluationSettingsPage = lazy(() => import('../pages/admin/EvaluationSettingsPage'));
const SheriffLogDetailPage = lazy(() => import('../pages/admin/SheriffLogDetailPage'));
const Ley21121Page = lazy(() => import('../pages/admin/Ley21121Page'));
const Ley20393Page = lazy(() => import('../pages/admin/Ley20393Page'));
const TenantManagementPage = lazy(() => import('../pages/admin/TenantManagementPage'));
const TenantUsersPage = lazy(() => import('../pages/admin/TenantUsersPage'));
const SuperAdminUsersPage = lazy(() => import('../pages/admin/SuperAdminUsersPage'));
const TenantMonitoringStatusPage = lazy(() => import('../pages/admin/TenantMonitoringStatusPage'));
const PromptConfigurationPage = lazy(() => import('../pages/admin/PromptConfigurationPage'));
const TenantBillingPage = lazy(() => import('../pages/admin/TenantBillingPage'));
const EnvConfigurationPage = lazy(() => import('../pages/admin/EnvConfigurationPage'));
const AntiunionCasesPage = lazy(() => import('../pages/admin/AntiunionCasesPage'));
const SnifaImportPage = lazy(() => import('../pages/admin/SnifaImportPage'));
const DatabaseManagementPage = lazy(() => import('../pages/admin/DatabaseManagementPage'));
const EquifaxMonitorPage = lazy(() => import('../pages/admin/EquifaxMonitorPage'));
const SheriffMonitorPage = lazy(() => import('../pages/admin/SheriffMonitorPage'));
const AdminEvaluationsPage = lazy(() => import('../pages/admin/AdminEvaluationsPage'));
const AdminResultsPage = lazy(() => import('../pages/admin/AdminResultsPage'));
import RoleProtectedRoute from '../components/auth/RoleProtectedRoute';

const AdminRoutes = () => {
  return (
    <RoleProtectedRoute role="superuser">
      <Routes>
        <Route index element={<AdminDashboard />} />
        <Route path="evaluation-settings" element={<EvaluationSettingsPage />} />
        <Route path="sheriff-log/:id" element={<SheriffLogDetailPage />} />
        <Route path="ley21121" element={<Ley21121Page />} />
        <Route path="ley20393" element={<Ley20393Page />} />
        <Route path="tenants" element={<TenantManagementPage />} />
        <Route path="tenants/:tenantId/users" element={<TenantUsersPage />} />
        <Route path="users" element={<SuperAdminUsersPage />} />
        <Route path="billing" element={<TenantBillingPage />} />
        <Route path="monitoring" element={<TenantMonitoringStatusPage />} />
        <Route path="prompt-configuration" element={<PromptConfigurationPage />} />
        <Route path="env-configuration" element={<EnvConfigurationPage />} />
        <Route path="antiunion-cases" element={<AntiunionCasesPage />} />
        <Route path="snifa-import" element={<SnifaImportPage />} />
        <Route path="database" element={<DatabaseManagementPage />} />
        <Route path="equifax-monitor" element={<EquifaxMonitorPage />} />
        <Route path="sheriff-monitor" element={<SheriffMonitorPage />} />
        <Route path="evaluations-summary" element={<AdminEvaluationsPage />} />
        <Route path="results" element={<AdminResultsPage />} />
      </Routes>
    </RoleProtectedRoute>
  );
};

export default AdminRoutes;
