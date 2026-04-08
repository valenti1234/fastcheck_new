import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Card, CardContent, Typography, Button, TextField, CircularProgress, IconButton } from '@mui/material';
import { RefreshCw, Download } from 'lucide-react';
import { SheriffDataLogResponse } from '../../types/sheriff';
import { apiClient, getSheriffLogById, validateChileanRut, formatChileanRut, getSheriffDataLogs as getLogsApi } from '../../services/api';
import logger from '../../utils/logger';
import { useTranslation } from 'react-i18next';

interface SheriffLogsResponse {
  logs: SheriffDataLogResponse[];
  total: number;
  pages: number;
  currentPage: number;
}

const SheriffMonitorPage: React.FC = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<SheriffDataLogResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [total, setTotal] = useState<number>(0);
  const [pages, setPages] = useState<number>(0);
  // Campos para igualar el encabezado de Equifax (por ahora solo visual)
  const [rutInput, setRutInput] = useState<string>('');
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);

  const fetchLogs = async (overridePage?: number) => {
    try {
      setLoading(true);
      const currentPage = overridePage ?? page;
      // Si el RUT es válido, lo formateamos sin puntos (manteniendo guion)
      let rutParam: string | undefined = undefined;
      const trimmedRut = rutInput.trim();
      if (trimmedRut) {
        if (!validateChileanRut(trimmedRut)) {
          setError(t('sheriffMonitor.form.invalidRut'));
          setLoading(false);
          return;
        }
        rutParam = formatChileanRut(trimmedRut).replace(/\./g, '');
      }

      const data = await getLogsApi(currentPage, limit, {
        rut: rutParam,
        startDate,
        endDate,
      });
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPages(data.pages || 0);
      setPage(data.currentPage || currentPage);
      setError(null);
    } catch (err) {
      logger.error('Error fetching Sheriff logs', err);
      setError(t('sheriffMonitor.errors.loadLogs'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePrevPage = () => {
    const next = Math.max(1, page - 1);
    fetchLogs(next);
  };

  const handleNextPage = () => {
    const next = pages ? Math.min(pages, page + 1) : page + 1;
    fetchLogs(next);
  };

  const handleConsult = () => {
    fetchLogs();
  };

  const totalPages = pages || (limit ? Math.ceil(total / limit) : 0);

  const downloadJsonForLog = async (log: SheriffDataLogResponse) => {
    try {
      // Scarica esattamente il contenuto mostrato in "Ver JSON"
      const fullLog = await getSheriffLogById(log._id);
      const blob = new Blob([JSON.stringify(fullLog, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filenamePart = log._id || `${log.rut}-${log.createdAt ? new Date(log.createdAt).toISOString() : Date.now()}`;
      a.href = url;
      a.download = `sheriff-log-${filenamePart}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      logger.error('Error al descargar JSON de Sheriff', error);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        {t('sheriffMonitor.header.title')}
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label={t('sheriffMonitor.form.rut')}
              value={rutInput}
              onChange={(e) => setRutInput(e.target.value)}
              placeholder={t('sheriffMonitor.form.rutPlaceholder')}
              size="small"
              error={rutInput.trim() !== '' && !validateChileanRut(rutInput)}
              helperText={rutInput.trim() !== '' && !validateChileanRut(rutInput) ? t('sheriffMonitor.form.invalidRut') : ''}
            />
            <TextField
              label={t('sheriffMonitor.form.limit')}
              type="number"
              value={limit}
              inputProps={{ min: 1, max: 100 }}
              size="small"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLimit(Number(e.target.value))}
            />
            <TextField
              label={t('sheriffMonitor.form.page')}
              type="number"
              value={page}
              inputProps={{ min: 1 }}
              size="small"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPage(Number(e.target.value))}
            />
            <TextField
              label={t('sheriffMonitor.form.from')}
              type="datetime-local"
              value={startDate || ''}
              onChange={(e) => setStartDate(e.target.value || undefined)}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label={t('sheriffMonitor.form.to')}
              type="datetime-local"
              value={endDate || ''}
              onChange={(e) => setEndDate(e.target.value || undefined)}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
            <Button variant="contained" onClick={() => handleConsult()} startIcon={<RefreshCw size={16} />}>
              {t('sheriffMonitor.buttons.consult')}
            </Button>
            <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto', gap: 1 }}>
              <Typography variant="body2">
                {t('sheriffMonitor.pagination.summary', { total, page, pages: totalPages })}
              </Typography>
              <Button variant="outlined" size="small" onClick={() => handlePrevPage()} disabled={page <= 1}>
                {t('sheriffMonitor.buttons.prev')}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleNextPage()}
                disabled={totalPages > 0 ? page >= totalPages : false}
              >
                {t('sheriffMonitor.buttons.next')}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '160px 120px 140px 120px 140px 200px', gap: 2, fontWeight: 600, mb: 1 }}>
                <div>{t('sheriffMonitor.table.columns.rut')}</div>
                <div>{t('sheriffMonitor.table.columns.status')}</div>
                <div>{t('sheriffMonitor.table.columns.errorCalls')}</div>
                <div>{t('sheriffMonitor.table.columns.download')}</div>
                <div>{t('sheriffMonitor.table.columns.detail')}</div>
                <div>{t('sheriffMonitor.table.columns.date')}</div>
              </Box>

              {error && (
                <Typography variant="body2" color="error" sx={{ mb: 2 }}>
                  {error}
                </Typography>
              )}

              {logs.map((log) => {
                const errores = Array.isArray(log.apiCallErrors) ? log.apiCallErrors.length : 0;

                return (
                  <Box key={log._id} sx={{ borderTop: '1px solid #eee', py: 1, display: 'grid', gridTemplateColumns: '160px 120px 140px 120px 140px 200px', gap: 2, alignItems: 'center' }}>
                    <div style={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.rut}</div>
                    <div style={{ color: log.allCallsSucceeded ? '#0a7' : '#d33' }}>{log.allCallsSucceeded ? t('sheriffMonitor.status.ok') : t('sheriffMonitor.status.withErrors')}</div>
                    <div>{errores}</div>
                    <div>
                      <IconButton size="small" onClick={() => downloadJsonForLog(log)} aria-label={t('sheriffMonitor.actions.downloadJson')} title={t('sheriffMonitor.actions.downloadJson')}>
                        <Download size={18} />
                      </IconButton>
                    </div>
                    <div>
                      <Link to={`/admin/sheriff-log/${log._id}`}>{t('sheriffMonitor.table.link.viewJson')}</Link>
                    </div>
                    <div>{new Date(log.createdAt).toLocaleString()}</div>
                  </Box>
                );
              })}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default SheriffMonitorPage;