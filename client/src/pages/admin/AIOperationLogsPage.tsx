import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Pagination,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Card,
  CardContent
} from '@mui/material';
import { apiClient } from '../../services/api';

interface AIOperationLog {
  _id: string;
  rut?: string;
  tenantId?: string;
  operationType: string;
  promptUsed: string;
  promptConfigId?: string;
  inputData: any;
  aiResponse: string;
  aiModel: string;
  temperature?: number;
  maxTokens?: number;
  tokensUsed?: number;
  executionTime: number;
  success: boolean;
  errorMessage?: string;
  userId?: string;
  createdAt: string;
}

const AIOperationLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AIOperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AIOperationLog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    operationType: '',
    success: '',
    rut: '',
    startDate: '',
    endDate: ''
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 20;

  const operationTypes = ['seekData', 'analyzeSheriffData', 'analyzeEvaluationParameters'];

  useEffect(() => {
    fetchLogs();
  }, [page, filters]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...Object.fromEntries(Object.entries(filters).filter(([_, value]) => value !== ''))
      });

      const response = await apiClient.get(`/api/admin/ai-operation-logs?${queryParams}`);
      setLogs(response.data.logs);
      setTotalPages(Math.ceil(response.data.total / limit));
    } catch (error) {
      console.error('Error fetching AI operation logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (log: AIOperationLog) => {
    setSelectedLog(log);
    setDialogOpen(true);
  };

  const handleFilterChange = (field: string, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPage(1);
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        AI Operation Logs
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Debug information for AI operations including prompts and responses
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              fullWidth
              label="Operation Type"
              value={filters.operationType}
              onChange={(e) => handleFilterChange('operationType', e.target.value)}
              size="small"
            >
              <MenuItem value="">All</MenuItem>
              {operationTypes.map((type) => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              select
              fullWidth
              label="Status"
              value={filters.success}
              onChange={(e) => handleFilterChange('success', e.target.value)}
              size="small"
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Success</MenuItem>
              <MenuItem value="false">Failed</MenuItem>
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              label="RUT"
              value={filters.rut}
              onChange={(e) => handleFilterChange('rut', e.target.value)}
              size="small"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="Start Date"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              fullWidth
              label="End Date"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Logs Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Timestamp</TableCell>
              <TableCell>Operation</TableCell>
              <TableCell>RUT</TableCell>
              <TableCell>Model</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Tokens</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  No logs found
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log._id}>
                  <TableCell>
                    {format(new Date(log.createdAt), 'MMM dd, yyyy HH:mm:ss')}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={log.operationType}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{log.rut || '-'}</TableCell>
                  <TableCell>{log.aiModel}</TableCell>
                  <TableCell>{formatDuration(log.executionTime)}</TableCell>
                  <TableCell>{log.tokensUsed || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      icon={log.success ? <CheckCircleIcon /> : <ErrorIcon />}
                      label={log.success ? 'Success' : 'Failed'}
                      color={log.success ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton
                      onClick={() => handleViewDetails(log)}
                      size="small"
                    >
                      <VisibilityIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, newPage) => setPage(newPage)}
            color="primary"
          />
        </Box>
      )}

      {/* Details Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          AI Operation Details - {selectedLog?.operationType}
        </DialogTitle>
        <DialogContent>
          {selectedLog && (
            <Box sx={{ mt: 2 }}>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Operation Info
                      </Typography>
                      <Typography variant="body2"><strong>Type:</strong> {selectedLog.operationType}</Typography>
                      <Typography variant="body2"><strong>RUT:</strong> {selectedLog.rut || 'N/A'}</Typography>
                      <Typography variant="body2"><strong>Model:</strong> {selectedLog.aiModel}</Typography>
                      <Typography variant="body2"><strong>Temperature:</strong> {selectedLog.temperature || 'N/A'}</Typography>
                      <Typography variant="body2"><strong>Max Tokens:</strong> {selectedLog.maxTokens || 'N/A'}</Typography>
                      <Typography variant="body2"><strong>Tokens Used:</strong> {selectedLog.tokensUsed || 'N/A'}</Typography>
                      <Typography variant="body2"><strong>Duration:</strong> {formatDuration(selectedLog.executionTime)}</Typography>
                      <Typography variant="body2"><strong>Status:</strong> 
                        <Chip
                          icon={selectedLog.success ? <CheckCircleIcon /> : <ErrorIcon />}
                          label={selectedLog.success ? 'Success' : 'Failed'}
                          color={selectedLog.success ? 'success' : 'error'}
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      </Typography>
                      <Typography variant="body2"><strong>Timestamp:</strong> {format(new Date(selectedLog.createdAt), 'MMM dd, yyyy HH:mm:ss')}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  {selectedLog.errorMessage && (
                    <Card sx={{ mb: 2 }}>
                      <CardContent>
                        <Typography variant="h6" color="error" gutterBottom>
                          Error Message
                        </Typography>
                        <Typography variant="body2" color="error">
                          {selectedLog.errorMessage}
                        </Typography>
                      </CardContent>
                    </Card>
                  )}
                </Grid>
              </Grid>

              <Accordion sx={{ mt: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="h6">Prompt Used</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <TextField
                    multiline
                    fullWidth
                    value={selectedLog.promptUsed}
                    InputProps={{ readOnly: true }}
                    variant="outlined"
                    minRows={4}
                    maxRows={10}
                  />
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="h6">Input Data</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <TextField
                    multiline
                    fullWidth
                    value={JSON.stringify(selectedLog.inputData, null, 2)}
                    InputProps={{ readOnly: true }}
                    variant="outlined"
                    minRows={4}
                    maxRows={10}
                  />
                </AccordionDetails>
              </Accordion>

              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography variant="h6">AI Response</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <TextField
                    multiline
                    fullWidth
                    value={selectedLog.aiResponse}
                    InputProps={{ readOnly: true }}
                    variant="outlined"
                    minRows={4}
                    maxRows={10}
                  />
                </AccordionDetails>
              </Accordion>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AIOperationLogsPage;