import React, { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Box, TextField, Button, Collapse, IconButton, CircularProgress } from '@mui/material';
import { ChevronDown, ChevronUp, RefreshCw, Download } from 'lucide-react';
import { validateChileanRut, formatChileanRut } from '../../services/api';
import { getEquifaxResponsesByRut, EquifaxResponseDoc, getAllEquifaxResponses } from '../../services/equifaxService';
import logger from '../../utils/logger';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

interface RowState {
  open: boolean;
}

const EquifaxMonitorPage: React.FC = () => {
  const { t } = useTranslation();
  const [rutInput, setRutInput] = useState('');
  const [formattedRut, setFormattedRut] = useState('');
  const [isValidRut, setIsValidRut] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [responses, setResponses] = useState<EquifaxResponseDoc[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [rowOpenState, setRowOpenState] = useState<Record<string, RowState>>({});

  const [limit, setLimit] = useState(20);
  const [startDate, setStartDate] = useState<string | undefined>(undefined);
  const [endDate, setEndDate] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (rutInput) {
      const formatted = formatChileanRut(rutInput);
      setFormattedRut(formatted);
      setIsValidRut(validateChileanRut(rutInput));
    } else {
      setFormattedRut('');
      setIsValidRut(null);
    }
  }, [rutInput]);

  const toggleRow = (id: string) => {
    setRowOpenState(prev => ({
      ...prev,
      [id]: { open: !prev[id]?.open }
    }));
  };

  const downloadJsonForResponse = (r: EquifaxResponseDoc) => {
    try {
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filenamePart = r._id || `${r.endpoint}-${r.createdAt ? new Date(r.createdAt).toISOString() : Date.now()}`;
      a.href = url;
      a.download = `equifax-response-${filenamePart}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast.error(t('equifaxMonitor.errors.downloadJson'));
    }
  };

  const fetchResponses = async (overridePage?: number) => {
    try {
      const rutTrimmed = rutInput.trim();
      setLoading(true);
      setResponses([]);
  
      let result;
      const effectivePage = overridePage ?? page;
      if (rutTrimmed === '') {
        result = await getAllEquifaxResponses({
          limit,
          page: effectivePage,
          startDate,
          endDate,
        });
      } else if (isValidRut) {
        result = await getEquifaxResponsesByRut(formattedRut, {
          limit,
          page: effectivePage,
          startDate,
          endDate,
        });
      } else {
        setLoading(false);
        toast.error(t('equifaxMonitor.errors.invalidRut'));
        return;
      }
  
      setResponses(result.data || []);
      setTotal(result.total);
      if ((result.data || []).length === 0) {
        toast(t('equifaxMonitor.notifications.noRecentRecords'));
      }
    } catch (error) {
      logger.error('Error fetching Equifax responses:', error);
      toast.error(error instanceof Error ? error.message : t('equifaxMonitor.errors.loadResponses'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    // Carga automática inicial: sin RUT trae todos los registros
    void fetchResponses(1);
  }, []);

  const handlePrevPage = async () => {
    const newPage = Math.max(1, page - 1);
    setPage(newPage);
    await fetchResponses(newPage);
  };

  const handleNextPage = async () => {
    const totalPages = typeof total === 'number' ? Math.max(1, Math.ceil(total / limit)) : undefined;
    const newPage = totalPages ? Math.min(totalPages, page + 1) : page + 1;
    setPage(newPage);
    await fetchResponses(newPage);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        {t('equifaxMonitor.header.title')}
      </Typography>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label={t('equifaxMonitor.form.rut')}
              value={formattedRut || rutInput}
              onChange={(e) => setRutInput(e.target.value)}
              placeholder={t('equifaxMonitor.form.rutPlaceholder')}
              error={isValidRut === false}
              helperText={isValidRut === false ? t('equifaxMonitor.form.invalidRut') : ''}
              size="small"
            />
            <TextField
              label={t('equifaxMonitor.form.limit')}
              type="number"
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(100, parseInt(e.target.value || '20', 10))))}
              size="small"
            />
            <TextField
              label={t('equifaxMonitor.form.page')}
              type="number"
              value={page}
              onChange={(e) => setPage(Math.max(1, parseInt(e.target.value || '1', 10)))}
              size="small"
            />
            <TextField
              label={t('equifaxMonitor.form.from')}
              type="datetime-local"
              value={startDate || ''}
              onChange={(e) => setStartDate(e.target.value || undefined)}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label={t('equifaxMonitor.form.to')}
              type="datetime-local"
              value={endDate || ''}
              onChange={(e) => setEndDate(e.target.value || undefined)}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
            <Button variant="contained" onClick={() => fetchResponses()} startIcon={<RefreshCw size={16} />} disabled={loading}>
              {t('equifaxMonitor.buttons.consult')}
            </Button>
            <Box sx={{ display: 'flex', alignItems: 'center', ml: 'auto', gap: 1 }}>
              {typeof total === 'number' && (
                <Typography variant="body2">
                  {t('equifaxMonitor.pagination.summary', { total, page, pages: Math.max(1, Math.ceil(total / limit)) })}
                </Typography>
              )}
              <Button variant="outlined" size="small" onClick={handlePrevPage} disabled={loading || page <= 1}>
                {t('equifaxMonitor.buttons.prev')}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={handleNextPage}
                disabled={
                  loading || (typeof total === 'number' ? page >= Math.max(1, Math.ceil(total / limit)) : false)
                }
              >
                {t('equifaxMonitor.buttons.next')}
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
          <Box sx={{ display: 'grid', gridTemplateColumns: '160px 140px 120px 100px 120px 1fr 1fr 120px 120px', gap: 8, fontWeight: 600, mb: 1 }}>
            <div>{t('equifaxMonitor.table.columns.date')}</div>
            <div>{t('equifaxMonitor.table.columns.rut')}</div>
            <div>{t('equifaxMonitor.table.columns.status')}</div>
            <div>{t('equifaxMonitor.table.columns.code')}</div>
            <div>{t('equifaxMonitor.table.columns.timeMs')}</div>
            <div>{t('equifaxMonitor.table.columns.endpoint')}</div>
            <div>{t('equifaxMonitor.table.columns.cache')}</div>
            <div>{t('equifaxMonitor.table.columns.download')}</div>
            <div>{t('equifaxMonitor.table.columns.details')}</div>
          </Box>
              {responses.map((r) => (
                <Box key={r._id || `${r.createdAt}-${r.endpoint}`} sx={{ borderTop: '1px solid #eee', py: 1 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '160px 140px 120px 100px 120px 1fr 1fr 120px 120px', gap: 8, alignItems: 'center' }}>
                    <div>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '-'}</div>
                    <div style={{ fontFamily: 'monospace' }}>{r.rut || '-'}</div>
                    <div style={{ color: r.success ? '#0a7' : '#d33' }}>{r.success ? t('equifaxMonitor.status.ok') : t('equifaxMonitor.status.error')}</div>
                    <div>{r.statusCode ?? '-'}</div>
                    <div>{r.responseTime ?? '-'}</div>
                    <div>{r.endpoint}</div>
                    <div>
                      {r.cacheInfo ? (
                        <span style={{ fontFamily: 'monospace' }}>
                          {r.cacheInfo.cached ? t('equifaxMonitor.cache.cached') : t('equifaxMonitor.cache.miss')}
                          {r.cacheInfo.cache_key ? ` · ${String(r.cacheInfo.cache_key).slice(0, 12)}…` : ''}
                        </span>
                      ) : '-'}
                    </div>
                    <div>
                      <IconButton size="small" onClick={() => downloadJsonForResponse(r)} aria-label={t('equifaxMonitor.actions.downloadJson')} title={t('equifaxMonitor.actions.downloadJson')}>
                        <Download size={18} />
                      </IconButton>
                    </div>
                    <div>
                      <IconButton size="small" onClick={() => toggleRow(r._id || `${r.createdAt}-${r.endpoint}`)}>
                        {rowOpenState[r._id || `${r.createdAt}-${r.endpoint}`]?.open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </IconButton>
                    </div>
                  </Box>
                  <Collapse in={rowOpenState[r._id || `${r.createdAt}-${r.endpoint}`]?.open} timeout="auto" unmountOnExit>
                    <Box sx={{ mt: 1, p: 2, bgcolor: 'rgba(0,0,0,0.03)', borderRadius: 1 }}>
                      <Typography variant="subtitle2" gutterBottom>{t('equifaxMonitor.details.payload')}</Typography>
                      <pre style={{ overflowX: 'auto', maxHeight: 240 }}>
                        {JSON.stringify(r.requestPayload ?? {}, null, 2)}
                      </pre>
                      <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>{t('equifaxMonitor.details.data')}</Typography>
                      <pre style={{ overflowX: 'auto', maxHeight: 240 }}>
                        {JSON.stringify(r.data ?? {}, null, 2)}
                      </pre>
                      <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                        {t('equifaxMonitor.details.normalized')}
                      </Typography>
                      <pre style={{ overflowX: 'auto', maxHeight: 240 }}>
                        {JSON.stringify(r.normalizedData ?? {}, null, 2)}
                      </pre>
                      {r.cacheInfo && (
                        <>
                          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                            {t('equifaxMonitor.cache.info')}
                          </Typography>
                          <pre style={{ overflowX: 'auto', maxHeight: 240 }}>
                            {JSON.stringify(r.cacheInfo, null, 2)}
                          </pre>
                        </>
                      )}
                      {r.errorMessage && (
                        <>
                          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                            {t('equifaxMonitor.details.error')}
                          </Typography>
                          <pre style={{ overflowX: 'auto', maxHeight: 240 }}>
                            {r.errorMessage}
                          </pre>
                        </>
                      )}
                    </Box>
                  </Collapse>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default EquifaxMonitorPage;