import { apiClient as api } from './api';
import logger from '../utils/logger';



export const getSheriffDataLogs = async (tenantId: string, page: number, limit: number) => {
  const response = await api.get(`/sheriff-data-logs/tenant/${tenantId}`, {
    params: { page, limit },
  });
  return response.data;
};

export const getAllSheriffDataLogs = async (tenantId: string) => {
  let allLogs: any[] = [];
  let page = 1;
  let hasMore = true;
  const maxPages = 1000; // Safety limit to prevent infinite loops
  
  while (hasMore && page <= maxPages) {
    try {
      logger.log(`getAllSheriffDataLogs: Fetching page ${page} for tenant ${tenantId}`);
      
      const response = await api.get(`/sheriff-data-logs/tenant/${tenantId}`, {
        params: { page, limit: 100 },
      });
      
      logger.log(`getAllSheriffDataLogs: Response for page ${page}:`, {
        hasData: !!response.data,
        hasLogs: !!(response.data && response.data.logs),
        logsLength: response.data?.logs?.length || 0,
        totalPages: response.data?.pages || 0
      });
      
      if (response.data && response.data.logs && Array.isArray(response.data.logs)) {
        allLogs = allLogs.concat(response.data.logs);
        
        // Check if we have more pages
        if (response.data.pages && typeof response.data.pages === 'number') {
          hasMore = page < response.data.pages;
        } else {
          // If no pages info, stop if we got less than the limit
          hasMore = response.data.logs.length >= 100;
        }
        
        page++;
      } else {
        logger.log(`getAllSheriffDataLogs: No valid data structure in response for page ${page}, stopping`);
        hasMore = false;
      }
    } catch (error) {
      logger.error(`getAllSheriffDataLogs: Error fetching page ${page}:`, error);
      hasMore = false;
    }
  }
  
  if (page > maxPages) {
    logger.warn(`getAllSheriffDataLogs: Reached maximum page limit (${maxPages}), stopping`);
  }
  
  logger.log(`getAllSheriffDataLogs: Completed. Total logs: ${allLogs.length}, pages fetched: ${page - 1}`);
  return { logs: allLogs, total: allLogs.length, pages: Math.ceil(allLogs.length / 100) };
};

export const getSheriffDataLogById = async (id: string) => {
  const response = await api.get(`/sheriff-data-logs/${id}`);
  return response.data;
};