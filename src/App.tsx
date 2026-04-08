import { Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import PageLoader from './components/common/PageLoader';
import ProtectedRoute from './components/auth/ProtectedRoute';
import RoleProtectedRoute from './components/auth/RoleProtectedRoute';
import SuperuserBlockedRoute from './components/auth/SuperuserBlockedRoute';
import RoleBasedRedirect from './components/auth/RoleBasedRedirect';
import { useAuth } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import { ThemeProvider } from './contexts/ThemeContext';
const Terms = lazy(() => import('./pages/Terms'));
const Privacy = lazy(() => import('./pages/Privacy'));

// Lazy-loaded components
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const OAuthCallback = lazy(() => import('./pages/auth/OAuthCallback'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const SingleEvaluation = lazy(() => import('./pages/evaluations/SingleEvaluation'));
const BulkEvaluation = lazy(() => import('./pages/evaluations/BulkEvaluation'));
const BulkEvaluationResults = lazy(() => import('./pages/evaluations/BulkEvaluationResults'));
const BulkEvaluationProgress = lazy(() => import('./pages/evaluations/BulkEvaluationProgress'));
const EvaluationResults = lazy(() => import('./pages/evaluations/EvaluationResults'));
const Progress = lazy(() => import('./pages/evaluations/Progress'));
const AdminLayout = lazy(() => import('./components/layouts/AdminLayout'));
const DashboardLayout = lazy(() => import('./components/layouts/DashboardLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const TenantUsers = lazy(() => import('./pages/tenant/TenantUsers'));
const TenantSettings = lazy(() => import('./pages/tenant/TenantSettings'));
const TenantLpalto = lazy(() => import('./pages/tenant/TenantLpalto'));
const TenantLpmedio = lazy(() => import('./pages/tenant/TenantLpmedio'));
// const SummariesPage = lazy(() => import('./pages/tenant/SummariesPage'));
const CompanyLookup = lazy(() => import('./pages/CompanyLookup'));
const NotFound = lazy(() => import('./pages/NotFound'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const SheriffDataLogsPage = lazy(() => import('./pages/evaluations/EvaluationsSummaryPage')); // Changed import name
const SheriffLogDetailPage = lazy(() => import('./pages/admin/SheriffLogDetailPage')); // Added import for detail page
const HowToUse = lazy(() => import('./pages/HowToUse'));
const Consultas = lazy(() => import('./pages/Consultas'));
const ConsultaDetailPage = lazy(() => import('./pages/ConsultaDetailPage'));
const AlertingPage = lazy(() => import('./pages/AlertingPage'));
const AlertingDetailPage = lazy(() => import('./pages/AlertingDetailPage'));
const FastCheckConsolidado = lazy(() => import('./pages/FastCheckConsolidado'));
const FastCheckEX = lazy(() => import('./pages/FastCheckEX'));
const EvaluationSettingsPage = lazy(() => import('./pages/admin/EvaluationSettingsPage'));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage'));
const HistoricalConsultas = lazy(() => import('./pages/HistoricalConsultas'));
const AdminRoutes = lazy(() => import('./routes/AdminRoutes'));
const AuditOverviewDebug = lazy(() => import('./pages/debug/AuditOverviewDebug'));

function App() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <PageLoader />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <ThemeProvider>
        <TenantProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={!isAuthenticated ? <LandingPage /> : <RoleBasedRedirect />} />
          <Route path="/login" element={!isAuthenticated ? <Login /> : <RoleBasedRedirect />} />
          <Route path="/register" element={!isAuthenticated ? <Register /> : <RoleBasedRedirect />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          {/* Debug route (public) */}
          <Route path="/debug/audit" element={<AuditOverviewDebug />} />
          
          {/* All protected routes wrapped in DashboardLayout */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<SuperuserBlockedRoute><Dashboard /></SuperuserBlockedRoute>} />
            <Route path="/help" element={<HowToUse />} />
            <Route path="/company/lookup" element={<CompanyLookup />} />
            <Route path="/evaluations/single" element={<SingleEvaluation />} />
            <Route path="/evaluations/bulk" element={<BulkEvaluation />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/evaluations/progress/:jobId" element={<BulkEvaluationProgress />} />
            <Route path="/evaluations/results/:jobId" element={<BulkEvaluationResults />} />
            <Route path="/evaluations/results/:id" element={<EvaluationResults />} />
            <Route path="/evaluations/history" element={<EvaluationResults />} /> {/* This might be the old summary page? */}
            <Route path="/evaluations/summary" element={<SheriffDataLogsPage />} /> {/* Changed component */}
            <Route path="/consultas" element={<Consultas />} />
            <Route path="/consultas/:id" element={<ConsultaDetailPage />} />
            <Route path="/consultas/historical" element={<HistoricalConsultas />} />
            <Route path="/alerting" element={<AlertingPage />} />
            <Route path="/alerting/:id" element={<AlertingDetailPage />} />
            <Route path="/fast-chec-ex/consolidado" element={<SuperuserBlockedRoute><FastCheckConsolidado /></SuperuserBlockedRoute>} />
            <Route path="/fast-check-ex" element={<SuperuserBlockedRoute><FastCheckEX /></SuperuserBlockedRoute>} />
            <Route path="/monitoring" element={<MonitoringPage />} />
            <Route path="/help" element={<HowToUse />} />
            
            {/* Tenant admin routes */}
            <Route element={<RoleProtectedRoute role="tenant_admin" />}>
              <Route path="/tenant/users" element={<TenantUsers />} />
              <Route path="/tenant/settings" element={<TenantSettings />} />
              <Route path="/tenant/lpalto" element={<TenantLpalto />} />
              <Route path="/tenant/lpmedio" element={<TenantLpmedio />} />
              {/* <Route path="/tenant/summaries" element={<SummariesPage />} /> */}
            </Route>
            
            {/* Superuser admin routes */}
            <Route path="/admin/*" element={<AdminRoutes />} />
          </Route>
          
          {/* Not found */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </TenantProvider>
      </ThemeProvider>
    </Suspense>
  );
}

export default App;
