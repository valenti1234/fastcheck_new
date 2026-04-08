import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminResultsApi, AdminResultItem, apiClient } from '../../services/api';
import { Database, AlertTriangle, RefreshCw, Search, X } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Tenant {
  _id: string;
  name: string;
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  tenant: {
    _id: string;
    name: string;
  } | null;
  isActive: boolean;
}

const AdminResultsPage: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<AdminResultItem[]>([]);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [rut, setRut] = useState<string>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  const [selectedPepFilter, setSelectedPepFilter] = useState<string>('');
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);

  const [appliedRut, setAppliedRut] = useState<string>('');
  const [appliedTenants, setAppliedTenants] = useState<string[]>([]);
  const [appliedPepFilter, setAppliedPepFilter] = useState<string>('');

  // Query type filter
  const [selectedQueryType, setSelectedQueryType] = useState<string>('');
  const [appliedQueryType, setAppliedQueryType] = useState<string>('');

  // User states
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [appliedUserId, setAppliedUserId] = useState<string>('');

  // Export states
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);

  // NUEVOS ESTADOS PARA "APLICAR A TODAS LAS PÁGINAS"
  const [isLoadingAllPages, setIsLoadingAllPages] = useState(false);
  const [allPagesProgress, setAllPagesProgress] = useState(0);
  const [allPagesLoaded, setAllPagesLoaded] = useState(false);
  const [fullDataset, setFullDataset] = useState<AdminResultItem[]>([]);

  const loadData = async (resetPage = false) => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {
        page: resetPage ? 1 : page,
        limit,
      };
      if (rut.trim()) params.rut = rut.trim();
      if (tenantId.trim()) params.tenantId = tenantId.trim();
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (appliedUserId) params.userEmail = appliedUserId;
      if (appliedQueryType) params.queryType = appliedQueryType;

      const res = await adminResultsApi.list(params);
      setItems(res.items);
      setPage(res.page);
      setTotalPages(res.totalPages);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error', 'Error loading data'));
    } finally {
      setLoading(false);
    }
  };

  // NUEVA FUNCIÓN: Cargar todas las páginas
  const loadAllData = async () => {
    try {
      setIsLoadingAllPages(true);
      setAllPagesProgress(0);
      
      // NO enviamos el RUT al servidor, lo filtramos localmente después con checkRowVisibility
      const params: any = {
        page: 1,
        limit: limit,
      };
      // NO incluir rut en params
      if (tenantId.trim()) params.tenantId = tenantId.trim();
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (appliedUserId) params.userEmail = appliedUserId;
      if (appliedQueryType) params.queryType = appliedQueryType;

      // Obtener primera página para saber total de páginas
      const firstRes = await adminResultsApi.list(params);
      const totalPagesToLoad = firstRes.totalPages;
      let allData: AdminResultItem[] = [...firstRes.items];

      setAllPagesProgress(Math.round((1 / totalPagesToLoad) * 100));

      // Cargar el resto de páginas
      for (let currentPage = 2; currentPage <= totalPagesToLoad; currentPage++) {
        const pageParams = { ...params, page: currentPage };
        const res = await adminResultsApi.list(pageParams);
        allData = [...allData, ...res.items];
        setAllPagesProgress(Math.round((currentPage / totalPagesToLoad) * 100));
      }

      // NO filtramos por RUT aquí, se filtra con checkRowVisibility
      setFullDataset(allData);
      setAllPagesLoaded(true);
      setTotal(allData.length);
      setPage(1);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar todas las páginas');
    } finally {
      setIsLoadingAllPages(false);
      setAllPagesProgress(0);
    }
  };

  useEffect(() => {
    if (!allPagesLoaded) {
      void loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, allPagesLoaded]);

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setShowTenantDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTenant = (tenantId: string) => {
    setSelectedTenants(prev =>
      prev.includes(tenantId) ? prev.filter(t => t !== tenantId) : [...prev, tenantId]
    );
  };

  const onApplyFilters = () => {
    setAllPagesLoaded(false);
    setFullDataset([]);
    setAppliedRut(rut.trim());
    setAppliedTenants([...selectedTenants]);
    setAppliedPepFilter(selectedPepFilter);
    setAppliedUserId(selectedUserId);
    setAppliedQueryType(selectedQueryType);
    // NO llamamos a loadData, solo aplicamos filtros localmente
  };

  const onApplyFiltersAllPages = async () => {
    setAppliedRut(rut.trim());
    setAppliedTenants([...selectedTenants]);
    setAppliedPepFilter(selectedPepFilter);
    setAppliedUserId(selectedUserId);
    setAppliedQueryType(selectedQueryType);
    await loadAllData();
  };

  const onClearFilters = () => {
    setRut('');
    setTenantId('');
    setStartDate('');
    setEndDate('');
    setSelectedTenants([]);
    setSelectedPepFilter('');
    setAppliedRut('');
    setAppliedTenants([]);
    setAppliedPepFilter('');
    setSelectedUserId('');
    setAppliedUserId('');
    setSelectedQueryType('');
    setAppliedQueryType('');
    setAllPagesLoaded(false);
    setFullDataset([]);
    setLimit(20);
    setPage(1);
    void loadData(true);
  };

  const fetchTenants = async () => {
    try {
      const response = await apiClient.get('/tenant/all');
      if (response.data && Array.isArray(response.data)) {
        setTenants(response.data);
      }
    } catch (err) {
      console.error('Error fetching tenants:', err);
    }
  };

  useEffect(() => { fetchTenants() }, [])

  const fetchUsers = async () => {
    try {
      const response = await apiClient.get('/users/superadmin/all');
      if (response.data && Array.isArray(response.data)) {
        setAllUsers(response.data);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  useEffect(() => { fetchUsers() }, [])

  const checkRowVisibility = (item: AdminResultItem) => {
    // Filtro de RUT (solo cuando está aplicado)
    if (appliedRut.trim()) {
      if (!item.rut || !item.rut.toLowerCase().includes(appliedRut.trim().toLowerCase())) {
        return false;
      }
    }

    // Filtro de Tenants
    if (appliedTenants.length > 0) {
      const itemTenantId = typeof item.tenantId === 'string' ? item.tenantId : (item.tenantId as any)?._id;
      if (!appliedTenants.includes(itemTenantId)) return false;
    }

    // Filtro de PEP
    if (appliedPepFilter) {
      const isPepValue = item.isPep === true ? 'pep' : item.isPep === false ? 'no-pep' : 'unknown';
      if (isPepValue !== appliedPepFilter) return false;
    }

    // Filtro de Usuario
    if (appliedUserId) {
      const usuarioData = allUsers.find(u => u.email === item.userEmail);
      const usuarioNombre = usuarioData ? usuarioData.name : item.userEmail;
      const selectedUserData = allUsers.find(u => u.email === appliedUserId);
      const selectedUserName = selectedUserData ? selectedUserData.name : appliedUserId;
      if (usuarioNombre !== selectedUserName) return false;
    }

    // Filtro de Tipo de Consulta
    if (appliedQueryType) {
      const itemType = (item.type || '').toLowerCase();
      const filterType = appliedQueryType.toLowerCase();
      if (itemType !== filterType) return false;
    }

    return true;
  };

  const removeFilter = (filterType: 'tenant' | 'pep' | 'rut' | 'tenantId' | 'startDate' | 'endDate' | 'userId' | 'queryType', value?: string) => {
    switch (filterType) {
      case 'tenant':
        if (value) {
          const newTenants = appliedTenants.filter(t => t !== value);
          setAppliedTenants(newTenants);
          setSelectedTenants(newTenants);
        }
        break;
      case 'pep':
        setAppliedPepFilter('');
        setSelectedPepFilter('');
        break;
      case 'rut':
        setRut('');
        setAppliedRut('');
        break;
      case 'tenantId':
        setTenantId('');
        break;
      case 'startDate':
        setStartDate('');
        break;
      case 'endDate':
        setEndDate('');
        break;
      case 'userId':
        setSelectedUserId('');
        setAppliedUserId('');
        break;
      case 'queryType':
        setSelectedQueryType('');
        setAppliedQueryType('');
        break;
    }
    // NO llamamos a loadData, solo limpiamos el filtro localmente
  };

  const exportToExcel = async () => {
    try {
      setIsExporting(true);
      setExportProgress(0);
      let allExportResults: AdminResultItem[] = [];
      let currentExportPage = 1;

      // Recolectar todos los datos de todas las páginas
      while (currentExportPage <= totalPages) {
        const params: any = {
          page: currentExportPage,
          limit: limit,
        };
        if (rut.trim()) params.rut = rut.trim();
        if (tenantId.trim()) params.tenantId = tenantId.trim();
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        if (appliedUserId) params.userEmail = appliedUserId;
        if (appliedQueryType) params.queryType = appliedQueryType;

        const response = await adminResultsApi.list(params);
        if (response?.items && Array.isArray(response.items)) {
          allExportResults = [...allExportResults, ...response.items];
        }

        // Calcular progreso
        setExportProgress(Math.round((currentExportPage / totalPages) * 100));
        currentExportPage++;
      }

      // Aplicar filtros de visibilidad
      const filteredResults = allExportResults.filter(r => checkRowVisibility(r));

      // Preparar datos para exportar
      const exportData = filteredResults.map(item => {
        const fecha = item.createdAt ? new Date(item.createdAt) : null;
        const fechaStr = fecha ? fecha.toLocaleDateString() : '—';
        const horaStr = fecha ? fecha.toLocaleTimeString() : '—';

        const nombreProveedor = item.sheriffLogData?.summaryData?.data?.sii?.razonSocial ||
          item.sheriffLogData?.summaryData?.data?.compliance?.name ||
          '—';
        const tenantName = item.tenantName || (typeof item.tenantId === 'string' ? item.tenantId : item.tenantId && (item.tenantId as any).name) || '—';
        const usuarioData = allUsers.find(u => u.email === item.userEmail);
        const usuario = usuarioData ? usuarioData.name : (item.userEmail || '—');
        const tipo = item.type || '—';
        const estado = item.status || '—';
        const tiempo = item.processingTime ? `${item.processingTime}ms` : '—';
        const credito = item.creditsConsumed !== undefined && item.creditsConsumed !== null ? item.creditsConsumed : '—';
        const clasificacion = item?.isPep === true ? 'PEP' : item?.isPep === false ? 'No PEP' : '—';

        return {
          "Tenant": tenantName,
          "Usuario": usuario,
          "Fecha": fechaStr,
          "Hora": horaStr,
          "RUT Proveedor": item.rut || '—',
          "Nombre Proveedor": nombreProveedor,
          "Clasificación Consulta": clasificacion,
          "Tipo": tipo,
          "Estado": estado,
          "Tiempo": tiempo,
          "Créditos": credito
        };
      });

      // Crear archivo Excel
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Resultados Globales");

      // Ajustar ancho de columnas
      const columnWidths = [
        { wch: 20 }, // Tenant
        { wch: 20 }, // Usuario
        { wch: 12 }, // Fecha
        { wch: 12 }, // Hora
        { wch: 15 }, // RUT Proveedor
        { wch: 30 }, // Nombre Proveedor
        { wch: 20 }, // Clasificación Consulta
        { wch: 15 }, // Tipo
        { wch: 12 }, // Estado
        { wch: 12 }, // Tiempo
        { wch: 10 }  // Créditos
      ];
      ws['!cols'] = columnWidths;

      // Descargar archivo
      XLSX.writeFile(wb, `resultados_globales_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      setError(err instanceof Error ? err.message : 'Error al exportar a Excel');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // Usar el dataset apropiado dependiendo del modo
  const activeDataset = allPagesLoaded ? fullDataset : items;
  const visibleItems = activeDataset.filter(checkRowVisibility);
  const hiddenItemsCount = activeDataset.length - visibleItems.length;

  const hasActiveFilters = appliedRut || tenantId || startDate || endDate || appliedTenants.length > 0 || appliedPepFilter || appliedUserId || appliedQueryType;

  // Filtrar usuarios basado en tenants seleccionados
  const filteredUsers = selectedTenants.length > 0
    ? allUsers.filter(user => user.tenant && selectedTenants.includes(user.tenant._id))
    : allUsers;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('adminResults.title', 'Resultados Globales (Todos los Tenants)')}
        </h1>
        <button
          className="px-4 py-2 rounded bg-green-600 text-white hover:bg-primary-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={exportToExcel}
          disabled={isExporting}
        >
          {isExporting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Exportando... {exportProgress}%
            </>
          ) : (
            'Exportar Excel'
          )}
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="space-y-4">
          {/* Primera fila: RUT, Tenant, Clasificación, Usuario */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">RUT</label>
              <input
                type="text"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                placeholder="12.345.678-9"
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
            <div className="relative dropdown-container">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tenant</label>
              <div className="relative mt-1">
                <button
                  type="button"
                  onClick={() => setShowTenantDropdown(!showTenantDropdown)}
                  className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500 px-3 py-2 text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {selectedTenants.length === 0
                      ? 'Seleccionar...'
                      : `${selectedTenants.length} seleccionado${selectedTenants.length > 1 ? 's' : ''}`
                    }
                  </span>
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                {showTenantDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {tenants.length > 0 ? (
                      tenants.map((tenant) => (
                        <label key={tenant._id} className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedTenants.includes(tenant._id)}
                            onChange={() => toggleTenant(tenant._id)}
                            className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{tenant.name}</span>
                        </label>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No hay tenants disponibles</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Clasificación</label>
              <select
                value={selectedPepFilter}
                onChange={(e) => setSelectedPepFilter(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500"
              >
                <option value="">Todos</option>
                <option value="pep">PEP</option>
                <option value="no-pep">No PEP</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Usuario</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500"
                disabled={selectedTenants.length === 0}
              >
                <option value="">Todos los usuarios</option>
                {filteredUsers.map((user) => (
                  <option key={user._id} value={user.email}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Segunda fila: Tenant ID, Fecha Inicio, Fecha Fin, Tipo Consulta */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tenant ID</label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="tenant ObjectId"
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('consultas.filters.startDate', 'Fecha Inicio')}</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('consultas.filters.endDate', 'Fecha Fin')}</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Consulta</label>
              <select
                value={selectedQueryType}
                onChange={(e) => setSelectedQueryType(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500"
              >
                <option value="">Todos</option>
                <option value="individual">Individual</option>
                <option value="masiva">Masiva</option>
              </select>
            </div>
          </div>

          {/* Tercera fila: Botones */}
          <div className="flex items-end gap-2 flex-wrap">
            <button
              className="px-4 py-2 rounded bg-primary-600 text-white hover:bg-primary-700 flex items-center gap-2"
              onClick={onApplyFilters}
            >
              <Search className="h-4 w-4" /> {t('consultas.filters.apply', 'Aplicar Filtros')}
            </button>
            
            <button
              className={`px-4 py-2 rounded text-white flex items-center gap-2 transition-colors ${isLoadingAllPages ? 'bg-purple-800 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
              onClick={onApplyFiltersAllPages}
              disabled={isLoadingAllPages}
            >
              <Search className="h-4 w-4" />
              {isLoadingAllPages ? `Cargando ${allPagesProgress}%` : 'Aplicar Todas las Páginas'}
            </button>

            <button
              className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              onClick={onClearFilters}
            >
              {t('consultas.filters.clear', 'Limpiar Filtros')}
            </button>
          </div>
        </div>
      </div>

      {/* Indicador cuando se han cargado todas las páginas */}
      {allPagesLoaded && (
        <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-purple-800 dark:text-purple-300">
              Modo: Todas las páginas cargadas ({fullDataset.length} resultados totales)
            </span>
          </div>
        </div>
      )}

      {hasActiveFilters && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filtros activos:</span>

            {appliedRut && (
              <button
                onClick={() => removeFilter('rut')}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-sm hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
              >
                <span>RUT: {appliedRut}</span>
                <X className="h-3 w-3" />
              </button>
            )}

            {appliedTenants.map(tenantId => {
              const tenant = tenants.find(t => t._id === tenantId);
              return (
                <button
                  key={tenantId}
                  onClick={() => removeFilter('tenant', tenantId)}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-sm hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
                >
                  <span>Tenant: {tenant?.name || tenantId}</span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}

            {appliedPepFilter && (
              <button
                onClick={() => removeFilter('pep')}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-sm hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
              >
                <span>Clasificación: {appliedPepFilter === 'pep' ? 'PEP' : 'No PEP'}</span>
                <X className="h-3 w-3" />
              </button>
            )}

            {tenantId && (
              <button
                onClick={() => removeFilter('tenantId')}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-sm hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
              >
                <span>Tenant ID: {tenantId}</span>
                <X className="h-3 w-3" />
              </button>
            )}

            {startDate && (
              <button
                onClick={() => removeFilter('startDate')}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-sm hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
              >
                <span>Desde: {new Date(startDate).toLocaleDateString()}</span>
                <X className="h-3 w-3" />
              </button>
            )}

            {endDate && (
              <button
                onClick={() => removeFilter('endDate')}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-sm hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
              >
                <span>Hasta: {new Date(endDate).toLocaleDateString()}</span>
                <X className="h-3 w-3" />
              </button>
            )}

            {appliedUserId && (
              <button
                onClick={() => removeFilter('userId')}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-sm hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
              >
                <span>Usuario: {allUsers.find(u => u.email === appliedUserId)?.name || appliedUserId}</span>
                <X className="h-3 w-3" />
              </button>
            )}

            {appliedQueryType && (
              <button
                onClick={() => removeFilter('queryType')}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 text-sm hover:bg-primary-200 dark:hover:bg-primary-800 transition-colors"
              >
                <span>Tipo: {appliedQueryType === 'individual' ? 'Individual' : 'Masiva'}</span>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tenant</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Usuario</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fecha</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Hora</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">RUT Proveedor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Nombre Proveedor</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Clasificación Consulta</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tipo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tiempo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Crédito</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              <tr>
                <td colSpan={12} className="px-6 py-4 text-center text-gray-600 dark:text-gray-300">
                  {t('common.loading', 'Cargando...')}
                </td>
              </tr>
            ) : visibleItems.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-6 py-4 text-center text-gray-600 dark:text-gray-300">
                  {activeDataset.length > 0 ? 'Hay resultados en esta página pero están ocultos por los filtros.' : t('resultsTable.noResults', 'No se encontraron resultados')}
                </td>
              </tr>
            ) : (
              visibleItems.map(item => {
                const fecha = item.createdAt ? new Date(item.createdAt) : null;
                const fechaStr = fecha ? fecha.toLocaleDateString() : '—';
                const horaStr = fecha ? fecha.toLocaleTimeString() : '—';

                const nombreProveedor = item.sheriffLogData?.summaryData?.data?.sii?.razonSocial ||
                  item.sheriffLogData?.summaryData?.data?.compliance?.name ||
                  '—';
                const tenantName = item.tenantName || (typeof item.tenantId === 'string' ? item.tenantId : item.tenantId && (item.tenantId as any).name) || '—';
                const usuarioData = allUsers.find(u => u.email === item.userEmail);
                const usuario = usuarioData ? usuarioData.name : (item.userEmail || '—');
                const tipo = item.type || '—';
                const estado = item.status || '—';
                const tiempo = item.processingTime ? `${item.processingTime}ms` : '—';
                const credito = item.creditsConsumed !== undefined && item.creditsConsumed !== null ? item.creditsConsumed : '—';

                return (
                  <tr key={item._id}>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300 flex items-center gap-2">
                      <Database className="h-4 w-4" /> {tenantName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {usuario}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {fechaStr}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {horaStr}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {item.rut || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {nombreProveedor}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {item?.isPep === true ? 'PEP' : item?.isPep === false ? 'No PEP' : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {tipo}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {estado}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {tiempo}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                      {credito}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-300">
                      <a
                        className="text-primary-600 hover:text-primary-700"
                        href={`/consultas?rut=${encodeURIComponent(item.rut || '')}`}
                      >
                        {t('common.view', 'Ver')}
                      </a>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {allPagesLoaded ? (
            <>
              Mostrando todos los resultados | Total: {fullDataset.length}
              {(appliedTenants.length > 0 || appliedPepFilter || appliedUserId || appliedQueryType) && (
                <span className="ml-2 font-semibold text-primary-600 dark:text-primary-400">
                  ({visibleItems.length} visibles después de filtros)
                </span>
              )}
            </>
          ) : (
            <>
              Mostrando página {page} de {totalPages} | Total: {total}
              {(appliedTenants.length > 0 || appliedPepFilter) && (
                <span className="ml-2 font-semibold text-primary-600 dark:text-primary-400">
                  (En esta página: {visibleItems.length} visibles, {hiddenItemsCount} ocultos)
                </span>
              )}
            </>
          )}
        </div>
        {!allPagesLoaded && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              {t('common.previous', 'Anterior')}
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              {t('common.next', 'Siguiente')}
            </button>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value, 10))}
              className="rounded-md border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              {[10, 20, 50, 100].map(n => (
                <option key={n} value={n}>{n} / {t('common.page', 'Página')}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminResultsPage;
