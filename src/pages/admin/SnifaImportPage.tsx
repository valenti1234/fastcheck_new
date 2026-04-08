import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  LinearProgress,
  Grid,
  Chip,
  Snackbar,
  Pagination,
  Checkbox
} from '@mui/material';
import { Upload as UploadIcon, PlayArrow, Cancel, Delete as DeleteIcon, DeleteSweep as DeleteSweepIcon } from '@mui/icons-material';
import snifaService, { SnifaImportPreview, SnifaImportJob, SnifaRecord, SnifaGlobalSummary } from '../../services/snifaService';

const SnifaImportPage: React.FC = () => {
  const { t } = useTranslation();
  const [globalSummary, setGlobalSummary] = useState<SnifaGlobalSummary | null>(null);
  const [previewData, setPreviewData] = useState<SnifaImportPreview | null>(null);
  const [job, setJob] = useState<SnifaImportJob | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const [allData, setAllData] = useState<SnifaRecord[]>([]);
  const [list, setList] = useState<SnifaRecord[]>([]);
  const [filters, setFilters] = useState<{ nombre?: string; expediente?: string; regionNombre?: string; procesoSancionEstado?: string; razonSocial?: string }>({});
  const [hasActiveFilters, setHasActiveFilters] = useState(false);
  const [searchProgress, setSearchProgress] = useState<number | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteAllProgress, setDeleteAllProgress] = useState<{ current: number; total: number } | null>(null);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [page, setPage] = useState(1);
  const limit = 10;
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadSummary();
    loadPage(1);
  }, []);

  useEffect(() => {
    if (!hasActiveFilters) {
      loadPage(page);
    }
  }, [page]);

  useEffect(() => {
    if (hasActiveFilters && allData.length > 0) {
      const start = (page - 1) * limit;
      setList(allData.slice(start, start + limit));
    }
  }, [page, allData]);

  const loadSummary = async () => {
    try {
      const s = await snifaService.getSummary();
      setGlobalSummary(s);
    } catch (err) {
      console.error('Error loading summary', err);
    }
  };

  const loadPage = async (p: number) => {
    try {
      const res = await snifaService.list({ page: p, limit });
      setList(res.data || []);
      setPages(res.totalPages || 1);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err.message || 'Error al cargar registros SNIFA');
    }
  };

  const handleSearch = async () => {
    try {
      setSearchProgress(0);
      let fetched: SnifaRecord[] = [];
      let fetchPage = 1;
      let totalPages = 1;

      do {
        const res = await snifaService.list({ page: fetchPage, limit: 100 });
        fetched = [...fetched, ...(res.data || [])];
        totalPages = res.totalPages || 1;
        setSearchProgress(Math.round((fetchPage / totalPages) * 100));
        fetchPage++;
      } while (fetchPage <= totalPages);

      const { nombre, expediente, regionNombre, procesoSancionEstado, razonSocial } = filters;
      const filtered = fetched.filter((r) => {
        if (nombre && !r.nombre?.toLowerCase().includes(nombre.toLowerCase())) return false;
        if (expediente && !r.expediente?.toLowerCase().includes(expediente.toLowerCase())) return false;
        if (regionNombre && !r.regionNombre?.toLowerCase().includes(regionNombre.toLowerCase())) return false;
        if (procesoSancionEstado && !r.procesoSancionEstado?.toLowerCase().includes(procesoSancionEstado.toLowerCase())) return false;
        if (razonSocial && !r.razonSocial?.toLowerCase().includes(razonSocial.toLowerCase())) return false;
        return true;
      });

      setAllData(filtered);
      setHasActiveFilters(true);
      setPage(1);
      setTotal(filtered.length);
      setPages(Math.ceil(filtered.length / limit));
      setList(filtered.slice(0, limit));
      setSearchProgress(null);
    } catch (err: any) {
      setSearchProgress(null);
      setError(err.message || 'Error al buscar');
    }
  };

  const handleClear = () => {
    setFilters({});
    setAllData([]);
    setHasActiveFilters(false);
    setPage(1);
    loadPage(1);
  };

  const validateFile = (f: File): string | null => {
    const ext = f.name.toLowerCase().split('.').pop();
    const validExt = ['xlsx', 'xls'].includes(ext || '');
    if (!validExt) return 'Formato inválido. Solo XLSX/XLS';
    if (f.size > 50 * 1024 * 1024) return 'El archivo supera 50MB';
    return null;
  };

  const handleSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const f = files[0];
    const validationError = validateFile(f);
    if (validationError) {
      setError(validationError);
      return;
    }
    setFile(f);
    setImportDialogOpen(true);
    doPreview(f);
  };

  const doPreview = async (f: File) => {
    setError(null);
    setPreviewData(null);
    try {
      const p = await snifaService.preview(f);
      setPreviewData(p);
    } catch (err: any) {
      setError(err.message || 'Error al previsualizar archivo');
    }
  };

  const startImport = async () => {
    if (!file) return;
    try {
      setProcessing(true);
      setUploadProgress(0);
      const resp = await snifaService.import(file, (p) => setUploadProgress(p));
      setSuccess(`Importación completada: ${resp.summary.saved} nuevos, ${resp.summary.duplicates} duplicados`);
      setJob({ _id: resp.jobId, status: 'completed', processed: resp.summary.processed, saved: resp.summary.saved, duplicates: resp.summary.duplicates, errorCount: resp.summary.errors, total: resp.summary.total, warnings: [] });
      await loadPage(1);
      await loadSummary();
      setTimeout(() => {
        setImportDialogOpen(false);
        setProcessing(false);
        setUploadProgress(0);
        setPreviewData(null);
        setFile(null);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Error durante la importación');
      setProcessing(false);
    }
  };

  const cancelImport = async () => {
    if (!job) return;
    try {
      await snifaService.cancelJob(job._id);
      setSuccess('Proceso cancelado');
      setProcessing(false);
    } catch (err: any) {
      setError(err.message || 'No se pudo cancelar el proceso');
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    const allIds = list.map((r) => r._id);
    const allSelected = allIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allIds.includes(id)));
    } else {
      setSelectedIds((prev) => [...new Set([...prev, ...allIds])]);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    setDeleting(true);
    const errors: string[] = [];
    for (const id of selectedIds) {
      try {
        await snifaService.deleteSanction(id);
      } catch (err: any) {
        errors.push(id);
      }
    }
    setSelectedIds([]);
    setDeleting(false);
    if (errors.length > 0) {
      setError(`No se pudieron eliminar ${errors.length} registro(s)`);
    } else {
      setSuccess(`${selectedIds.length > 1 ? selectedIds.length + ' registros eliminados' : 'Registro eliminado'} correctamente`);
    }
    if (hasActiveFilters) {
      const updated = allData.filter((r) => !selectedIds.includes(r._id));
      setAllData(updated);
      setTotal(updated.length);
      setPages(Math.ceil(updated.length / limit));
      setList(updated.slice((page - 1) * limit, page * limit));
    } else {
      await loadPage(page);
      await loadSummary();
    }
  };

  const handleDeleteAll = async () => {
    setConfirmDeleteAllOpen(false);
    setDeletingAll(true);
    setDeleteAllProgress(null);

    let errors = 0;
    let totalDeleted = 0;

    try {
      // Fetch first page to get total
      const firstRes = await snifaService.list({ page: 1, limit: 100 });
      const totalPages = firstRes.totalPages || 1;

      // Collect all IDs page by page
      let allIds: string[] = (firstRes.data || []).map((r: SnifaRecord) => r._id);

      for (let p = 2; p <= totalPages; p++) {
        const res = await snifaService.list({ page: p, limit: 100 });
        allIds = [...allIds, ...(res.data || []).map((r: SnifaRecord) => r._id)];
      }

      const totalCount = allIds.length;
      setDeleteAllProgress({ current: 0, total: totalCount });

      // Delete one by one, awaiting each response
      for (const id of allIds) {
        try {
          await snifaService.deleteSanction(id);
          totalDeleted++;
        } catch (err: any) {
          errors++;
        }
        setDeleteAllProgress({ current: totalDeleted + errors, total: totalCount });
      }

      if (errors > 0) {
        setError(`Se eliminaron ${totalDeleted} registros. No se pudieron eliminar ${errors}.`);
      } else {
        setSuccess(`${totalDeleted} registros eliminados correctamente`);
      }
    } catch (err: any) {
      setError(err.message || 'Error al eliminar todos los registros');
    } finally {
      setDeletingAll(false);
      setDeleteAllProgress(null);
      setSelectedIds([]);
      setHasActiveFilters(false);
      setAllData([]);
      setPage(1);
      await loadPage(1);
      await loadSummary();
    }
  };

  const allOnPageSelected = list.length > 0 && list.every((r) => selectedIds.includes(r._id));
  const someOnPageSelected = list.some((r) => selectedIds.includes(r._id));

  const summaryStats = useMemo(() => {
    if (!previewData) return null;
    return [
      { label: 'Total filas', value: previewData.summary.totalRows },
      { label: 'Previsualizadas', value: previewData.summary.previewCount },
      { label: 'Advertencias', value: previewData.summary.missingCount },
      { label: 'Estados', value: previewData.summary.distinctEstados.join(', ') || '-' },
      { label: 'Regiones', value: previewData.summary.distinctRegiones.join(', ') || '-' }
    ];
  }, [previewData]);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">SNIFA - Procesos Sancionatorios</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteSweepIcon />}
            disabled={deletingAll || total === 0}
            onClick={() => setConfirmDeleteAllOpen(true)}
          >
            Eliminar Todo
          </Button>
          <Button variant="contained" startIcon={<UploadIcon />} onClick={() => fileInputRef.current?.click()}>
            Cargar XLSX
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleSelectFile} />
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Delete All Progress */}
      {deletingAll && deleteAllProgress && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Eliminando registros... {deleteAllProgress.current} / {deleteAllProgress.total}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.round((deleteAllProgress.current / deleteAllProgress.total) * 100)}
            color="error"
          />
        </Alert>
      )}

      {globalSummary && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={3} sx={{ borderRight: { md: '1px solid #e0e0e0' } }}>
                <Typography color="textSecondary" gutterBottom>Total Registros</Typography>
                <Typography variant="h3" color="primary">{globalSummary.total}</Typography>
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  Última act: {globalSummary.lastUpdate ? new Date(globalSummary.lastUpdate).toLocaleDateString('es-CL') : '-'}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={4} sx={{ borderRight: { md: '1px solid #e0e0e0' } }}>
                <Typography color="textSecondary" gutterBottom>Por Estado</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {Object.entries(globalSummary.byEstado).slice(0, 4).map(([k, v]) => (
                    <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', pr: 2 }}>
                      <Typography variant="body2" noWrap title={k} sx={{ maxWidth: '70%' }}>{k}</Typography>
                      <Typography variant="body2" fontWeight="bold">{v}</Typography>
                    </Box>
                  ))}
                </Box>
              </Grid>
              <Grid item xs={12} sm={12} md={5}>
                <Typography color="textSecondary" gutterBottom>Top Regiones</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {globalSummary.byRegion.map((r) => (
                    <Chip key={r.region} label={`${r.region}: ${r.count}`} size="small" variant="outlined" />
                  ))}
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6">
            Filtros {hasActiveFilters && <Chip label="Filtros activos" size="small" color="primary" sx={{ ml: 1 }} />}
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Expediente" value={filters.expediente || ''} onChange={(e) => setFilters({ ...filters, expediente: e.target.value })} size="small" />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Empresa" value={filters.nombre || ''} onChange={(e) => setFilters({ ...filters, nombre: e.target.value })} size="small" />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Región" value={filters.regionNombre || ''} onChange={(e) => setFilters({ ...filters, regionNombre: e.target.value })} size="small" />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Estado" value={filters.procesoSancionEstado || ''} onChange={(e) => setFilters({ ...filters, procesoSancionEstado: e.target.value })} size="small" />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Razón Social" value={filters.razonSocial || ''} onChange={(e) => setFilters({ ...filters, razonSocial: e.target.value })} size="small" />
            </Grid>
            <Grid item xs={12} sx={{ display: 'flex', gap: 1 }}>
              <Button variant="contained" disabled={searchProgress !== null} onClick={handleSearch}>
                {searchProgress !== null ? `Buscando... ${searchProgress}%` : 'Buscar'}
              </Button>
              <Button variant="outlined" onClick={handleClear}>Limpiar</Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Registros SNIFA</Typography>
            {selectedIds.length > 0 && (
              <Button
                variant="contained"
                color="error"
                startIcon={<DeleteIcon />}
                disabled={deleting}
                onClick={handleDeleteSelected}
              >
                {deleting ? 'Eliminando...' : `Eliminar (${selectedIds.length})`}
              </Button>
            )}
          </Box>
          {list.length === 0 && <Typography variant="body2" color="textSecondary">Sin resultados</Typography>}
          {list.length > 0 && (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={allOnPageSelected}
                        indeterminate={someOnPageSelected && !allOnPageSelected}
                        onChange={handleToggleSelectAll}
                      />
                    </TableCell>
                    <TableCell>ID Proceso</TableCell>
                    <TableCell>Expediente</TableCell>
                    <TableCell>Empresa</TableCell>
                    <TableCell>Razón Social</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Región</TableCell>
                    <TableCell>Comuna</TableCell>
                    <TableCell>Categoría Económica</TableCell>
                    <TableCell>Subcategoría</TableCell>
                    <TableCell>Multa (UTA)</TableCell>
                    <TableCell>Confirma PdC</TableCell>
                    <TableCell>Fast Check Proc.</TableCell>
                    <TableCell>Fast Check Sanc.</TableCell>

                    <TableCell>link SNIFA</TableCell>
                    <TableCell>link SNIFA UF</TableCell>


                    <TableCell>Fecha Inicio</TableCell>
                    <TableCell>Fecha Actualización</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {list.map((r) => (
                    <TableRow key={r._id} selected={selectedIds.includes(r._id)}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={selectedIds.includes(r._id)}
                          onChange={() => handleToggleSelect(r._id)}
                        />
                      </TableCell>
                      <TableCell>{r.procesoSancionId}</TableCell>
                      <TableCell>{r.expediente}</TableCell>
                      <TableCell>{r.nombre}</TableCell>
                      <TableCell>{r.razonSocial}</TableCell>
                      <TableCell><Chip label={r.procesoSancionEstado} size="small" /></TableCell>
                      <TableCell>{r.procesoSancionTipoNombre}</TableCell>
                      <TableCell>{r.regionNombre}</TableCell>
                      <TableCell>{r.comunaNombre}</TableCell>
                      <TableCell>{r.categoriaEconomicaNombre}</TableCell>
                      <TableCell>{r.subCategoriaEconomicaNombre}</TableCell>
                      <TableCell>{r.multaTotalUTA ?? '-'}</TableCell>
                      <TableCell>{r.confirmaPdC}</TableCell>
                      <TableCell>{r.fastCheckProcesoSancionatorio}</TableCell>
                      <TableCell>{r.fastCheckSanciones}</TableCell>
                      <TableCell>{r.linkSNIFA}</TableCell>
                      <TableCell>{r.linkSNIFA_UF}</TableCell>


                      <TableCell>{r.fechaInicio ? new Date(r.fechaInicio).toLocaleDateString('es-CL') : '-'}</TableCell>
                      <TableCell>{r.fechaActualizacion ? new Date(r.fechaActualizacion).toLocaleDateString('es-CL') : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
            <Pagination count={pages} page={page} onChange={(_, value) => setPage(value)} />
          </Box>
        </CardContent>
      </Card>

      {/* Confirm Delete All Dialog */}
      <Dialog open={confirmDeleteAllOpen} onClose={() => setConfirmDeleteAllOpen(false)}>
        <DialogTitle>¿Eliminar todos los registros?</DialogTitle>
        <DialogContent>
          <Typography>
            Esta acción eliminará <strong>todos los {total} registros</strong> de SNIFA. Esta operación no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteAllOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="error" startIcon={<DeleteSweepIcon />} onClick={handleDeleteAll}>
            Sí, eliminar todo
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} maxWidth="xl" fullWidth>
        <DialogTitle>Importar XLSX (SNIFA)</DialogTitle>
        <DialogContent>
          {previewData ? (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ mb: 1 }}>Previsualización (primeros 50)</Typography>
              <TableContainer component={Paper} sx={{ maxHeight: 320 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>ID Proceso</TableCell>
                      <TableCell>Expediente</TableCell>
                      <TableCell>Empresa</TableCell>
                      <TableCell>Razón Social</TableCell>
                      <TableCell>Estado</TableCell>
                      <TableCell>Tipo</TableCell>
                      <TableCell>Región</TableCell>
                      <TableCell>Comuna</TableCell>
                      <TableCell>Categoría Económica</TableCell>
                      <TableCell>Subcategoría</TableCell>
                      <TableCell>Multa (UTA)</TableCell>
                      <TableCell>Confirma PdC</TableCell>



                      <TableCell>Fast Check Proc.</TableCell>
                      <TableCell>Fast Check Sanc.</TableCell>
                      <TableCell>Fecha Inicio</TableCell>
                      <TableCell>Fecha Actualización</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(previewData.preview || []).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{row.procesoSancionId}</TableCell>
                        <TableCell>{row.expediente}</TableCell>
                        <TableCell>{row.nombre}</TableCell>
                        <TableCell>{row.razonSocial}</TableCell>
                        <TableCell>{row.procesoSancionEstado}</TableCell>
                        <TableCell>{row.procesoSancionTipoNombre}</TableCell>
                        <TableCell>{row.regionNombre}</TableCell>
                        <TableCell>{row.comunaNombre}</TableCell>
                        <TableCell>{row.categoriaEconomicaNombre}</TableCell>
                        <TableCell>{row.subCategoriaEconomicaNombre}</TableCell>
                        <TableCell>{row.multaTotalUTA ?? '-'}</TableCell>
                        <TableCell>{row.confirmaPdC}</TableCell>
                        <TableCell>{row.fastCheckProcesoSancionatorio}</TableCell>
                        <TableCell>{row.fastCheckSanciones}</TableCell>
                        <TableCell>{row.fechaInicio ? new Date(row.fechaInicio as any).toLocaleDateString('es-CL') : '-'}</TableCell>
                        <TableCell>{row.fechaActualizacion ? new Date(row.fechaActualizacion as any).toLocaleDateString('es-CL') : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                {summaryStats?.map((s, i) => (
                  <Grid item xs={12} md={6} key={i}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography color="textSecondary">{s.label}</Typography>
                        <Typography variant="h6">{s.value}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
              {(previewData.warnings || []).length > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  {previewData.warnings.length} filas con posibles problemas de formato
                </Alert>
              )}
            </Box>
          ) : (
            <Typography variant="body2" color="textSecondary">Procesando previsualización...</Typography>
          )}

          {processing && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress variant="determinate" value={uploadProgress} />
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                Subida: {uploadProgress}%
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)} disabled={processing}>Cerrar</Button>
          <Button variant="outlined" startIcon={<Cancel />} onClick={cancelImport} disabled={!processing || !job}>Cancelar</Button>
          <Button variant="contained" startIcon={<PlayArrow />} onClick={startImport} disabled={processing || !file}>Confirmar Importación</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!success} autoHideDuration={4000} onClose={() => setSuccess(null)} message={success || ''} />
    </Box>
  );
};

export default SnifaImportPage;
