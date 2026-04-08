import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import logger from '../../utils/logger';
import { 
  FileText, 
  Download, 
  Send, 
  Plus, 
  Filter, 
  Calendar, 
  DollarSign, 
  TrendingUp,
  Users,
  Activity,
  Settings,
  Eye,
  CheckCircle,
  Clock,
  AlertTriangle,
  XCircle,
  Coins
} from 'lucide-react';
import billingService from '../../services/billingService';
import { TenantBilling, TrafficReport, BillingSettings, CreditStats } from '../../types/billing';
import AddCreditsModal from '../../components/modals/AddCreditsModal';

interface BillingStats {
  totalRevenue: number;
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  overdueInvoices: number;
  averageInvoiceAmount: number;
}

const TenantBillingPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'es'
    ? 'es-CL'
    : i18n.language === 'en'
      ? 'en-US'
      : i18n.language === 'pt'
        ? 'pt-PT'
        : i18n.language === 'fr'
          ? 'fr-FR'
          : 'es-CL';
  const [billings, setBillings] = useState<TenantBilling[]>([]);
  const [trafficReports, setTrafficReports] = useState<TrafficReport[]>([]);
  const [billingStats, setBillingStats] = useState<BillingStats | null>(null);
  const [creditStats, setCreditStats] = useState<CreditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'invoices' | 'traffic' | 'credits' | 'settings'>('invoices');
  
  // Filters
  const [invoiceFilters, setInvoiceFilters] = useState({
    status: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    tenantId: ''
  });
  
  const [trafficFilters, setTrafficFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    tenantId: ''
  });
  
  const [creditFilters, setCreditFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  
  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showTrafficModal, setShowTrafficModal] = useState(false);
  const [showAddCreditsModal, setShowAddCreditsModal] = useState(false);
  const [selectedBilling, setSelectedBilling] = useState<TenantBilling | null>(null);
  const [selectedReport, setSelectedReport] = useState<TrafficReport | null>(null);
  
  // Settings
  const [billingSettings, setBillingSettings] = useState<BillingSettings | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, [activeTab, currentPage, invoiceFilters, trafficFilters, creditFilters]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (activeTab === 'invoices') {
        logger.log('Fetching billings with filters:', invoiceFilters);
        const [billingsResponse, statsResponse] = await Promise.all([
          billingService.getBillings(invoiceFilters, currentPage, 10),
          billingService.getBillingStats(invoiceFilters.month, invoiceFilters.year)
        ]);
        
        logger.log('Billings response:', billingsResponse);
        logger.log('Billings data:', billingsResponse.billings || billingsResponse.data);
        
        setBillings(billingsResponse.billings || billingsResponse.data || []);
        setTotalPages(billingsResponse.pagination?.totalPages || billingsResponse.totalPages || 1);
        setTotalItems(billingsResponse.pagination?.total || billingsResponse.total || 0);
        setBillingStats(statsResponse);
      } else if (activeTab === 'traffic') {
        const reportsResponse = await billingService.getTrafficReports(trafficFilters, currentPage, 10);
        setTrafficReports(reportsResponse.data || []);
        setTotalPages(reportsResponse.totalPages || 1);
        setTotalItems(reportsResponse.total || 0);
      } else if (activeTab === 'credits') {
        const creditStatsResponse = await billingService.getCreditStats(creditFilters.month, creditFilters.year);
        setCreditStats(creditStatsResponse);
      } else if (activeTab === 'settings') {
        const settingsResponse = await billingService.getBillingSettings();
        setBillingSettings(settingsResponse);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('superAdminBilling.messages.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMonthlyBilling = async (tenantId?: string) => {
    try {
      if (tenantId) {
        await billingService.generateMonthlyBilling(tenantId, invoiceFilters.month, invoiceFilters.year);
      } else {
        await billingService.generateAllMonthlyBillings(invoiceFilters.month, invoiceFilters.year);
      }
      fetchData();
      setShowGenerateModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message || t('superAdminBilling.messages.errorGenerateBilling'));
    }
  };

  const handleGenerateTrafficReport = async (tenantId?: string) => {
    try {
      if (tenantId) {
        await billingService.generateTrafficReport(tenantId, trafficFilters.month, trafficFilters.year);
      } else {
        await billingService.generateAllTrafficReports(trafficFilters.month, trafficFilters.year);
      }
      fetchData();
      setShowTrafficModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message || t('superAdminBilling.messages.errorGenerateTraffic'));
    }
  };

  const handleUpdateInvoiceStatus = async (billingId: string, status: string) => {
    try {
      await billingService.updateInvoiceStatus(billingId, status);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || t('superAdminBilling.messages.errorUpdateStatus'));
    }
  };

  const handleSendInvoice = async (billingId: string) => {
    try {
      await billingService.sendInvoice(billingId);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || t('superAdminBilling.messages.errorSendInvoice'));
    }
  };

  const handleDownloadInvoice = async (billingId: string) => {
    try {
      const blob = await billingService.downloadInvoice(billingId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `factura-${billingId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.response?.data?.message || t('superAdminBilling.messages.errorDownloadInvoice'));
    }
  };

  const handleCreditsAdded = () => {
    // Refresh credit stats when credits are added
    fetchData();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'sent':
        return <Clock className="w-4 h-4 text-blue-500" />;
      case 'overdue':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <XCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'paid':
        return t('superAdminBilling.status.paid');
      case 'sent':
        return t('superAdminBilling.status.sent');
      case 'overdue':
        return t('superAdminBilling.status.overdue');
      default:
        return t('superAdminBilling.status.pending');
    }
  };

  const formatCurrency = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null || isNaN(amount)) {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'CLP'
      }).format(0);
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'CLP'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(locale);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('superAdminBilling.title')}</h1>
          <p className="text-gray-600">{t('superAdminBilling.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowGenerateModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('superAdminBilling.buttons.generateBilling')}
          </button>
          <button
            onClick={() => setShowTrafficModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Activity className="w-4 h-4" />
            {t('superAdminBilling.buttons.generateReport')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Statistics Cards */}
      {billingStats && activeTab === 'invoices' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <DollarSign className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('superAdminBilling.stats.invoices.totalRevenue')}</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(billingStats.totalRevenue)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <FileText className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('superAdminBilling.stats.invoices.totalInvoices')}</p>
                <p className="text-2xl font-bold text-gray-900">{billingStats.totalInvoices}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('superAdminBilling.stats.invoices.paid')}</p>
                <p className="text-2xl font-bold text-gray-900">{billingStats.paidInvoices}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-blue-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('superAdminBilling.stats.invoices.pending')}</p>
                <p className="text-2xl font-bold text-gray-900">{billingStats.pendingInvoices}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('superAdminBilling.stats.invoices.overdue')}</p>
                <p className="text-2xl font-bold text-gray-900">{billingStats.overdueInvoices}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">{t('superAdminBilling.stats.invoices.average')}</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(billingStats.averageInvoiceAmount)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('invoices')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'invoices'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            {t('superAdminBilling.tabs.invoices')}
          </button>
          <button
            onClick={() => setActiveTab('traffic')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'traffic'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Activity className="w-4 h-4 inline mr-2" />
            {t('superAdminBilling.tabs.traffic')}
          </button>
          <button
            onClick={() => setActiveTab('credits')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'credits'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Coins className="w-4 h-4 inline mr-2" />
            {t('superAdminBilling.tabs.credits')}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'settings'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Settings className="w-4 h-4 inline mr-2" />
            {t('superAdminBilling.tabs.settings')}
          </button>
        </nav>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'invoices' && (
        <div>
          {/* Filters */}
          <div className="bg-white p-4 rounded-lg shadow mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('superAdminBilling.filters.status')}</label>
                <select
                  value={invoiceFilters.status}
                  onChange={(e) => setInvoiceFilters({ ...invoiceFilters, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{t('superAdminBilling.status.all')}</option>
                  <option value="pending">{t('superAdminBilling.status.pending')}</option>
                  <option value="sent">{t('superAdminBilling.status.sent')}</option>
                  <option value="paid">{t('superAdminBilling.status.paid')}</option>
                  <option value="overdue">{t('superAdminBilling.status.overdue')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('superAdminBilling.filters.month')}</label>
                <select
                  value={invoiceFilters.month}
                  onChange={(e) => setInvoiceFilters({ ...invoiceFilters, month: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(0, i).toLocaleDateString(locale, { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('superAdminBilling.filters.year')}</label>
                <select
                  value={invoiceFilters.year}
                  onChange={(e) => setInvoiceFilters({ ...invoiceFilters, year: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - i;
                    return (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('superAdminBilling.filters.tenantId')}</label>
                <input
                  type="text"
                  value={invoiceFilters.tenantId}
                  onChange={(e) => setInvoiceFilters({ ...invoiceFilters, tenantId: e.target.value })}
                  placeholder={t('superAdminBilling.filters.placeholderTenant')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Invoices Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.invoices.invoice')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.invoices.tenant')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.invoices.period')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.invoices.amount')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.invoices.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.invoices.dueDate')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.invoices.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {billings.map((billing) => (
                    <tr key={billing._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {billing.invoice.invoiceNumber}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{billing.tenantName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {billing.billingPeriod.month}/{billing.billingPeriod.year}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(billing.costs.totalCost)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getStatusIcon(billing.invoice.status)}
                          <span className="ml-2 text-sm text-gray-900">
                            {getStatusText(billing.invoice.status)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(billing.invoice.dueDate)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setSelectedBilling(billing)}
                            className="text-blue-600 hover:text-blue-900"
                            title={t('superAdminBilling.buttons.viewDetails')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDownloadInvoice(billing._id)}
                            className="text-green-600 hover:text-green-900"
                            title={t('superAdminBilling.buttons.download')}
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {billing.invoice.status === 'pending' && (
                            <button
                              onClick={() => handleSendInvoice(billing._id)}
                              className="text-purple-600 hover:text-purple-900"
                              title={t('superAdminBilling.buttons.send')}
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'traffic' && (
        <div>
          {/* Traffic Reports Filters */}
          <div className="bg-white p-4 rounded-lg shadow mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('superAdminBilling.filters.month')}</label>
                <select
                  value={trafficFilters.month}
                  onChange={(e) => setTrafficFilters({ ...trafficFilters, month: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(0, i).toLocaleDateString(locale, { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('superAdminBilling.filters.year')}</label>
                <select
                  value={trafficFilters.year}
                  onChange={(e) => setTrafficFilters({ ...trafficFilters, year: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - i;
                    return (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('superAdminBilling.filters.tenantId')}</label>
                <input
                  type="text"
                  value={trafficFilters.tenantId}
                  onChange={(e) => setTrafficFilters({ ...trafficFilters, tenantId: e.target.value })}
                  placeholder={t('superAdminBilling.filters.placeholderTenant')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Traffic Reports Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.traffic.tenant')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.traffic.period')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.traffic.evaluations')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.traffic.apiCalls')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.traffic.tokens')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.traffic.peakUsage')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.traffic.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {trafficReports.map((report) => (
                    <tr key={report._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{report.tenantName}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {report.reportPeriod.month}/{report.reportPeriod.year}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {report.summary?.totalEvaluations?.toLocaleString() || '0'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {report.summary?.totalApiCalls?.toLocaleString() || '0'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {report.summary?.totalTokensUsed?.toLocaleString() || '0'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {report.summary.peakDayEvaluations} ({formatDate(report.summary.peakDate)})
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setSelectedReport(report)}
                            className="text-blue-600 hover:text-blue-900"
                            title={t('superAdminBilling.buttons.viewDetails')}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const blob = await billingService.downloadTrafficReport(report._id);
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `reporte-trafico-${report._id}.pdf`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                              } catch (err: any) {
                                setError(err.response?.data?.message || t('superAdminBilling.messages.errorDownloadReport'));
                              }
                            }}
                            className="text-green-600 hover:text-green-900"
                            title={t('superAdminBilling.buttons.download')}
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await billingService.sendTrafficReport(report._id);
                                // Show success message
                              } catch (err: any) {
                                setError(err.response?.data?.message || t('superAdminBilling.messages.errorSendReport'));
                              }
                            }}
                            className="text-purple-600 hover:text-purple-900"
                            title={t('superAdminBilling.buttons.send')}
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'credits' && creditStats && (
        <div>
          {/* Credit Filters and Actions */}
          <div className="bg-white p-4 rounded-lg shadow mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">{t('superAdminBilling.filters.creditsTitle')}</h3>
              <button
                onClick={() => setShowAddCreditsModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('superAdminBilling.buttons.addCredits')}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('superAdminBilling.filters.month')}</label>
                <select
                  value={creditFilters.month}
                  onChange={(e) => setCreditFilters({ ...creditFilters, month: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(0, i).toLocaleDateString(locale, { month: 'long' })}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('superAdminBilling.filters.year')}</label>
                <select
                  value={creditFilters.year}
                  onChange={(e) => setCreditFilters({ ...creditFilters, year: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 5 }, (_, i) => {
                    const year = new Date().getFullYear() - i;
                    return (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Credit Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <Activity className="h-8 w-8 text-blue-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{t('superAdminBilling.stats.credits.totalOperations')}</p>
                  <p className="text-2xl font-bold text-gray-900">{creditStats.overview?.totalOperations?.toLocaleString() || '0'}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <Coins className="h-8 w-8 text-green-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{t('superAdminBilling.stats.credits.creditsAdded')}</p>
                  <p className="text-2xl font-bold text-green-600">{creditStats.overview?.totalCreditsAdded?.toLocaleString() || '0'}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <TrendingUp className="h-8 w-8 text-red-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{t('superAdminBilling.stats.credits.creditsDeducted')}</p>
                  <p className="text-2xl font-bold text-red-600">{Math.abs(creditStats.overview?.totalCreditsDeducted || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-purple-500" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{t('superAdminBilling.stats.credits.averageOperationValue')}</p>
                  <p className="text-2xl font-bold text-gray-900">{(creditStats.overview?.averageOperationValue || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tenant Credit Statistics */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">{t('superAdminBilling.sections.tenantStats')}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.creditsTenant.tenant')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.creditsTenant.operations')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.creditsTenant.creditsAdded')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.creditsTenant.creditsDeducted')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('superAdminBilling.table.creditsTenant.currentBalance')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(creditStats.tenantStats || []).map((tenant) => (
                    <tr key={tenant.tenantId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{tenant.tenantName}</div>
                        <div className="text-sm text-gray-500">{tenant.tenantId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{tenant.totalOperations?.toLocaleString() || '0'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-green-600 font-medium">+{tenant.totalCreditsAdded?.toLocaleString() || '0'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-red-600 font-medium">{tenant.totalCreditsDeducted?.toLocaleString() || '0'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-medium ${
                          (tenant.currentBalance || 0) > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {tenant.currentBalance?.toLocaleString() || '0'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Operation Type Statistics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">{t('superAdminBilling.sections.operationTypeStats')}</h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {(creditStats.operationTypeStats || []).map((opType) => (
                    <div key={opType._id} className="flex justify-between items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {opType._id === 'evaluation' ? t('superAdminBilling.opTypes.evaluation') :
                           opType._id === 'api_call' ? t('superAdminBilling.opTypes.api_call') :
                           opType._id === 'credit_purchase' ? t('superAdminBilling.opTypes.credit_purchase') :
                           opType._id === 'credit_refund' ? t('superAdminBilling.opTypes.credit_refund') :
                           opType._id}
                        </div>
                        <div className="text-sm text-gray-500">{opType.count?.toLocaleString(locale) || '0'} {t('superAdminBilling.opTypes.operationsSuffix')}</div>
                      </div>
                      <div className={`text-sm font-medium ${
                        (opType.totalCreditsChanged || 0) > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(opType.totalCreditsChanged || 0) > 0 ? '+' : ''}{opType.totalCreditsChanged?.toLocaleString(locale) || '0'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">{t('superAdminBilling.sections.topTenantBalances')}</h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {(creditStats.topTenantBalances || []).map((tenant, index) => (
                    <div key={tenant.tenantId} className="flex justify-between items-center">
                      <div className="flex items-center">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                          index < 3 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {index + 1}
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">{tenant.tenantName}</div>
                          <div className="text-sm text-gray-500">{tenant.tenantId}</div>
                        </div>
                      </div>
                      <div className={`text-sm font-medium ${
                        (tenant.currentBalance || 0) > 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {tenant.currentBalance?.toLocaleString(locale) || '0'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && billingSettings && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">{t('superAdminBilling.sections.billingSettings')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">{t('superAdminBilling.sections.pricing')}</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('superAdminBilling.settings.evaluationPrice')}</label>
                  <input
                    type="number"
                    value={billingSettings.pricing.evaluationPrice}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('superAdminBilling.settings.apiCallPrice')}</label>
                  <input
                    type="number"
                    value={billingSettings.pricing.apiCallPrice}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('superAdminBilling.settings.tokenPricePerThousand')}</label>
                  <input
                    type="number"
                    value={billingSettings.pricing.tokenPrice}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                    readOnly
                  />
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-md font-medium text-gray-900 mb-3">{t('superAdminBilling.sections.generalSettings')}</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('superAdminBilling.settings.currency')}</label>
                  <input
                    type="text"
                    value={billingSettings.currency}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('superAdminBilling.settings.taxRatePercent')}</label>
                  <input
                    type="number"
                    value={billingSettings.taxRate}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                    readOnly
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('superAdminBilling.settings.daysUntilDue')}</label>
                  <input
                    type="number"
                    value={billingSettings.invoiceSettings.daysUntilDue}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                    readOnly
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
            >
              {t('superAdminBilling.buttons.editSettings')}
            </button>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {t('superAdminBilling.pagination.showing', {
              from: ((currentPage - 1) * 10) + 1,
              to: Math.min(currentPage * 10, totalItems),
              total: totalItems
            })}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50"
            >
              {t('superAdminBilling.pagination.prev')}
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 border rounded-md ${
                    page === currentPage
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50"
            >
              {t('superAdminBilling.pagination.next')}
            </button>
          </div>
        </div>
      )}

      {/* Generate Billing Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">{t('superAdminBilling.modals.generateBillingTitle')}</h3>
              <p className="text-sm text-gray-600 mb-4">
                {t('superAdminBilling.modals.generateBillingQuestion', { month: invoiceFilters.month, year: invoiceFilters.year })}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowGenerateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  {t('superAdminBilling.buttons.cancel')}
                </button>
                <button
                  onClick={() => handleGenerateMonthlyBilling()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
                >
                  {t('superAdminBilling.buttons.generateForAll')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate Traffic Report Modal */}
      {showTrafficModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">{t('superAdminBilling.modals.generateTrafficTitle')}</h3>
              <p className="text-sm text-gray-600 mb-4">
                {t('superAdminBilling.modals.generateTrafficQuestion', { month: trafficFilters.month, year: trafficFilters.year })}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowTrafficModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  {t('superAdminBilling.buttons.cancel')}
                </button>
                <button
                  onClick={() => handleGenerateTrafficReport()}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md"
                >
                  {t('superAdminBilling.buttons.generateForAll')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Billing Detail Modal */}
      {selectedBilling && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-4/5 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {t('superAdminBilling.modals.billingDetailTitlePrefix')} - {selectedBilling.invoice.invoiceNumber}
                </h3>
                <button
                  onClick={() => setSelectedBilling(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">{t('superAdminBilling.modals.generalInfo')}</h4>
                  <div className="space-y-2 text-sm">
                    <div><strong>{t('superAdminBilling.table.invoices.tenant')}:</strong> {selectedBilling.tenantName}</div>
                    <div><strong>{t('superAdminBilling.table.invoices.period')}:</strong> {selectedBilling.billingPeriod.month}/{selectedBilling.billingPeriod.year}</div>
                    <div><strong>{t('superAdminBilling.table.invoices.status')}:</strong> {getStatusText(selectedBilling.invoice.status)}</div>
                    <div><strong>{t('superAdminBilling.table.invoices.dueDate')}:</strong> {formatDate(selectedBilling.invoice.dueDate)}</div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">{t('superAdminBilling.modals.serviceUsage')}</h4>
                  <div className="space-y-2 text-sm">
                    <div><strong>{t('superAdminBilling.table.traffic.evaluations')}:</strong> {selectedBilling.usage?.totalEvaluations?.toLocaleString(locale) || '0'}</div>
                    <div><strong>{t('superAdminBilling.table.traffic.apiCalls')}:</strong> {selectedBilling.usage?.totalApiCalls?.toLocaleString(locale) || '0'}</div>
                    <div><strong>{t('superAdminBilling.table.traffic.tokens')}:</strong> {selectedBilling.usage?.totalTokensUsed?.toLocaleString(locale) || '0'}</div>
                    <div><strong>{t('superAdminBilling.modals.storage')}:</strong> {selectedBilling.usage?.totalStorageUsed || '0'} MB</div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">{t('superAdminBilling.modals.costBreakdown')}</h4>
                  <div className="space-y-2 text-sm">
                    <div><strong>{t('superAdminBilling.table.traffic.evaluations')}:</strong> {formatCurrency(selectedBilling.costs.evaluationCost)}</div>
                    <div><strong>{t('superAdminBilling.table.traffic.apiCalls')}:</strong> {formatCurrency(selectedBilling.costs.apiCallCost)}</div>
                    <div><strong>{t('superAdminBilling.table.traffic.tokens')}:</strong> {formatCurrency(selectedBilling.costs.tokenCost)}</div>
                    <div><strong>{t('superAdminBilling.modals.storage')}:</strong> {formatCurrency(selectedBilling.costs.storageCost)}</div>
                    <div className="border-t pt-2"><strong>{t('superAdminBilling.modals.total')}:</strong> {formatCurrency(selectedBilling.costs.totalCost)}</div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">{t('superAdminBilling.modals.actions')}</h4>
                  <div className="space-y-2">
                    <button
                      onClick={() => handleDownloadInvoice(selectedBilling._id)}
                      className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      {t('superAdminBilling.buttons.downloadPdf')}
                    </button>
                    {selectedBilling.invoice.status === 'pending' && (
                      <button
                        onClick={() => {
                          handleSendInvoice(selectedBilling._id);
                          setSelectedBilling(null);
                        }}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        {t('superAdminBilling.buttons.sendInvoice')}
                      </button>
                    )}
                    <select
                      value={selectedBilling.invoice.status}
                      onChange={(e) => {
                        handleUpdateInvoiceStatus(selectedBilling._id, e.target.value);
                        setSelectedBilling(null);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="pending">{t('superAdminBilling.status.pending')}</option>
                      <option value="sent">{t('superAdminBilling.status.sent')}</option>
                      <option value="paid">{t('superAdminBilling.status.paid')}</option>
                      <option value="overdue">{t('superAdminBilling.status.overdue')}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Traffic Report Detail Modal */}
      {selectedReport && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-4/5 max-w-6xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  {t('superAdminBilling.modals.trafficReportTitle', { tenantName: selectedReport.tenantName, month: selectedReport.reportPeriod.month, year: selectedReport.reportPeriod.year })}
                </h3>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{selectedReport.summary.totalEvaluations.toLocaleString(locale)}</div>
                  <div className="text-sm text-blue-600">{t('superAdminBilling.modals.totalEvaluations')}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{selectedReport.summary.averageDailyEvaluations.toFixed(1)}</div>
                  <div className="text-sm text-green-600">{t('superAdminBilling.modals.averageDaily')}</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{selectedReport.summary.peakDayEvaluations}</div>
                  <div className="text-sm text-purple-600">{t('superAdminBilling.modals.peakUsageWithDate', { date: formatDate(selectedReport.summary.peakDate) })}</div>
                </div>
              </div>
              
              <div className="bg-white border rounded-lg">
                <div className="px-4 py-3 border-b">
                  <h4 className="font-medium text-gray-900">{t('superAdminBilling.modals.dailyStats')}</h4>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('superAdminBilling.table.dailyStats.date')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('superAdminBilling.table.dailyStats.evaluations')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('superAdminBilling.table.dailyStats.apiCalls')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('superAdminBilling.table.dailyStats.tokens')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('superAdminBilling.table.dailyStats.storage')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {selectedReport.dailyStats.map((stat, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(stat.date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {stat.evaluations?.toLocaleString(locale) || '0'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {stat.apiCalls?.toLocaleString(locale) || '0'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {stat.tokensUsed?.toLocaleString(locale) || '0'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {stat.storageUsed || '0'} MB
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={async () => {
                    try {
                      const blob = await billingService.downloadTrafficReport(selectedReport._id);
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `reporte-trafico-${selectedReport._id}.pdf`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      document.body.removeChild(a);
                    } catch (err: any) {
                      setError(err.response?.data?.message || t('superAdminBilling.messages.errorDownloadReport'));
                    }
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {t('superAdminBilling.buttons.downloadPdf')}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await billingService.sendTrafficReport(selectedReport._id);
                      setSelectedReport(null);
                    } catch (err: any) {
                      setError(err.response?.data?.message || t('superAdminBilling.messages.errorSendReport'));
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {t('superAdminBilling.buttons.sendReport')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Credits Modal */}
      <AddCreditsModal
        isOpen={showAddCreditsModal}
        onClose={() => setShowAddCreditsModal(false)}
        onSuccess={handleCreditsAdded}
      />
    </div>
  );
};

export default TenantBillingPage;