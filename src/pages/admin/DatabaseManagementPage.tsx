import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import logger from '../../utils/logger';
import { apiClient } from '../../services/api';
import { 
  Database, 
  Server, 
  Activity, 
  HardDrive, 
  Users, 
  FileText, 
  Trash2, 
  RefreshCw, 
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react';
import {
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  CircularProgress
} from '@mui/material';

interface DatabaseStats {
  collections: Array<{
    name: string;
    documentCount: number;
    avgObjSize: number;
    totalSize: number;
    indexes: number;
  }>;
  totalSize: string;
  totalDocuments: number;
  totalCollections: number;
  totalIndexes: number;
  connectionInfo: {
    host: string;
    port: number;
    database: string;
    status: 'connected' | 'disconnected' | 'error';
  };
}

interface DatabaseOperation {
  id: string;
  type: 'backup' | 'restore' | 'cleanup' | 'reindex';
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  message?: string;
  progress?: number;
}

const DatabaseManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [operations, setOperations] = useState<DatabaseOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [showReindexDialog, setShowReindexDialog] = useState(false);
  const [operationLoading, setOperationLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchDatabaseStats();
    fetchOperations();
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchDatabaseStats();
      fetchOperations();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchDatabaseStats = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/database/stats');
      setStats(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || t('databaseManagement.errors.loadStats'));
    } finally {
      setLoading(false);
    }
  };

  const fetchOperations = async () => {
    try {
      const response = await apiClient.get('/admin/database/operations');
      setOperations(response.data);
    } catch (err: any) {
      logger.error(t('databaseManagement.errors.loadOperations'), err);
    }
  };

  const handleBackup = async () => {
    try {
      await apiClient.post('/admin/database/backup');
      setShowBackupDialog(false);
      fetchOperations();
    } catch (err: any) {
      setError(err.response?.data?.message || t('databaseManagement.errors.backup'));
    }
  };

  const handleCleanup = async (collection?: string) => {
    try {
      await apiClient.post('/admin/database/cleanup', { collection });
      setShowCleanupDialog(false);
      fetchDatabaseStats();
      fetchOperations();
    } catch (err: any) {
      setError(err.response?.data?.message || t('databaseManagement.errors.cleanup'));
    }
  };

  const handleReindex = async (collection?: string) => {
    try {
      await apiClient.post('/admin/database/reindex', { collection });
      fetchOperations();
    } catch (err: any) {
      setError(err.response?.data?.message || t('databaseManagement.errors.reindex'));
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'running':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'failed':
      case 'error':
      case 'disconnected':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Info className="h-5 w-5 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <span className="block sm:inline">{error}</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('databaseManagement.header.title')}</h1>
        <div className="flex space-x-2">
          <button 
            onClick={fetchDatabaseStats}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('databaseManagement.header.refresh')}
          </button>
          <button 
            onClick={() => setShowBackupDialog(true)}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded flex items-center"
          >
            <Download className="h-4 w-4 mr-2" />
            {t('databaseManagement.header.backup')}
          </button>
        </div>
      </div>

      {/* Connection Status */}
      {stats && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Database className="h-8 w-8 text-blue-500 mr-4" />
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('databaseManagement.connection.title')}</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  {stats.connectionInfo.host}:{stats.connectionInfo.port}/{stats.connectionInfo.database}
                </p>
              </div>
            </div>
            <div className="flex items-center">
              {getStatusIcon(stats.connectionInfo.status)}
              <span className="ml-2 text-sm font-medium capitalize">
                {stats.connectionInfo.status === 'connected' ? t('databaseManagement.connection.status.connected') : 
                 stats.connectionInfo.status === 'disconnected' ? t('databaseManagement.connection.status.disconnected') : t('databaseManagement.connection.status.error')}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Database Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-4">
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <Typography variant="body2" color="textSecondary">{t('databaseManagement.stats.totalCollections')}</Typography>
              <Database className="h-4 w-4 text-gray-500" />
            </div>
            <Typography variant="h4" component="div" className="font-bold">
              {stats?.totalCollections || 0}
            </Typography>
          </CardContent>
        </Card>

        <Card className="p-4">
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <Typography variant="body2" color="textSecondary">{t('databaseManagement.stats.totalDocuments')}</Typography>
              <HardDrive className="h-4 w-4 text-gray-500" />
            </div>
            <Typography variant="h4" component="div" className="font-bold">
              {stats?.totalDocuments.toLocaleString() || 0}
            </Typography>
          </CardContent>
        </Card>

        <Card className="p-4">
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <Typography variant="body2" color="textSecondary">{t('databaseManagement.stats.dbSize')}</Typography>
              <HardDrive className="h-4 w-4 text-gray-500" />
            </div>
            <Typography variant="h4" component="div" className="font-bold">
              {stats?.totalSize || '0 MB'}
            </Typography>
          </CardContent>
        </Card>

        <Card className="p-4">
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <Typography variant="body2" color="textSecondary">{t('databaseManagement.stats.totalIndexes')}</Typography>
              <RefreshCw className="h-4 w-4 text-gray-500" />
            </div>
            <Typography variant="h4" component="div" className="font-bold">
              {stats?.totalIndexes || 0}
            </Typography>
          </CardContent>
        </Card>
      </div>

      {/* Database Operations */}
      <Card className="p-6">
        <CardContent>
          <Typography variant="h6" component="h2" className="mb-2">
            {t('databaseManagement.operations.title')}
          </Typography>
          <Typography variant="body2" color="textSecondary" className="mb-4">
            {t('databaseManagement.operations.subtitle')}
          </Typography>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={() => setShowBackupDialog(true)}
              disabled={operationLoading === 'backup'}
              variant="contained"
              className="h-20 flex flex-col items-center justify-center"
              sx={{ height: '80px', flexDirection: 'column' }}
            >
              {operationLoading === 'backup' ? (
                <RefreshCw className="h-6 w-6 animate-spin mb-2" />
              ) : (
                <Download className="h-6 w-6 mb-2" />
              )}
              {t('databaseManagement.operations.buttons.backup')}
            </Button>

            <Button
              onClick={() => setShowCleanupDialog(true)}
              disabled={operationLoading === 'cleanup'}
              variant="outlined"
              className="h-20 flex flex-col items-center justify-center"
              sx={{ height: '80px', flexDirection: 'column' }}
            >
              {operationLoading === 'cleanup' ? (
                <RefreshCw className="h-6 w-6 animate-spin mb-2" />
              ) : (
                <Trash2 className="h-6 w-6 mb-2" />
              )}
              {t('databaseManagement.operations.buttons.cleanup')}
            </Button>

            <Button
              onClick={() => setShowReindexDialog(true)}
              disabled={operationLoading === 'reindex'}
              variant="outlined"
              className="h-20 flex flex-col items-center justify-center"
              sx={{ height: '80px', flexDirection: 'column' }}
            >
              {operationLoading === 'reindex' ? (
                <RefreshCw className="h-6 w-6 animate-spin mb-2" />
              ) : (
                <RefreshCw className="h-6 w-6 mb-2" />
              )}
              {t('databaseManagement.operations.buttons.reindex')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Collections Table */}
      {stats && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('databaseManagement.collections.title')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('databaseManagement.collections.columns.name')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('databaseManagement.collections.columns.documents')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('databaseManagement.collections.columns.avgSize')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('databaseManagement.collections.columns.totalSize')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('databaseManagement.collections.columns.indexes')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    {t('databaseManagement.collections.columns.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {stats.collections.map((collection) => (
                  <tr key={collection.name} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {collection.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      {collection.documentCount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      {formatBytes(collection.avgObjSize)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      {formatBytes(collection.totalSize)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                      {collection.indexes}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleReindex(collection.name)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                          title={t('databaseManagement.collections.tooltips.reindex')}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedCollection(collection.name);
                            setShowCleanupDialog(true);
                          }}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                          title={t('databaseManagement.collections.tooltips.clean')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Operations */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('databaseManagement.recent.title')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('databaseManagement.recent.columns.type')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('databaseManagement.recent.columns.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('databaseManagement.recent.columns.start')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('databaseManagement.recent.columns.end')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  {t('databaseManagement.recent.columns.message')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {operations.map((operation) => (
                <tr key={operation.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white capitalize">
                    {operation.type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    <div className="flex items-center">
                      {getStatusIcon(operation.status)}
                      <span className="ml-2 capitalize">{t(`databaseManagement.connection.status.${operation.status}`)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    {new Date(operation.startTime).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    {operation.endTime ? new Date(operation.endTime).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                    {operation.message || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Backup Dialog */}
      {showBackupDialog && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                <Download className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">{t('databaseManagement.dialogs.backup.title')}</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('databaseManagement.dialogs.backup.message')}</p>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={handleBackup}
                  className="px-4 py-2 bg-green-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-300"
                >
                  {t('databaseManagement.dialogs.backup.confirm')}
                </button>
                <button
                  onClick={() => setShowBackupDialog(false)}
                  className="mt-3 px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  {t('databaseManagement.dialogs.backup.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cleanup Dialog */}
      {showCleanupDialog && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white dark:bg-gray-800">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-white">{t('databaseManagement.dialogs.cleanup.title')}</h3>
              <div className="mt-2 px-7 py-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t('databaseManagement.dialogs.cleanup.message', { 
                    target: selectedCollection 
                      ? t('databaseManagement.dialogs.cleanup.collection', { name: selectedCollection }) 
                      : t('databaseManagement.dialogs.cleanup.allDatabase') 
                  })}
                </p>
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={() => handleCleanup(selectedCollection || undefined)}
                  className="px-4 py-2 bg-red-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  {t('databaseManagement.dialogs.cleanup.confirm')}
                </button>
                <button
                  onClick={() => {
                    setShowCleanupDialog(false);
                    setSelectedCollection(null);
                  }}
                  className="mt-3 px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  {t('databaseManagement.dialogs.cleanup.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseManagementPage;