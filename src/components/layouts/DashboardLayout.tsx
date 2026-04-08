import React, { useState, ReactNode, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import ThemeToggle from '../common/ThemeToggle';
import {
  BarChart,
  FileText,
  Settings,
  Users,
  LogOut,
  Menu,
  X,
  ExternalLink,
  CheckSquare,
  Upload,
  Home,
  BarChart2,
  Building,
  LayoutDashboard,
  Search,
  HelpCircle,
  List,
  Activity,
  Monitor,
  CreditCard,
  Server,
  AlertTriangle,
  Database
} from 'lucide-react';
import duxiterLogo from '../../assets/duxiter_logo.png';
import packageJson from '../../../package.json';
import logger from '../../utils/logger';
import LanguageSwitcher from '../common/LanguageSwitcher';
import { useTranslation } from 'react-i18next';

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const { t, i18n } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Force language from localStorage on mount to ensure immediate consistency
  useEffect(() => {
    try {
      const stored = localStorage.getItem('i18nextLng');
      if (stored && stored !== i18n.language) {
        i18n.changeLanguage(stored);
      }
    } catch { }
  }, []);

  useEffect(() => {
    try {
      document.documentElement.setAttribute('lang', i18n.resolvedLanguage || 'es');
    } catch { }
  }, [i18n.resolvedLanguage]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      logger.error('Logout error:', error);
      // Navigate to login even if logout fails
      navigate('/login');
    }
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  // Define navigation links based on user role
  const navigationLinks = [
    { name: t('nav.dashboard'), href: '/dashboard', icon: LayoutDashboard, roles: ['tenant_admin', 'evaluator'] },
    { name: t('nav.singleEvaluation'), href: '/evaluations/single', icon: CheckSquare, roles: ['tenant_admin', 'evaluator'] },
    { name: t('nav.bulkEvaluation'), href: '/evaluations/bulk', icon: Upload, roles: ['tenant_admin', 'evaluator'] },
    { name: t('nav.consultas'), href: '/consultas', icon: FileText, roles: ['tenant_admin', 'evaluator'] },
    { name: t('nav.historicalConsultas'), href: '/consultas/historical', icon: FileText, roles: ['tenant_admin', 'evaluator'] },
    /* { name: t('nav.alerts'), href: '/alerting', icon: AlertTriangle, roles: ['tenant_admin', 'evaluator'] },
     { name: t('nav.monitoring'), href: '/monitoring', icon: Monitor, roles: ['tenant_admin', 'evaluator'] },*/
    { name: t('nav.users'), href: '/tenant/users', icon: Users, roles: ['tenant_admin'] },
    { name: t('nav.settings'), href: '/tenant/settings', icon: Settings, roles: ['tenant_admin'] },
    { name: t('nav.lpalto'), href: '/tenant/lpalto', icon: List, roles: ['tenant_admin'] },
    { name: t('nav.lpmedio'), href: '/tenant/lpmedio', icon: List, roles: ['tenant_admin'] },
    { name: t('nav.adminPanel'), href: '/admin', icon: BarChart2, roles: ['superuser'] },
    { name: t('nav.evaluationSettings'), href: '/admin/evaluation-settings', icon: Settings, roles: ['superuser'] },
    { name: t('nav.promptConfiguration'), href: '/admin/prompt-configuration', icon: Settings, roles: ['superuser'] },
    { name: t('nav.antiunionCases'), href: '/admin/antiunion-cases', icon: FileText, roles: ['superuser'] },
    { name: t('nav.snifaImport'), href: '/admin/snifa-import', icon: FileText, roles: ['superuser'] },
    { name: t('nav.ley21121'), href: '/admin/ley21121', icon: FileText, roles: ['superuser'] },
    { name: t('nav.ley20393'), href: '/admin/ley20393', icon: FileText, roles: ['superuser'] },
    { name: t('nav.tenants'), href: '/admin/tenants', icon: Building, roles: ['superuser'] },
    { name: t('nav.adminUsers'), href: '/admin/users', icon: Users, roles: ['superuser'] },
    { name: t('nav.billing'), href: '/admin/billing', icon: CreditCard, roles: ['superuser'] },
    { name: t('nav.monitoringStatus'), href: '/admin/monitoring', icon: Activity, roles: ['superuser'] },
    { name: t('nav.envConfiguration'), href: '/admin/env-configuration', icon: Server, roles: ['superuser'] },
    { name: t('nav.database'), href: '/admin/database', icon: Database, roles: ['superuser'] },
    { name: t('nav.equifaxMonitor'), href: '/admin/equifax-monitor', icon: Monitor, roles: ['superuser'] },
    { name: t('nav.sheriffMonitor'), href: '/admin/sheriff-monitor', icon: Monitor, roles: ['superuser'] },
    { name: t('nav.adminEvaluations'), href: '/admin/evaluations-summary', icon: BarChart2, roles: ['superuser'] },
    { name: t('nav.adminResults'), href: '/admin/results', icon: Database, roles: ['superuser'] },
    { name: t('app.help'), href: '/help', icon: HelpCircle, roles: ['superuser', 'tenant_admin', 'evaluator'] },
    { name: "Deep Check", href: 'https://www.pro2win.cl/', icon: ExternalLink, roles: ['superuser', 'tenant_admin', 'evaluator'] },
  ];

  
  // Filter navigation links based on user role
  const filteredLinks = navigationLinks.filter(link =>
    user && link.roles.includes(user.role)
  );

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      {/* Mobile sidebar */}
      <div className="lg:hidden">
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-40 transition-opacity duration-300 ease-linear"
          style={{ display: sidebarOpen ? 'block' : 'none' }}
          onClick={closeSidebar}></div>

        <div className={`fixed inset-y-0 left-0 flex flex-col min-h-0 w-64 bg-white dark:bg-gray-800 shadow-lg transform transition duration-300 ease-in-out z-50 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}>
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <img src={duxiterLogo} alt="Duxiter Logo" className="h-8 w-auto" />
              <span className="ml-2 text-xl font-bold text-primary-600 dark:text-primary-400">Duxiter</span>
            </div>
            <button onClick={closeSidebar} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pt-5 pb-4">
            <div className="px-2 space-y-1">
              {filteredLinks.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-2 py-2 text-base font-medium rounded-md ${isActive(item.href)
                    ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-white'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
                    }`}
                  onClick={closeSidebar}
                >
                  <item.icon
                    className={`mr-4 flex-shrink-0 h-6 w-6 ${isActive(item.href)
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400'
                      }`}
                  />
                  {item.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex-shrink-0 flex border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex-shrink-0 w-full group block">
              <div className="flex items-center">
                <div>
                  <div className="h-9 w-9 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-white text-sm font-medium">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-base font-medium text-gray-700 group-hover:text-gray-900 dark:text-gray-200 dark:group-hover:text-white">{user?.name}</p>
                  <p className="text-sm font-medium text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-300">{tenant?.name}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 flex flex-col border-t border-gray-200 dark:border-gray-700 p-4 space-y-3">
            <div className="flex flex-col space-y-2">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <LogOut className="mr-2 h-4 w-4" /> {t('app.logout')}
            </button>

            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>v{packageJson.version}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Static sidebar for desktop */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 min-h-0">
        <div className="flex flex-col flex-grow h-full min-h-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center h-16 flex-shrink-0 px-4 border-b border-gray-200 dark:border-gray-700">
            <img src={duxiterLogo} alt="Duxiter Logo" className="h-8 w-auto" />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pt-5 pb-4">
            <nav className="mt-5 flex-1 px-4 space-y-1">
              {filteredLinks.map((item) => {

                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md ${isActive(item.href)
                      ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/50 dark:text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
                      }`}
                  >
                    <item.icon
                      className={`mr-3 flex-shrink-0 h-5 w-5 ${isActive(item.href)
                        ? 'text-primary-600 dark:text-primary-400'
                        : 'text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-400'
                        }`}
                    />
                    {item.name}
                  </Link>
                )
              })}
         
            </nav>
          </div>

          <div className="flex-shrink-0 flex border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex-shrink-0 w-full group block">
              <div className="flex items-center">
                <div>
                  <div className="h-9 w-9 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-white text-sm font-medium">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900 dark:text-gray-200 dark:group-hover:text-white">{user?.name}</p>
                  <p className="text-xs font-medium text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-300">{tenant?.name}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 flex flex-col border-t border-gray-200 dark:border-gray-700 p-4 space-y-3 sticky bottom-0 bg-white dark:bg-gray-800">
            <div className="flex flex-col space-y-2">
              <ThemeToggle />
              <LanguageSwitcher />
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center justify-center w-full px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <LogOut className="mr-2 h-4 w-4" /> {t('app.logout')}
            </button>

            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>v{packageJson.version}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile header */}
      <div className="lg:pl-64 flex flex-col flex-1">
        <div className="sticky top-0 z-10 lg:hidden pl-1 pt-1 sm:pl-3 sm:pt-3 bg-gray-50 dark:bg-gray-900 shadow-sm">
          <button
            type="button"
            className="-ml-0.5 -mt-0.5 h-12 w-12 inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 dark:text-gray-400 dark:hover:text-white"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">{t('app.name')}</span>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        <main className="flex-1 bg-gray-100 dark:bg-gray-900">
          <div className="py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
