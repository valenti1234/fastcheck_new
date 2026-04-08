import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import logger from '../utils/logger';

interface Tenant {
  _id: string;
  id?: string;
  name: string;
  settings?: Record<string, any>;
  usageStats: {
    evaluationsRemaining: number;
    evaluationsUsed: number;
    lastEvaluationDate: Date | null;
  };
  creditBalance?: {
    availableCredits: number;
    totalCreditsUsed: number;
    lastCreditOperation: Date | null;
  };
}

interface TenantContextType {
  tenant: Tenant | null;
  loading: boolean;
  error: string | null;
  updateTenant: (tenant: Tenant) => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const API_URL = globalThis.__APP_ENV__?.VITE_API_BASE_URL || 'https://duxiter.azurianlab.com/api';

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const fetchTenantData = async () => {
      if (!isAuthenticated) {
        setTenant(null);
        setLoading(false);
        return;
      }

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/tenant`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          // For superusers, tenant data might not be available
          // This is expected behavior, so we don't treat it as an error
          if (response.status === 404) {
            setTenant(null);
            setError(null);
            setLoading(false);
            return;
          }
          throw new Error('Failed to fetch tenant data');
        }

        const data = await response.json();
        setTenant(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        setTenant(null);
      } finally {
        setLoading(false);
      }
    };

    fetchTenantData();
  }, [isAuthenticated]);

  const updateTenant = (newTenant: Tenant) => {
    setTenant(newTenant);
  };

  return (
    <TenantContext.Provider value={{ tenant, loading, error, updateTenant }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
