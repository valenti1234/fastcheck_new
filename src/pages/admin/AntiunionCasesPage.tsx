import React, { useState, useEffect } from 'react';
import logger from '../../utils/logger';

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
  Chip,
  IconButton,
  Tooltip,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Pagination,
  CircularProgress,
  Fab,
  Snackbar,
  Checkbox,
  LinearProgress
} from '@mui/material';
import {
  Upload as UploadIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  FileDownload as DownloadIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { antiunionCaseService } from '../../services/antiunionCaseService';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';

interface AntiunionCase {
  _id: string;
  rut: string;
  companyName: string;
  rit: string;
  tribunal: string;
  date: string;
  description: string;
  complaintType: 'DT' | 'PARTICULAR' | 'UNKNOWN';
  fineAmount: string;
  pdfFileName?: string;
  pdfPath?: string;
  uploadedBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface PaginationData {
  current: number;
  pages: number;
  total: number;
  limit: number;
}

interface Statistics {
  totalCases: number;
  casesByType: Array<{ _id: string; count: number }>;
  casesByTribunal: Array<{ _id: string; count: number }>;
  recentCases: Array<{
    _id: string;
    companyName: string;
    rut: string;
    date: string;
    tribunal: string;
  }>;
}

const emptyRow = () => ({
  rut: '',
  companyName: '',
  rit: '',
  tribunal: '',
  date: '',
  description: '',
  complaintType: '',
  fineAmount: ''
});

const AntiunionCasesPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [cases, setCases] = useState<AntiunionCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationData>({
    current: 1,
    pages: 1,
    total: 0,
    limit: 10
  });
  const [statistics, setStatistics] = useState<Statistics | null>(null);

  // Dialog states
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<AntiunionCase | null>(null);

  // Manual add dialog states
  const [manualAddDialogOpen, setManualAddDialogOpen] = useState(false);
  const [manualRows, setManualRows] = useState<Partial<AntiunionCase>[]>([emptyRow()]);
  const [manualSubmitting, setManualSubmitting] = useState(false);

  // Form states
  const [editForm, setEditForm] = useState<Partial<AntiunionCase>>({});
  const [uploadProgress, setUploadProgress] = useState(false);
  const [uploadProgressValue, setUploadProgressValue] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  // Filter states
  const [filters, setFilters] = useState({
    rut: '',
    companyName: '',
    tribunal: '',
    complaintType: ''
  });

  // Selection states
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    onDrop: handleFileUpload
  });

  // Load data on component mount
  useEffect(() => {
    loadCases();
    loadStatistics();
  }, [pagination.current, filters]);

  // Update selectAll state when cases change
  useEffect(() => {
    if (cases.length === 0) {
      setSelectAll(false);
      setSelectedCases([]);
    } else {
      setSelectAll(selectedCases.length === cases.length && selectedCases.length > 0);
    }
  }, [cases, selectedCases]);

  const loadCases = async () => {
    try {
      setLoading(true);
      const response = await antiunionCaseService.getAllCases({
        page: pagination.current,
        limit: pagination.limit,
        ...filters
      });
      setCases(response.data);
      setPagination(response.pagination);
    } catch (err) {
      setError(t('antiunionCases.errors.loadCases', 'Error al cargar los casos'));
      logger.error('Error loading cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const stats = await antiunionCaseService.getStatistics();
      setStatistics(stats);
    } catch (err) {
      logger.error('Error loading statistics:', err);
    }
  };

  async function handleFileUpload(acceptedFiles: File[]) {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    if (file.type !== 'application/pdf') {
      setError(t('antiunionCases.upload.onlyPdf', 'Solo se permiten archivos PDF'));
      return;
    }

    try {
      setUploadProgress(true);
      setUploadProgressValue(0);
      setUploadStatus(t('antiunionCases.upload.progress.uploadingFile', 'Subiendo archivo...'));

      const result = await antiunionCaseService.uploadPDF(file, (progress) => {
        setUploadProgressValue(progress);
        if (progress === 100) {
          setUploadStatus(t('antiunionCases.upload.progress.processingPdf', 'Procesando PDF...'));
        }
      });

      setUploadStatus(t('antiunionCases.upload.progress.completed', 'Completado'));

      let successMessage = t('antiunionCases.upload.savedCount', { count: result.data.length });
      if (result.summary && result.summary.skipped > 0) {
        successMessage += `, ${t('antiunionCases.upload.skippedCount', { count: result.summary.skipped })}`;
      }

      setSuccess(successMessage);
      setUploadDialogOpen(false);
      loadCases();
      loadStatistics();
    } catch (err: any) {
      setError(err.response?.data?.message || t('antiunionCases.errors.uploadPdf', 'Error al subir el PDF'));
    } finally {
      setUploadProgress(false);
      setUploadProgressValue(0);
      setUploadStatus('');
    }
  }

  const handleEdit = async () => {
    if (!selectedCase || !editForm) return;

    try {
      setLoading(true);
      await antiunionCaseService.updateCase(selectedCase._id, editForm);
      setSuccess(t('antiunionCases.messages.updateSuccess', 'Caso actualizado exitosamente'));
      setEditDialogOpen(false);
      loadCases();
    } catch (err: any) {
      setError(err.response?.data?.message || t('antiunionCases.errors.updateCase', 'Error al actualizar el caso'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCase) return;

    try {
      setLoading(true);
      await antiunionCaseService.deleteCase(selectedCase._id);
      setSuccess(t('antiunionCases.messages.deleteSuccess', 'Caso eliminado exitosamente'));
      setDeleteDialogOpen(false);
      loadCases();
      loadStatistics();
    } catch (err: any) {
      setError(err.response?.data?.message || t('antiunionCases.errors.deleteCase', 'Error al eliminar el caso'));
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field: string, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  // Selection handlers
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setSelectAll(checked);
    if (checked) {
      setSelectedCases(cases.map(case_ => case_._id));
    } else {
      setSelectedCases([]);
    }
  };

  const handleSelectCase = (caseId: string) => {
    setSelectedCases(prev => {
      const newSelected = prev.includes(caseId)
        ? prev.filter(id => id !== caseId)
        : [...prev, caseId];
      setSelectAll(newSelected.length === cases.length);
      return newSelected;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedCases.length === 0) return;

    try {
      setLoading(true);
      await Promise.all(selectedCases.map(id => antiunionCaseService.deleteCase(id)));
      setSuccess(t('antiunionCases.messages.bulkDeleteSuccess', { count: selectedCases.length }));
      setSelectedCases([]);
      setSelectAll(false);
      loadCases();
      loadStatistics();
    } catch (err: any) {
      setError(t('antiunionCases.errors.bulkDelete', 'Error al eliminar los casos seleccionados'));
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({ rut: '', companyName: '', tribunal: '', complaintType: '' });
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  // Manual add handlers
  const handleManualRowChange = (index: number, field: keyof AntiunionCase, value: string) => {
    setManualRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleAddManualRow = () => {
    setManualRows(prev => [...prev, emptyRow()]);
  };

  const handleRemoveManualRow = (index: number) => {
    setManualRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleManualSubmit = async () => {
    const validTypes = ['DT', 'PARTICULAR', 'UNKNOWN'];
    for (let i = 0; i < manualRows.length; i++) {
      const row = manualRows[i];
      const missing = ['rut', 'companyName', 'rit', 'tribunal', 'date', 'description', 'complaintType', 'fineAmount'].filter(f => !row[f as keyof typeof row]);
      if (missing.length > 0) {
        setError(`Fila ${i + 1}: los campos ${missing.join(', ')} son requeridos`);
        return;
      }
      if (!validTypes.includes((row.complaintType as string).toUpperCase())) {
        setError(`Fila ${i + 1}: complaintType debe ser DT, PARTICULAR o UNKNOWN`);
        return;
      }
    }
    try {
      setManualSubmitting(true);
      await antiunionCaseService.createCasesBulk(manualRows as any);
      setSuccess(t('antiunionCases.messages.manualAddSuccess', { count: manualRows.length }));
      setManualAddDialogOpen(false);
      setManualRows([emptyRow()]);
      loadCases();
      loadStatistics();
    } catch (err: any) {
      setError(err.response?.data?.message || t('antiunionCases.errors.manualAdd', 'Error al guardar los casos'));
    } finally {
      setManualSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const lang = i18n.language || 'es';
    const localeMap: Record<string, string> = {
      es: 'es-CL',
      en: 'en-US',
      pt: 'pt-PT',
      fr: 'fr-FR'
    };
    const locale = localeMap[lang] || 'es-CL';
    try {
      return new Date(dateString).toLocaleDateString(locale);
    } catch {
      return new Date(dateString).toLocaleDateString();
    }
  };

  const getComplaintTypeColor = (type: string) => {
    switch (type) {
      case 'DT': return 'primary';
      case 'PARTICULAR': return 'secondary';
      default: return 'default';
    }
  };

  const getComplaintTypeLabel = (type: string) => {
    switch (type) {
      case 'DT': return t('antiunionCases.complaintType.dt', 'DT');
      case 'PARTICULAR': return t('antiunionCases.complaintType.particular', 'Particular');
      default: return t('antiunionCases.complaintType.unknown', 'Desconocido');
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          {t('antiunionCases.title', 'Gestión de Casos Antisindicales')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() => setManualAddDialogOpen(true)}
          >
            {t('antiunionCases.manualAddButton', 'Agregar Manual')}
          </Button>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={() => setUploadDialogOpen(true)}
            sx={{ bgcolor: 'primary.main' }}
          >
            {t('antiunionCases.uploadButton', 'Cargar PDF')}
          </Button>
        </Box>
      </Box>

      {/* Statistics Cards */}
      {statistics && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  {t('antiunionCases.stats.totalCases', 'Total de Casos')}
                </Typography>
                <Typography variant="h4">
                  {statistics.totalCases}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  {t('antiunionCases.stats.dtCases', 'Casos DT')}
                </Typography>
                <Typography variant="h4">
                  {statistics.casesByType.find(t => t._id === 'DT')?.count || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  {t('antiunionCases.stats.particularCases', 'Casos Particulares')}
                </Typography>
                <Typography variant="h4">
                  {statistics.casesByType.find(t => t._id === 'PARTICULAR')?.count || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  {t('antiunionCases.stats.activeTribunals', 'Tribunales Activos')}
                </Typography>
                <Typography variant="h4">
                  {statistics.casesByTribunal.length}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {t('antiunionCases.filters.title', 'Filtros de Búsqueda')}
          </Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <TextField
                fullWidth
                label={t('antiunionCases.filters.rut', 'RUT')}
                value={filters.rut}
                onChange={(e) => handleFilterChange('rut', e.target.value)}
                size="small"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                label={t('antiunionCases.filters.companyName', 'Nombre de Empresa')}
                value={filters.companyName}
                onChange={(e) => handleFilterChange('companyName', e.target.value)}
                size="small"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                label={t('antiunionCases.filters.tribunal', 'Tribunal')}
                value={filters.tribunal}
                onChange={(e) => handleFilterChange('tribunal', e.target.value)}
                size="small"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('antiunionCases.filters.complaintType', 'Tipo de Denuncia')}</InputLabel>
                <Select
                  value={filters.complaintType}
                  onChange={(e) => handleFilterChange('complaintType', e.target.value)}
                  label={t('antiunionCases.filters.complaintType', 'Tipo de Denuncia')}
                >
                  <MenuItem value="">{t('antiunionCases.filters.all', 'Todos')}</MenuItem>
                  <MenuItem value="DT">{t('antiunionCases.complaintType.dt', 'DT')}</MenuItem>
                  <MenuItem value="PARTICULAR">{t('antiunionCases.complaintType.particular', 'Particular')}</MenuItem>
                  <MenuItem value="UNKNOWN">{t('antiunionCases.complaintType.unknown', 'Desconocido')}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 2 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  startIcon={<SearchIcon />}
                  onClick={loadCases}
                  size="small"
                >
                  {t('common.search', 'Buscar')}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={clearFilters}
                  size="small"
                >
                  {t('antiunionCases.filters.reset', 'Reset')}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Cases Table */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">
              {t('antiunionCases.table.title', { total: pagination.total })}
            </Typography>
            {selectedCases.length > 0 && (
              <Button
                variant="contained"
                color="error"
                onClick={handleBulkDelete}
                disabled={loading}
              >
                {t('antiunionCases.actions.deleteSelected', { count: selectedCases.length })}
              </Button>
            )}
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectAll}
                          onChange={handleSelectAll}
                          indeterminate={selectedCases.length > 0 && selectedCases.length < cases.length}
                        />
                      </TableCell>
                      <TableCell>{t('antiunionCases.table.headers.rut', 'RUT')}</TableCell>
                      <TableCell>{t('antiunionCases.table.headers.company', 'Empresa')}</TableCell>
                      <TableCell>{t('antiunionCases.table.headers.rit', 'RIT')}</TableCell>
                      <TableCell>{t('antiunionCases.table.headers.tribunal', 'Tribunal')}</TableCell>
                      <TableCell>{t('antiunionCases.table.headers.date', 'Fecha')}</TableCell>
                      <TableCell>{t('antiunionCases.table.headers.description', 'Descripción')}</TableCell>
                      <TableCell>{t('antiunionCases.table.headers.type', 'Tipo')}</TableCell>
                      <TableCell>{t('antiunionCases.table.headers.fine', 'Multa')}</TableCell>
                      <TableCell>{t('antiunionCases.table.headers.actions', 'Acciones')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cases.map((case_) => (
                      <TableRow key={case_._id}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selectedCases.includes(case_._id)}
                            onChange={() => handleSelectCase(case_._id)}
                          />
                        </TableCell>
                        <TableCell>{case_.rut}</TableCell>
                        <TableCell>{case_.companyName}</TableCell>
                        <TableCell>{case_.rit}</TableCell>
                        <TableCell>{case_.tribunal}</TableCell>
                        <TableCell>{formatDate(case_.date)}</TableCell>
                        <TableCell>{case_.description}</TableCell>
                        <TableCell>
                          <Chip
                            label={getComplaintTypeLabel(case_.complaintType)}
                            color={getComplaintTypeColor(case_.complaintType) as any}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{case_.fineAmount}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Tooltip title={t('common.view', 'Ver')}>
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setSelectedCase(case_);
                                  setViewDialogOpen(true);
                                }}
                              >
                                <ViewIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('antiunionCases.actions.edit', 'Editar')}>
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setSelectedCase(case_);
                                  setEditForm(case_);
                                  setEditDialogOpen(true);
                                }}
                              >
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('common.delete', 'Eliminar')}>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => {
                                  setSelectedCase(case_);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                <Pagination
                  count={pagination.pages}
                  page={pagination.current}
                  onChange={(_, page) => setPagination(prev => ({ ...prev, current: page }))}
                  color="primary"
                />
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      {/* Manual Add Dialog */}
      <Dialog
        open={manualAddDialogOpen}
        onClose={() => { setManualAddDialogOpen(false); setManualRows([emptyRow()]); }}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle>{t('antiunionCases.manualAddDialog.title', 'Agregar Casos Manualmente')}</DialogTitle>
        <DialogContent>
          <TableContainer component={Paper} sx={{ mt: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('antiunionCases.fields.rut', 'RUT')}</TableCell>
                  <TableCell>{t('antiunionCases.fields.companyName', 'Empresa')}</TableCell>
                  <TableCell>{t('antiunionCases.fields.rit', 'RIT')}</TableCell>
                  <TableCell>{t('antiunionCases.fields.tribunal', 'Tribunal')}</TableCell>
                  <TableCell>{t('antiunionCases.fields.date', 'Fecha')}</TableCell>
                  <TableCell>{t('antiunionCases.fields.complaintType', 'Tipo')}</TableCell>
                  <TableCell>{t('antiunionCases.fields.fine', 'Multa')}</TableCell>
                  <TableCell>{t('antiunionCases.fields.description', 'Descripción')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {manualRows.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.rut || ''}
                        onChange={(e) => handleManualRowChange(index, 'rut', e.target.value)}
                        sx={{ minWidth: 110 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.companyName || ''}
                        onChange={(e) => handleManualRowChange(index, 'companyName', e.target.value)}
                        sx={{ minWidth: 160 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.rit || ''}
                        onChange={(e) => handleManualRowChange(index, 'rit', e.target.value)}
                        sx={{ minWidth: 110 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.tribunal || ''}
                        onChange={(e) => handleManualRowChange(index, 'tribunal', e.target.value)}
                        sx={{ minWidth: 140 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        type="date"
                        value={row.date ? row.date.split('T')[0] : ''}
                        onChange={(e) => handleManualRowChange(index, 'date', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ minWidth: 140 }}
                      />
                    </TableCell>
                    <TableCell>
                      <FormControl size="small" sx={{ minWidth: 130 }}>
                        <Select
                          value={row.complaintType || ''}
                          onChange={(e) => handleManualRowChange(index, 'complaintType', e.target.value)}
                          displayEmpty
                        >
                          <MenuItem value="" disabled>{t('antiunionCases.filters.complaintType', 'Tipo')}</MenuItem>
                          <MenuItem value="DT">{t('antiunionCases.complaintType.dt', 'DT')}</MenuItem>
                          <MenuItem value="PARTICULAR">{t('antiunionCases.complaintType.particular', 'Particular')}</MenuItem>
                          <MenuItem value="UNKNOWN">{t('antiunionCases.complaintType.unknown', 'Desconocido')}</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.fineAmount || ''}
                        onChange={(e) => handleManualRowChange(index, 'fineAmount', e.target.value)}
                        sx={{ minWidth: 110 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        value={row.description || ''}
                        onChange={(e) => handleManualRowChange(index, 'description', e.target.value)}
                        sx={{ minWidth: 180 }}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleRemoveManualRow(index)}
                        disabled={manualRows.length === 1}
                      >
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Button
            startIcon={<AddIcon />}
            onClick={handleAddManualRow}
            sx={{ mt: 2 }}
            variant="outlined"
            size="small"
          >
            {t('antiunionCases.manualAddDialog.addRow', 'Agregar fila')}
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setManualAddDialogOpen(false); setManualRows([emptyRow()]); }}>
            {t('common.cancel', 'Cancelar')}
          </Button>
          <Button
            onClick={handleManualSubmit}
            variant="contained"
            disabled={manualSubmitting}
          >
            {manualSubmitting ? <CircularProgress size={20} /> : t('common.send', 'Enviar')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('antiunionCases.upload.title', 'Cargar PDF de Casos Antisindicales')}</DialogTitle>
        <DialogContent>
          <Box
            {...getRootProps()}
            sx={{
              border: '2px dashed #ccc',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              bgcolor: isDragActive ? 'action.hover' : 'background.paper',
              '&:hover': { bgcolor: 'action.hover' }
            }}
          >
            <input {...getInputProps()} />
            <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              {isDragActive ? t('antiunionCases.upload.dragActive', 'Suelta el archivo aquí') : t('antiunionCases.upload.dragHint', 'Arrastra un archivo PDF aquí o haz clic para seleccionar')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('antiunionCases.upload.onlyPdf', 'Solo se permiten archivos PDF')}
            </Typography>
          </Box>
          {uploadProgress && (
            <Box sx={{ mt: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <CircularProgress
                  variant={uploadProgressValue > 0 ? "determinate" : "indeterminate"}
                  value={uploadProgressValue}
                  size={24}
                  sx={{ mr: 2 }}
                />
                <Typography variant="body2" color="text.secondary">
                  {uploadStatus} {uploadProgressValue > 0 && `(${uploadProgressValue}%)`}
                </Typography>
              </Box>
              {uploadProgressValue > 0 && (
                <Box sx={{ width: '100%', mt: 1 }}>
                  <Box
                    sx={{
                      width: '100%',
                      height: 8,
                      bgcolor: 'grey.300',
                      borderRadius: 1,
                      overflow: 'hidden'
                    }}
                  >
                    <Box
                      sx={{
                        width: `${uploadProgressValue}%`,
                        height: '100%',
                        bgcolor: 'primary.main',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadDialogOpen(false)}>{t('common.cancel', 'Cancelar')}</Button>
        </DialogActions>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('antiunionCases.viewDialog.title', 'Detalles del Caso')}</DialogTitle>
        <DialogContent>
          {selectedCase && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label={t('antiunionCases.fields.rut', 'RUT')}
                  value={selectedCase.rut}
                  InputProps={{ readOnly: true }}
                  margin="normal"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label={t('antiunionCases.fields.companyName', 'Nombre de Empresa')}
                  value={selectedCase.companyName}
                  InputProps={{ readOnly: true }}
                  margin="normal"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label={t('antiunionCases.fields.rit', 'RIT')}
                  value={selectedCase.rit}
                  InputProps={{ readOnly: true }}
                  margin="normal"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label={t('antiunionCases.fields.tribunal', 'Tribunal')}
                  value={selectedCase.tribunal}
                  InputProps={{ readOnly: true }}
                  margin="normal"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label={t('antiunionCases.fields.date', 'Fecha')}
                  value={formatDate(selectedCase.date)}
                  InputProps={{ readOnly: true }}
                  margin="normal"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label={t('antiunionCases.fields.complaintType', 'Tipo de Denuncia')}
                  value={selectedCase.complaintType}
                  InputProps={{ readOnly: true }}
                  margin="normal"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label={t('antiunionCases.fields.fine', 'Multa')}
                  value={selectedCase.fineAmount}
                  InputProps={{ readOnly: true }}
                  margin="normal"
                />
              </Grid>
              <Grid size={12}>
                <TextField
                  fullWidth
                  label={t('antiunionCases.fields.description', 'Descripción')}
                  value={selectedCase.description}
                  InputProps={{ readOnly: true }}
                  margin="normal"
                  multiline
                  rows={3}
                />
              </Grid>
              {selectedCase.pdfFileName && (
                <Grid size={12}>
                  <TextField
                    fullWidth
                    label={t('antiunionCases.fields.pdfFile', 'Archivo PDF')}
                    value={selectedCase.pdfFileName}
                    InputProps={{ readOnly: true }}
                    margin="normal"
                  />
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>{t('common.close', 'Cerrar')}</Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('antiunionCases.editDialog.title', 'Editar Caso')}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label={t('antiunionCases.fields.rut', 'RUT')}
                value={editForm.rut || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, rut: e.target.value }))}
                margin="normal"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label={t('antiunionCases.fields.companyName', 'Nombre de Empresa')}
                value={editForm.companyName || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, companyName: e.target.value }))}
                margin="normal"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label={t('antiunionCases.fields.rit', 'RIT')}
                value={editForm.rit || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, rit: e.target.value }))}
                margin="normal"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label={t('antiunionCases.fields.tribunal', 'Tribunal')}
                value={editForm.tribunal || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, tribunal: e.target.value }))}
                margin="normal"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label={t('antiunionCases.fields.date', 'Fecha')}
                type="date"
                value={editForm.date ? editForm.date.split('T')[0] : ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                margin="normal"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth margin="normal">
                <InputLabel>{t('antiunionCases.fields.complaintType', 'Tipo de Denuncia')}</InputLabel>
                <Select
                  value={editForm.complaintType || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, complaintType: e.target.value as any }))}
                  label={t('antiunionCases.fields.complaintType', 'Tipo de Denuncia')}
                >
                  <MenuItem value="DT">{t('antiunionCases.complaintType.dt', 'DT')}</MenuItem>
                  <MenuItem value="PARTICULAR">{t('antiunionCases.complaintType.particular', 'Particular')}</MenuItem>
                  <MenuItem value="UNKNOWN">{t('antiunionCases.complaintType.unknown', 'Desconocido')}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label={t('antiunionCases.fields.fine', 'Multa')}
                value={editForm.fineAmount || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, fineAmount: e.target.value }))}
                margin="normal"
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label={t('antiunionCases.fields.description', 'Descripción')}
                value={editForm.description || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                margin="normal"
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>{t('common.cancel', 'Cancelar')}</Button>
          <Button onClick={handleEdit} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : t('common.save', 'Guardar')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('antiunionCases.deleteDialog.title', 'Confirmar Eliminación')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('antiunionCases.deleteDialog.message', { company: selectedCase?.companyName })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('common.cancel', 'Cancelar')}</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={20} /> : t('common.delete', 'Eliminar')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbars */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert onClose={() => setError(null)} severity="error">
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={!!success}
        autoHideDuration={6000}
        onClose={() => setSuccess(null)}
      >
        <Alert onClose={() => setSuccess(null)} severity="success">
          {success}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default AntiunionCasesPage;