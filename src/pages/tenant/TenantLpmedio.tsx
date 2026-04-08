import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import toast from 'react-hot-toast';
import { PlusIcon, MagnifyingGlassIcon, TrashIcon } from '@heroicons/react/24/outline';
import LpmedioModal from '../../components/modals/LpmedioModal';
import logger from '../../utils/logger';
import { useTranslation } from 'react-i18next';

interface LpmedioEntry {
  _id: string;
  rut: string;
  nombre: string;
  tipoPersona: 'Empresa' | 'Persona';
  tipoLista: string;
  nombreSubLista: string;
  fechaIncorporacion: string;
  createdAt: string;
  updatedAt: string;
}

const API_URL = globalThis.__APP_ENV__?.VITE_API_BASE_URL || 'https://duxiter.azurianlab.com/api';

const TenantLpmedio = () => {
  const { tenant } = useTenant();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<LpmedioEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<LpmedioEntry | null>(null);
  const [tipoPersonaFilter, setTipoPersonaFilter] = useState<string>('');
  const [nombreSubListaFilter, setNombreSubListaFilter] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Sanitize RUT: remove dots, keep dash
  const sanitizeRut = (rut: string): string => {
    return rut.replace(/\./g, '');
  };

  // Fetch entries
  const fetchEntries = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      // Build query parameters
      const queryParams = new URLSearchParams();
      if (search) {
        // If search looks like a RUT, sanitize it
        if (search.includes('.') || search.includes('-')) {
          queryParams.append('search', sanitizeRut(search));
        } else {
          queryParams.append('search', search);
        }
      }
      if (tipoPersonaFilter) queryParams.append('tipoPersona', tipoPersonaFilter);
      if (nombreSubListaFilter) queryParams.append('nombreSubLista', nombreSubListaFilter);

      const response = await fetch(`${API_URL}/lpmedio?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(t('lpmedioPage.fetchError'));
      }

      const data = await response.json();
      setEntries(data);
    } catch (error) {
      logger.error('Error fetching entries:', error);
      toast.error(error instanceof Error ? error.message : t('lpmedioPage.fetchErrorGeneric'));
      setEntries([]); // Ensure entries is an array to prevent .map error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [search, tipoPersonaFilter, nombreSubListaFilter]);

  // Delete entry
  const deleteEntry = async (id: string) => {
    if (!window.confirm(t('lpmedioPage.confirmDeleteMessage'))) {
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/lpmedio/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(t('lpmedioPage.deleteError'));
      }

      toast.success(t('lpmedioPage.deleteSuccess'));
      fetchEntries(); // Refresh the list
    } catch (error) {
      logger.error('Error deleting entry:', error);
      toast.error(t('lpmedioPage.deleteError'));
    }
  };

  // Delete selected entries
  const deleteSelectedEntries = async () => {
    if (selectedIds.length === 0) return;
    
    if (!window.confirm(`¿Está seguro de eliminar ${selectedIds.length} registro(s) seleccionado(s)?`)) {
      return;
    }

    const token = localStorage.getItem('token');
    let successCount = 0;
    let errorCount = 0;

    for (const id of selectedIds) {
      try {
        const response = await fetch(`${API_URL}/lpmedio/${id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        logger.error('Error deleting entry:', error);
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} registro(s) eliminado(s) correctamente`);
    }
    if (errorCount > 0) {
      toast.error(`Error al eliminar ${errorCount} registro(s)`);
    }

    setSelectedIds([]);
    fetchEntries();
  };

  // Toggle individual checkbox
  const toggleSelectEntry = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Toggle all checkboxes
  const toggleSelectAll = () => {
    if (selectedIds.length === entries.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(entries.map(entry => entry._id));
    }
  };

  // Get unique sub-list names for filter dropdown
  const uniqueSubListas = Array.from(new Set(entries.map(entry => entry.nombreSubLista)));

  return (
    <div className="px-4 sm:px-6 lg:px-8 text-gray-600 dark:text-gray-400">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('lpmedioPage.title')}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {t('lpmedioPage.subtitle')}
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none flex gap-2">
          <button
            type="button"
            onClick={() => {
              const headers = ['RUT','Nombre','TipoPersona','TipoLista','NombreSubLista','FechaIncorporacion'];
              const rows = [
                ['12.345.678-9','Juan Pérez','Persona','Lista Interna','Observación','2024-01-15'],
                ['76.543.210-1','Empresa XYZ S.A.','Empresa','Lista Interna','Seguimiento','2023-12-01']
              ];
              const esc = (v: string) => '"' + v.replace(/"/g, '""') + '"';
              const csv = [headers.join(';'), ...rows.map(r => r.map(esc).join(';'))].join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'plantilla_lpmedio.csv';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50"
          >
            {t('lpmedioPage.downloadCsvTemplate')}
          </button>
          <label className="inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 cursor-pointer">
            <input
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const token = localStorage.getItem('token');
                const formData = new FormData();
                formData.append('file', file);
                const toastId = toast.loading(t('lpmedioPage.uploading'));
                try {
                  const res = await fetch(`${API_URL}/lpmedio/upload`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${token}`
                    },
                    body: formData
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    throw new Error(data?.error || t('lpmedioPage.uploadError'));
                  }
                  toast.success(t('lpmedioPage.uploadSuccess', { saved: data.saved, duplicates: data.duplicates }), { id: toastId });
                  fetchEntries();
                } catch (err: any) {
                  toast.error(err?.message || t('lpmedioPage.uploadError'), { id: toastId });
                } finally {
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
            {t('lpmedioPage.uploadCsvXls')}
          </label>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 sm:w-auto"
          >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            {t('lpmedioPage.addRecord')}
          </button>
        </div>
      </div>

      <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
        {t('lpmedioPage.formatHint')}
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
              placeholder={t('lpmedioPage.searchPlaceholder')}
              className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 pl-10 focus:border-primary-500 focus:ring-primary-500 sm:text-sm text-gray-900 dark:text-white"
            />
          </div>
        </div>
        <div className="sm:w-48">
          <select
            value={tipoPersonaFilter}
            onChange={(e) => setTipoPersonaFilter(e.target.value)}
            className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-primary-500 focus:ring-primary-500 sm:text-sm text-gray-900 dark:text-white"
          >
            <option value="">{t('lpmedioPage.filterAllTypes')}</option>
            <option value="Empresa">Empresa</option>
            <option value="Persona">Persona</option>
          </select>
        </div>
        <div className="sm:w-64">
          <select
            value={nombreSubListaFilter}
            onChange={(e) => setNombreSubListaFilter(e.target.value)}
            className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-primary-500 focus:ring-primary-500 sm:text-sm text-gray-900 dark:text-white"
          >
            <option value="">{t('lpmedioPage.filterAllSubLists')}</option>
            {uniqueSubListas.map((subLista) => (
              <option key={subLista} value={subLista}>{subLista}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Delete selected button */}
      {selectedIds.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={deleteSelectedEntries}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            <TrashIcon className="-ml-1 mr-2 h-5 w-5" />
            Eliminar seleccionados ({selectedIds.length})
          </button>
        </div>
      )}

      {/* Entries Table */}
      <div className="mt-8 flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 dark:ring-white dark:ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                <thead className="bg-gray-100 dark:bg-gray-800">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">
                      <input
                        type="checkbox"
                        checked={entries.length > 0 && selectedIds.length === entries.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                    </th>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 dark:text-white sm:pl-6">
                      {t('lpmedioPage.headers.rut')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                      {t('lpmedioPage.headers.nombre')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                      {t('lpmedioPage.headers.tipoPersona')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                      {t('lpmedioPage.headers.tipoLista')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                      {t('lpmedioPage.headers.nombreSubLista')}
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 dark:text-white">
                      {t('lpmedioPage.headers.fechaIncorporacion')}
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">{t('lpmedioPage.headers.acciones')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-gray-600 dark:text-gray-400">
                        {t('common.loading')}
                      </td>
                    </tr>
                  ) : entries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-4 text-center text-gray-600 dark:text-gray-400">
                        {t('common.noResults')}
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <tr key={entry._id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(entry._id)}
                            onChange={() => toggleSelectEntry(entry._id)}
                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                        </td>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 dark:text-white sm:pl-6">
                          {entry.rut}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {entry.nombre}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {entry.tipoPersona}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {entry.tipoLista}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {entry.nombreSubLista}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-600 dark:text-gray-400">
                          {new Date(entry.fechaIncorporacion).toLocaleDateString('es-CL')}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                          <button
                            onClick={() => {
                              setSelectedEntry(entry);
                              setShowEditModal(true);
                            }}
                            className="text-primary-500 hover:text-primary-400 mr-4"
                          >
                            {t('lpmedioPage.edit')}
                          </button>
                          <button
                            onClick={() => deleteEntry(entry._id)}
                            className="text-red-500 hover:text-red-400"
                          >
                            {t('common.delete')}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <LpmedioModal
        isOpen={showAddModal || showEditModal}
        onClose={() => {
          setShowAddModal(false);
          setShowEditModal(false);
          setSelectedEntry(null);
        }}
        entry={selectedEntry || undefined}
        onSuccess={fetchEntries}
      />
    </div>
  );
};

export default TenantLpmedio;
