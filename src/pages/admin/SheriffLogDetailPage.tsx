import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getSheriffLogById } from '../../services/api';
import PageLayout from '../../components/layouts/PageLayout';
import Card from '../../components/common/Card';
import logger from '../../utils/logger';
import { Button } from '@mui/material';
import { Download } from 'lucide-react';

const SheriffLogDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [log, setLog] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLog = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const data = await getSheriffLogById(id);
        setLog(data);
        setError(null);
      } catch (err) {
        setError('Failed to fetch log details.');
        logger.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchLog();
  }, [id]);

  if (loading) {
    return <PageLayout title="Loading..."><p>Loading...</p></PageLayout>;
  }

  if (error) {
    return <PageLayout title="Error"><p>{error}</p></PageLayout>;
  }

  if (!log) {
    return <PageLayout title="Not Found"><p>Log not found.</p></PageLayout>;
  }

  const downloadJson = () => {
    try {
      const blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filenamePart = log._id || `log-${Date.now()}`;
      a.href = url;
      a.download = `sheriff-log-${filenamePart}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      logger.error('Error al descargar JSON del log de Sheriff', error);
    }
  };

  return (
    <PageLayout title="Sheriff Log Details">
      <Card title={`Log ID: ${log._id}`}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <Button variant="outlined" size="small" onClick={downloadJson} startIcon={<Download size={16} />}>Descargar JSON</Button>
        </div>
        <pre>{JSON.stringify(log, null, 2)}</pre>
      </Card>
    </PageLayout>
  );
};

export default SheriffLogDetailPage;