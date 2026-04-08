import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Loader, CheckCircle, XCircle } from 'lucide-react';
import { apiClient, validateChileanRut, formatChileanRut } from '../../services/api';
import logger from '../../utils/logger';
import { useTranslation } from 'react-i18next';

interface Ley20393Record {
  _id: string;
  rut: string;
  razonSocial: string;
  rolCausa: string;
  fechaDesde: string;
  fechaHasta: string;
  duracion: string;
  motivo: string;
  createdAt: string;
  updatedAt: string;
}

const Ley20393Page: React.FC = () => {
  const { t } = useTranslation();
  const token = localStorage.getItem('token');
  const [records, setRecords] = useState<Ley20393Record[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState<boolean>(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create');
  const [currentRecord, setCurrentRecord] = useState<Partial<Ley20393Record>>({});
  const [isValidRut, setIsValidRut] = useState<boolean | null>(null);
  const [formattedRut, setFormattedRut] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Fetch all records
  const fetchRecords = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get('/ley20393');
      setRecords(response.data.data);
      setError(null);
    } catch (err) {
      logger.error('Error fetching records:', err);
      setError(t('ley20393.messages.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [token]);

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // If the field is RUT, validate and format it
    if (name === 'rut') {
      // Format RUT as user types
      if (value) {
        const formatted = formatChileanRut(value);
        setFormattedRut(formatted);
        
        // Validate RUT
        const isValid = validateChileanRut(value);
        setIsValidRut(isValid);
        
        // Store the sanitized RUT (without dots, uppercase)
        const sanitizedRut = formatted.replace(/\./g, '');
        setCurrentRecord({ ...currentRecord, [name]: sanitizedRut });
      } else {
        setFormattedRut('');
        setIsValidRut(null);
        setCurrentRecord({ ...currentRecord, [name]: '' });
      }
    } else {
      setCurrentRecord({ ...currentRecord, [name]: value });
    }
  };

  // Handle date changes
  const handleDateChange = (date: Date | null, field: 'fechaDesde' | 'fechaHasta') => {
    if (date) {
      setCurrentRecord({ ...currentRecord, [field]: date.toISOString() });
    }
  };

  // Open dialog for creating a new record
  const handleOpenCreateDialog = () => {
    setDialogMode('create');
    setCurrentRecord({});
    setOpenDialog(true);
  };

  // Open dialog for editing an existing record
  const handleOpenEditDialog = (record: Ley20393Record) => {
    setDialogMode('edit');
    setCurrentRecord({ ...record });
    setOpenDialog(true);
  };

  // Close dialog
  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  // Save record (create or update)
  const handleSaveRecord = async () => {
    // Validate RUT before saving
    if (currentRecord.rut && !validateChileanRut(currentRecord.rut)) {
      setSnackbar({
        open: true,
        message: t('ley20393.form.rut.invalid'),
        severity: 'error'
      });
      return;
    }
    
    try {
      if (dialogMode === 'create') {
        await apiClient.post('/ley20393', currentRecord);
        setSnackbar({
          open: true,
          message: t('ley20393.messages.createSuccess'),
          severity: 'success'
        });
      } else {
        await apiClient.put(`/ley20393/${currentRecord._id}`, currentRecord);
        setSnackbar({
          open: true,
          message: t('ley20393.messages.updateSuccess'),
          severity: 'success'
        });
      }
      handleCloseDialog();
      fetchRecords();
    } catch (err) {
      logger.error('Error saving record:', err);
      setSnackbar({
        open: true,
        message: t('ley20393.messages.saveError'),
        severity: 'error'
      });
    }
  };

  // Delete record
  const handleDeleteRecord = async (id: string) => {
    if (window.confirm(t('ley20393.messages.deleteConfirm'))) {
      try {
        await apiClient.delete(`/ley20393/${id}`);
        setSnackbar({
          open: true,
          message: t('ley20393.messages.deleteSuccess'),
          severity: 'success'
        });
        fetchRecords();
      } catch (err) {
        logger.error('Error deleting record:', err);
        setSnackbar({
          open: true,
          message: t('ley20393.messages.deleteError'),
          severity: 'error'
        });
      }
    }
  };

  // Handle checkbox selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(records.map(record => record._id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(selectedId => selectedId !== id) : [...prev, id]
    );
  };

  // Delete multiple records
  const handleDeleteSelected = async () => {
    if (window.confirm(t('ley20393.messages.deleteConfirm'))) {
      try {
        await Promise.all(selectedIds.map(id => apiClient.delete(`/ley20393/${id}`)));
        setSnackbar({
          open: true,
          message: t('ley20393.messages.deleteSuccess'),
          severity: 'success'
        });
        setSelectedIds([]);
        fetchRecords();
      } catch (err) {
        logger.error('Error deleting records:', err);
        setSnackbar({
          open: true,
          message: t('ley20393.messages.deleteError'),
          severity: 'error'
        });
      }
    }
  };

  // Close snackbar
  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return t('ley20393.messages.invalidDate');
      }
      
      // Format as dd/MM/yyyy
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      
      return `${day}/${month}/${year}`;
    } catch (error) {
      return t('ley20393.messages.invalidDate');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center my-16">
        <Loader className="animate-spin h-8 w-8 text-primary-500" />
      </div>
    );
  } else if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 dark:bg-red-900/50 dark:text-red-300 dark:border-red-800">
        {error}
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 mb-8">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('ley20393.title')}
          </h1>
          <div className="flex gap-2">
            <button
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
              onClick={handleDeleteSelected}
              disabled={selectedIds.length === 0}
            >
              <Trash2 className="h-5 w-5 mr-2" /> Eliminar
            </button>
            <button
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              onClick={handleOpenCreateDialog}
            >
              <Plus className="h-5 w-5 mr-2" /> {t('ley20393.addNew')}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[5%]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    checked={selectedIds.length === records.length && records.length > 0}
                    onChange={handleSelectAll}
                  />
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[10%]">{t('ley20393.table.headers.rut')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[10%]">{t('ley20393.table.headers.company')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[10%]">{t('ley20393.table.headers.caseRole')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[10%]">{t('ley20393.table.headers.dates')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[10%]">{t('ley20393.table.headers.duration')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[25%]">{t('ley20393.table.headers.reason')}</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider w-[10%]">{t('ley20393.table.headers.actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t('ley20393.table.empty')}
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record._id}>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        checked={selectedIds.includes(record._id)}
                        onChange={() => handleSelectOne(record._id)}
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 break-words">{record.rut}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 break-words">{record.razonSocial}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 break-words">{record.rolCausa}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 break-words">
                      {t('ley20393.from')} {formatDate(record.fechaDesde)}
                      <br />
                      {t('ley20393.to')} {formatDate(record.fechaHasta)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 break-words">{record.duracion}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 break-words">{record.motivo}</td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <button
                        className="text-primary-600 hover:text-primary-900 dark:text-primary-400 dark:hover:text-primary-300 mr-2"
                        onClick={() => handleOpenEditDialog(record)}
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        onClick={() => handleDeleteRecord(record._id)}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog for creating/editing records */}
      {openDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {dialogMode === 'create' ? t('ley20393.dialog.createTitle') : t('ley20393.dialog.editTitle')}
              </h3>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ley20393.form.labels.rut')}</label>
                  <div className="relative">
                    <input
                      type="text"
                      name="rut"
                      className={`w-full pl-3 pr-10 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                        isValidRut === false
                          ? 'border-red-500 text-red-900 dark:text-red-200 focus:ring-red-500 focus:border-red-500'
                          : isValidRut === true
                          ? 'border-green-500 text-green-900 dark:text-green-200 focus:ring-green-500 focus:border-green-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                      value={formattedRut || currentRecord.rut || ''}
                      onChange={handleInputChange}
                      placeholder={t('ley20393.form.rut.placeholder')}
                      required
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      {isValidRut === true && <CheckCircle className="h-5 w-5 text-green-500" />}
                      {isValidRut === false && <XCircle className="h-5 w-5 text-red-500" />}
                    </div>
                  </div>
                  {isValidRut === false && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                      {t('ley20393.form.rut.invalid')}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ley20393.form.labels.company')}</label>
                  <input
                    type="text"
                    name="razonSocial"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    value={currentRecord.razonSocial || ''}
                    onChange={handleInputChange}
                    required
                  />
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ley20393.form.labels.caseRole')}</label>
                <input
                  type="text"
                  name="rolCausa"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={currentRecord.rolCausa || ''}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ley20393.form.labels.startDate')}</label>
                  <input
                    type="date"
                    name="fechaDesde"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    value={currentRecord.fechaDesde ? new Date(currentRecord.fechaDesde).toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const date = e.target.value ? new Date(e.target.value) : null;
                      handleDateChange(date, 'fechaDesde');
                    }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ley20393.form.labels.endDate')}</label>
                  <input
                    type="date"
                    name="fechaHasta"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    value={currentRecord.fechaHasta ? new Date(currentRecord.fechaHasta).toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const date = e.target.value ? new Date(e.target.value) : null;
                      handleDateChange(date, 'fechaHasta');
                    }}
                    required
                  />
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ley20393.form.labels.duration')}</label>
                <input
                  type="text"
                  name="duracion"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={currentRecord.duracion || ''}
                  onChange={handleInputChange}
                  placeholder={t('ley20393.form.duration.placeholder')}
                  required
                />
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('ley20393.form.labels.reason')}</label>
                <textarea
                  name="motivo"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  value={currentRecord.motivo || ''}
                  onChange={handleInputChange}
                  required
                ></textarea>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md mr-2"
                onClick={handleCloseDialog}
              >
                {t('common.cancel')}
              </button>
              <button
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                onClick={handleSaveRecord}
                disabled={!!(currentRecord.rut && isValidRut === false)}
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {snackbar.open && (
        <div className={`fixed bottom-4 left-1/2 transform -translate-x-1/2 px-4 py-3 rounded shadow-lg ${
          snackbar.severity === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
        }`}>
          {snackbar.message}
          <button
            className="ml-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            onClick={handleCloseSnackbar}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default Ley20393Page;